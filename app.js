(() => {
  'use strict';

  /* ============================================================
     AURA MIX MOBILE
     - UI is mobile-first but keeps the original menu/functions.
     - MIX timings intentionally stay the same as the supplied Python:
       HOOK 60s / CROSSFADE 4s / PRELOAD.
     ============================================================ */
  const HOOK_SECONDS = 60;
  const MIX_SECONDS = 4;
  const TICK_MS = 100;
  const MAX_VOLUME = 100;
  const API = window.AuraYouTubeSearch;

  // Helpers MUST exist before state initialization.
  const $ = id => document.getElementById(id);
  const readJSON = (k, fallback) => {
    try {
      const raw = localStorage.getItem(k);
      return raw == null ? fallback : JSON.parse(raw);
    } catch (_) { return fallback; }
  };
  const saveJSON = (k, value) => { try { localStorage.setItem(k, JSON.stringify(value)); } catch (_) {} };
  const fmt = seconds => {
    const n = Math.max(0, Math.floor(Number(seconds) || 0));
    return `${Math.floor(n / 60)}:${String(n % 60).padStart(2, '0')}`;
  };
  const esc = value => String(value ?? '').replace(/[&<>'"]/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
  const thumb = track => track?.thumbnail || (track?.id ? `https://i.ytimg.com/vi/${track.id}/hqdefault.jpg` : '');

  const state = {
    queue: readJSON('aura_mix_queue', []),
    currentIndex: -1,
    current: null,
    next: null,
    nextIndex: -1,
    nextReady: false,
    autoMix: true,
    autoMusic: true,
    active: 'a',
    volume: Number(readJSON('aura_mix_volume', 100)) || 100,
    paused: false,
    duration: 180,
    pos: 0,
    session: 0,
    mix: { running: false, phase: 'idle', startedAt: 0 },
    playersReady: false,
    readyCount: 0,
    playerVideo: { a: '', b: '' },
    playerCued: { a: false, b: false },
    searchResults: [],
    selectedSearch: null,
    history: readJSON('aura_mix_history', []),
    eq: readJSON('aura_mix_eq', {bass:0,music:0,vocal:0}),
    autoEq: readJSON('aura_mix_auto_eq', true),
    selectedQueue: -1,
    autoPreparing: false,
    searchTimer: null,
    searchRequestId: 0,
    userActivated: false,
    pendingStartIndex: -1,
    pendingStartSession: 0,
    wavePhase: 0,
    waveFrame: 0
  };

  if (!Array.isArray(state.queue)) state.queue = [];
  if (!Array.isArray(state.history)) state.history = [];

  let playerA = null, playerB = null;
  let timerId = null, clockId = null, seekPointer = false;

  const curPlayer = () => state.active === 'a' ? playerA : playerB;
  const standbyPlayer = () => state.active === 'a' ? playerB : playerA;
  const playerKey = p => p === playerA ? 'a' : 'b';

  function setStatus(text, warn = false) {
    const status = $('status'), dot = $('statusDot');
    if (status) status.textContent = text;
    if (dot) dot.classList.toggle('warn', !!warn);
  }
  function toast(text) {
    const el = $('toast'); if (!el) return;
    el.textContent = text; el.classList.add('show');
    clearTimeout(toast._t); toast._t = setTimeout(() => el.classList.remove('show'), 2400);
  }
  function nowClock() {
    const d = new Date();
    if ($('realClock')) $('realClock').textContent = d.toLocaleTimeString('th-TH', {hour12:false}) + ' • ' + d.toLocaleDateString('th-TH');
  }

  // ---------- Pages ----------
  function showPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.dataset.page === name));
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.pageTarget === name));
    try { history.replaceState(null, '', `#${name}`); } catch (_) {}
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  function initPageFromHash() {
    const name = location.hash.replace('#', '');
    showPage(['home','search','queue','menu'].includes(name) ? name : 'home');
  }

  // ---------- Search ----------
  function renderSearch(rows) {
    state.searchResults = Array.isArray(rows) ? rows : [];
    state.selectedSearch = null;
    const box = $('searchList'); if (!box) return;
    box.innerHTML = '';
    $('searchState').textContent = state.searchResults.length ? `พบ ${state.searchResults.length} เพลง` : 'ไม่พบผลลัพธ์';
    if (!state.searchResults.length) return;
    state.searchResults.forEach((t, i) => {
      const item = document.createElement('button');
      item.type = 'button'; item.className = 'music-item search-item'; item.dataset.index = String(i);
      item.innerHTML = `<img class="thumb" src="${esc(thumb(t))}" alt=""><span class="item-main"><b>${esc(t.title)}</b><small>${esc(t.uploader || 'YouTube')} • ${fmt(t.duration)}</small></span><span class="item-actions"><span class="circle add">＋</span><span class="circle play">▶</span></span>`;
      item.addEventListener('click', e => {
        const add = e.target.closest('.add'), play = e.target.closest('.play');
        if (add) { addToQueue(t, false); return; }
        if (play) { addToQueue(t, true); return; }
        state.selectedSearch = {...t};
        box.querySelectorAll('.search-item').forEach(x => x.classList.remove('selected'));
        item.classList.add('selected');
      });
      box.appendChild(item);
    });
  }
  async function doSearch({silent=false} = {}) {
    const q = $('searchInput').value.trim();
    const requestId = ++state.searchRequestId;
    if (!q) {
      state.searchResults = []; state.selectedSearch = null;
      $('searchList').innerHTML = ''; $('searchState').textContent = 'พิมพ์คำค้นหาเพื่อเริ่มค้นหา';
      return;
    }
    if (!API?.search) { setStatus('SEARCH API ไม่พร้อม', true); toast('youtube-search.js ไม่พร้อม'); return; }
    if (!silent) toast('กำลังค้นหา YouTube…');
    $('searchState').textContent = 'กำลังค้นหาเพลง…';
    try {
      const rows = await API.search(q, $('searchMode').value);
      if (requestId !== state.searchRequestId) return;
      renderSearch(rows);
      setStatus(`✅ พบ ${rows.length} เพลง`);
    } catch (err) {
      if (requestId !== state.searchRequestId) return;
      console.error(err);
      $('searchState').textContent = 'ค้นหาไม่สำเร็จ';
      setStatus('SEARCH ERROR', true);
      toast(err?.message || 'ค้นหาไม่สำเร็จ');
    }
  }
  function debounceSearch() {
    clearTimeout(state.searchTimer);
    if (!$('searchInput').value.trim()) {
      state.searchRequestId++;
      renderSearch([]); $('searchState').textContent = 'พิมพ์คำค้นหาเพื่อเริ่มค้นหา'; return;
    }
    $('searchState').textContent = 'กำลังค้นหาอัตโนมัติ…';
    state.searchTimer = setTimeout(() => doSearch({silent:true}), 550);
  }
  async function artistSearch() {
    const artist = prompt('พิมพ์ชื่อศิลปิน:', '')?.trim();
    if (!artist || !API?.artistPlaylist) return;
    showPage('search'); $('searchInput').value = artist; $('searchState').textContent = `กำลังค้นหาเพลงของ ${artist}…`;
    try {
      const rows = await API.artistPlaylist(artist); renderSearch(rows);
      rows.forEach(t => { if (!state.queue.some(q => q.id === t.id)) state.queue.push(t); });
      persistQueue(); renderQueue();
      if (state.current === null && state.queue.length) startTrack(0); else prepareNext();
      toast(`✅ เพิ่มเพลงของ ${artist} ${rows.length} เพลง`);
    } catch (err) { toast(err?.message || 'ค้นหาไม่สำเร็จ'); setStatus('SEARCH ERROR', true); }
  }
  async function oldPlaylist() {
    showPage('search'); $('searchInput').value = 'เพลงยุค 1990-2000 • GMM GRAMMY OFFICIAL'; $('searchState').textContent = 'กำลังสุ่มเพลง…';
    try {
      const rows = await API.oldPlaylist(); renderSearch(rows);
      rows.forEach(t => { if (!state.queue.some(q => q.id === t.id)) state.queue.push(t); });
      persistQueue(); renderQueue();
      if (state.current === null && state.queue.length) startTrack(0); else prepareNext();
      toast(`🎲 เพิ่มเพลง ${rows.length} เพลงแล้ว`);
    } catch (err) { toast(err?.message || 'ค้นหาไม่สำเร็จ'); setStatus('SEARCH ERROR', true); }
  }

  // ---------- Queue ----------
  function persistQueue() { saveJSON('aura_mix_queue', state.queue); }
  function addToQueue(track, play) {
    if (!track?.id) return;
    let idx = state.queue.findIndex(x => x.id === track.id);
    if (idx === -1) { state.queue.push({...track}); idx = state.queue.length - 1; }
    state.selectedQueue = idx; persistQueue(); renderQueue();
    if (play) { showPage('home'); startTrack(idx); }
    else { toast('✅ เพิ่มเพลงลงคิวแล้ว'); if (state.current) prepareNext(); }
  }
  function renderQueue() {
    const box = $('queueList'); if (!box) return;
    box.innerHTML = ''; $('queueCount').textContent = String(state.queue.length);
    if (!state.queue.length) { box.innerHTML = '<div class="list-state">ยังไม่มีเพลงในคิว<br>ไปที่ค้นหาแล้วกด ＋ เพิ่มเพลง</div>'; return; }
    state.queue.forEach((t, i) => {
      const item = document.createElement('div');
      item.className = `music-item queue-item${i === state.selectedQueue ? ' selected' : ''}${i === state.currentIndex ? ' now' : ''}`;
      item.innerHTML = `<span class="queue-number">${i+1}</span><img class="thumb" src="${esc(thumb(t))}" alt=""><span class="item-main"><b>${i===state.currentIndex?'▶ ':''}${esc(t.title)}</b><small>${esc(t.uploader||'YouTube')} • ${fmt(t.duration)}</small></span><span class="item-actions"><button class="circle play" type="button">▶</button><button class="circle up" type="button">↑</button><button class="circle down" type="button">↓</button></span>`;
      item.addEventListener('click', e => {
        if (e.target.closest('button')) return;
        state.selectedQueue = i; renderQueue();
      });
      item.querySelector('.play').addEventListener('click', () => { showPage('home'); startTrack(i); });
      item.querySelector('.up').addEventListener('click', () => moveQueue(i, -1));
      item.querySelector('.down').addEventListener('click', () => moveQueue(i, 1));
      box.appendChild(item);
    });
  }
  function removeSelectedQueue() {
    const i = state.selectedQueue;
    if (i < 0 || i >= state.queue.length) { toast('แตะเลือกเพลงในคิวก่อน'); return; }
    const wasCurrent = i === state.currentIndex;
    const wasBefore = i < state.currentIndex;
    const wasNext = i === state.nextIndex;
    state.queue.splice(i, 1);
    if (wasBefore) state.currentIndex--;
    if (state.nextIndex > i) state.nextIndex--;
    if (wasCurrent) {
      stopAll(false);
      state.selectedQueue = state.queue.length ? Math.min(i, state.queue.length - 1) : -1;
    }
    if (wasNext) { state.next = null; state.nextIndex = -1; state.nextReady = false; }
    persistQueue(); renderQueue();
    if (state.current) prepareNext();
    toast('ลบเพลงออกจากคิวแล้ว');
  }
  function clearQueue() {
    state.queue = []; state.selectedQueue = -1; state.next = null; state.nextIndex = -1; state.nextReady = false;
    persistQueue(); renderQueue();
    toast('ล้างคิวแล้ว • เพลงปัจจุบันยังเล่นอยู่');
    if (state.current) prepareNext();
  }
  function moveQueue(i, delta) {
    const j = i + delta; if (j < 0 || j >= state.queue.length) return;
    [state.queue[i], state.queue[j]] = [state.queue[j], state.queue[i]];
    if (state.currentIndex === i) state.currentIndex = j; else if (state.currentIndex === j) state.currentIndex = i;
    if (state.nextIndex === i) state.nextIndex = j; else if (state.nextIndex === j) state.nextIndex = i;
    state.selectedQueue = j; persistQueue(); renderQueue(); prepareNext();
  }

  function removePlayedTrackAndAdvance(finishedTrack, preferredNextId = null) {
    if (!finishedTrack?.id) return null;
    recordHistory(finishedTrack);
    const removeIndex = state.queue.findIndex(x => x.id === finishedTrack.id);
    if (removeIndex >= 0) state.queue.splice(removeIndex, 1);
    const nextId = preferredNextId || state.queue[removeIndex]?.id || null;
    persistQueue();
    return nextId;
  }

  function finishCurrentAndPlayNext() {
    const finished = state.current ? {...state.current} : null;
    if (!finished) return;
    const nextId = state.queue[state.currentIndex + 1]?.id || state.queue[state.currentIndex]?.id || null;
    removePlayedTrackAndAdvance(finished, nextId);
    const nextIndex = nextId ? state.queue.findIndex(x => x.id === nextId) : -1;
    state.current = null;
    state.currentIndex = -1;
    state.next = null; state.nextIndex = -1; state.nextReady = false;
    state.selectedQueue = nextIndex;
    renderQueue();
    if (nextIndex >= 0) { startTrack(nextIndex); return; }
    if (state.autoMusic) { prepareAutoMusic(finished); return; }
    setCurrentUI(null);
    $('clockLabel').textContent = 'AUTO MIX • READY';
    $('nextText').textContent = 'เพลงต่อไป: —';
    setStatus('✅ คิวเพลงหมดแล้ว');
  }

  // ---------- Playback / MIX ----------
  function safeStop(p) { if (!p) return; try { p.setVolume(0); } catch(_) {} try { p.pauseVideo(); } catch(_) {} try { p.stopVideo(); } catch(_) {} }
  function getDuration() { try { return Number(curPlayer()?.getDuration()) || state.duration || 180; } catch(_) { return state.duration || 180; } }
  function calcHookStart(duration) { const d = Number(duration) || 180; if (d <= HOOK_SECONDS) return 0; return Math.min(d * 0.30, Math.max(0, d - HOOK_SECONDS)); }
  function setPlayerSource(p, id, start = 0) {
    if (!p || !id) return false;
    const k = playerKey(p);
    try {
      state.playerVideo[k] = String(id); state.playerCued[k] = false;
      p.unMute(); p.setVolume(0); p.loadVideoById({videoId:String(id), startSeconds:Number(start)||0});
      return true;
    } catch (e) { console.error(e); return false; }
  }
  function waitForPlayerState(p, targetStates, timeout = 12000) {
    const started = performance.now();
    return new Promise(resolve => {
      const poll = () => {
        if (!p) return resolve(false);
        if (performance.now() - started >= timeout) return resolve(false);
        try {
          const s = p.getPlayerState();
          if (targetStates.includes(s)) return resolve(true);
          if (s === YT.PlayerState.ENDED) return resolve(false);
        } catch(_) {}
        setTimeout(poll, 100);
      };
      poll();
    });
  }
  function fadeVolume(p, from, to, ms, done) {
    if (!p) { done?.(); return; }
    const started = performance.now(), delta = to - from;
    const frame = now => {
      const q = Math.min(1, (now - started) / ms);
      const eased = q < .5 ? 2*q*q : 1-Math.pow(-2*q+2,2)/2;
      try { p.setVolume(Math.max(0, Math.min(100, Math.round(from + delta*eased)))); } catch(_) {}
      if (q < 1) requestAnimationFrame(frame); else done?.();
    };
    requestAnimationFrame(frame);
  }

  async function startTrack(index) {
    if (index < 0 || index >= state.queue.length) return;
    if (!state.playersReady) {
      state.pendingStartIndex = index;
      state.pendingStartSession = state.session + 1;
      toast('กำลังเตรียม YouTube Player…');
      setStatus('กำลังเตรียมตัวเล่นเพลง…', true);
      return;
    }
    state.pendingStartIndex = -1;
    state.pendingStartSession = 0;
    state.userActivated = true;
    state.session++; const session = state.session;
    state.currentIndex = index; state.selectedQueue = index; state.current = {...state.queue[index]};
    state.duration = Number(state.current.duration) || 180; state.pos = 0;
    state.next = null; state.nextIndex = -1; state.nextReady = false; state.paused = false; state.mix = {running:false,phase:'idle',startedAt:0};
    safeStop(playerA); safeStop(playerB); state.active = 'a'; state.playerVideo.a = ''; state.playerVideo.b = '';
    setCurrentUI(state.current); renderQueue(); updatePauseButton(); updateMode();
    $('clockLabel').textContent = 'AUTO MIX • LOADING'; setStatus('กำลังเปิดเพลง…', true);
    const start = state.autoMix ? calcHookStart(state.duration) : 0;
    if (!setPlayerSource(playerA, state.current.id, start)) { setStatus('PLAYBACK ERROR', true); return; }
    try { playerA.playVideo(); } catch(_) {}
    const playing = await waitForPlayerState(playerA, [YT.PlayerState.PLAYING], 14000);
    if (session !== state.session) return;
    if (!playing) {
      setStatus('PLAYBACK ERROR', true); toast('YouTube เปิดเพลงนี้ไม่ได้ ลองกด ▶ อีกครั้ง');
      return;
    }
    state.duration = getDuration(); state.pos = start;
    fadeVolume(playerA, 0, state.volume, 700);
    state.userActivated = true;
    $('clockLabel').textContent = 'AUTO MIX • PLAYING';
    setStatus(state.autoMix ? `✅ PLAYING • HOOK ${HOOK_SECONDS} วิ` : '✅ PLAYING FULL SONG');
    updateMediaSession(); prepareNext();
  }
  function prepareNext() {
    if (!state.current || state.mix.running || state.nextReady || state.autoPreparing) return;
    const idx = state.currentIndex + 1;
    if (idx >= state.queue.length) {
      state.next = null; state.nextIndex = -1;
      $('nextText').textContent = state.autoMusic ? 'เพลงต่อไป: ✨ AUTO MUSIC รอค้นหา…' : 'เพลงต่อไป: —';
      if (state.autoMusic) prepareAutoMusic();
      return;
    }
    const track = {...state.queue[idx]}; state.next = track; state.nextIndex = idx;
    $('nextText').textContent = `เพลงต่อไป: ${track.title} • กำลังเตรียม…`;
    const p = standbyPlayer(); if (!p) return;
    const key = playerKey(p);
    state.playerVideo[key] = String(track.id); state.playerCued[key] = false;
    try {
      safeStop(p); p.setVolume(0); const hookStart = calcHookStart(Number(track.duration) || 180); p.cueVideoById({videoId:String(track.id), startSeconds:hookStart});
      const started = performance.now();
      const poll = () => {
        if (!state.next || state.next.id !== track.id) return;
        try {
          const s = p.getPlayerState();
          if (s === YT.PlayerState.CUED || s === YT.PlayerState.PAUSED || s === YT.PlayerState.PLAYING) {
            state.playerCued[key] = true; state.nextReady = true;
            $('nextText').textContent = `เพลงต่อไป: ${track.title} • ✅ READY`;
            return;
          }
        } catch(_) {}
        if (performance.now() - started < 12000) setTimeout(poll, 150);
        else { state.nextReady = false; setStatus('NEXT PRELOAD TIMEOUT', true); }
      };
      poll();
    } catch (err) { console.error(err); state.nextReady = false; setStatus('NEXT PRELOAD ERROR', true); }
  }
  async function prepareAutoMusic(seedTrack = state.current) {
    if (!state.autoMusic || state.autoPreparing || !seedTrack || !API?.search) return;
    state.autoPreparing = true; $('nextText').textContent = 'เพลงต่อไป: ✨ AUTO MUSIC กำลังหา…';
    try {
      const rows = await API.search(`${seedTrack.title || ''} similar songs`, 'YouTube ทั้งหมด');
      const used = new Set(state.queue.map(x => x.id));
      const pick = rows.find(x => x.id && !used.has(x.id));
      if (pick) {
        state.queue.push(pick); persistQueue(); renderQueue(); prepareNext();
        toast(`✨ AUTO MUSIC: ${pick.title}`);
      } else $('nextText').textContent = 'เพลงต่อไป: หาเพลงที่คล้ายกันไม่พบ';
    } catch (err) { console.error(err); $('nextText').textContent = 'เพลงต่อไป: AUTO MUSIC หาไม่สำเร็จ'; }
    finally { state.autoPreparing = false; }
  }
  // ---------- True Dual-Deck Crossfade ----------
  function setDeckVolume(player, volume) {
    if (!player) return;
    try { player.setVolume(Math.max(0, Math.min(100, Math.round(volume)))); } catch (_) {}
  }

  function waitForPlayerStateFast(player, states, timeout = 2500) {
    return new Promise(resolve => {
      const started = performance.now();
      const wanted = new Set(states);
      const tick = () => {
        try {
          const s = player?.getPlayerState?.();
          if (wanted.has(s)) return resolve(true);
        } catch (_) {}
        if (performance.now() - started >= timeout) return resolve(false);
        setTimeout(tick, 50);
      };
      tick();
    });
  }

  async function startMix() {
    if (state.mix.running || !state.nextReady || !state.next) return;

    const old = curPlayer();
    const incoming = standbyPlayer();
    if (!old || !incoming || old === incoming) return;

    const session = state.session;
    const master = Math.max(0, Math.min(100, Number(state.volume) || 0));

    state.mix = {
      running: true,
      phase: 'starting-new',
      startedAt: performance.now()
    };

    $('clockLabel').textContent = `AUTO MIX • CROSSFADE ${MIX_SECONDS}S`;
    setStatus('🎚 AUTO MIX • STARTING NEXT TRACK');

    // The next track is already CUED on the standby deck. Start it at zero
    // volume BEFORE touching the current deck, so there is no intentional gap.
    setDeckVolume(incoming, 0);
    try { incoming.unMute?.(); } catch (_) {}
    try { incoming.playVideo(); } catch (_) {}

    const started = await waitForPlayerStateFast(incoming, [YT.PlayerState.PLAYING], 2800);

    if (session !== state.session || !state.mix.running) return;

    // Roll back safely if the standby deck could not start.
    if (!started) {
      setDeckVolume(incoming, 0);
      try { incoming.stopVideo(); } catch (_) {}
      setDeckVolume(old, master);
      try { old.playVideo(); } catch (_) {}
      state.mix = {running:false, phase:'idle', startedAt:0};
      state.nextReady = false;
      setStatus('✅ เพลงเดิมเล่นต่อ • NEXT ไม่พร้อม', true);
      prepareNext();
      return;
    }

    state.mix.phase = 'crossfade';
    setStatus('🎚 AUTO MIX • TRUE CROSSFADE');

    const duration = MIX_SECONDS * 1000;
    const startAt = performance.now();

    const finish = () => {
      if (session !== state.session || !state.mix.running) return;

      setDeckVolume(old, 0);
      try { old.stopVideo(); } catch (_) {}
      setDeckVolume(incoming, master);

      const finishedTrack = state.current ? {...state.current} : null;
      const incomingTrack = state.next ? {...state.next} : null;
      const incomingId = incomingTrack?.id || null;

      // Remove the track that has just completed its AURA MIX slot.
      if (finishedTrack?.id) {
        recordHistory(finishedTrack);
        const removeIndex = state.queue.findIndex(x => x.id === finishedTrack.id);
        if (removeIndex >= 0) state.queue.splice(removeIndex, 1);
      }

      state.active = state.active === 'a' ? 'b' : 'a';
      state.current = incomingTrack;
      state.currentIndex = incomingId ? state.queue.findIndex(x => x.id === incomingId) : -1;
      if (state.currentIndex < 0 && incomingTrack) {
        state.queue.push(incomingTrack);
        state.currentIndex = state.queue.length - 1;
      }
      state.selectedQueue = state.currentIndex;
      state.duration = Number(incoming.getDuration?.()) || Number(state.current?.duration) || 180;
      state.pos = Number(incoming.getCurrentTime?.()) || calcHookStart(state.duration);
      state.next = null;
      state.nextIndex = -1;
      state.nextReady = false;
      state.mix = {running:false, phase:'idle', startedAt:0};

      setCurrentUI(state.current);
      renderQueue();
      updateMediaSession();
      persistQueue();
      $('clockLabel').textContent = 'AUTO MIX • PLAYING HOOK';
      setStatus('✅ AUTO MIX • PLAYING HOOK');
      prepareNext();
    };

    const step = () => {
      if (session !== state.session || !state.mix.running) return;
      const elapsed = performance.now() - startAt;
      const p = Math.max(0, Math.min(1, elapsed / duration));

      // Equal-power crossfade: cosine out + sine in.
      const oldGain = Math.cos((Math.PI / 2) * p) * master;
      const newGain = Math.sin((Math.PI / 2) * p) * master;

      setDeckVolume(old, oldGain);
      setDeckVolume(incoming, newGain);

      if (p >= 1) {
        finish();
        return;
      }
      requestAnimationFrame(step);
    };

    requestAnimationFrame(step);
  }

  function monitor() {
    if (!state.current || state.paused || state.mix.running) return;
    const p = curPlayer(); if (!p) return;
    let pos = state.pos, dur = state.duration;
    try { pos = Number(p.getCurrentTime()) || 0; dur = Number(p.getDuration()) || dur; } catch(_) {}
    state.pos = pos; state.duration = dur || state.duration;
    const hook = state.autoMix ? calcHookStart(state.duration) : 0;
    const elapsed = state.autoMix ? Math.max(0, pos - hook) : pos;
    const visible = state.autoMix ? Math.min(HOOK_SECONDS, Math.max(1, state.duration - hook)) : Math.max(1, state.duration);
    const pct = Math.max(0, Math.min(1, elapsed / visible));
    $('progressBar').style.width = `${pct*100}%`; $('timeLabel').textContent = `${fmt(elapsed)} / ${fmt(visible)}`; drawWave(pct);
    if (!state.nextReady && elapsed >= Math.max(0, visible - 15)) prepareNext();
    if (state.autoMix) {
      if (elapsed >= visible - 0.15) { if (state.nextReady) startMix(); else { setStatus('⏳ AUTO MIX • WAITING FOR NEXT', true); prepareNext(); } }
    } else {
      if (pos >= dur - MIX_SECONDS && state.nextReady) startMix();
      else if (pos >= dur - 1.5 && !state.nextReady) prepareNext();
    }
  }

  // ---------- Controls ----------
  function updatePauseButton() {
    const b = $('pauseBtn'); if (b) b.querySelector('b').textContent = state.paused ? '▶ เล่นต่อ' : '⏸ พักเพลง';
    $('playBtn')?.classList.toggle('paused', state.paused);
  }
  function togglePause() {
    const p = curPlayer(); if (!p || !state.current) return;
    if (state.mix.running) { toast('กำลัง MIX อยู่ • พักเพลงไม่ได้'); return; }
    try {
      if (!state.paused) { p.pauseVideo(); state.paused = true; setStatus('⏸ พักเพลงแล้ว'); }
      else { p.playVideo(); state.paused = false; setStatus('▶ เล่นต่อแล้ว'); }
      updatePauseButton(); updateMediaSession();
    } catch(_) {}
  }
  function playPrev() { if (state.queue.length) startTrack(Math.max(0, state.currentIndex - 1)); }
  function playNext() { if (!state.queue.length) return; const i = state.currentIndex + 1; if (i < state.queue.length) startTrack(i); else if (state.autoMusic) prepareAutoMusic(); else toast('ไม่มีเพลงถัดไปในคิว'); }
  function stopAll(show = true) {
    state.session++;
    state.pendingStartIndex = -1;
    state.pendingStartSession = 0; safeStop(playerA); safeStop(playerB);
    state.current = null; state.currentIndex = -1; state.next = null; state.nextIndex = -1; state.nextReady = false; state.paused = false; state.mix = {running:false,phase:'idle',startedAt:0}; state.selectedQueue = -1;
    renderQueue(); setCurrentUI(null); updatePauseButton(); $('clockLabel').textContent = 'AUTO MIX • READY'; $('timeLabel').textContent = '0:00 / 1:00'; $('progressBar').style.width = '0%'; $('nextText').textContent = 'เพลงต่อไป: —'; setStatus('READY');
    if (show) toast('หยุดเพลงแล้ว');
  }
  function toggleMix() {
    state.autoMix = !state.autoMix; updateMode(); syncMenuState();
    if (state.current) prepareNext();
    toast(state.autoMix ? 'AUTO MIX เปิด' : 'AUTO MIX ปิด • เล่นเต็มเพลง');
  }
  function toggleAutoMusic() { state.autoMusic = !state.autoMusic; syncMenuState(); if (state.autoMusic && state.current) prepareNext(); toast(state.autoMusic ? 'AUTO MUSIC เปิด' : 'AUTO MUSIC ปิด'); }
  function updateMode() {
    $('mixBtn')?.classList.toggle('active', state.autoMix);
    const span = $('mixBtn')?.querySelector('span'); if (span) span.textContent = state.autoMix ? 'ON • 60S' : 'OFF • FULL SONG';
    if ($('modeText')) $('modeText').textContent = state.autoMix ? `AUTO • ${HOOK_SECONDS} วิ / เพลง • CROSSFADE ${MIX_SECONDS} วิ • PRELOAD` : `FULL TRACK • AUTO NEXT • CROSSFADE ${MIX_SECONDS} วิ • PRELOAD`;
  }
  function setCurrentUI(t) {
    $('coverStage')?.classList.toggle('playing', !!t);
    $('nowTitle').textContent = t?.title || 'พร้อมเล่น'; $('nowMeta').textContent = t ? `${t.uploader || 'YouTube'} • ${fmt(t.duration || 180)}` : '—';
    const img = $('coverImg'), ph = $('coverPlaceholder');
    if (t?.id) { img.src = thumb(t); img.hidden = false; ph.hidden = true; img.onerror = () => { img.hidden = true; ph.hidden = false; }; }
    else { img.removeAttribute('src'); img.hidden = true; ph.hidden = false; }
  }
  function recordHistory(t) { if (!t?.id) return; state.history = state.history.filter(x => x.id !== t.id); state.history.unshift({...t,played_at:new Date().toLocaleString('th-TH')}); state.history = state.history.slice(0,100); saveJSON('aura_mix_history',state.history); }

  // ---------- Waveform / visualizer ----------
  function drawWave(progress = 0, timestamp = performance.now()) {
    const c = $('waveCanvas'); if (!c) return;
    const r = c.getBoundingClientRect(); if (r.width < 10 || r.height < 10) return;
    const d = Math.max(1, window.devicePixelRatio || 1);
    const width = Math.floor(r.width * d), height = Math.floor(r.height * d);
    if (c.width !== width || c.height !== height) { c.width = width; c.height = height; }
    const ctx = c.getContext('2d'); ctx.setTransform(d,0,0,d,0,0);
    ctx.clearRect(0,0,r.width,r.height);

    const w = r.width, h = r.height, mid = h * .52;
    const seed = String(state.current?.id || 'aura').split('').reduce((a,x)=>a+x.charCodeAt(0),0);
    const count = Math.max(90, Math.floor(w / 3.3));
    const active = !!state.current && !state.paused;
    const pulse = active ? 0.5 + 0.5 * Math.sin(timestamp * 0.0052) : 0.25;
    const progressSafe = Math.max(0, Math.min(1, progress));

    const bg = ctx.createLinearGradient(0,0,w,h);
    bg.addColorStop(0,'rgba(93,73,170,.06)'); bg.addColorStop(.5,'rgba(21,117,153,.10)'); bg.addColorStop(1,'rgba(75,58,145,.04)');
    ctx.fillStyle = bg; ctx.fillRect(0,0,w,h);

    ctx.strokeStyle='rgba(90,108,130,.26)'; ctx.lineWidth=1;
    ctx.beginPath(); ctx.moveTo(0,mid); ctx.lineTo(w,mid); ctx.stroke();
    for (let j=1;j<4;j++){ const y=(h/4)*j; ctx.strokeStyle='rgba(70,88,108,.10)'; ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(w,y); ctx.stroke(); }

    for (let i=0;i<count;i++) {
      const f=i/(count-1), x=f*w;
      const a1=(Math.sin(i*.33+seed*.017+state.wavePhase*1.4)+1)/2;
      const a2=(Math.sin(i*1.19+seed*.051-state.wavePhase*.8)+1)/2;
      const a3=(Math.sin(i*.071+seed*.009+Math.sin(state.wavePhase)) + 1)/2;
      let amp=(8+a1*19+a2*11+a3*7) * (active ? .92 + pulse*.18 : .72);
      if (Math.abs(f-progressSafe)<.035) amp *= 1.12;
      ctx.lineWidth = f <= progressSafe ? 2.2 : 1.45;
      ctx.strokeStyle = f <= progressSafe ? `rgba(188,168,255,${.72+.22*pulse})` : 'rgba(63,78,96,.65)';
      ctx.beginPath(); ctx.moveTo(x,mid-amp); ctx.lineTo(x,mid+amp); ctx.stroke();
    }

    // Moving energy particles and scan line.
    if (active) {
      const scan=(timestamp*.055)% (w+80)-40;
      const grad=ctx.createLinearGradient(scan-35,0,scan+35,0);
      grad.addColorStop(0,'rgba(255,255,255,0)'); grad.addColorStop(.5,'rgba(218,210,255,.9)'); grad.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=grad; ctx.fillRect(scan-35,8,70,h-16);
      for(let k=0;k<9;k++){
        const f=(k/9 + timestamp*.000035)%1, x=f*w;
        const y=mid + Math.sin(timestamp*.003+k*1.7)*14;
        const rr=1.1+((Math.sin(timestamp*.008+k)+1)/2)*1.6;
        ctx.fillStyle=`rgba(220,213,255,${.22+.3*pulse})`; ctx.beginPath(); ctx.arc(x,y,rr,0,Math.PI*2); ctx.fill();
      }
    }

    const px=progressSafe*w;
    ctx.strokeStyle='rgba(247,242,255,.95)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(px,5); ctx.lineTo(px,h-5); ctx.stroke();
    ctx.fillStyle='rgba(255,255,255,.98)'; ctx.beginPath(); ctx.arc(px,6,3.5,0,Math.PI*2); ctx.fill();
  }

  function animateWave(timestamp) {
    state.wavePhase = timestamp * 0.001;
    let progress = 0;
    if (state.current && !state.paused) {
      const dur = Math.max(1, state.duration || 180);
      const hook = state.autoMix ? calcHookStart(dur) : 0;
      const visible = state.autoMix ? Math.min(HOOK_SECONDS, Math.max(1, dur-hook)) : dur;
      progress = Math.max(0, Math.min(1, ((state.pos||0)-hook) / visible));
    }
    drawWave(progress, timestamp);
    state.waveFrame = requestAnimationFrame(animateWave);
  }

  function seekWave(clientX) {
    if (!state.current || state.mix.running || state.paused) return; const p=curPlayer(); if(!p)return; const r=$('waveCanvas').getBoundingClientRect(), f=Math.max(0,Math.min(1,(clientX-r.left)/r.width)), dur=getDuration(), start=state.autoMix?calcHookStart(dur):0, visible=state.autoMix?Math.min(HOOK_SECONDS,Math.max(1,dur-start)):dur, target=state.autoMix?start+f*visible:f*dur;
    try { p.seekTo(Math.min(dur,target),true); state.pos=target; setStatus('⏩ เลื่อนตำแหน่งเพลงแล้ว'); drawWave(f); } catch(_) {}
  }

  // ---------- Menu / EQ / History ----------
  function openModal(title, html) { $('modalTitle').textContent=title; $('modalBody').innerHTML=html; $('modal').classList.add('show'); $('modal').setAttribute('aria-hidden','false'); }
  function closeModal() { $('modal').classList.remove('show'); $('modal').setAttribute('aria-hidden','true'); }
  function showEQ() {
    openModal('🎚 ปรับแต่งเสียง', `<div class="eq-list">${[['bass','🔊 Bass'],['music','🎵 Music'],['vocal','🎤 Vocal']].map(([k,l])=>`<label class="eq-row"><span>${l}</span><input id="eq_${k}" type="range" min="-12" max="12" value="${state.eq[k]}"><b id="eqv_${k}">${state.eq[k]||0} dB</b></label>`).join('')}</div><div class="modal-grid"><button id="autoEQ">✨ AUTO EQ ${state.autoEq?'ON':'OFF'}</button><button id="resetEQ">↺ รีเซ็ต</button></div><p class="modal-note">เมนู EQ คงรูปแบบจากระบบเดิม; การประมวลผลเสียงจริงของ YouTube IFrame ถูกจำกัดโดยเบราว์เซอร์</p>`);
    ['bass','music','vocal'].forEach(k=>{ $(`eq_${k}`).oninput=()=>{state.eq[k]=Number($(`eq_${k}`).value);$(`eqv_${k}`).textContent=`${state.eq[k]||0} dB`;saveJSON('aura_mix_eq',state.eq);} });
    $('autoEQ').onclick=()=>{state.autoEq=!state.autoEq;saveJSON('aura_mix_auto_eq',state.autoEq);showEQ();};
    $('resetEQ').onclick=()=>{state.eq={bass:0,music:0,vocal:0};saveJSON('aura_mix_eq',state.eq);showEQ();};
  }
  function showHistory() {
    if (!state.history.length) { openModal('🕘 ประวัติการฟัง','<div class="list-state">ยังไม่มีประวัติการฟัง</div>'); return; }
    openModal('🕘 ประวัติการฟัง', `${state.history.map((t,i)=>`<button class="music-item history-item" data-history="${i}"><img class="thumb" src="${esc(thumb(t))}" alt=""><span class="item-main"><b>${i+1}. ${esc(t.title)}</b><small>${esc(t.uploader||'YouTube')} • ${esc(t.played_at||'—')}</small></span><span class="circle play">▶</span></button>`).join('')}<button id="clearHistory" class="danger-wide">🗑 ล้างประวัติ</button>`);
    document.querySelectorAll('[data-history]').forEach(b=>b.onclick=()=>{const t=state.history[Number(b.dataset.history)];closeModal();addToQueue(t,true);});
    $('clearHistory').onclick=()=>{state.history=[];saveJSON('aura_mix_history',[]);showHistory();};
  }
  function syncMenuState() { $('menuMixState').textContent=state.autoMix?'ON • 60S':'OFF • FULL SONG'; $('menuAutoState').textContent=state.autoMusic?'ON':'OFF'; }

  // ---------- Media Session ----------
  function updateMediaSession() {
    if (!('mediaSession' in navigator) || !state.current) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({title:state.current.title||'AURA MIX',artist:state.current.uploader||'YouTube',album:'AURA MIX',artwork:thumb(state.current)?[{src:thumb(state.current),sizes:'480x360',type:'image/jpeg'}]:[]});
      navigator.mediaSession.playbackState = state.paused ? 'paused' : 'playing';
    } catch(_) {}
  }
  function bindMediaSession() {
    if (!('mediaSession' in navigator)) return;
    const bind=(name,fn)=>{try{navigator.mediaSession.setActionHandler(name,fn);}catch(_) {}};
    bind('play',()=>{if(state.paused)togglePause();}); bind('pause',()=>{if(!state.paused)togglePause();}); bind('previoustrack',playPrev); bind('nexttrack',playNext);
  }

  // ---------- YouTube ----------
  let playersInitialized = false;
  window.onYouTubeIframeAPIReady = function() {
    if (playersInitialized) return;
    if (!window.YT?.Player) { setStatus('YOUTUBE API ERROR', true); return; }
    playersInitialized = true;
    const common = {
      height:'1', width:'1', host:'https://www.youtube.com',
      playerVars:{autoplay:0,controls:0,disablekb:1,fs:0,iv_load_policy:3,modestbranding:1,playsinline:1,rel:0,origin:location.origin},
      events:{onReady:onPlayerReady,onStateChange:onYTState,onError:onYTError,onAutoplayBlocked:()=>{setStatus('▶ แตะ PLAY เพื่อเริ่มเพลง',true);toast('แตะปุ่ม ▶ เพื่ออนุญาตให้ YouTube เล่นเพลง');}}
    };
    playerA = new YT.Player('yt-a', common); playerB = new YT.Player('yt-b', common);
  };
  function onPlayerReady(e) {
    const p=e.target;
    const k=playerKey(p);
    state.playerCued[k]=false;
    try { p.setVolume(0); p.unMute?.(); } catch(_) {}
    state.readyCount++;
    if(state.readyCount>=2){
      state.playersReady=true;
      setStatus(state.queue.length?'READY • แตะเพลงเพื่อเล่น':'READY • YouTube Player พร้อม');
      if (state.pendingStartIndex >= 0 && state.pendingStartIndex < state.queue.length) {
        const idx = state.pendingStartIndex;
        state.pendingStartIndex = -1;
        state.pendingStartSession = 0;
        setTimeout(() => startTrack(idx), 0);
      }
    }
  }
  function onYTState(e) {
    const p=e.target, k=playerKey(p);
    if(e.data===YT.PlayerState.CUED) state.playerCued[k]=true;
    if(!state.current)return;
    if(e.data===YT.PlayerState.PLAYING){state.userActivated=true;updateMediaSession();}
    if(e.data===YT.PlayerState.ENDED && !state.mix.running && p===curPlayer()){
      finishCurrentAndPlayNext();
    }
  }
  function onYTError(e) {
    console.error('YouTube error',e.data);
    if (state.current && state.mix.running) return;
    const msg = ({2:'วิดีโอเสียหรือถูกลบ',5:'รูปแบบวิดีโอไม่รองรับ',100:'ไม่พบวิดีโอ',101:'วิดีโอไม่อนุญาตให้ฝัง',150:'วิดีโอไม่อนุญาตให้ฝัง'})[e?.data] || 'YouTube เปิดเพลงนี้ไม่ได้';
    setStatus(`YOUTUBE ERROR • ${e?.data ?? ''}`, true);
    toast(msg);
  }

  // ---------- Binding ----------
  function bindUI() {
    document.querySelectorAll('.nav-item[data-page-target]').forEach(b=>b.addEventListener('click',()=>showPage(b.dataset.pageTarget)));
    $('searchInput').addEventListener('input', debounceSearch);
    $('searchInput').addEventListener('keydown', e=>{ if(e.key==='Enter'){clearTimeout(state.searchTimer);doSearch();} });
    $('searchBtn').addEventListener('click',()=>doSearch());
    $('clearSearchBtn').addEventListener('click',()=>{state.searchRequestId++;$('searchInput').value='';clearTimeout(state.searchTimer);renderSearch([]);$('searchState').textContent='พิมพ์คำค้นหาเพื่อเริ่มค้นหา';});
    $('searchMode').addEventListener('change',()=>{if($('searchInput').value.trim())doSearch({silent:true});});
    $('artistBtn').addEventListener('click',artistSearch); $('oldBtn').addEventListener('click',oldPlaylist);
    $('pauseBtn')?.addEventListener('click',togglePause); $('prevBtn')?.addEventListener('click',playPrev); $('nextBtn')?.addEventListener('click',playNext); $('stopBtn')?.addEventListener('click',()=>stopAll()); $('mixBtn')?.addEventListener('click',toggleMix); $('autoMusicBtn')?.addEventListener('click',toggleAutoMusic);
    $('removeBtn').addEventListener('click',removeSelectedQueue); $('clearBtn').addEventListener('click',clearQueue);
    $('moreBtn').addEventListener('click',()=>showPage('menu')); $('closeModal').addEventListener('click',closeModal); $('modal').addEventListener('click',e=>{if(e.target===$('modal'))closeModal();});
    $('menuEq').addEventListener('click',showEQ); $('menuHistory').addEventListener('click',showHistory); $('menuArtist').addEventListener('click',artistSearch); $('menuOld').addEventListener('click',oldPlaylist); $('menuMix').addEventListener('click',toggleMix); $('menuAuto').addEventListener('click',toggleAutoMusic);
    $('vol').value=String(Math.max(0,Math.min(100,state.volume))); $('volVal').textContent=`${state.volume}%`;
    $('vol').addEventListener('input',()=>{state.volume=Number($('vol').value);$('volVal').textContent=`${state.volume}%`;saveJSON('aura_mix_volume',state.volume);try{curPlayer()?.setVolume(state.volume);}catch(_){} });
    const c=$('waveCanvas'); c.addEventListener('pointerdown',e=>{seekPointer=true;c.setPointerCapture?.(e.pointerId);seekWave(e.clientX);}); c.addEventListener('pointermove',e=>{if(seekPointer)seekWave(e.clientX);}); c.addEventListener('pointerup',()=>seekPointer=false); c.addEventListener('pointercancel',()=>seekPointer=false);
    window.addEventListener('resize',()=>drawWave(0));
    document.addEventListener('visibilitychange',()=>{ if(document.visibilityState==='visible'&&state.current&&!state.paused){updateMediaSession();try{curPlayer()?.setVolume(state.volume);}catch(_){}} });
  }

  function boot() {
    bindUI(); bindMediaSession(); syncMenuState(); updateMode(); renderQueue(); nowClock(); initPageFromHash();
    clockId=setInterval(nowClock,1000); timerId=setInterval(monitor,TICK_MS); drawWave(0); cancelAnimationFrame(state.waveFrame); state.waveFrame=requestAnimationFrame(animateWave);
    // The IFrame API is loaded before this file in index.html. In that case
    // YouTube may have fired its callback before this function existed.
    // Initialize immediately when YT is already available; otherwise the
    // global callback above will be called when the API finishes loading.
    if (window.YT?.Player && !playersInitialized) window.onYouTubeIframeAPIReady();
    if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js?v=4',{updateViaCache:'none'}).catch(()=>{});}
    // Surface a useful state if the YouTube API failed to load at all.
    setTimeout(()=>{if(!state.playersReady && !window.YT) {setStatus('YOUTUBE API ยังไม่โหลด',true);}},7000);
  }

  document.addEventListener('DOMContentLoaded', boot, {once:true});
})();
