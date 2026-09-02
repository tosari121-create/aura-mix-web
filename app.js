(() => {
  'use strict';

  // MIX constants intentionally mirror the supplied Python player.
  const HOOK_SECONDS = 60;
  const MIX_SECONDS = 4;
  const MIX_TICK_MS = 80;
  const MAX_VOLUME = 100;
  const PLAYBACK_EPSILON = 0.25;

  const state = {
    queue: [], currentIndex: -1, current: null,
    next: null, nextIndex: -1, nextReady: false,
    autoMix: true, autoMusic: true,
    active: 'a', duration: 180, pos: 0, volume: 100,
    paused: false, session: 0,
    mix: {running:false, phase:'idle', startedAt:0},
    playersReady: false, readyCount: 0,
    searchResults: [], selectedSearch: null,
    history: loadJSON('aura_mix_history', []),
    eq: loadJSON('aura_mix_eq', {bass:0,music:0,vocal:0}),
    autoEq: loadJSON('aura_mix_auto_eq', true),
    aiPreparing: false
  };

  let playerA=null, playerB=null;
  let timerId=null, clockId=null, resizeTimer=null, touchSeek=false;

  function $(id){ return document.getElementById(id); }
  function loadJSON(key,fallback){ try{const v=JSON.parse(localStorage.getItem(key));return v??fallback}catch{return fallback} }
  function saveJSON(key,value){ try{localStorage.setItem(key,JSON.stringify(value))}catch{} }
  function fmt(seconds){const s=Math.max(0,Math.floor(Number(seconds)||0));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
  function esc(v){return String(v??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
  function thumb(track){return track?.thumbnail || (track?.id?`https://i.ytimg.com/vi/${track.id}/hqdefault.jpg`:'')}
  function currentPlayer(){return state.active==='a'?playerA:playerB}
  function standbyPlayer(){return state.active==='a'?playerB:playerA}
  function setStatus(text,kind=''){ $('status').textContent=text; $('statusDot').className=kind==='warn'?'warn':''; }
  function toast(text){const el=$('toast');el.textContent=text;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),1900)}
  function nowClock(){const d=new Date();$('realClock').textContent=d.toLocaleTimeString('th-TH',{hour12:false})+' • '+d.toLocaleDateString('th-TH')}

  function renderSearch(rows){
    state.searchResults=Array.isArray(rows)?rows:[]; state.selectedSearch=null;
    const box=$('searchList'); box.innerHTML='';
    if(!state.searchResults.length){box.innerHTML='<div class="empty-state">ไม่พบผลลัพธ์</div>';return}
    for(const [i,t] of state.searchResults.entries()){
      const item=document.createElement('div'); item.className='item'; item.dataset.index=i;
      item.innerHTML=`<img class="thumb" src="${esc(thumb(t))}" alt=""><div class="item-main"><div class="item-title">${esc(t.title)}</div><div class="item-meta">${esc(t.uploader||'YouTube')} • ${fmt(t.duration)}</div></div><div class="item-actions"><button class="add">＋</button><button class="primary play">▶</button></div>`;
      item.addEventListener('click',e=>{if(e.target.closest('button'))return;state.selectedSearch=t;document.querySelectorAll('#searchList .item').forEach(x=>x.classList.remove('selected'));item.classList.add('selected')});
      item.querySelector('.add').addEventListener('click',()=>addToQueue(t,false));
      item.querySelector('.play').addEventListener('click',()=>addToQueue(t,true));
      box.appendChild(item);
    }
  }

  function renderQueue(){
    const box=$('queueList'); box.innerHTML=''; $('queueCount').textContent=String(state.queue.length);
    if(!state.queue.length){box.innerHTML='<div class="empty-state">ยังไม่มีเพลงในคิว<br>ค้นหาเพลงแล้วกด ＋ เพิ่มลงคิว</div>';return}
    state.queue.forEach((t,i)=>{
      const item=document.createElement('div'); item.className='item queue-item'+(i===state.currentIndex?' selected':'');
      item.dataset.index=i;
      item.innerHTML=`<div class="queue-num">${i+1}</div><img class="thumb" src="${esc(thumb(t))}" alt=""><div class="item-main"><div class="item-title">${i===state.currentIndex?'▶ ':''}${esc(t.title)}</div><div class="item-meta">${esc(t.uploader||'YouTube')} • ${fmt(t.duration)}</div></div><div class="item-actions"><button class="primary play">▶</button><button class="up">↑</button><button class="down">↓</button></div>`;
      item.querySelector('.play').addEventListener('click',()=>startTrack(i));
      item.querySelector('.up').addEventListener('click',()=>moveQueue(i,-1));
      item.querySelector('.down').addEventListener('click',()=>moveQueue(i,1));
      item.addEventListener('click',e=>{if(e.target.closest('button'))return;document.querySelectorAll('#queueList .item').forEach(x=>x.classList.remove('selected'));item.classList.add('selected')});
      box.appendChild(item);
    });
  }

  function addToQueue(track,play){
    if(!track?.id)return;
    let idx=state.queue.findIndex(x=>x.id===track.id);
    if(idx<0){state.queue.push({...track});idx=state.queue.length-1}
    renderQueue();
    if(play)startTrack(idx);else{state.selectedSearch={...track};toast('✅ เพิ่มเพลงลงคิวแล้ว');if(state.current)prepareNext()}
  }

  function removeSelectedQueue(){
    const selected=$('#queueList .item.selected'); const idx=selected?Number(selected.dataset.index):-1;
    if(idx<0||idx>=state.queue.length){toast('แตะเลือกเพลงในคิวก่อน');return}
    const deletingCurrent=idx===state.currentIndex;
    state.queue.splice(idx,1);
    if(idx<state.currentIndex)state.currentIndex--;
    if(state.nextIndex>idx)state.nextIndex--;
    if(deletingCurrent){stopPlayback();state.current=null;state.currentIndex=-1;state.next=null;state.nextReady=false}
    else if(state.nextIndex===idx){state.next=null;state.nextReady=false}
    renderQueue();prepareNext();toast('ลบเพลงออกจากคิวแล้ว');
  }

  function moveQueue(i,delta){
    const j=i+delta;if(j<0||j>=state.queue.length)return;
    [state.queue[i],state.queue[j]]=[state.queue[j],state.queue[i]];
    if(state.currentIndex===i)state.currentIndex=j;else if(state.currentIndex===j)state.currentIndex=i;
    if(state.nextIndex===i)state.nextIndex=j;else if(state.nextIndex===j)state.nextIndex=i;
    renderQueue();prepareNext();
  }
  function clearQueue(){state.queue=[];state.next=null;state.nextIndex=-1;state.nextReady=false;renderQueue();toast('ล้างคิวแล้ว • เพลงปัจจุบันยังเล่นอยู่')}

  function setCurrentUI(track){
    $('nowTitle').textContent=track?.title||'Unknown';
    $('nowMeta').textContent=`${track?.uploader||'YouTube'} • ${fmt(track?.duration||180)}`;
    const img=$('coverImg'); const ph=$('coverPlaceholder');
    if(track?.id){img.src=thumb(track);img.style.display='block';ph.style.display='none'}else{img.removeAttribute('src');img.style.display='none';ph.style.display='flex'}
  }

  function resetPlayer(p){try{p.stopVideo();p.mute();p.setVolume(0)}catch{}}
  function stopPlayback(){resetPlayer(playerA);resetPlayer(playerB);state.active='a';state.paused=false;state.mix.running=false;state.mix.phase='idle';}
  function getDuration(){try{return Number(currentPlayer()?.getDuration?.())||Number(state.duration)||180}catch{return Number(state.duration)||180}}

  function setPlayerSource(p,id,start){
    try{p.unMute();p.setVolume(0);p.loadVideoById({videoId:id,startSeconds:start});return true}catch(e){console.error(e);return false}
  }

  function fade(p,from,to,duration,done){
    if(!p){done?.();return}
    const started=performance.now(), delta=to-from;
    const frame=(now)=>{
      const q=Math.min(1,Math.max(0,(now-started)/duration));
      const eased=q<.5?2*q*q:1-Math.pow(-2*q+2,2)/2;
      try{p.setVolume(Math.round(from+delta*eased))}catch{}
      if(q<1)requestAnimationFrame(frame);else done?.();
    };
    requestAnimationFrame(frame);
  }

  async function waitForPlaying(p,timeout=6500){
    const start=performance.now();
    while(performance.now()-start<timeout){
      try{const s=p?.getPlayerState?.();if(s===YT.PlayerState.PLAYING)return true;if(s===YT.PlayerState.ENDED||s===YT.PlayerState.CUED){p.playVideo()}}catch{}
      await new Promise(r=>setTimeout(r,80));
    }
    return false;
  }

  async function startTrack(index){
    if(index<0||index>=state.queue.length)return;
    state.session++; const session=state.session;
    state.currentIndex=index; state.current={...state.queue[index]}; state.duration=Number(state.current.duration)||180; state.pos=0;
    state.next=null;state.nextIndex=-1;state.nextReady=false;state.paused=false;state.mix.running=false;state.mix.phase='idle';
    stopPlayback(); renderQueue(); setCurrentUI(state.current); updateMode();
    setStatus('กำลังเตรียมเพลง…','warn'); $('clockLabel').textContent='AUTO MIX • LOADING';
    if(!state.playersReady){toast('แตะอีกครั้งเมื่อ YouTube Player พร้อม');setStatus('WAITING FOR PLAYER','warn');return}
    const p=playerA;state.active='a';
    const start=state.autoMix?calcHookStart(state.duration):0;
    if(!setPlayerSource(p,state.current.id,start)){setStatus('PLAYBACK ERROR','warn');return}
    try{p.playVideo()}catch{}
    const ok=await waitForPlaying(p);
    if(session!==state.session)return;
    if(!ok){setStatus('PLAYBACK ERROR','warn');toast('YouTube ไม่อนุญาตให้เริ่มเพลง');return}
    state.pos=start;state.duration=getDuration();state.mix.phase='idle';
    fade(p,0,state.volume,650,()=>{});
    $('clockLabel').textContent='AUTO MIX • PLAYING';
    setStatus(state.autoMix?`✅ PLAYING • HOOK ${HOOK_SECONDS} วิ`:'✅ PLAYING FULL SONG');
    prepareNext();
  }

  function calcHookStart(duration){
    duration=Number(duration)||180;
    if(duration<=HOOK_SECONDS)return 0;
    return Math.min(duration*.30,Math.max(0,duration-HOOK_SECONDS));
  }

  function prepareNext(){
    if(!state.current||state.mix.running||state.nextReady)return;
    let idx=state.currentIndex+1;
    if(idx<0)idx=0;
    if(idx>=state.queue.length){
      state.next=null;state.nextIndex=-1;$('nextText').textContent=state.autoMusic?'เพลงต่อไป: AUTO MUSIC รอค้นหา…':'เพลงต่อไป: —';
      if(state.autoMusic&&!state.aiPreparing)prepareAutoMusic();
      return;
    }
    state.next={...state.queue[idx]};state.nextIndex=idx;
    $('nextText').textContent=`เพลงต่อไป: ${state.next.title} • กำลังเตรียม…`;
    const p=standbyPlayer(); if(!p){return}
    try{
      p.stopVideo();p.mute();p.setVolume(0);p.cueVideoById(state.next.id);state.nextReady=true;
      $('nextText').textContent=`เพลงต่อไป: ${state.next.title} • ✅ READY`;
    }catch(e){state.nextReady=false;setStatus('NEXT PRELOAD ERROR','warn')}
  }

  async function prepareAutoMusic(){
    if(!state.autoMusic||state.aiPreparing||!state.current)return;
    state.aiPreparing=true;$('nextText').textContent='เพลงต่อไป: ✨ AUTO MUSIC กำลังหา…';
    try{
      const q=`${state.current.title||''} ${state.current.uploader||''} similar song music`;
      const rows=await window.AuraYouTubeSearch.search(q,'YouTube ทั้งหมด');
      const used=new Set(state.queue.map(x=>x.id));
      const pick=rows.find(x=>x.id&&!used.has(x.id));
      if(pick){state.queue.push(pick);renderQueue();prepareNext();toast('✨ AUTO MUSIC เพิ่มเพลงถัดไปแล้ว')}
      else $('nextText').textContent='เพลงต่อไป: หาเพลงคล้ายกันไม่พบ';
    }catch(e){console.error(e);$('nextText').textContent='เพลงต่อไป: AUTO MUSIC ใช้งานไม่ได้'}
    finally{state.aiPreparing=false}
  }

  function runMix(){
    if(state.mix.running||!state.nextReady||!state.next)return;
    const old=currentPlayer(), incoming=standbyPlayer();
    if(!old||!incoming){return}
    state.mix.running=true;state.mix.phase='crossfade';state.mix.startedAt=performance.now();
    setStatus('🎚 AUTO MIX • SMOOTH CROSSFADE');$('clockLabel').textContent='AUTO MIX • CROSSFADE 4S';
    try{incoming.unMute();incoming.setVolume(0);incoming.playVideo()}catch{}
    const oldVol=state.volume;
    fade(old,oldVol,0,MIX_SECONDS*1000,()=>{try{old.stopVideo()}catch{}});
    fade(incoming,0,state.volume,MIX_SECONDS*1000,()=>{
      if(!state.mix.running)return;
      recordHistory(state.current);
      state.active=state.active==='a'?'b':'a';
      state.current={...state.next};state.currentIndex=state.nextIndex;state.duration=Number(state.current.duration)||180;state.pos=0;
      state.next=null;state.nextIndex=-1;state.nextReady=false;state.mix.running=false;state.mix.phase='idle';
      setCurrentUI(state.current);renderQueue();
      $('clockLabel').textContent='AUTO MIX • PLAYING';setStatus('✅ AUTO MIX • PLAYING');
      $('timeLabel').textContent=`0:00 / ${fmt(state.autoMix?HOOK_SECONDS:state.duration)}`;$('progressBar').style.width='0%';
      prepareNext();
    });
  }

  // This monitor preserves the Python timing model: when AUTO MIX is ON, the visible play window is 60 seconds.
  function monitor(){
    if(!state.current||state.paused||state.mix.running)return;
    const p=currentPlayer(); if(!p)return;
    let pos=state.pos,dur=state.duration;
    try{pos=Number(p.getCurrentTime())||0;dur=Number(p.getDuration())||dur}catch{}
    state.pos=pos;state.duration=dur||state.duration;
    const hookStart=state.autoMix?calcHookStart(state.duration):0;
    const elapsed=state.autoMix?Math.max(0,pos-hookStart):pos;
    const visible=state.autoMix?HOOK_SECONDS:Math.max(1,state.duration);
    const pct=Math.max(0,Math.min(1,elapsed/visible));
    $('progressBar').style.width=`${pct*100}%`;
    $('timeLabel').textContent=`${fmt(elapsed)} / ${fmt(visible)}`;
    drawWave(pct);
    if(state.autoMusic&&!state.nextReady&&elapsed>=Math.max(0,visible-12))prepareNext();
    if(state.autoMix){
      if(elapsed>=visible-PLAYBACK_EPSILON){
        if(state.nextReady)runMix();else{setStatus('⏳ AUTO MIX • WAITING FOR NEXT','warn');prepareNext()}
      }
    }else{
      if(pos>=dur-MIX_SECONDS&&state.nextReady)runMix();
      else if(pos>=dur-1.5&&!state.nextReady)prepareNext();
    }
  }

  function recordHistory(track){
    if(!track?.id)return;state.history=state.history.filter(x=>x.id!==track.id);state.history.unshift({...track,played_at:new Date().toLocaleString('th-TH')});state.history=state.history.slice(0,100);saveJSON('aura_mix_history',state.history)
  }

  function playPrev(){if(!state.queue.length)return;startTrack(Math.max(0,state.currentIndex-1))}
  function playNext(){if(!state.queue.length)return;const i=state.currentIndex+1;if(i<state.queue.length)startTrack(i);else if(state.autoMusic)prepareAutoMusic();else toast('ไม่มีเพลงถัดไปในคิว')}
  function togglePause(){
    const p=currentPlayer();if(!p||!state.current)return;
    if(state.mix.running){toast('กำลัง MIX อยู่ • พักเพลงไม่ได้');return}
    if(!state.paused){try{p.pauseVideo();state.paused=true;$('pauseBtn').querySelector('strong').textContent='▶ เล่นต่อ';setStatus('⏸ พักเพลงแล้ว');}catch{}}
    else{try{p.playVideo();state.paused=false;$('pauseBtn').querySelector('strong').textContent='⏸ พักเพลง';setStatus('▶ เล่นต่อแล้ว')}catch{}}
  }
  function stopAll(){state.session++;stopPlayback();state.current=null;state.currentIndex=-1;state.next=null;state.nextIndex=-1;state.nextReady=false;renderQueue();setCurrentUI(null);setStatus('READY • หยุดเพลงแล้ว');$('clockLabel').textContent='AUTO MIX • READY';$('nextText').textContent='เพลงต่อไป: —';$('timeLabel').textContent='0:00 / 1:00';$('progressBar').style.width='0%';toast('หยุดเพลงแล้ว')}

  function updateMode(){
    $('mixBtn').classList.toggle('active',state.autoMix);$('mixBtn').querySelector('strong').textContent=state.autoMix?'🤖 AUTO MIX':'🤖 AUTO MIX';$('mixBtn').querySelector('span').textContent=state.autoMix?'ON • 60s':'OFF • FULL SONG';
    $('modeText').textContent=state.autoMix?`AUTO • ${HOOK_SECONDS} วิ / เพลง • CROSSFADE ${MIX_SECONDS} วิ • PRELOAD`:`FULL TRACK • AUTO NEXT • CROSSFADE ${MIX_SECONDS} วิ • PRELOAD`;
  }
  function toggleMix(){state.autoMix=!state.autoMix;updateMode();if(state.current){state.mix.phase='idle';$('timeLabel').textContent=`0:00 / ${fmt(state.autoMix?HOOK_SECONDS:state.duration)}`;prepareNext()}toast(state.autoMix?'AUTO MIX เปิด':'AUTO MIX ปิด • เล่นเต็มเพลง')}
  function toggleAutoMusic(){state.autoMusic=!state.autoMusic;$('autoMusicBtn').classList.toggle('active',state.autoMusic);$('autoMusicBtn').querySelector('span').textContent=state.autoMusic?'ON':'OFF';if(state.autoMusic)prepareNext();toast(state.autoMusic?'AUTO MUSIC เปิด':'AUTO MUSIC ปิด')}

  function drawWave(progress=0){
    const c=$('waveCanvas');const r=c.getBoundingClientRect();if(r.width<10||r.height<10)return;const d=window.devicePixelRatio||1;c.width=Math.floor(r.width*d);c.height=Math.floor(r.height*d);const ctx=c.getContext('2d');ctx.setTransform(d,0,0,d,0,0);ctx.clearRect(0,0,r.width,r.height);
    const mid=r.height/2, seed=String(state.current?.id||'aura').split('').reduce((a,ch)=>a+ch.charCodeAt(0),0), count=Math.max(70,Math.floor(r.width/4));
    ctx.lineWidth=1;ctx.strokeStyle='#1d2a38';ctx.beginPath();ctx.moveTo(0,mid);ctx.lineTo(r.width,mid);ctx.stroke();
    for(let i=0;i<count;i++){const x=i/(count-1)*r.width;const amp=7+((Math.sin(i*.39+seed)+1)/2)*24+((Math.sin(i*1.29+seed*.11)+1)/2)*10;ctx.strokeStyle=(i/(count-1))<=progress?'#b29fff':'#344454';ctx.beginPath();ctx.moveTo(x,mid-amp);ctx.lineTo(x,mid+amp);ctx.stroke()}
    const px=Math.max(0,Math.min(r.width,progress*r.width));ctx.strokeStyle='#eee9ff';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(px,8);ctx.lineTo(px,r.height-8);ctx.stroke();
  }

  function seekWave(clientX){
    if(!state.current||state.mix.running)return;const p=currentPlayer();if(!p)return;const r=$('waveCanvas').getBoundingClientRect();const frac=Math.max(0,Math.min(1,(clientX-r.left)/r.width));const dur=getDuration();const start=state.autoMix?calcHookStart(dur):0;const visible=state.autoMix?Math.min(HOOK_SECONDS,Math.max(1,dur-start)):dur;const target=state.autoMix?Math.min(dur,start+frac*visible):frac*dur;try{p.seekTo(target,true);state.pos=target;setStatus('⏩ เลื่อนตำแหน่งเพลงแล้ว')}catch{}}

  function openModal(title,html){$('modalTitle').textContent=title;$('modalBody').innerHTML=html;$('modal').classList.add('show');$('modal').setAttribute('aria-hidden','false')}
  function closeModal(){$('modal').classList.remove('show');$('modal').setAttribute('aria-hidden','true')}

  function showMenu(){
    openModal('☰ เมนู',`<div class="modal-grid"><button id="mEQ">🎚 ปรับแต่งเสียง</button><button id="mHistory">🕘 ประวัติการฟัง</button><button id="mArtist">🎤 ค้นหาเพลย์ลิสต์ศิลปิน</button><button id="mOld">🎲 เพลงยุค 1990–2000</button><button id="mMix">🤖 AUTO MIX ${state.autoMix?'ON':'OFF'}</button><button id="mAuto">✨ AUTO MUSIC ${state.autoMusic?'ON':'OFF'}</button></div>`);
    $('mEQ').onclick=()=>showEQ();$('mHistory').onclick=()=>showHistory();$('mArtist').onclick=()=>{closeModal();artistSearch()};$('mOld').onclick=()=>{closeModal();oldPlaylist()};$('mMix').onclick=()=>{toggleMix();showMenu()};$('mAuto').onclick=()=>{toggleAutoMusic();showMenu()};
  }

  function showEQ(){
    const keys=[['bass','🔊 Bass'],['music','🎵 Music'],['vocal','🎤 Vocal']];
    openModal('🎚 ปรับแต่งเสียง',`${keys.map(([k,label])=>`<div class="sheet-row"><label>${label}</label><input id="eq_${k}" type="range" min="-12" max="12" value="${state.eq[k]}"><b id="eqv_${k}">${state.eq[k]===0?'0':state.eq[k]} dB</b></div>`).join('')}<div class="modal-grid"><button id="autoEQ">✨ AUTO EQ ${state.autoEq?'ON':'OFF'}</button><button id="resetEQ">↺ รีเซ็ต</button></div><p style="color:#718094;font-size:10px;line-height:1.7">ค่า EQ และ AUTO EQ ถูกเก็บไว้ในเครื่องตามเมนูเดิม แต่ YouTube IFrame ไม่อนุญาตให้หน้าเว็บนำสัญญาณเสียงข้ามโดเมนเข้า Web Audio เพื่อทำ EQ จริงแบบ VLC ได้</p>`);
    for(const k of ['bass','music','vocal']){$(`eq_${k}`).oninput=()=>{state.eq[k]=Number($(`eq_${k}`).value);$(`eqv_${k}`).textContent=`${state.eq[k]===0?'0':state.eq[k]} dB`;saveJSON('aura_mix_eq',state.eq)}}
    $('autoEQ').onclick=()=>{state.autoEq=!state.autoEq;saveJSON('aura_mix_auto_eq',state.autoEq);showEQ()};$('resetEQ').onclick=()=>{state.eq={bass:0,music:0,vocal:0};saveJSON('aura_mix_eq',state.eq);showEQ()};
  }

  function showHistory(){
    if(!state.history.length){openModal('🕘 ประวัติการฟัง','<div class="empty-state">ยังไม่มีประวัติการฟัง</div>');return}
    openModal('🕘 ประวัติการฟัง',`${state.history.map((t,i)=>`<div class="item history-item"><img class="thumb" src="${esc(thumb(t))}" alt=""><div class="item-main"><div class="item-title">${i+1}. ${esc(t.title)}</div><div class="item-meta">${esc(t.uploader||'YouTube')} • ${esc(t.played_at||'—')}</div></div><div class="item-actions"><button class="primary" data-history="${i}">▶</button></div></div>`).join('')}<div class="modal-grid"><button id="clearHistory" class="danger">🗑 ล้างประวัติ</button></div>`);
    document.querySelectorAll('[data-history]').forEach(b=>b.onclick=()=>{const t=state.history[Number(b.dataset.history)];closeModal();addToQueue(t,true)});$('clearHistory').onclick=()=>{state.history=[];saveJSON('aura_mix_history',[]);showHistory()}
  }

  async function doSearch(){
    const q=$('searchInput').value.trim();if(!q)return;setStatus('🔍 กำลังค้นหา…','warn');$('searchList').innerHTML='<div class="empty-state">กำลังค้นหาเพลง…</div>';
    try{const rows=await window.AuraYouTubeSearch.search(q,$('searchMode').value);renderSearch(rows);setStatus(`✅ พบ ${rows.length} เพลง`)}catch(e){console.error(e);renderSearch([]);setStatus('SEARCH ERROR','warn');toast(e.message||'ค้นหาไม่สำเร็จ')}
  }
  async function artistSearch(){
    const artist=prompt('พิมพ์ชื่อศิลปิน:','');if(!artist?.trim())return;state.selectedSearch=null;$('searchInput').value=artist.trim();setStatus(`🎤 กำลังค้นหาเพลงของ ${artist.trim()}…`,'warn');
    try{const rows=await window.AuraYouTubeSearch.artistPlaylist(artist.trim());renderSearch(rows);rows.forEach(t=>{if(!state.queue.some(q=>q.id===t.id))state.queue.push(t)});renderQueue();if(!state.current&&state.queue.length)startTrack(0);else prepareNext();toast(`✅ เพิ่มเพลงของ ${artist.trim()} ${rows.length} เพลง`)}catch(e){setStatus('SEARCH ERROR','warn');toast(e.message||'ค้นหาไม่สำเร็จ')}
  }
  async function oldPlaylist(){
    setStatus('🎲 กำลังหาเพลงยุค 1990–2000…','warn');$('searchInput').value='เพลงยุค 1990-2000 • GMM GRAMMY OFFICIAL';
    try{const rows=await window.AuraYouTubeSearch.oldPlaylist();renderSearch(rows);rows.forEach(t=>{if(!state.queue.some(q=>q.id===t.id))state.queue.push(t)});renderQueue();if(!state.current&&state.queue.length)startTrack(0);else prepareNext();toast(`🎲 เพิ่มเพลง ${rows.length} เพลงแล้ว`)}catch(e){setStatus('SEARCH ERROR','warn');toast(e.message||'ค้นหาไม่สำเร็จ')}
  }

  function bindUI(){
    $('searchBtn').onclick=doSearch;$('searchInput').addEventListener('keydown',e=>{if(e.key==='Enter')doSearch()});$('artistBtn').onclick=artistSearch;$('oldBtn').onclick=oldPlaylist;
    $('playBtn').onclick=()=>{if(state.current)togglePause();else if(state.queue.length)startTrack(0);else if(state.selectedSearch)addToQueue(state.selectedSearch,true);else toast('ค้นหาเพลงก่อนครับ')};
    $('pauseBtn').onclick=togglePause;$('prevBtn').onclick=playPrev;$('nextBtn').onclick=playNext;$('stopBtn').onclick=stopAll;$('mixBtn').onclick=toggleMix;$('autoMusicBtn').onclick=toggleAutoMusic;
    $('removeBtn').onclick=removeSelectedQueue;$('clearBtn').onclick=clearQueue;$('moreBtn').onclick=showMenu;$('navMenuBtn').onclick=showMenu;$('closeModal').onclick=closeModal;$('modal').onclick=e=>{if(e.target===$('modal'))closeModal()};
    $('vol').oninput=()=>{state.volume=Number($('vol').value);$('volVal').textContent=`${state.volume}%`;try{currentPlayer()?.setVolume(state.volume)}catch{}};
    const canvas=$('waveCanvas');canvas.addEventListener('pointerdown',e=>{touchSeek=true;canvas.setPointerCapture?.(e.pointerId);seekWave(e.clientX)});canvas.addEventListener('pointermove',e=>{if(touchSeek)seekWave(e.clientX)});canvas.addEventListener('pointerup',()=>touchSeek=false);canvas.addEventListener('pointercancel',()=>touchSeek=false);
    document.querySelectorAll('.nav-item[data-target]').forEach(btn=>btn.onclick=()=>{document.getElementById(btn.dataset.target).scrollIntoView({behavior:'smooth',block:'start'});document.querySelectorAll('.nav-item').forEach(x=>x.classList.remove('active'));btn.classList.add('active')});
    window.addEventListener('resize',()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>drawWave(),100)});
  }

  window.onYouTubeIframeAPIReady=function(){
    const opts={height:'2',width:'2',host:'https://www.youtube.com',playerVars:{autoplay:0,controls:0,disablekb:1,fs:0,iv_load_policy:3,modestbranding:1,playsinline:1,rel:0},events:{onReady:onPlayerReady,onError:e=>{console.error('YouTube',e);setStatus('YOUTUBE ERROR','warn')}}};
    playerA=new YT.Player('yt-a',opts);playerB=new YT.Player('yt-b',opts);
  };
  function onPlayerReady(){state.readyCount++;if(state.readyCount===2){state.playersReady=true;setStatus('READY • YouTube Player พร้อม');}}

  bindUI();updateMode();renderQueue();nowClock();clockId=setInterval(nowClock,1000);timerId=setInterval(monitor,MIX_TICK_MS);drawWave();
})();
