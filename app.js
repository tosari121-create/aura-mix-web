/* AURA MIX client-side YouTube API bridge.
   The API key never lives in the browser. The browser only calls the Netlify Function.
*/
(function(){
  'use strict';
  const endpoint = '/api/youtube-search';
  const fallbackEndpoint = '/.netlify/functions/youtube-search';
  const suffixMap = {
    'YouTube ทั้งหมด': '',
    'Official / Audio': ' official audio OR official',
    'Official MV': ' official MV',
    'Live': ' live',
    'Karaoke': ' karaoke'
  };
  function normalize(v){ return String(v || '').trim().toLowerCase().replace(/\s+/g,' '); }
  function mapItem(x){
    const id = x && x.id && typeof x.id === 'object' ? x.id.videoId : x.id;
    const snippet = x && x.snippet ? x.snippet : {};
    return {
      id,
      title: snippet.title || x.title || 'Unknown',
      uploader: snippet.channelTitle || x.uploader || 'YouTube',
      duration: Number((x.contentDetails && x.contentDetails.durationSeconds) || x.duration || 0),
      thumbnail: (snippet.thumbnails && ((snippet.thumbnails.medium && snippet.thumbnails.medium.url) || (snippet.thumbnails.high && snippet.thumbnails.high.url))) || x.thumbnail || (id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '')
    };
  }
  async function call(payload){
    const opts = {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload)};
    let response = await fetch(endpoint, opts).catch(()=>null);
    if(!response || !response.ok) response = await fetch(fallbackEndpoint, opts).catch(()=>null);
    if(!response) throw new Error('เชื่อมต่อ Netlify Function ไม่ได้');
    const data = await response.json().catch(()=>({}));
    if(!response.ok) throw new Error(data.error || `API error ${response.status}`);
    if(data.error) throw new Error(data.error);
    return (data.items || []).map(mapItem).filter(t=>t.id);
  }
  async function search(q, mode){
    const query = `${q} ${suffixMap[mode] || ''}`.trim();
    return call({action:'search', query, maxResults:25});
  }
  async function multi(queries, limit){
    const out=[]; const seen=new Set();
    for(const q of queries){
      const rows=await call({action:'search', query:q, maxResults:50});
      for(const row of rows){
        if(seen.has(row.id)) continue;
        seen.add(row.id); out.push(row);
        if(out.length >= limit) return out;
      }
    }
    return out;
  }
  async function artistPlaylist(artist){
    const queries=[`"${artist}"`,`"${artist}" เพลง`,`"${artist}" official`,`"${artist}" music`,`"${artist}" MV`];
    const rows=await multi(queries,90), needle=normalize(artist);
    const blocked=['รวมเพลง','รวมฮิต','longplay','medley','mix','playlist','compilation','nonstop','concert','karaoke','คาราโอเกะ','เบื้องหลัง','สัมภาษณ์','interview','teaser','trailer','ข่าว','shorts','reaction','รีแอค'];
    return rows.filter(t=>{
      const title=normalize(t.title), uploader=normalize(t.uploader);
      if(!title.includes(needle) && !uploader.includes(needle)) return false;
      if(blocked.some(k=>title.includes(k))) return false;
      return !t.duration || (t.duration>=45 && t.duration<=1800);
    }).slice(0,90);
  }
  async function oldPlaylist(){
    const queries=['GMM GRAMMY OFFICIAL เพลงเก่า 1990','GMM GRAMMY OFFICIAL เพลงเก่า 1992','GMM GRAMMY OFFICIAL เพลงเก่า 1995','GMM GRAMMY OFFICIAL เพลงเก่า 1998','GMM GRAMMY OFFICIAL เพลงเก่า 2000','GMM GRAMMY OFFICIAL เพลงยุค 90 เพลงเดี่ยว','GMM GRAMMY OFFICIAL เพลงฮิตเก่า 90s'];
    let rows=await multi(queries,360);
    const blocked=['รวมเพลง','รวมฮิต','longplay','medley','mix','playlist','compilation','nonstop','live','concert','karaoke','คาราโอเกะ','cover','cover version','เบื้องหลัง','สัมภาษณ์','interview','teaser','trailer','ตัวอย่าง','ข่าว','shorts'];
    rows=rows.filter(t=>{
      const uploader=normalize(t.uploader), title=normalize(t.title);
      if(uploader!=='gmm grammy official') return false;
      if(blocked.some(k=>title.includes(k))) return false;
      return t.duration>=75 && t.duration<=900;
    });
    for(let i=rows.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [rows[i],rows[j]]=[rows[j],rows[i]]; }
    return rows.slice(0,90);
  }
  window.AuraYouTubeSearch={search,artistPlaylist,oldPlaylist};
})();

