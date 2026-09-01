const CFG = { HOOK_SECONDS: 60, MIX_SECONDS: 4, HOOK_RATIO: 0.30, MAX_VOLUME: 100 };
const state = {
  queue: JSON.parse(localStorage.getItem('aura_queue') || '[]'),
  history: JSON.parse(localStorage.getItem('aura_history') || '[]'),
  currentIndex: -1, current: null, next: null, nextIndex: -1,
  mixOn: JSON.parse(localStorage.getItem('aura_mix') ?? 'true'),
  autoMusic: JSON.parse(localStorage.getItem('aura_auto_music') ?? 'true'),
  autoEQ: JSON.parse(localStorage.getItem('aura_auto_eq') ?? 'true'),
  selectedSearch: null, selectedQueue: 0, paused: false, startedAt: 0, duration: 0,
  playerA: null, playerB: null, active: 'A', mixTimer: null, progressTimer: null,
  playersReady: 0, apiReady: false, loaded: { A:false, B:false },
  eqValues: { bass: 0, music: 0, vocal: 0 }
};

const $ = id => document.getElementById(id);
const els = { searchInput:$('searchInput'), searchMode:$('searchMode'), searchBtn:$('searchBtn'), searchList:$('searchList'), queueList:$('queueList'), addBtn:$('addBtn'), removeBtn:$('removeBtn'), clearBtn:$('clearBtn'), startBtn:$('startBtn'), pauseBtn:$('pauseBtn'), nextBtn:$('nextBtn'), prevBtn:$('prevBtn'), stopBtn:$('stopBtn'), mixBtn:$('mixBtn'), autoMusic:$('autoMusic'), autoEQ:$('autoEQ'), status:$('status'), engineClock:$('engineClock'), nextLabel:$('nextLabel'), modeLabel:$('modeLabel'), nowTitle:$('nowTitle'), meta:$('meta'), cover:$('cover'), coverFallback:$('coverFallback'), progress:$('progress'), timeline:$('timeline'), waveform:$('waveform'), clock:$('clock'), shuffle90Btn:$('shuffle90Btn'), artistBtn:$('artistBtn'), historyBtn:$('historyBtn'), historyModal:$('historyModal'), historyList:$('historyList'), closeHistory:$('closeHistory'), clearHistory:$('clearHistory'), toast:$('toast'), eqProfileName:$('eqProfileName') };

