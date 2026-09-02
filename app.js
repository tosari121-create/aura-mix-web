(() => {
  'use strict';

  // MIX timing is kept aligned with the supplied Python player.
  const HOOK_SECONDS = 60;
  const MIX_SECONDS = 4;
  const TICK_MS = 100;
  const MAX_VOLUME = 100;

  const state = {
    queue: [], currentIndex: -1, current: null,
    next: null, nextIndex: -1, nextReady: false,
    autoMix: true, autoMusic: true,
    active: 'a', volume: 100, paused: false,
    duration: 180, pos: 0, session: 0,
    mix: { running: false, phase: 'idle', startedAt: 0 },
    playersReady: false, readyCount: 0,
    searchResults: [], selectedSearch: null,
    history: readJSON('aura_mix_history', []),
    eq: readJSON('aura_mix_eq', {bass:0,music:0,vocal:0}),
    autoEq: readJSON('aura_mix_auto_eq', true),
    selectedQueue: -1,
    autoPreparing: false,
    searchTimer: null,
    userActivated: false
  };

  let playerA = null, playerB = null;
  let timerId = null, clockId = null, waveRAF = null, seekPointer = false;

  const $ = id => document.getElementById(id);
  const readJSON = (k, f) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? f; } catch { return f; } };
  const saveJSON = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const fmt = s => { const n = Math.max(0, Math.floor(Number(s)||0)); return `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`; };
  const esc = v => String(v ?? '').replace(/[&<>'"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const thumb = t => t?.thumbnail || (t?.id ? `https://i.ytimg.com/vi/${t.id}/hqdefault.jpg` : '');
  const curPlayer = () => state.active === 'a' ? playerA : playerB;
  const standbyPlayer = () => state.active === 'a' ? playerB : playerA;

  function setStatus(text, warn=false) { $('status').textContent = text; $('statusDot').classList.toggle('warn', !!warn); }
  function toast(text) { const el=$('toast'); el.textContent=text; el.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>el.classList.remove('show'),2200); }
  function nowClock(){ const d=new Date(); $('realClock').textContent=d.toLocaleTimeString('th-TH',{hour12:false})+' • '+d.toLocaleDateString('th-TH'); }

  // ---------- Pages ----------
  function showPage(name){
    document.querySelectorAll('.page').forEach(p=>p.classList.toggle('active',p.dataset.page===name));
    document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.pageTarget===name));
    window.scrollTo({top:0, behavior:'smooth'});
  }

  // ---------- Search ----------
  function renderSearch(rows){
    state.searchResults = Array.isArray(rows) ? rows : [];
    state.selectedSearch = null;
    const box = $('searchList'); box.innerHTML='';
    $('searchState').textContent = state.searchResults.length ? `พบ ${state.searchResults.length} เพลง` : 'ไม่พบผลลัพธ์';
    if(!state.searchResults.length) return;
    state.searchResults.forEach((t,i)=>{
      const item=document.createElement('button'); item.type='button'; item.className='music-item search-item'; item.dataset.index=i;
      item.innerHTML=`<img class="thumb" src="${esc(thumb(t))}" alt=""><span class="item-main"><b>${esc(t.title)}</b><small>${esc(t.uploader||'YouTube')} • ${fmt(t.duration)}</small></span><span class="item-actions"><span class="circle add">＋</span><span class="circle play">▶</span></span>`;
      item.onclick=e=>{
        const add=e.target.closest('.add'), play=e.target.closest('.play');
        if(add){ addToQueue(t,false); return; }
        if(play){ addToQueue(t,true); return; }
        state.selectedSearch={...t}; document.querySelectorAll('.search-item').forEach(x=>x.classList.remove('selected')); item.classList.add('selected');
      };
      box.appendChild(item);
    });
  }

  async function doSearch({silent=false}={}){
    const q=$('searchInput').value.trim();
    if(!q){ state.searchResults=[];state.selectedSearch=null;$('searchList').innerHTML='';$('searchState').textContent='พิมพ์คำค้นหาเพื่อเริ่มค้นหา';return; }
    if(!silent) toast('กำลังค้นหา YouTube…');
    $('searchState').textContent='กำลังค้นหาเพลง…';
    try{
      const rows=await window.AuraYouTubeSearch.search(q,$('searchMode').value);
      renderSearch(rows); setStatus(`✅ พบ ${rows.length} เพลง`);
    }catch(err){
      console.error(err);$('searchState').textContent='ค้นหาไม่สำเร็จ';setStatus('SEARCH ERROR',true);toast(err.message||'ค้นหาไม่สำเร็จ');
    }
  }

  function debounceSearch(){
    clearTimeout(state.searchTimer);
    if(!$('searchInput').value.trim()){ renderSearch([]); $('searchState').textContent='พิมพ์คำค้นหาเพื่อเริ่มค้นหา'; return; }
    $('searchState').textContent='กำลังรอคำค้นหา…';
    state.searchTimer=setTimeout(()=>doSearch({silent:true}),450);
  }

  async function artistSearch(){
    const artist=prompt('พิมพ์ชื่อศิลปิน:',''); if(!artist?.trim())return;
    showPage('search'); $('searchInput').value=artist.trim(); $('searchState').textContent=`กำลังค้นหาเพลงของ ${artist.trim()}…`;
    try{
      const rows=await window.AuraYouTubeSearch.artistPlaylist(artist.trim()); renderSearch(rows);
      for(const t of rows) if(!state.queue.some(q=>q.id===t.id)) state.queue.push(t);
      renderQueue(); if(state.current===null && state.queue.length===1) startTrack(0); else prepareNext();
      toast(`✅ เพิ่มเพลงของ ${artist.trim()} ${rows.length} เพลง`);
    }catch(err){toast(err.message||'ค้นหาไม่สำเร็จ');setStatus('SEARCH ERROR',true);}
  }

  async function oldPlaylist(){
    showPage('search'); $('searchInput').value='เพลงยุค 1990-2000 • GMM GRAMMY OFFICIAL'; $('searchState').textContent='กำลังสุ่มเพลง…';
    try{
      const rows=await window.AuraYouTubeSearch.oldPlaylist(); renderSearch(rows);
      for(const t of rows) if(!state.queue.some(q=>q.id===t.id)) state.queue.push(t);
      renderQueue(); if(state.current===null && state.queue.length) startTrack(0); else prepareNext(); toast(`🎲 เพิ่มเพลง ${rows.length} เพลงแล้ว`);
    }catch(err){toast(err.message||'ค้นหาไม่สำเร็จ');setStatus('SEARCH ERROR',true);}
  }

  // ---------- Queue ----------
  function addToQueue(track, play){
    if(!track?.id) return;
    let idx=state.queue.findIndex(x=>x.id===track.id);
    if(idx===-1){ state.queue.push({...track}); idx=state.queue.length-1; }
    state.selectedQueue=idx; renderQueue();
    if(play) startTrack(idx); else { toast('✅ เพิ่มเพลงลงคิวแล้ว'); if(state.current) prepareNext(); }
  }
  function renderQueue(){
    const box=$('queueList'); box.innerHTML=''; $('queueCount').textContent=state.queue.length;
    if(!state.queue.length){box.innerHTML='<div class="list-state">ยังไม่มีเพลงในคิว<br>ไปที่ค้นหาแล้วกด ＋ เพิ่มเพลง</div>';return;}
    state.queue.forEach((t,i)=>{
      const item=document.createElement('div'); item.className='music-item queue-item'+(i===state.selectedQueue?' selected ':'')+(i===state.currentIndex?' now ':''); item.dataset.index=i;
      item.innerHTML=`<span class="queue-number">${i+1}</span><img class="thumb" src="${esc(thumb(t))}" alt=""><span class="item-main"><b>${i===state.currentIndex?'▶ ':''}${esc(t.title)}</b><small>${esc(t.uploader||'YouTube')} • ${fmt(t.duration)}</small></span><span class="item-actions"><button class="circle play" title="เล่น">▶</button><button class="circle up">↑</button><button class="circle down">↓</button></span>`;
      item.onclick=e=>{
        if(e.target.closest('button')) return;
        state.selectedQueue=i; renderQueue();
      };
      item.querySelector('.play').onclick=()=>startTrack(i);
      item.querySelector('.up').onclick=()=>moveQueue(i,-1);
      item.querySelector('.down').onclick=()=>moveQueue(i,1);
      box.appendChild(item);
    });
  }
  function removeSelectedQueue(){
    const i=state.selectedQueue; if(i<0||i>=state.queue.length){toast('แตะเลือกเพลงในคิวก่อน');return;}
    const wasCurrent=i===state.currentIndex;
    state.queue.splice(i,1);
    if(i<state.currentIndex) state.currentIndex--;
    if(state.nextIndex>i) state.nextIndex--;
    if(wasCurrent){stopAll(false); if(state.queue.length){state.currentIndex=-1;state.selectedQueue=Math.min(i,state.queue.length-1);}}
    if(state.queue.length===0)state.selectedQueue=-1; else if(state.selectedQueue>=state.queue.length)state.selectedQueue=state.queue.length-1;
    renderQueue(); if(state.current)prepareNext(); toast('ลบเพลงออกจากคิวแล้ว');
  }
  function clearQueue(){
    state.queue=[];state.selectedQueue=-1;state.next=null;state.nextIndex=-1;state.nextReady=false;renderQueue();
    toast('ล้างคิวแล้ว • เพลงปัจจุบันยังเล่นอยู่'); if(state.current) prepareNext();
  }
  function moveQueue(i,d){ const j=i+d;if(j<0||j>=state.queue.length)return; [state.queue[i],state.queue[j]]=[state.queue[j],state.queue[i]]; if(state.currentIndex===i)state.currentIndex=j;else if(state.currentIndex===j)state.currentIndex=i;if(state.nextIndex===i)state.nextIndex=j;else if(state.nextIndex===j)state.nextIndex=i;state.selectedQueue=j;renderQueue();prepareNext(); }

  // ---------- Playback ----------
  function safeStop(p){try{p.stopVideo();}catch{}try{p.setVolume(0);}catch{}try{p.mute();}catch{}}
  function getDuration(){try{return Number(curPlayer()?.getDuration())||state.duration||180}catch{return state.duration||180}}
  function calcHookStart(duration){
    const d=Number(duration)||180; if(d<=HOOK_SECONDS)return 0; return Math.min(d*0.30, Math.max(0,d-HOOK_SECONDS));
  }
  function setPlayerSource(p,id,start=0){
    if(!p||!id)return false;
    try{ p.unMute(); p.setVolume(0); p.loadVideoById({videoId:id,startSeconds:start}); return true; }catch(e){console.error(e);return false;}
  }
  function waitForPlayerState(p,targetStates,timeout=9000){
    const start=performance.now();
    return new Promise(resolve=>{
      const loop=()=>{
        if(performance.now()-start>=timeout){resolve(false);return;}
        try{
          const s=p.getPlayerState();
          if(targetStates.includes(s)){resolve(true);return;}
          if(s===YT.PlayerState.ENDED){resolve(false);return;}
        }catch{}
        requestAnimationFrame(loop);
      }; loop();
    });
  }
  function fadeVolume(p,from,to,ms,cb){
    if(!p){cb?.();return;}
    const start=performance.now(), delta=to-from;
    const frame=now=>{
      const q=Math.min(1,(now-start)/ms); const eased=q<.5?2*q*q:1-Math.pow(-2*q+2,2)/2;
      try{p.setVolume(Math.max(0,Math.min(100,Math.round(from+delta*eased))))}catch{}
      if(q<1) requestAnimationFrame(frame); else cb?.();
    }; requestAnimationFrame(frame);
  }

  async function startTrack(index){
    if(index<0||index>=state.queue.length)return;
    if(!state.playersReady){toast('กำลังเตรียม YouTube Player…');return;}
    state.userActivated=true; state.session++; const session=state.session;
    state.currentIndex=index;state.selectedQueue=index;state.current={...state.queue[index]};state.duration=Number(state.current.duration)||180;state.pos=0;
    state.next=null;state.nextIndex=-1;state.nextReady=false;state.paused=false;state.mix={running:false,phase:'idle',startedAt:0};
    safeStop(playerA); safeStop(playerB); state.active='a';
    setCurrentUI(state.current); renderQueue(); updatePauseButton(); updateMode();
    $('clockLabel').textContent='AUTO MIX • LOADING'; setStatus('กำลังเปิดเพลง…',true);
    const start=state.autoMix?calcHookStart(state.duration):0;
    if(!setPlayerSource(playerA,state.current.id,start)){setStatus('PLAYBACK ERROR',true);return;}
    try{playerA.playVideo();}catch{}
    const playing=await waitForPlayerState(playerA,[YT.PlayerState.PLAYING,YT.PlayerState.BUFFERING],9000);
    if(session!==state.session)return;
    if(!playing){setStatus('PLAYBACK ERROR',true);toast('YouTube ยังเล่นเพลงนี้ไม่ได้');return;}
    // Ensure playback really started before fading in.
    try{playerA.playVideo();}catch{}
    state.pos=start;state.duration=getDuration();
    fadeVolume(playerA,0,state.volume,700);
    state.userActivated=true;
    $('clockLabel').textContent='AUTO MIX • PLAYING';setStatus(state.autoMix?`✅ PLAYING • HOOK ${HOOK_SECONDS} วิ`:'✅ PLAYING FULL SONG');
    updateMediaSession(); prepareNext();
  }

  function prepareNext(){
    if(!state.current||state.mix.running||state.nextReady)return;
    let idx=state.currentIndex+1;
    if(idx>=state.queue.length){
      state.next=null;state.nextIndex=-1;$('nextText').textContent=state.autoMusic?'เพลงต่อไป: ✨ AUTO MUSIC รอค้นหา…':'เพลงต่อไป: —';
      if(state.autoMusic && !state.autoPreparing) prepareAutoMusic();
      return;
    }
    state.next={...state.queue[idx]};state.nextIndex=idx;$('nextText').textContent=`เพลงต่อไป: ${state.next.title} • กำลังเตรียม…`;
    const p=standbyPlayer(); if(!p){return;}
    try{
      safeStop(p);p.cueVideoById(state.next.id);state.nextReady=true;
      $('nextText').textContent=`เพลงต่อไป: ${state.next.title} • ✅ READY`;
    }catch(err){console.error(err);state.nextReady=false;setStatus('NEXT PRELOAD ERROR',true);}
  }

  async function prepareAutoMusic(){
    if(!state.autoMusic||state.autoPreparing||!state.current)return;
    state.autoPreparing=true; $('nextText').textContent='เพลงต่อไป: ✨ AUTO MUSIC กำลังหา…';
    try{
      const base=state.current.title||'';
      const rows=await window.AuraYouTubeSearch.search(`${base} similar songs`, 'YouTube ทั้งหมด');
      const used=new Set(state.queue.map(x=>x.id));
      const pick=rows.find(x=>x.id&&!used.has(x.id));
      if(pick){state.queue.push(pick);renderQueue();prepareNext();toast(`✨ AUTO MUSIC: ${pick.title}`);} else $('nextText').textContent='เพลงต่อไป: หาเพลงที่คล้ายกันไม่พบ';
    }catch(err){console.error(err);$('nextText').textContent='เพลงต่อไป: AUTO MUSIC หาไม่สำเร็จ';}
    finally{state.autoPreparing=false;}
  }

  function startMix(){
    if(state.mix.running||!state.nextReady||!state.next)return;
    const old=curPlayer(),incoming=standbyPlayer(); if(!old||!incoming)return;
    state.mix.running=true;state.mix.phase='fadeOut';state.mix.startedAt=performance.now();setStatus('🎚 AUTO MIX • SMOOTH FADE OUT');$('clockLabel').textContent='AUTO MIX • CROSSFADE 4S';
    const from=state.volume; fadeVolume(old,from,0,MIX_SECONDS*1000,async()=>{
      safeStop(old); state.mix.phase='startNew';
      try{incoming.unMute();incoming.setVolume(0);incoming.playVideo();}catch{}
      const ok=await waitForPlayerState(incoming,[YT.PlayerState.PLAYING],7000);
      if(!ok){
        // Keep old track recovered rather than leaving a dead player.
        try{old.unMute();old.setVolume(from);old.playVideo();}catch{}
        state.mix={running:false,phase:'idle',startedAt:0}; state.nextReady=false; setStatus('✅ เล่นเพลงเดิมต่อ • รอเพลงใหม่',true); prepareNext(); return;
      }
      state.mix.phase='fadeIn';setStatus('🎚 AUTO MIX • SMOOTH FADE IN');
      fadeVolume(incoming,0,state.volume,MIX_SECONDS*1000,()=>finishMix());
    });
  }

  function finishMix(){
    const old=curPlayer();const newPlayer=standbyPlayer();
    recordHistory(state.current);
    state.active=state.active==='a'?'b':'a';
    state.current={...state.next};state.currentIndex=state.nextIndex;state.selectedQueue=state.currentIndex;state.duration=Number(state.current.duration)||180;state.pos=0;
    state.next=null;state.nextIndex=-1;state.nextReady=false;state.mix={running:false,phase:'idle',startedAt:0};
    setCurrentUI(state.current);renderQueue();updateMediaSession();
    $('clockLabel').textContent='AUTO MIX • PLAYING';setStatus('✅ AUTO MIX • PLAYING');$('timeLabel').textContent=`0:00 / ${fmt(state.autoMix?HOOK_SECONDS:state.duration)}`;$('progressBar').style.width='0%';
    try{old?.setVolume(0);}catch{} try{old?.stopVideo();}catch{}
    prepareNext();
  }

  function monitor(){
    if(!state.current||state.paused||state.mix.running)return;
    const p=curPlayer();if(!p)return;
    let pos=state.pos,dur=state.duration;
    try{pos=Number(p.getCurrentTime())||0;dur=Number(p.getDuration())||dur;}catch{}
    state.pos=pos;state.duration=dur||state.duration;
    const hook=state.autoMix?calcHookStart(state.duration):0;
    const elapsed=state.autoMix?Math.max(0,pos-hook):pos;
    const visible=state.autoMix?Math.min(HOOK_SECONDS,Math.max(1,state.duration-hook)):Math.max(1,state.duration);
    const pct=Math.max(0,Math.min(1,elapsed/visible));
    $('progressBar').style.width=`${pct*100}%`; $('timeLabel').textContent=`${fmt(elapsed)} / ${fmt(visible)}`; drawWave(pct);
    // Keep next song prepared early.
    if(state.autoMusic && !state.nextReady && elapsed>=Math.max(0,visible-15)) prepareNext();
    if(state.autoMix){
      if(elapsed>=visible-0.15){ if(state.nextReady)startMix(); else {setStatus('⏳ AUTO MIX • WAITING FOR NEXT',true);prepareNext();} }
    }else{
      if(pos>=dur-MIX_SECONDS && state.nextReady) startMix();
      else if(pos>=dur-1.5 && !state.nextReady) prepareNext();
      if(pos>=dur-0.25 && !state.nextReady && state.autoMusic) prepareNext();
    }
  }

  // ---------- Controls ----------
  function updatePauseButton(){ const b=$('pauseBtn');b.querySelector('b').textContent=state.paused?'▶ เล่นต่อ':'⏸ พักเพลง'; }
  function togglePause(){
    const p=curPlayer();if(!p||!state.current)return;
    if(state.mix.running){toast('กำลัง MIX อยู่ • พักเพลงไม่ได้');return;}
    if(!state.paused){try{p.pauseVideo();state.paused=true;updatePauseButton();$('playBtn').classList.add('paused');setStatus('⏸ พักเพลงแล้ว');}catch{}}
    else{try{p.playVideo();state.paused=false;updatePauseButton();$('playBtn').classList.remove('paused');setStatus('▶ เล่นต่อแล้ว');}catch{}}
  }
  function playPrev(){if(!state.queue.length)return;startTrack(Math.max(0,state.currentIndex-1));}
  function playNext(){if(!state.queue.length)return;const i=state.currentIndex+1;if(i<state.queue.length)startTrack(i);else if(state.autoMusic)prepareAutoMusic();else toast('ไม่มีเพลงถัดไปในคิว');}
  function stopAll(show=true){
    state.session++;safeStop(playerA);safeStop(playerB);state.current=null;state.currentIndex=-1;state.next=null;state.nextIndex=-1;state.nextReady=false;state.paused=false;state.mix={running:false,phase:'idle',startedAt:0};state.selectedQueue=-1;renderQueue();setCurrentUI(null);updatePauseButton();$('playBtn').classList.remove('paused');$('clockLabel').textContent='AUTO MIX • READY';$('timeLabel').textContent='0:00 / 1:00';$('progressBar').style.width='0%';$('nextText').textContent='เพลงต่อไป: —';setStatus('READY');if(show)toast('หยุดเพลงแล้ว');}
  function toggleMix(){state.autoMix=!state.autoMix;updateMode();if(state.current){state.pos=getDuration();$('timeLabel').textContent=`0:00 / ${fmt(state.autoMix?HOOK_SECONDS:state.duration)}`;prepareNext();}syncMenuState();toast(state.autoMix?'AUTO MIX เปิด':'AUTO MIX ปิด • เล่นเต็มเพลง');}
  function toggleAutoMusic(){state.autoMusic=!state.autoMusic;syncMenuState();if(state.autoMusic&&state.current)prepareNext();toast(state.autoMusic?'AUTO MUSIC เปิด':'AUTO MUSIC ปิด');}
  function updateMode(){ $('mixBtn').classList.toggle('active',state.autoMix);$('mixBtn').querySelector('span').textContent=state.autoMix?'ON • 60S':'OFF • FULL SONG';$('modeText').textContent=state.autoMix?`AUTO • ${HOOK_SECONDS} วิ / เพลง • CROSSFADE ${MIX_SECONDS} วิ • PRELOAD`:`FULL TRACK • AUTO NEXT • CROSSFADE ${MIX_SECONDS} วิ • PRELOAD`; }

  function setCurrentUI(t){
    $('nowTitle').textContent=t?.title||'พร้อมเล่น';$('nowMeta').textContent=t?`${t.uploader||'YouTube'} • ${fmt(t.duration||180)}`:'—';
    const img=$('coverImg'),ph=$('coverPlaceholder');
    if(t?.id){img.src=thumb(t);img.hidden=false;ph.hidden=true;}else{img.removeAttribute('src');img.hidden=true;ph.hidden=false;}
    if(t?.id){ $('coverImg').onerror=()=>{ $('coverImg').hidden=true;$('coverPlaceholder').hidden=false; }; }
  }

  function recordHistory(t){ if(!t?.id)return;state.history=state.history.filter(x=>x.id!==t.id);state.history.unshift({...t,played_at:new Date().toLocaleString('th-TH')});state.history=state.history.slice(0,100);saveJSON('aura_mix_history',state.history); }

  // ---------- Waveform ----------
  function drawWave(progress=0){
    const c=$('waveCanvas'),r=c.getBoundingClientRect();if(r.width<10)return;const d=devicePixelRatio||1;c.width=Math.floor(r.width*d);c.height=Math.floor(r.height*d);const ctx=c.getContext('2d');ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,r.width,r.height);
    const mid=r.height/2,seed=String(state.current?.id||'aura').split('').reduce((a,x)=>a+x.charCodeAt(0),0),count=Math.max(72,Math.floor(r.width/4));
    ctx.strokeStyle='#1d2a38';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,mid);ctx.lineTo(r.width,mid);ctx.stroke();
    for(let i=0;i<count;i++){const x=i/(count-1)*r.width;const amp=8+((Math.sin(i*.39+seed)+1)/2)*22+((Math.sin(i*1.27+seed*.07)+1)/2)*9;ctx.strokeStyle=i/(count-1)<=progress?'#b29fff':'#344454';ctx.beginPath();ctx.moveTo(x,mid-amp);ctx.lineTo(x,mid+amp);ctx.stroke();}
    const px=Math.max(0,Math.min(r.width,progress*r.width));ctx.strokeStyle='#f3edff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px,7);ctx.lineTo(px,r.height-7);ctx.stroke();
  }
  function seekWave(clientX){
    if(!state.current||state.mix.running||state.paused)return;const p=curPlayer();if(!p)return;const r=$('waveCanvas').getBoundingClientRect();const f=Math.max(0,Math.min(1,(clientX-r.left)/r.width));const dur=getDuration();const start=state.autoMix?calcHookStart(dur):0;const visible=state.autoMix?Math.min(HOOK_SECONDS,Math.max(1,dur-start)):dur;const target=state.autoMix?start+f*visible:f*dur;try{p.seekTo(Math.min(dur,target),true);state.pos=target;setStatus('⏩ เลื่อนตำแหน่งเพลงแล้ว');drawWave(f);}catch{}}

  // ---------- Menu / EQ / History ----------
  function openModal(title,html){$('modalTitle').textContent=title;$('modalBody').innerHTML=html;$('modal').classList.add('show');$('modal').setAttribute('aria-hidden','false');}
  function closeModal(){$('modal').classList.remove('show');$('modal').setAttribute('aria-hidden','true');}
  function showEQ(){
    openModal('🎚 ปรับแต่งเสียง',`<div class="eq-list">${[['bass','🔊 Bass'],['music','🎵 Music'],['vocal','🎤 Vocal']].map(([k,l])=>`<label class="eq-row"><span>${l}</span><input id="eq_${k}" type="range" min="-12" max="12" value="${state.eq[k]}"><b id="eqv_${k}">${state.eq[k]||0} dB</b></label>`).join('')}</div><div class="modal-grid"><button id="autoEQ">✨ AUTO EQ ${state.autoEq?'ON':'OFF'}</button><button id="resetEQ">↺ รีเซ็ต</button></div><p class="modal-note">ค่า EQ จะถูกจำไว้ในเครื่อง เว็บไม่สามารถนำเสียงจาก YouTube IFrame ข้ามโดเมนเข้า Web Audio เพื่อทำ EQ จริงแบบ VLC ได้</p>`);
    ['bass','music','vocal'].forEach(k=>{ $(`eq_${k}`).oninput=()=>{state.eq[k]=Number($(`eq_${k}`).value);$(`eqv_${k}`).textContent=`${state.eq[k]||0} dB`;saveJSON('aura_mix_eq',state.eq);} });
    $('autoEQ').onclick=()=>{state.autoEq=!state.autoEq;saveJSON('aura_mix_auto_eq',state.autoEq);showEQ();};$('resetEQ').onclick=()=>{state.eq={bass:0,music:0,vocal:0};saveJSON('aura_mix_eq',state.eq);showEQ();};
  }
  function showHistory(){
    if(!state.history.length){openModal('🕘 ประวัติการฟัง','<div class="list-state">ยังไม่มีประวัติการฟัง</div>');return;}
    openModal('🕘 ประวัติการฟัง',`${state.history.map((t,i)=>`<button class="music-item history-item" data-history="${i}"><img class="thumb" src="${esc(thumb(t))}" alt=""><span class="item-main"><b>${i+1}. ${esc(t.title)}</b><small>${esc(t.uploader||'YouTube')} • ${esc(t.played_at||'—')}</small></span><span class="circle play">▶</span></button>`).join('')}<button id="clearHistory" class="danger-wide">🗑 ล้างประวัติ</button>`);
    document.querySelectorAll('[data-history]').forEach(b=>b.onclick=()=>{const t=state.history[Number(b.dataset.history)];closeModal();addToQueue(t,true)});$('clearHistory').onclick=()=>{state.history=[];saveJSON('aura_mix_history',[]);showHistory();};
  }
  function syncMenuState(){ $('menuMixState').textContent=state.autoMix?'ON • 60S':'OFF • FULL SONG';$('menuAutoState').textContent=state.autoMusic?'ON':'OFF'; }

  // ---------- Mobile background playback support ----------
  function updateMediaSession(){
    if(!('mediaSession' in navigator)||!state.current)return;
    try{
      navigator.mediaSession.metadata=new MediaMetadata({title:state.current.title||'AURA MIX',artist:state.current.uploader||'YouTube',album:'AURA MIX',artwork:thumb(state.current)?[{src:thumb(state.current)}]:[]});
      navigator.mediaSession.playbackState=state.paused?'paused':'playing';
    }catch{}
  }
  function bindMediaSession(){
    if(!('mediaSession' in navigator))return;
    try{
      navigator.mediaSession.setActionHandler('play',()=>{if(state.paused)togglePause();});
      navigator.mediaSession.setActionHandler('pause',()=>{if(!state.paused)togglePause();});
      navigator.mediaSession.setActionHandler('previoustrack',playPrev);
      navigator.mediaSession.setActionHandler('nexttrack',playNext);
    }catch{}
  }

  // ---------- YouTube ----------
  window.onYouTubeIframeAPIReady=function(){
    const common={height:'160',width:'280',host:'https://www.youtube.com',playerVars:{autoplay:0,controls:0,disablekb:1,fs:0,iv_load_policy:3,modestbranding:1,playsinline:1,rel:0},events:{onReady:onPlayerReady,onStateChange:onYTState,onError:onYTError,onAutoplayBlocked:()=>{setStatus('▶ แตะ PLAY เพื่อเริ่มเพลง',true);toast('แตะปุ่ม ▶ เพื่ออนุญาตให้ YouTube เล่นเพลง');}}};
    playerA=new YT.Player('yt-a',common);playerB=new YT.Player('yt-b',common);
  };
  function onPlayerReady(){state.readyCount++;if(state.readyCount>=2){state.playersReady=true;setStatus('READY • YouTube Player พร้อม');}}
  function onYTState(e){ if(!state.current)return; if(e.data===YT.PlayerState.PLAYING){state.userActivated=true;updateMediaSession();} if(e.data===YT.PlayerState.ENDED && !state.mix.running){const i=state.currentIndex+1;if(i<state.queue.length)startTrack(i);else if(state.autoMusic)prepareAutoMusic();} }
  function onYTError(e){console.error('YouTube error',e);setStatus('YOUTUBE ERROR',true);}

  function bindUI(){
    document.querySelectorAll('.nav-item[data-page-target]').forEach(b=>b.onclick=()=>showPage(b.dataset.pageTarget));
    $('searchInput').addEventListener('input',debounceSearch); $('searchInput').addEventListener('keydown',e=>{if(e.key==='Enter'){clearTimeout(state.searchTimer);doSearch();}}); $('searchBtn').onclick=()=>doSearch(); $('clearSearchBtn').onclick=()=>{ $('searchInput').value='';clearTimeout(state.searchTimer);renderSearch([]);$('searchState').textContent='พิมพ์คำค้นหาเพื่อเริ่มค้นหา';}; $('searchMode').onchange=()=>{if($('searchInput').value.trim())doSearch({silent:true});};
    $('artistBtn').onclick=artistSearch;$('oldBtn').onclick=oldPlaylist;
    $('playBtn').onclick=()=>{ if(!state.current){ if(state.selectedSearch)addToQueue(state.selectedSearch,true); else if(state.queue.length)startTrack(state.selectedQueue>=0?state.selectedQueue:0); else {showPage('search');toast('ค้นหาเพลงก่อนครับ');} } else togglePause(); };
    $('pauseBtn').onclick=togglePause;$('prevBtn').onclick=playPrev;$('nextBtn').onclick=playNext;$('stopBtn').onclick=()=>stopAll();$('mixBtn').onclick=toggleMix;$('autoMusicBtn').onclick=toggleAutoMusic;
    $('removeBtn').onclick=removeSelectedQueue;$('clearBtn').onclick=clearQueue;
    $('moreBtn').onclick=()=>showPage('menu');$('closeModal').onclick=closeModal;$('modal').onclick=e=>{if(e.target===$('modal'))closeModal();};
    $('menuEq').onclick=showEQ;$('menuHistory').onclick=showHistory;$('menuArtist').onclick=artistSearch;$('menuOld').onclick=oldPlaylist;$('menuMix').onclick=toggleMix;$('menuAuto').onclick=toggleAutoMusic;
    $('vol').oninput=()=>{state.volume=Number($('vol').value);$('volVal').textContent=`${state.volume}%`;try{curPlayer()?.setVolume(state.volume)}catch{}};
    const c=$('waveCanvas'); c.addEventListener('pointerdown',e=>{seekPointer=true;c.setPointerCapture?.(e.pointerId);seekWave(e.clientX)});c.addEventListener('pointermove',e=>{if(seekPointer)seekWave(e.clientX)});c.addEventListener('pointerup',()=>seekPointer=false);c.addEventListener('pointercancel',()=>seekPointer=false);
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&state.current&&!state.paused){ updateMediaSession(); try{curPlayer()?.setVolume(state.volume);}catch{} } });
    window.addEventListener('resize',()=>{drawWave(state.pos&&state.duration?Math.min(1,state.pos/state.duration):0);});
  }

  bindUI(); bindMediaSession(); syncMenuState(); updateMode(); renderQueue(); nowClock(); clockId=setInterval(nowClock,1000); timerId=setInterval(monitor,TICK_MS); drawWave(0);
  if('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(()=>{});
})();