(() => {
'use strict';
const HOOK=60, FADE=4, TICK=80, FULL_MODE=false;
const state={queue:[],currentIndex:-1,current:null,next:null,nextIndex:-1,autoMix:true,autoMusic:true,mix:{running:false,phase:'idle',started:0},duration:180,pos:0,volume:100,active:'a',nextReady:false,playersReady:false,searchResults:[],selectedSearch:null,history:JSON.parse(localStorage.getItem('aura_mix_history')||'[]'),eq:{bass:0,music:0,vocal:0},autoEq:true,session:0,coverCache:{}};
let playerA,playerB,readyCount=0,transitionTimer=null,progressTimer=null,clockTimer=null,seekDragging=false;
const $=id=>document.getElementById(id);
const esc=s=>String(s??'').replace(/[&<>'"]/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[m]));
function fmt(s){s=Math.max(0,Math.floor(Number(s)||0));return `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}
function toast(t){$('toast').textContent=t;$('toast').classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>$('toast').classList.remove('show'),1900)}
function nowClock(){const d=new Date();$('realClock').textContent=d.toLocaleTimeString('th-TH',{hour12:false})+' • '+d.toLocaleDateString('th-TH')}
function activePlayer(){return state.active==='a'?playerA:playerB} function standbyPlayer(){return state.active==='a'?playerB:playerA}
function thumb(t){return t.thumbnail||`https://i.ytimg.com/vi/${t.id}/hqdefault.jpg`}
function setStatus(s){$('status').textContent=s}
function persistHistory(){localStorage.setItem('aura_mix_history',JSON.stringify(state.history.slice(0,100)))}
function recordHistory(track){if(!track?.id)return;state.history=state.history.filter(x=>x.id!==track.id);state.history.unshift({...track,played_at:new Date().toLocaleString('th-TH')});persistHistory()}
function setCurrent(track,index){state.current={...track};state.currentIndex=index;state.duration=Number(track.duration)||180;state.pos=state.autoMix?Math.max(0,Math.min(state.duration-HOOK,state.duration*.3)):0;renderQueue();$('nowTitle').textContent=track.title||'Unknown';$('nowMeta').textContent=`${track.uploader||'YouTube'} • ${fmt(state.duration)}`;const im=$('coverImg');im.src=thumb(track);im.style.display='block';$('coverPlaceholder').style.display='none';}
function renderSearch(rows=state.searchResults){state.searchResults=rows;$('searchList').innerHTML='';state.selectedSearch=null;if(!rows.length){$('searchList').innerHTML='<div class="empty">ไม่พบผลลัพธ์</div>';return}rows.forEach((t,i)=>{const el=document.createElement('div');el.className='item';el.dataset.i=i;el.innerHTML=`<img class="thumb" src="${esc(thumb(t))}" loading="lazy"><div class="item-main"><div class="title">${esc(t.title)}</div><div class="meta">${esc(t.uploader||'YouTube')} • ${fmt(t.duration)}</div></div><div class="item-actions"><button data-action="add">＋</button><button data-action="play" class="primary">▶</button></div>`;el.addEventListener('click',e=>{if(e.target.closest('button'))return;state.selectedSearch=t;document.querySelectorAll('#searchList .item').forEach(x=>x.classList.remove('selected'));el.classList.add('selected')});el.querySelector('[data-action=add]').onclick=()=>addToQueue(t);el.querySelector('[data-action=play]').onclick=()=>{addToQueue(t,true)};$('searchList').appendChild(el)})}
function renderQueue(){const box=$('queueList');box.innerHTML='';$('queueCount').textContent=state.queue.length;if(!state.queue.length){box.innerHTML='<div class="empty">ยังไม่มีเพลงในคิว<br>เลือกเพลงด้านบนแล้วกด ＋</div>';return}state.queue.forEach((t,i)=>{const el=document.createElement('div');el.className='item drag'+(i===state.currentIndex?' selected':'');el.draggable=true;el.dataset.i=i;el.innerHTML=`<span class="queue-num">${i+1}</span><img class="thumb" src="${esc(thumb(t))}" loading="lazy"><div class="item-main"><div class="title">${i===state.currentIndex?'▶ ':''}${esc(t.title)}</div><div class="meta">${esc(t.uploader||'YouTube')} • ${fmt(t.duration)}</div></div><div class="item-actions"><button data-action="play" class="primary">▶</button><button data-action="up">↑</button><button data-action="down">↓</button></div>`;el.querySelector('[data-action=play]').onclick=()=>startTrack(i);el.querySelector('[data-action=up]').onclick=()=>moveQueue(i,-1);el.querySelector('[data-action=down]').onclick=()=>moveQueue(i,1);box.appendChild(el)});box.querySelectorAll('.drag').forEach(el=>{el.addEventListener('dragstart',()=>el.classList.add('dragging'));el.addEventListener('dragend',()=>el.classList.remove('dragging'));el.addEventListener('dragover',e=>e.preventDefault());el.addEventListener('drop',e=>{e.preventDefault();const from=Number(document.querySelector('.dragging')?.dataset.i);const to=Number(el.dataset.i);if(Number.isInteger(from)&&Number.isInteger(to)&&from!==to){const [x]=state.queue.splice(from,1);state.queue.splice(to,0,x);if(state.current?.id===x.id)state.currentIndex=to;renderQueue();prepareNext()}})})}
function addToQueue(track,play=false){if(!track?.id)return;let i=state.queue.findIndex(x=>x.id===track.id);if(i<0){state.queue.push({...track});i=state.queue.length-1}renderQueue();state.selectedSearch=track;if(play)startTrack(i);else{toast('เพิ่มเพลงลงคิวแล้ว');if(state.current)prepareNext()}}
function moveQueue(i,d){const j=i+d;if(j<0||j>=state.queue.length)return;[state.queue[i],state.queue[j]]=[state.queue[j],state.queue[i]];if(state.currentIndex===i)state.currentIndex=j;else if(state.currentIndex===j)state.currentIndex=i;if(state.nextIndex===i)state.nextIndex=j;else if(state.nextIndex===j)state.nextIndex=i;renderQueue();prepareNext()}
function removeCurrentQueue(){const i=[...document.querySelectorAll('#queueList .item')].find(x=>x.classList.contains('selected'))?.dataset.i;const idx=Number(i);if(!Number.isInteger(idx)||idx<0)return;state.queue.splice(idx,1);if(idx<state.currentIndex)state.currentIndex--;else if(idx===state.currentIndex){state.currentIndex=-1;state.current=null;stopPlayers()}renderQueue();prepareNext();toast('ลบเพลงออกจากคิวแล้ว')}
function clearQueue(){state.queue=[];state.next=null;state.nextIndex=-1;renderQueue();toast('ล้างคิวแล้ว • เพลงปัจจุบันยังเล่นอยู่')}
function playByPlayer(p,id,volume=0,startSec=0){return new Promise((resolve,reject)=>{let done=false;const onState=e=>{if(e.data===1&&!done){done=true;p.setVolume(volume);if(startSec)p.seekTo(startSec,true);resolve()}};const old=p.__onState;p.__onState=onState;p.addEventListener('onStateChange',onState);try{p.loadVideoById({videoId:id,startSeconds:startSec});p.setVolume(volume);p.playVideo()}catch(e){reject(e)}setTimeout(()=>{if(!done)resolve()},5000)})}
async function startTrack(i){if(i<0||i>=state.queue.length)return;state.session++;state.mix.running=false;state.mix.phase='idle';state.next=null;state.nextIndex=-1;state.nextReady=false;setCurrent(state.queue[i],i);setStatus('กำลังเปิดเพลง…');$('modeText').textContent=state.autoMix?`AUTO • ${HOOK} วิ / เพลง • CROSSFADE ${FADE} วิ • PRELOAD`:`FULL TRACK • CROSSFADE ${FADE} วิ • PRELOAD`;if(!playerA||!playerB){toast('กำลังเตรียมตัวเล่น YouTube…');return}const p=activePlayer();const other=standbyPlayer();try{other.stopVideo();other.mute();p.stopVideo();p.unMute();p.setVolume(0);const start=state.autoMix?Math.max(0,Math.min(state.duration-HOOK,state.duration*.3)):0;p.loadVideoById({videoId:state.current.id,startSeconds:start});p.unMute();p.playVideo();fadeVolume(p,0,state.volume,800);state.pos=start;setStatus(state.autoMix?'✅ PLAYING • HOOK 60 วิ':'✅ PLAYING FULL SONG');prepareNext();toast('กำลังเล่น '+state.current.title)}catch(e){console.error(e);setStatus('PLAYBACK ERROR')}}
function stopPlayers(){try{playerA?.stopVideo();playerB?.stopVideo()}catch{}state.pos=0;$('progressBar').style.width='0%';$('timeLabel').textContent='0:00 / '+fmt(state.autoMix?HOOK:state.duration);setStatus('READY • หยุดเพลงแล้ว')}
function pauseResume(){const p=activePlayer();if(!state.current)return;const st=p?.getPlayerState?.();if(st===1){p.pauseVideo();setStatus('⏸ พักเพลงแล้ว');$('pauseBtn').textContent='▶ เล่นต่อ'}else{p.playVideo();setStatus('▶ เล่นเพลงต่อแล้ว');$('pauseBtn').textContent='⏸ พัก'}}
function playNextManual(){if(state.currentIndex+1<state.queue.length)startTrack(state.currentIndex+1);else toast('ไม่มีเพลงถัดไปในคิว')}
function playPrev(){if(state.currentIndex>0)startTrack(state.currentIndex-1);else if(state.queue.length)startTrack(0)}
function prepareNext(){if(!state.current||state.nextReady||state.mix.running||!state.autoMusic)return;const i=state.currentIndex+1;if(i<0||i>=state.queue.length){state.next=null;state.nextIndex=-1;$('nextText').textContent='เพลงต่อไป: —';return}state.next={...state.queue[i]};state.nextIndex=i;$('nextText').textContent='เพลงต่อไป: '+state.next.title+' • กำลังเตรียม…';const p=standbyPlayer();try{p.stopVideo();p.mute();p.setVolume(0);p.cueVideoById(state.next.id);state.nextReady=true;$('nextText').textContent='เพลงต่อไป: '+state.next.title+' • ✅ READY'}catch(e){state.nextReady=false;$('nextText').textContent='เพลงต่อไปโหลดไม่สำเร็จ'}}
function fadeVolume(p,from,to,duration,done){const start=performance.now();function tick(t){const k=Math.min(1,(t-start)/duration);const v=from+(to-from)*k;p.setVolume(Math.round(v));if(k<1)requestAnimationFrame(tick);else if(done)done()}requestAnimationFrame(tick)}
function runMix(){if(!state.autoMusic||!state.current||state.currentIndex<0||state.currentIndex>=state.queue.length-1)return;if(!state.nextReady||!state.next){prepareNext();return}state.mix.running=true;state.mix.phase='fade_out';state.mix.started=performance.now();setStatus('🎚 AUTO MIX • SMOOTH FADE OUT');const old=activePlayer();const incoming=standbyPlayer();fadeVolume(old,state.volume,0,FADE*1000,()=>{try{old.pauseVideo();incoming.unMute();incoming.setVolume(0);incoming.playVideo();setStatus('🎚 AUTO MIX • START NEW')}catch(e){console.error(e);finishMix(true);return}waitIncoming(incoming)} )}
function waitIncoming(incoming){const start=performance.now();function wait(){const st=incoming.getPlayerState?.();if(st===1){state.active=state.active==='a'?'b':'a';const old=state.current;recordHistory(old);state.current={...state.next};state.currentIndex=state.nextIndex;state.duration=Number(state.current.duration)||180;state.pos=0;state.next=null;state.nextIndex=-1;state.nextReady=false;renderQueue();$('nowTitle').textContent=state.current.title;$('nowMeta').textContent=`${state.current.uploader||'YouTube'} • ${fmt(state.duration)}`;$('coverImg').src=thumb(state.current);$('coverPlaceholder').style.display='none';setStatus('🎚 AUTO MIX • SMOOTH FADE IN');const p=activePlayer();fadeVolume(p,0,state.volume,FADE*1000,()=>{state.mix.running=false;state.mix.phase='idle';setStatus('✅ AUTO MIX • PLAYING');prepareNext()});return}if(performance.now()-start>6000){finishMix(true);return}requestAnimationFrame(wait)}wait()}
function finishMix(force){state.mix.running=false;state.mix.phase='idle';if(force){const p=activePlayer();try{p.unMute();p.setVolume(state.volume);p.playVideo()}catch{}setStatus('✅ PLAYING • RETRY NEXT')}prepareNext()}
function monitor(){if(!state.current||state.mix.running)return;const p=activePlayer();let pos=p?.getCurrentTime?.()||state.pos;let dur=p?.getDuration?.()||state.duration;state.pos=pos;state.duration=dur||state.duration;const targetTotal=state.autoMix?HOOK:state.duration;const visible=state.autoMix?Math.max(0,Math.min(HOOK,state.duration-Math.max(0,state.duration*.3))):state.duration;const start=state.autoMix?Math.max(0,Math.min(state.duration-HOOK,state.duration*.3)):0;const elapsed=state.autoMix?Math.max(0,pos-start):pos;$('progressBar').style.width=(100*Math.max(0,Math.min(1,elapsed/Math.max(1,targetTotal))))+'%';$('timeLabel').textContent=`${fmt(elapsed)} / ${fmt(targetTotal)}`;if(state.autoMusic&&!state.nextReady&&elapsed>Math.max(0,targetTotal-12))prepareNext();if(state.autoMix){if(elapsed>=targetTotal && !state.mix.running)runMix()}else{if(pos>=dur-FADE&&state.nextReady&&!state.mix.running)runMix();else if(pos>=dur-2&&!state.nextReady)prepareNext()}}
function drawWave(){const c=$('waveCanvas'),r=c.getBoundingClientRect(),d=window.devicePixelRatio||1;c.width=r.width*d;c.height=r.height*d;const x=c.getContext('2d');x.scale(d,d);x.clearRect(0,0,r.width,r.height);const mid=r.height/2;x.strokeStyle='#22303e';x.lineWidth=1;x.beginPath();x.moveTo(0,mid);x.lineTo(r.width,mid);x.stroke();for(let i=0;i<Math.max(80,r.width/4);i++){const px=i/(Math.max(80,r.width/4)-1)*r.width;const seed=(state.current?.id||'aura').split('').reduce((a,b)=>a+b.charCodeAt(0),0);const amp=7+((Math.sin(i*.37+seed)+1)/2)*30+((Math.sin(i*1.37+seed*.2)+1)/2)*12;const played=(state.autoMix?Math.max(0,state.pos-(state.current?Math.max(0,(state.duration-HOOK))*.001:0))/HOOK:state.pos/state.duration)*r.width;x.strokeStyle=px<=played?'#b59aff':'#3a4958';x.beginPath();x.moveTo(px,mid-amp);x.lineTo(px,mid+amp);x.stroke()} }
function seekWave(e){if(!state.current||state.mix.running)return;const r=$('waveCanvas').getBoundingClientRect();const frac=Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));const dur=activePlayer()?.getDuration?.()||state.duration;const start=state.autoMix?Math.max(0,Math.min(dur-HOOK,dur*.3)):0;const target=state.autoMix?start+frac*Math.min(HOOK,Math.max(1,dur-start)):frac*dur;activePlayer()?.seekTo(target,true);state.pos=target;toast('⏩ เลื่อนตำแหน่งเพลงแล้ว')}
function showModal(title,body){$('modalTitle').textContent=title;$('modalBody').innerHTML=body;$('modal').classList.add('show')}
function showEQ(){showModal('🎚 ปรับแต่งเสียง',`<div class="row"><label>Bass</label><input id="eqBass" type="range" min="-12" max="12" value="${state.eq.bass}"><b id="eqBassV">${state.eq.bass} dB</b></div><div class="row"><label>Music</label><input id="eqMusic" type="range" min="-12" max="12" value="${state.eq.music}"><b id="eqMusicV">${state.eq.music} dB</b></div><div class="row"><label>Vocal</label><input id="eqVocal" type="range" min="-12" max="12" value="${state.eq.vocal}"><b id="eqVocalV">${state.eq.vocal} dB</b></div><div class="row"><label>AUTO EQ</label><button id="autoEqToggle" class="${state.autoEq?'active':''}">${state.autoEq?'ON':'OFF'}</button><button id="eqReset">↺ รีเซ็ต</button></div><p style="color:#7f8da0;font-size:11px;line-height:1.6">โปรไฟล์/ค่า EQ เก็บไว้ในเว็บตามระบบเดิม แต่เสียง YouTube ใน iframe ไม่สามารถต่อเข้ากับ Web Audio จากข้ามโดเมนเพื่อปรับย่านจริงได้โดยตรง</p>`);['Bass','Music','Vocal'].forEach(k=>{const id='eq'+k.toLowerCase().replace(/^./,m=>m.toUpperCase());const v=id+'V';$(id).oninput=()=>{state.eq[k.toLowerCase()]=Number($(id).value);$(v).textContent=$(id).value+' dB'}});$('autoEqToggle').onclick=()=>{state.autoEq=!state.autoEq;showEQ()};$('eqReset').onclick=()=>{state.eq={bass:0,music:0,vocal:0};showEQ()};}
function showHistory(){const h=state.history;if(!h.length){showModal('🕘 ประวัติการฟัง','<div class="empty">ยังไม่มีประวัติการฟัง</div>');return}showModal('🕘 ประวัติการฟัง',`<div class="history-list">${h.map((t,i)=>`<div class="item"><img class="thumb" src="${esc(thumb(t))}"><div class="item-main"><div class="title">${i+1}. ${esc(t.title)}</div><div class="meta">${esc(t.uploader||'YouTube')} • ${esc(t.played_at||'—')}</div></div><button data-h="${i}" class="primary">▶</button></div>`).join('')}</div><div style="margin-top:10px"><button id="clearHistory" class="danger">🗑 ล้างประวัติ</button></div>`);document.querySelectorAll('[data-h]').forEach(b=>b.onclick=()=>{const t=h[Number(b.dataset.h)];addToQueue(t,true);$('modal').classList.remove('show')});$('clearHistory').onclick=()=>{state.history=[];persistHistory();showHistory()}}
function search(){const q=$('searchInput').value.trim();if(!q)return;const mode=$('searchMode').value;setStatus('🔍 กำลังค้นหา…');window.AuraYouTubeSearch.search(q,mode).then(renderSearch).catch(e=>{console.error(e);setStatus('SEARCH ERROR');toast(e.message||'ค้นหาไม่สำเร็จ')})}
function artistSearch(){const artist=prompt('พิมพ์ชื่อศิลปิน:','');if(!artist?.trim())return;$('searchInput').value=artist.trim();window.AuraYouTubeSearch.artistPlaylist(artist.trim()).then(rows=>{renderSearch(rows);rows.forEach(t=>{if(!state.queue.some(q=>q.id===t.id))state.queue.push(t)});renderQueue();if(state.current)prepareNext();else if(state.queue.length)startTrack(0);toast('เพิ่มเพลย์ลิสต์ศิลปินแล้ว '+rows.length+' เพลง')}).catch(e=>toast(e.message||'ค้นหาไม่สำเร็จ'))}
function oldPlaylist(){window.AuraYouTubeSearch.oldPlaylist().then(rows=>{renderSearch(rows);rows.forEach(t=>{if(!state.queue.some(q=>q.id===t.id))state.queue.push(t)});renderQueue();if(!state.current&&state.queue.length)startTrack(0);else prepareNext();toast('สุ่มเพลงยุค 1990-2000 แล้ว '+rows.length+' เพลง')}).catch(e=>toast(e.message||'ค้นหาไม่สำเร็จ'))}
window.onYouTubeIframeAPIReady=()=>{const opts={height:'2',width:'2',playerVars:{playsinline:1,controls:0,disablekb:1,modestbranding:1,rel:0}};playerA=new YT.Player('yt-a',{...opts,events:{onReady:onPlayerReady,onError:e=>console.error('A',e)}});playerB=new YT.Player('yt-b',{...opts,events:{onReady:onPlayerReady,onError:e=>console.error('B',e)}})};
function onPlayerReady(){readyCount++;if(readyCount===2){state.playersReady=true;setStatus('READY • YouTube Player พร้อม');if(state.queue.length===0)renderQueue()}}
$('searchBtn').onclick=search;$('searchInput').addEventListener('keydown',e=>{if(e.key==='Enter')search()});$('artistBtn').onclick=artistSearch;$('oldBtn').onclick=oldPlaylist;$('startBtn').onclick=()=>{if(state.current)startTrack(state.currentIndex>=0?state.currentIndex:0);else if(state.queue.length)startTrack(0);else if(state.selectedSearch)addToQueue(state.selectedSearch,true)};$('pauseBtn').onclick=pauseResume;$('prevBtn').onclick=playPrev;$('nextBtn').onclick=playNextManual;$('stopBtn').onclick=()=>{stopPlayers();state.current=null;state.currentIndex=-1;renderQueue();$('nowTitle').textContent='ยกเลิกเพลงแล้ว';$('nowMeta').textContent='—';$('nextText').textContent='เพลงต่อไป: —'};$('removeBtn').onclick=removeCurrentQueue;$('clearBtn').onclick=clearQueue;$('mixBtn').onclick=()=>{state.autoMix=!state.autoMix;$('mixBtn').classList.toggle('active',state.autoMix);$('mixBtn').textContent=state.autoMix?'🤖 AUTO MIX • ON':'🤖 AUTO MIX • OFF';$('modeText').textContent=state.autoMix?`AUTO • ${HOOK} วิ / เพลง • CROSSFADE ${FADE} วิ • PRELOAD`:`FULL TRACK • AUTO NEXT • CROSSFADE ${FADE} วิ • PRELOAD`;if(state.current)state.pos=activePlayer()?.getCurrentTime?.()||state.pos};$('autoBtn').onclick=()=>{state.autoMusic=!state.autoMusic;$('autoBtn').classList.toggle('active',state.autoMusic);$('autoBtn').textContent=state.autoMusic?'✨ AUTO MUSIC • ON':'✨ AUTO MUSIC • OFF';if(state.autoMusic)prepareNext();toast(state.autoMusic?'AUTO MUSIC เปิด':'AUTO MUSIC ปิด')};$('eqBtn').onclick=showEQ;$('historyBtn').onclick=showHistory;$('closeModal').onclick=()=>$('modal').classList.remove('show');$('modal').onclick=e=>{if(e.target.id==='modal')$('modal').classList.remove('show')};$('vol').oninput=()=>{state.volume=Number($('vol').value);$('volVal').textContent=state.volume+'%';try{activePlayer()?.setVolume(state.volume)}catch{}};$('waveCanvas').addEventListener('pointerdown',seekWave);window.addEventListener('resize',drawWave);$('navSearch').onclick=()=>scrollTo({top:0,behavior:'smooth'});$('navQueue').onclick=()=>document.querySelector('#queueList').scrollIntoView({behavior:'smooth'});$('navPlayer').onclick=()=>document.querySelector('.player-card').scrollIntoView({behavior:'smooth'});$('navMore').onclick=()=>showModal('☰ เมนู',`<div class="head-actions"><button id="mEQ">🎚 ปรับเสียง</button><button id="mHist">🕘 ประวัติ</button><button id="mOld">🎲 1990-2000</button><button id="mArtist">🎤 เพลย์ลิสต์ศิลปิน</button></div>`);document.addEventListener('click',e=>{if(e.target.id==='mEQ')showEQ();if(e.target.id==='mHist')showHistory();if(e.target.id==='mOld'){oldPlaylist();$('modal').classList.remove('show')}if(e.target.id==='mArtist'){artistSearch();$('modal').classList.remove('show')}});
clockTimer=setInterval(nowClock,1000);progressTimer=setInterval(monitor,TICK);nowClock();drawWave();renderQueue();setInterval(drawWave,250);
})();