function save(){ localStorage.setItem('aura_queue', JSON.stringify(state.queue)); localStorage.setItem('aura_history', JSON.stringify(state.history)); localStorage.setItem('aura_mix', JSON.stringify(state.mixOn)); localStorage.setItem('aura_auto_music', JSON.stringify(state.autoMusic)); localStorage.setItem('aura_auto_eq', JSON.stringify(state.autoEQ)); }
function fmt(s){ s=Math.max(0,Math.floor(Number(s)||0)); return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`; }
function toast(t){ els.toast.textContent=t; els.toast.classList.add('show'); clearTimeout(toast.t); toast.t=setTimeout(()=>els.toast.classList.remove('show'),2300); }
function uniqueQueue(){ const seen=new Set(); state.queue=state.queue.filter(x=>x?.id && !seen.has(x.id) && seen.add(x.id)); }
function currentPlayer(){ return state.active==='A'?state.playerA:state.playerB; }
function standbyPlayer(){ return state.active==='A'?state.playerB:state.playerA; }
function hookStart(duration){ return duration<=CFG.HOOK_SECONDS ? 0 : Math.min(duration*CFG.HOOK_RATIO, duration-CFG.HOOK_SECONDS); }
function normalizeText(text) { return (text || '').toString().toLowerCase().trim().replace(/\s+/g, ' '); }

window.onYouTubeIframeAPIReady = function(){ state.apiReady=true; makePlayer('A','playerA'); makePlayer('B','playerB'); };
function makePlayer(which, id){ const player = new YT.Player(id,{width:'1',height:'1',videoId:'',playerVars:{autoplay:0,controls:0,disablekb:1,playsinline:1,rel:0,modestbranding:1},events:{onReady:()=>{ state.playersReady++; if(which==='A') state.playerA=player; else state.playerB=player; },onStateChange:e=>onYTState(which,e),onError:e=>setStatus('⚠️ YouTube เล่นเพลงนี้ไม่ได้ ('+e.data+')','bad')}}); }

function onYTState(which,e){ if(e.data===YT.PlayerState.ENDED){ if(which===state.active) transitionOrAdvance(); } }
function setStatus(text, cls='ok'){ els.status.textContent=text; els.status.className='status '+cls; }
function updateClock(){ const d=new Date(); els.clock.textContent=d.toLocaleTimeString('th-TH',{hour12:false})+' • '+d.toLocaleDateString('th-TH'); }
setInterval(updateClock,1000); updateClock();

async function search(q=els.searchInput.value.trim(), mode=els.searchMode.value, max=25, isPlaylist=false){
  if(!q) return toast('พิมพ์ชื่อเพลงหรือศิลปินก่อน');
  if(!isPlaylist) els.searchList.innerHTML='<div class="track"><div></div><div>กำลังค้นหา…</div></div>';
  state.selectedSearch=null;
  const exclude=[...new Set(state.queue.map(x=>x.id).filter(Boolean))].join(',');
  try{
    const r=await fetch(`/.netlify/functions/youtube-search?q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode)}&max=${max}&exclude=${encodeURIComponent(exclude)}`);
    const data=await r.json(); if(!r.ok) throw new Error(data.error||'Search failed');
    return data;
  }catch(e){ if(!isPlaylist){ els.searchList.innerHTML=''; setStatus('❌ '+e.message,'bad'); toast('ค้นหาไม่สำเร็จ'); } return []; }
}
function renderSearch(rows){ els.searchList.innerHTML=''; if(!rows.length){ els.searchList.innerHTML='<div class="track"><div></div><div>ไม่พบผลลัพธ์</div></div>'; return; } rows.forEach(track=>{ const el=document.createElement('div'); el.className='track'; el.innerHTML=`<img class="thumb" src="${escapeAttr(track.thumbnail)}" alt=""><div><div class="track-title">${escapeHtml(track.title)}</div><div class="track-sub">${escapeHtml(track.uploader)} • ${fmt(track.duration)}</div></div>`; el.onclick=()=>{document.querySelectorAll('#searchList .track').forEach(x=>x.classList.remove('selected')); el.classList.add('selected'); state.selectedSearch=track;}; el.ondblclick=()=>{addTrack(track,true)}; els.searchList.appendChild(el); }); }
function escapeHtml(s){ return String(s).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }
function escapeAttr(s){return String(s).replace(/"/g,'&quot;');}

function addTrack(track,start=false){ if(!track?.id) return toast('เลือกเพลงก่อน'); state.queue.push({...track}); uniqueQueue(); state.selectedQueue=state.queue.length-1; save(); renderQueue(); if(start) startTrack(state.selectedQueue); else { toast('✅ เพิ่มเข้าคิวแล้ว'); if(state.current && !state.next) prepareNext(); } }
function renderQueue(){ els.queueList.innerHTML=''; state.queue.forEach((t,i)=>{ const el=document.createElement('div'); el.className='queue-item '+(i===state.currentIndex?'current':''); el.draggable=true; el.dataset.index=i; el.innerHTML=`<div class="qnum">${i===state.currentIndex?'▶':'♪'}</div><div><div class="track-title">${escapeHtml(t.title)}</div><div class="track-sub">${escapeHtml(t.uploader||'Unknown')}</div></div><div>⋮</div>`; el.onclick=()=>{state.selectedQueue=i; document.querySelectorAll('#queueList .queue-item').forEach(x=>x.classList.remove('selected')); el.classList.add('selected')}; el.ondblclick=()=>startTrack(i); el.addEventListener('dragstart',e=>e.dataTransfer.setData('text/plain',i)); el.addEventListener('dragover',e=>e.preventDefault()); el.addEventListener('drop',e=>{e.preventDefault(); const from=Number(e.dataTransfer.getData('text/plain')); const to=i; if(Number.isInteger(from)&&from!==to){const [m]=state.queue.splice(from,1);state.queue.splice(to,0,m); if(state.currentIndex===from)state.currentIndex=to; save();renderQueue();prepareNext(); setStatus('✅ จัดลำดับคิวใหม่แล้ว');}}); els.queueList.appendChild(el); }); }
function addSelected(){ if(!state.selectedSearch) return toast('⚠️ กรุณาเลือกเพลงจากผลการค้นหาก่อน'); addTrack(state.selectedSearch); }
function removeSelected(){ const i=state.selectedQueue; if(i<0||i>=state.queue.length) return; const isCurrent=i===state.currentIndex; state.queue.splice(i,1); if(i<state.currentIndex) state.currentIndex--; if(isCurrent) state.currentIndex=-1; save(); renderQueue(); if(state.current) prepareNext(); setStatus('ลบเพลงออกจากคิวแล้ว'); }
function clearQueue(){ state.queue=[]; state.currentIndex=-1; state.selectedQueue=0; clearNext(); save(); renderQueue(); setStatus('ล้างคิวแล้ว • เพลงปัจจุบันยังเล่นอยู่'); els.nextLabel.textContent='เพลงต่อไป: —'; }

function configurePlayer(p, track, volume=0){ if(!p||!track?.id) return false; p.setVolume(volume); p.cueVideoById({videoId:track.id,startSeconds:state.mixOn?hookStart(Number(track.duration)||180):0}); return true; }
async function startTrack(i){ if(i<0||i>=state.queue.length) return toast('ยังไม่มีเพลงในคิว'); const track=state.queue[i]; state.currentIndex=i; state.current={...track}; state.selectedQueue=i; state.paused=false; els.pauseBtn.textContent='⏸ พักเพลง'; clearMixTimer(); state.active='A'; state.loaded={A:false,B:false}; try{state.playerA?.stopVideo(); state.playerB?.stopVideo();}catch{} renderQueue(); updateNow(); applyAutoEqForTrack(track); setStatus('กำลังเตรียมเพลง…'); els.engineClock.textContent='AUTO MIX • LOADING';
  const p=currentPlayer(); if(!p) return toast('กำลังโหลด YouTube Player…'); p.loadVideoById({videoId:track.id,startSeconds:state.mixOn?hookStart(Number(track.duration)||180):0}); p.setVolume(CFG.MAX_VOLUME); p.playVideo(); state.startedAt=performance.now(); state.duration=Number(track.duration)||180; setStatus(state.mixOn?`✅ PLAYING • HOOK ${CFG.HOOK_SECONDS} วิ`:'✅ PLAYING FULL SONG • AUTO NEXT'); els.engineClock.textContent=state.mixOn?'AUTO MIX':'FULL TRACK • AUTO'; startProgressLoop(); prepareNext(); }
function updateNow(){ const t=state.current; if(!t){els.nowTitle.textContent='พร้อมเล่น';els.meta.textContent='—';els.cover.classList.remove('visible');els.coverFallback.style.display='flex';return;} els.nowTitle.textContent=t.title||'Unknown'; els.meta.textContent=`${t.uploader||'Unknown'} • ${fmt(t.duration||0)}`; if(t.thumbnail){els.cover.src=t.thumbnail;els.cover.classList.add('visible');els.coverFallback.style.display='none';} }
function prepareNext(){ clearNext(); const idx=state.currentIndex+1; if(idx<state.queue.length){ state.nextIndex=idx; state.next={...state.queue[idx]}; configurePlayer(standbyPlayer(),state.next,0); els.nextLabel.textContent=`เพลงต่อไป: ${state.next.title}\n✅ READY`; return true; } if(state.autoMusic&&state.current){ els.nextLabel.textContent='เพลงต่อไป: ⏳ AUTO MIX • PREPARING NEXT...'; autoFindNext(); return false; } els.nextLabel.textContent='เพลงต่อไป: —'; return false; }
function clearNext(){ state.next=null; state.nextIndex=-1; try{standbyPlayer()?.stopVideo()}catch{} }
async function autoFindNext(){ try{ const base=(state.current.uploader||'')+' '+(state.current.title||''); const exclude=[...new Set(state.queue.map(x=>x.id))].join(','); const rows = await search(base, 'all', 8, true); if(!Array.isArray(rows)||!rows.length){els.nextLabel.textContent='เพลงต่อไป: หาเพลงอัตโนมัติไม่เจอ';return;} const pick=rows[0]; state.queue.push(pick); uniqueQueue(); save(); renderQueue(); prepareNext(); }catch(e){els.nextLabel.textContent='เพลงต่อไป: AUTO MUSIC มีปัญหา';} }

function startProgressLoop(){ cancelAnimationFrame(state.progressTimer); const loop=()=>{ if(!state.current){return;} const p=currentPlayer(); let pos=0, dur=Number(state.duration)||180; try{pos=Math.max(0,p?.getCurrentTime?.()||0); dur=Math.max(1,p?.getDuration?.()||dur);}catch{} state.duration=dur; const display=state.mixOn?Math.min(CFG.HOOK_SECONDS,pos-hookStart(dur)):pos; const max=state.mixOn?CFG.HOOK_SECONDS:dur; els.progress.max=max; els.progress.value=Math.max(0,Math.min(max,display)); els.timeline.textContent=`${fmt(display)} / ${fmt(max)}`; drawWaveform(display/max,state.current.id); if(!state.paused){ if(state.mixOn && display>=CFG.HOOK_SECONDS-CFG.MIX_SECONDS){ if(state.nextIndex<0 && state.autoMusic) prepareNext(); if(state.next) startCrossfade(); } else if(!state.mixOn && pos>=Math.max(0,dur-CFG.MIX_SECONDS)){ if(state.nextIndex<0 && state.autoMusic) prepareNext(); if(state.next) startCrossfade(); } else if(!state.mixOn && pos>=Math.max(0,dur-1)){ if(!state.next) prepareNext(); } } state.progressTimer=requestAnimationFrame(loop); }; loop(); }

function startCrossfade(){ if(state.mixTimer||!state.next) return; const incoming=standbyPlayer(), outgoing=currentPlayer(); if(!incoming||!outgoing) return; state.mixTimer={start:performance.now(),outgoing,incoming}; incoming.setVolume(0); incoming.playVideo(); setStatus('🎚 AUTO MIX • SMOOTH FADE OUT'); els.engineClock.textContent='AUTO MIX'; function tick(){ if(!state.mixTimer)return; const p=Math.min(1,(performance.now()-state.mixTimer.start)/(CFG.MIX_SECONDS*1000)); const outV=Math.round(CFG.MAX_VOLUME*Math.cos(Math.PI/2*p)); const inV=Math.round(CFG.MAX_VOLUME*Math.sin(Math.PI/2*p)); try{outgoing.setVolume(outV);incoming.setVolume(inV)}catch{} if(p<1){requestAnimationFrame(tick);return;} try{outgoing.stopVideo();incoming.setVolume(CFG.MAX_VOLUME)}catch{} const oldTitle=state.current; if(oldTitle) recordHistory(oldTitle); state.active=state.active==='A'?'B':'A'; state.currentIndex=state.nextIndex; state.current={...state.next}; state.next=null; state.nextIndex=-1; state.mixTimer=null; state.startedAt=performance.now(); state.duration=Number(state.current.duration)||180; updateNow(); renderQueue(); applyAutoEqForTrack(state.current); setStatus('✅ AUTO MIX • PLAYING'); els.engineClock.textContent='AUTO MIX'; prepareNext(); }
 requestAnimationFrame(tick); }
function transitionOrAdvance(){ if(state.current && state.next) startCrossfade(); else if(state.autoMusic) {prepareNext(); setTimeout(()=>state.next&&startCrossfade(),350);} else setStatus('เพลงจบแล้ว • AUTO MUSIC OFF'); }
function clearMixTimer(){state.mixTimer=null}

function togglePause(){ const p=currentPlayer(); if(!p||!state.current) return; if(state.mixTimer){ setStatus('กำลัง MIX อยู่ • พักเพลงชั่วคราวไม่ได้'); return; } if(state.paused){p.playVideo();state.paused=false;els.pauseBtn.textContent='⏸ พักเพลง';setStatus('▶ เล่นเพลงต่อแล้ว');} else {p.pauseVideo();state.paused=true;els.pauseBtn.textContent='▶ เล่นต่อ';setStatus('⏸ พักเพลงแล้ว');} }
function nextManual(){ if(state.currentIndex+1<state.queue.length) startTrack(state.currentIndex+1); else if(state.autoMusic){prepareNext();setTimeout(()=>{if(state.next){state.queue.push(state.next);state.currentIndex=state.queue.length-2;startTrack(state.queue.length-1);}},300);} else setStatus('ไม่มีเพลงถัดไปในคิว'); }
function prevManual(){ if(state.currentIndex>0) startTrack(state.currentIndex-1); }
function stopCurrent(){ try{state.playerA?.stopVideo();state.playerB?.stopVideo();}catch{} state.current=null;state.currentIndex=-1;clearNext();clearMixTimer();cancelAnimationFrame(state.progressTimer);els.progress.value=0;els.timeline.textContent=`0:00 / ${fmt(CFG.HOOK_SECONDS)}`;updateNow();setStatus('READY • หยุดเพลงแล้ว');els.engineClock.textContent='AUTO MIX • READY';els.nextLabel.textContent='เพลงต่อไป: —';els.nowTitle.textContent='ยกเลิกเพลงแล้ว';renderQueue(); }
function seek(f){ const p=currentPlayer(); if(!p||!state.current||state.mixTimer||state.paused)return; const dur=Number(state.duration)||180; const target=state.mixOn?hookStart(dur)+f*Math.min(CFG.HOOK_SECONDS,Math.max(1,dur-hookStart(dur))):f*dur; try{p.seekTo(Math.max(0,Math.min(dur,target)),true); setStatus('⏩ เลื่อนตำแหน่งเพลงแล้ว');}catch{} }

function recordHistory(track){ const playedAt=new Date().toLocaleString('th-TH',{hour12:false}).replace(',',' •'); const item={...track,playedAt}; state.history=state.history.filter(x=>x.id!==track.id);state.history.unshift(item);state.history=state.history.slice(0,100);save(); }
function showHistory(){ els.historyList.innerHTML=''; if(!state.history.length){els.historyList.innerHTML='<div class="track"><div></div><div>ยังไม่มีประวัติการฟัง</div></div>';} else state.history.forEach((t,i)=>{const el=document.createElement('div');el.className='track';el.innerHTML=`<img class="thumb" src="${escapeAttr(t.thumbnail||'')}" alt=""><div><div class="track-title">${i+1}. ${escapeHtml(t.title)}</div><div class="track-sub">${escapeHtml(t.uploader||'')} • ${escapeHtml(t.playedAt||'—')}</div></div>`;el.ondblclick=()=>{addTrack(t,true);els.historyModal.classList.add('hidden')};els.historyList.appendChild(el)});els.historyModal.classList.remove('hidden');}

// Waveform Interactive Logic
function renderWave(passed=0){ const c=els.waveform,ctx=c.getContext('2d'),dpr=devicePixelRatio||1,w=c.clientWidth,h=c.clientHeight;c.width=w*dpr;c.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b141d';ctx.fillRect(0,0,w,h);ctx.strokeStyle='#1b2936';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(12,h/2);ctx.lineTo(w-12,h/2);ctx.stroke(); const count=Math.max(90,Math.floor(w/4.5)),t=performance.now()/700;for(let i=0;i<count;i++){const x=12+i*(w-24)/Math.max(1,count-1),frac=i/Math.max(1,count-1);const amp=.18+.8*(.5+.5*Math.sin(frac*34+(state.current?.id||'').length))*(.45+.55*Math.abs(Math.sin(frac*71)));const hh=amp*(h*.38);ctx.fillStyle=frac<=passed?'#b59aff':'#3a4958';ctx.fillRect(x-1.15,h/2-hh,2.3,hh*2);}if(state.current){const x=12+passed*(w-24);ctx.fillStyle='#fff';ctx.fillRect(x-4,h/2-4,8,8);ctx.fillStyle='#eee9ff';ctx.fillRect(x-1,9,2,h-18);} }
function drawWaveform(passed){renderWave(passed)}; window.addEventListener('resize',()=>renderWave(els.progress.value/els.progress.max));

let isDraggingWave = false;
els.waveform.addEventListener('mousedown', e => { isDraggingWave = true; handleWaveSeek(e); });
window.addEventListener('mousemove', e => { if (isDraggingWave) handleWaveSeek(e); });
window.addEventListener('mouseup', () => { isDraggingWave = false; });
function handleWaveSeek(e){ if(!state.current) return; const rect = els.waveform.getBoundingClientRect(); let x = (e.clientX - rect.left - 12) / (rect.width - 24); x = Math.max(0, Math.min(1, x)); seek(x); renderWave(x); }
els.progress.addEventListener('input', e => { if(!state.current) return; seek(Number(e.target.value)/(Number(e.target.max)||60)); });

// Auto EQ Logic
function eqProfileForTrack(track){
  if(!track) return { bass: 0, music: 0, vocal: 0, name: "Flat" };
  const text = normalizeText(`${track.title||''} ${track.uploader||''}`);
  let p = { bass: 2, music: 2, vocal: 2, name: "POP / BALANCED" };
  if (['rock', 'metal', 'punk', 'alternative'].some(k=>text.includes(k))) p = {bass:4, music:3, vocal:1, name:"ROCK"};
  else if (['edm', 'electronic', 'dance', 'techno', 'house', 'remix', 'dj'].some(k=>text.includes(k))) p = {bass:5, music:3, vocal:1, name:"EDM / DANCE"};
  else if (['hip hop', 'hip-hop', 'hiphop', 'rap', 'trap'].some(k=>text.includes(k))) p = {bass:5, music:2, vocal:2, name:"HIP-HOP"};
  else if (['ballad', 'acoustic', 'unplugged', 'piano', 'guitar'].some(k=>text.includes(k))) p = {bass:1, music:1, vocal:4, name:"BALLAD / ACOUSTIC"};
  else if (['live', 'concert', 'session'].some(k=>text.includes(k))) p = {bass:2, music:2, vocal:3, name:"LIVE"};
  else if (['karaoke', 'คาราโอเกะ', 'voice', 'podcast', 'speech'].some(k=>text.includes(k))) p = {bass:-1, music:1, vocal:5, name:"VOCAL"};
  else if (['ost', 'soundtrack', 'movie', 'instrumental'].some(k=>text.includes(k))) p = {bass:2, music:4, vocal:0, name:"INSTRUMENTAL"};
  else if (text.includes('gmm') || text.includes('grammy')) p = {bass:2, music:2, vocal:3, name:"GMM / VOCAL"};
  return p;
}
function applyAutoEqForTrack(track){
  if(!state.autoEQ || !track) return;
  const profile = eqProfileForTrack(track);
  ['bass', 'music', 'vocal'].forEach(k => { state.eqValues[k] = profile[k]; $(k).value = profile[k]; $(k+'Value').textContent = `${profile[k]>0?'+':''}${profile[k]} dB`; });
  els.eqProfileName.textContent = profile.name;
  setStatus(`✨ AUTO EQ • ${profile.name}`);
}

els.searchBtn.onclick=async()=>{ els.searchList.innerHTML='<div class="track"><div></div><div>กำลังค้นหา…</div></div>'; const rows=await search(); renderSearch(rows); }; els.searchInput.addEventListener('keydown',async e=>{if(e.key==='Enter'){ els.searchList.innerHTML='<div class="track"><div></div><div>กำลังค้นหา…</div></div>'; const rows=await search(); renderSearch(rows); }}); els.addBtn.onclick=addSelected;els.removeBtn.onclick=removeSelected;els.clearBtn.onclick=clearQueue;els.startBtn.onclick=()=>startTrack(state.selectedQueue<state.queue.length?state.selectedQueue:0);els.pauseBtn.onclick=togglePause;els.nextBtn.onclick=nextManual;els.prevBtn.onclick=prevManual;els.stopBtn.onclick=stopCurrent;
els.mixBtn.onclick=()=>{state.mixOn=!state.mixOn;els.mixBtn.textContent=state.mixOn?'🤖 AUTO MIX • ON':'🤖 AUTO MIX • OFF';els.mixBtn.classList.toggle('active',state.mixOn);els.modeLabel.textContent=state.mixOn?'AUTO • 60 วิ / เพลง | OFF = เต็มเพลง | CROSSFADE 4 วิ | PRELOAD':'FULL TRACK | AUTO NEXT | CROSSFADE 4 วิ | PRELOAD';save();if(state.current)prepareNext();};
els.autoMusic.checked=state.autoMusic;els.autoMusic.onchange=e=>{state.autoMusic=e.target.checked;save();if(state.current)prepareNext()};
els.autoEQ.checked=state.autoEQ;els.autoEQ.onchange=e=>{state.autoEQ=e.target.checked;save(); setStatus(state.autoEQ?'✨ AUTO EQ เปิด • เพลงใหม่จะปรับตามโปรไฟล์เพลง':'🎚 AUTO EQ ปิด • ใช้ค่า EQ ที่ตั้งเอง'); if(state.autoEQ && state.current) applyAutoEqForTrack(state.current); };
els.historyBtn.onclick=showHistory;els.closeHistory.onclick=()=>els.historyModal.classList.add('hidden');els.clearHistory.onclick=()=>{state.history=[];save();showHistory();setStatus('ล้างประวัติการฟังแล้ว');};

// Playlist Generators
function isGmmSingleSong(track) {
  const uploader = normalizeText(track.uploader);
  const title = normalizeText(track.title);
  const blocked = ["รวมเพลง", "รวมฮิต", "longplay", "medley", "mix", "playlist", "compilation", "nonstop", "live", "concert", "karaoke", "คาราโอเกะ", "cover", "cover version", "เบื้องหลัง", "สัมภาษณ์", "interview", "teaser", "trailer", "ตัวอย่าง", "ข่าว", "shorts"];
  if (uploader !== "gmm grammy official") return false;
  if (!track.id) return false;
  if (blocked.some(b => title.includes(b))) return false;
  const dur = Number(track.duration) || 0;
  return dur >= 75 && dur <= 900;
}

els.shuffle90Btn.onclick=async()=>{
  els.searchInput.value = "เพลงยุค 1990-2000 • GMM GRAMMY OFFICIAL";
  els.searchList.innerHTML='<div class="track"><div></div><div>🎲 กำลังหาเพลงเดี่ยวเก่ายุค 1990-2000 จาก GMM GRAMMY OFFICIAL…</div></div>';
  setStatus('🎲 กำลังหาเพลงเดี่ยวเก่ายุค 1990-2000 จาก GMM GRAMMY OFFICIAL…');
  els.engineClock.textContent = 'PLAYLIST • YOUTUBE SEARCH';
  const rows = await search("GMM GRAMMY OFFICIAL เพลงเก่า 1990 1995", "all", 50, true);
  const filtered = rows.filter(isGmmSingleSong).sort(() => Math.random() - 0.5);
  
  const queuedIds = new Set(state.queue.map(t => t.id));
  const playlist = filtered.filter(t => !queuedIds.has(t.id));
  
  renderSearch(playlist);
  if(!playlist.length) { setStatus('ไม่พบเพลงเดี่ยวจาก GMM GRAMMY OFFICIAL ที่ผ่านตัวกรอง'); return; }
  
  state.queue.push(...playlist);
  renderQueue();
  if(!state.current && state.queue.length){ els.queueList.querySelectorAll('.queue-item')[0].click(); startTrack(0); }
  else if(state.current) prepareNext();
  setStatus(`✅ สุ่มเพลงยุค 1990-2000 ได้ ${playlist.length} เพลง • GMM GRAMMY OFFICIAL`);
  els.engineClock.textContent = 'PLAYLIST • 1990-2000 • RANDOMIZED';
};

els.artistBtn.onclick=async()=>{
  const artist = prompt('🎤 พิมพ์ชื่อศิลปิน:');
  if(!artist || !artist.trim()) return;
  els.searchInput.value = artist.trim();
  els.searchList.innerHTML=`<div class="track"><div></div><div>🎤 กำลังค้นหาเพลงของ ${artist} จาก YouTube ทุกช่อง…</div></div>`;
  setStatus(`🎤 กำลังค้นหาเพลงของ ${artist} จาก YouTube ทุกช่อง…`);
  els.engineClock.textContent = 'PLAYLIST • YOUTUBE SEARCH';
  
  const rows = await search(`"${artist}" official audio`, "all", 50, true);
  const needle = normalizeText(artist);
  const blocked = ["รวมเพลง", "รวมฮิต", "longplay", "medley", "mix", "playlist", "compilation", "nonstop", "concert", "karaoke", "คาราโอเกะ", "เบื้องหลัง", "สัมภาษณ์", "interview", "teaser", "trailer", "ตัวอย่าง", "ข่าว", "shorts", "reaction", "รีแอค"];
  
  const filtered = rows.filter(t => {
    if(!t.id) return false;
    const title = normalizeText(t.title);
    const uploader = normalizeText(t.uploader);
    if(!title.includes(needle) && !uploader.includes(needle)) return false;
    if(blocked.some(b => title.includes(b))) return false;
    const dur = Number(t.duration) || 0;
    if(dur && (dur < 45 || dur > 1800)) return false;
    return true;
  });
  
  const queuedIds = new Set(state.queue.map(t => t.id));
  const playlist = filtered.filter(t => !queuedIds.has(t.id));
  
  renderSearch(playlist);
  if(!playlist.length) { setStatus(`ไม่พบเพลงของ ${artist} ในผลค้นหา YouTube`); return; }
  
  state.queue.push(...playlist);
  renderQueue();
  if(!state.current && state.queue.length){ els.queueList.querySelectorAll('.queue-item')[0].click(); startTrack(0); }
  else if(state.current) prepareNext();
  setStatus(`✅ เพลงของ ${artist} จาก YouTube ได้ ${playlist.length} เพลง`);
  els.engineClock.textContent = `PLAYLIST • ${artist}`;
};

['bass','music','vocal'].forEach(k=>{
  const s=$(k),o=$(k+'Value');
  s.oninput=()=>{
    state.eqValues[k] = s.value;
    o.textContent=`${Number(s.value)>0?'+':''}${s.value} dB`;
    state.autoEQ = false; els.autoEQ.checked = false; save();
    els.eqProfileName.textContent = 'Custom';
    setStatus('🎚 ปรับ EQ แบบกำหนดเองแล้ว');
  };
});

uniqueQueue();renderQueue();els.mixBtn.textContent=state.mixOn?'🤖 AUTO MIX • ON':'🤖 AUTO MIX • OFF';els.mixBtn.classList.toggle('active',state.mixOn);els.autoMusic.checked=state.autoMusic;els.autoEQ.checked=state.autoEQ; renderWave(0);
