(() => {
  if (window.DBT_VOICE_V2) return;
  const stable = window.DBT_STABILITY;
  const fail = (where, error) => stable?.record?.(`voice:${where}`, error);

  try {
    const mode = location.pathname.startsWith('/flex') || new URLSearchParams(location.search).get('mode') === 'flex' ? 'flex' : 'classic';
    const session = () => {
      try {
        const raw = localStorage.getItem(mode === 'flex' ? 'flex-session' : 'uno-session');
        const data = raw ? JSON.parse(raw) : null;
        if (!data) return null;
        const roomCode = String(data.roomCode || '').toUpperCase();
        const sessionToken = String(mode === 'flex' ? (data.token || '') : (data.sessionToken || ''));
        return /^[A-Z2-9]{4}$/.test(roomCode) && sessionToken ? { roomCode, sessionToken } : null;
      } catch (error) { fail('session', error); return null; }
    };
    const visible = (el) => !!el && !el.hidden && getComputedStyle(el).display !== 'none';
    const inRoom = () => mode === 'flex'
      ? visible(document.getElementById('lobby')) || visible(document.getElementById('game'))
      : visible(document.getElementById('lobby')) || visible(document.getElementById('board'));

    if (!session() || !inRoom()) return;
    window.DBT_VOICE_V2 = true;

    const ui = window.DBT_UI || { emit:()=>{}, haptic:()=>{} };
    const peers = new Map();
    const meta = new Map();
    let socket = null;
    let stream = null;
    let joined = false;
    let wanted = false;
    let muted = true;
    let selfToken = '';
    let iceServers = [];
    let ptt = localStorage.getItem('dbt-voice-ptt') === '1';
    let focus = localStorage.getItem('dbt-voice-focus') === '1';
    let meterCtx = null;
    let localAnalyser = null;
    let meterTimer = 0;
    let lastSpeaking = false;
    let roomWatch = 0;

    const toast = (message) => {
      try {
        if (ui.toast) return ui.toast(message, 'info');
        document.querySelector('.dbt-voice-toast')?.remove();
        const el = document.createElement('div');
        el.className = 'dbt-voice-toast';
        el.textContent = message;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 2600);
      } catch (error) { fail('toast', error); }
    };

    const dock = document.createElement('aside');
    dock.id = 'dbt-voice-dock';
    dock.className = 'dbt-voice-dock-compact';
    dock.innerHTML = `<div class="dbt-voice-head" role="button" tabindex="0" aria-label="Toggle voice room panel"><span id="dbt-voice-live" class="dbt-voice-live"></span><strong>🎙️ VOICE ROOM</strong><small id="dbt-voice-status">OFF</small><span id="dbt-voice-chevron">▴</span></div><div class="dbt-voice-body"><div class="dbt-voice-controls"><button id="dbt-voice-join" type="button">JOIN VOICE</button><button id="dbt-voice-mic" type="button" disabled>🔇 MUTED</button><button id="dbt-voice-leave" type="button" disabled aria-label="Leave voice">✕</button></div><div class="dbt-voice-expanded"><div class="dbt-voice-setting-row"><button id="dbt-voice-ptt" type="button">PTT: OFF</button><button id="dbt-voice-focus" type="button">VOICE FOCUS</button></div><div class="dbt-voice-setting-row"><button id="dbt-voice-audio" type="button">🎵 ATMOSPHERE</button><button id="dbt-voice-mute-all" type="button">🔇 MUTE ALL</button></div><div id="dbt-voice-peers"></div><small class="dbt-voice-privacy">Peer-to-peer audio. Voice is not recorded or stored by DBT Games.</small></div></div>`;
    document.body.appendChild(dock);

    const consent = document.createElement('dialog');
    consent.id = 'dbt-voice-consent';
    consent.innerHTML = `<small>DBT GAMES · VOICE ROOM</small><h2>Enable match voice?</h2><p>Your browser will ask for microphone access. Voice is sent between players through WebRTC where possible. DBT Games does not record or store the conversation. You always join muted.</p><div class="dbt-consent-actions"><button id="dbt-voice-consent-no" type="button">NOT NOW</button><button id="dbt-voice-consent-yes" type="button">ENABLE VOICE</button></div>`;
    document.body.appendChild(consent);

    const $ = (id) => document.getElementById(id);
    const liveEl = $('dbt-voice-live');
    const statusEl = $('dbt-voice-status');
    const joinBtn = $('dbt-voice-join');
    const micBtn = $('dbt-voice-mic');
    const leaveBtn = $('dbt-voice-leave');
    const pttBtn = $('dbt-voice-ptt');
    const focusBtn = $('dbt-voice-focus');
    const audioBtn = $('dbt-voice-audio');
    const muteAllBtn = $('dbt-voice-mute-all');
    const peerBox = $('dbt-voice-peers');

    const setStatus = (text, kind='off') => {
      statusEl.textContent = text;
      liveEl.className = 'dbt-voice-live' + (kind === 'on' ? ' on' : kind === 'warn' ? ' warn' : '');
    };

    function syncControls() {
      joinBtn.textContent = joined ? 'VOICE CONNECTED' : wanted ? 'CONNECTING…' : 'JOIN VOICE';
      joinBtn.disabled = joined || wanted;
      micBtn.disabled = !joined;
      leaveBtn.disabled = !joined && !wanted;
      if (ptt) {
        micBtn.textContent = muted ? '🎙️ HOLD TO TALK' : '🟢 TALKING';
        micBtn.classList.toggle('talking', !muted);
        micBtn.classList.remove('live');
      } else {
        micBtn.textContent = muted ? '🔇 MUTED' : '🎙️ MIC LIVE';
        micBtn.classList.toggle('live', !muted);
        micBtn.classList.remove('talking');
      }
      pttBtn.textContent = `PTT: ${ptt ? 'ON' : 'OFF'}`;
      pttBtn.classList.toggle('active', ptt);
      focusBtn.textContent = focus ? 'VOICE FOCUS ✓' : 'VOICE FOCUS';
      focusBtn.classList.toggle('active', focus);
      const ambient = window.DBT_AUDIO?.enabled !== false;
      audioBtn.textContent = ambient ? '🎵 ATMOSPHERE ✓' : '🎵 ATMOSPHERE';
      audioBtn.classList.toggle('active', ambient);
      if (joined) setStatus(`${1 + peers.size} IN VOICE`, 'on');
      else if (wanted) setStatus('CONNECTING', 'warn');
      else setStatus('OFF');
    }

    function renderPeers() {
      peerBox.replaceChildren();
      if (!joined) {
        const p = document.createElement('small'); p.textContent = 'Join voice to see connected players.'; p.style.color = '#8298ae'; peerBox.appendChild(p); syncControls(); return;
      }
      if (!peers.size) {
        const p = document.createElement('small'); p.textContent = 'Waiting for another player to join voice…'; p.style.color = '#8298ae'; peerBox.appendChild(p); syncControls(); return;
      }
      for (const [token, peer] of peers) {
        const info = meta.get(token) || {};
        const row = document.createElement('div'); row.className = 'dbt-voice-peer'; peer.row = row;
        const av = document.createElement('span'); av.className = 'dbt-peer-avatar'; av.textContent = info.avatar || '🎮';
        const copy = document.createElement('span'); copy.className = 'dbt-peer-info';
        const name = document.createElement('b'); name.textContent = info.name || 'Player';
        const state = document.createElement('small'); state.textContent = info.muted ? 'Muted' : 'Voice connected';
        copy.append(name, state);
        const actions = document.createElement('span'); actions.className = 'dbt-peer-actions';
        const range = document.createElement('input'); range.type = 'range'; range.min = '0'; range.max = '1'; range.step = '.05'; range.value = String(peer.volume); range.setAttribute('aria-label', `Volume for ${info.name || 'player'}`);
        range.oninput = () => { peer.volume = Number(range.value); if (peer.audio) peer.audio.volume = peer.localMute ? 0 : peer.volume; };
        const mute = document.createElement('button'); mute.type = 'button'; mute.className = 'dbt-peer-mute'; mute.textContent = peer.localMute ? '🔇' : '🔊'; mute.title = 'Mute this player locally';
        mute.onclick = () => { peer.localMute = !peer.localMute; if (peer.audio) peer.audio.volume = peer.localMute ? 0 : peer.volume; mute.textContent = peer.localMute ? '🔇' : '🔊'; };
        actions.append(range, mute); row.append(av, copy, actions); peerBox.appendChild(row);
      }
      syncControls();
    }

    function stopMeters() {
      if (meterTimer) { clearInterval(meterTimer); meterTimer = 0; }
      if (meterCtx) { meterCtx.close().catch(()=>{}); meterCtx = null; }
      localAnalyser = null;
      if (lastSpeaking) { lastSpeaking = false; ui.emit?.('voiceactivity', { speaking:false }); }
    }
    function rms(analyser) {
      if (!analyser) return 0;
      const data = new Uint8Array(analyser.fftSize); analyser.getByteTimeDomainData(data);
      let sum = 0; for (const value of data) { const n = (value - 128) / 128; sum += n * n; }
      return Math.sqrt(sum / data.length);
    }
    function sampleMeters() {
      try {
        let any = joined && !muted && rms(localAnalyser) > .035;
        dock.classList.toggle('dbt-voice-speaking', any);
        for (const [token, peer] of peers) {
          const speaking = !meta.get(token)?.muted && rms(peer.analyser) > .028;
          peer.row?.classList.toggle('speaking', speaking);
          any = any || speaking;
        }
        if (any !== lastSpeaking) { lastSpeaking = any; ui.emit?.('voiceactivity', { speaking:any }); }
      } catch (error) { fail('meter', error); }
    }
    function ensureMeterContext() {
      if (meterCtx) return meterCtx;
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) return null;
      meterCtx = new AudioCtor();
      if (!meterTimer) meterTimer = setInterval(sampleMeters, 120);
      return meterCtx;
    }
    function attachLocalMeter() {
      try { const ctx = ensureMeterContext(); if (!ctx || !stream) return; const source = ctx.createMediaStreamSource(stream); localAnalyser = ctx.createAnalyser(); localAnalyser.fftSize = 256; source.connect(localAnalyser); } catch (error) { fail('local-meter', error); }
    }
    function attachRemoteMeter(peer, remoteStream) {
      try { const ctx = ensureMeterContext(); if (!ctx) return; const source = ctx.createMediaStreamSource(remoteStream); peer.analyser = ctx.createAnalyser(); peer.analyser.fftSize = 256; source.connect(peer.analyser); } catch (error) { fail('remote-meter', error); }
    }

    async function ensureLocal() {
      if (stream) return stream;
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw new Error('Voice chat needs HTTPS and microphone support.');
      stream = await navigator.mediaDevices.getUserMedia({ video:false, audio:{ echoCancellation:true, noiseSuppression:true, autoGainControl:true, channelCount:1 } });
      stream.getAudioTracks().forEach((track) => { track.enabled = false; });
      attachLocalMeter();
      return stream;
    }

    function dropPeer(token, rerender=true) {
      const peer = peers.get(token); if (!peer) return;
      try { peer.pc.ontrack = null; peer.pc.onicecandidate = null; peer.pc.close(); } catch {}
      if (peer.audio) { peer.audio.srcObject = null; peer.audio.remove(); }
      peers.delete(token);
      if (rerender) renderPeers();
    }
    function closePeers() { for (const token of [...peers.keys()]) dropPeer(token, false); renderPeers(); }

    async function ensurePeer(token) {
      if (peers.has(token)) return peers.get(token);
      const pc = new RTCPeerConnection({ iceServers });
      const peer = { pc, audio:null, analyser:null, pendingIce:[], volume:1, localMute:false, makingOffer:false, row:null };
      peers.set(token, peer);
      if (stream) stream.getTracks().forEach((track) => pc.addTrack(track, stream));
      pc.onicecandidate = (event) => {
        if (!event.candidate || !socket?.connected) return;
        socket.emit('v_signal', { targetToken:token, signal:{ type:'ice', candidate:JSON.stringify(event.candidate.toJSON ? event.candidate.toJSON() : event.candidate) } });
      };
      pc.ontrack = (event) => {
        try {
          const remoteStream = event.streams?.[0] || new MediaStream([event.track]);
          if (!peer.audio) {
            const audio = document.createElement('audio'); audio.autoplay = true; audio.playsInline = true; audio.srcObject = remoteStream; audio.volume = peer.localMute ? 0 : peer.volume; audio.dataset.dbtVoicePeer = token; document.body.appendChild(audio); peer.audio = audio; audio.play().catch(()=>{});
          }
          attachRemoteMeter(peer, remoteStream);
        } catch (error) { fail('track', error); }
      };
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed') { try { pc.restartIce(); } catch {} }
        if (pc.connectionState === 'closed') dropPeer(token);
      };
      return peer;
    }

    async function makeOffer(token) {
      const peer = await ensurePeer(token); if (!peer || peer.makingOffer) return;
      peer.makingOffer = true;
      try {
        const offer = await peer.pc.createOffer({ offerToReceiveAudio:true });
        await peer.pc.setLocalDescription(offer);
        socket?.emit('v_signal', { targetToken:token, signal:{ type:'offer', sdp:offer.sdp || '' } });
      } catch (error) { fail('offer', error); }
      finally { peer.makingOffer = false; }
    }

    async function handleSignal(payload) {
      const fromToken = payload?.fromToken, signal = payload?.signal;
      if (!fromToken || !signal || fromToken === selfToken) return;
      const peer = await ensurePeer(fromToken), pc = peer.pc;
      try {
        if (signal.type === 'offer') {
          const collision = peer.makingOffer || pc.signalingState !== 'stable';
          const polite = selfToken > fromToken;
          if (collision && !polite) return;
          if (collision && polite) { try { await pc.setLocalDescription({ type:'rollback' }); } catch {} }
          await pc.setRemoteDescription({ type:'offer', sdp:signal.sdp });
          for (const candidate of peer.pendingIce.splice(0)) await pc.addIceCandidate(candidate).catch(()=>{});
          const answer = await pc.createAnswer(); await pc.setLocalDescription(answer);
          socket?.emit('v_signal', { targetToken:fromToken, signal:{ type:'answer', sdp:answer.sdp || '' } });
        } else if (signal.type === 'answer') {
          if (pc.signalingState === 'have-local-offer') { await pc.setRemoteDescription({ type:'answer', sdp:signal.sdp }); for (const candidate of peer.pendingIce.splice(0)) await pc.addIceCandidate(candidate).catch(()=>{}); }
        } else if (signal.type === 'ice') {
          let object; try { object = JSON.parse(signal.candidate); } catch { return; }
          const candidate = new RTCIceCandidate(object);
          if (pc.remoteDescription) await pc.addIceCandidate(candidate); else peer.pendingIce.push(candidate);
        }
      } catch (error) { fail('signal', error); }
    }

    function setMuted(value, announce=true) {
      muted = !!value;
      stream?.getAudioTracks().forEach((track) => { track.enabled = !muted; });
      if (announce && joined && socket?.connected) socket.emit('v_meta', { muted });
      syncControls();
    }
    function setPtt(value) { ptt = !!value; localStorage.setItem('dbt-voice-ptt', ptt ? '1' : '0'); if (ptt) setMuted(true, true); syncControls(); }
    function setFocus(value) { focus = !!value; localStorage.setItem('dbt-voice-focus', focus ? '1' : '0'); ui.emit?.('voicefocus', { enabled:focus }); window.DBT_AUDIO?.setVoiceFocus?.(focus); syncControls(); }

    function createSocket() {
      if (socket) return socket;
      if (typeof io !== 'function') return null;
      socket = io('/voice', { autoConnect:false, reconnection:true, reconnectionAttempts:Infinity, reconnectionDelay:700, reconnectionDelayMax:3500 });
      socket.on('connect', () => { const s = session(); if (wanted && s) socket.emit('v_join', { mode, roomCode:s.roomCode, sessionToken:s.sessionToken }); });
      socket.on('disconnect', () => { if (!wanted) return; joined = false; closePeers(); setMuted(true, false); setStatus('RECONNECTING', 'warn'); syncControls(); });
      socket.on('v_joined', async (data) => {
        joined = true; wanted = true; selfToken = data?.self?.token || ''; iceServers = Array.isArray(data?.iceServers) ? data.iceServers : [];
        meta.clear(); closePeers();
        for (const person of data?.peers || []) if (person?.token) { meta.set(person.token, person); await ensurePeer(person.token); await makeOffer(person.token); }
        setMuted(true, true); renderPeers(); ui.haptic?.(10); ui.emit?.('voiceconnected', { mode, roomCode:data?.roomCode, peers:(data?.peers || []).length });
      });
      socket.on('v_peer_joined', (person) => { if (!person?.token || person.token === selfToken) return; meta.set(person.token, person); void ensurePeer(person.token); renderPeers(); });
      socket.on('v_peer_left', ({ token }={}) => { if (!token) return; dropPeer(token); meta.delete(token); renderPeers(); });
      socket.on('v_peer_meta', ({ token, muted:remoteMuted }={}) => { if (!token) return; const info = meta.get(token) || {}; info.muted = !!remoteMuted; meta.set(token, info); renderPeers(); });
      socket.on('v_signal', (data) => void handleSignal(data));
      socket.on('v_error', ({ message }={}) => { toast(message || 'Voice connection problem'); if (!joined && wanted) { wanted = false; stopLocal(); syncControls(); } });
      socket.on('v_replaced', () => { toast('Voice moved to another session.'); leaveVoice('replaced'); });
      return socket;
    }

    async function startVoice() {
      if (wanted) return;
      if (typeof RTCPeerConnection !== 'function') return toast('This browser does not support WebRTC voice chat.');
      const s = session(); if (!s || !inRoom()) return toast('Join a match room before using voice.');
      wanted = true; syncControls();
      try {
        await ensureLocal();
        const voiceSocket = createSocket(); if (!voiceSocket) throw new Error('Voice service is unavailable.');
        if (!voiceSocket.connected) voiceSocket.connect(); else voiceSocket.emit('v_join', { mode, roomCode:s.roomCode, sessionToken:s.sessionToken });
      } catch (error) { fail('start', error); wanted = false; joined = false; stopLocal(); toast(error?.message || 'Microphone access was not available.'); syncControls(); }
    }
    function askConsent() {
      if (localStorage.getItem('dbt-voice-consent') === '1') return void startVoice();
      if (!consent.open) consent.showModal();
    }
    function stopLocal() {
      if (stream) { stream.getTracks().forEach((track) => track.stop()); stream = null; }
      stopMeters();
    }
    function leaveVoice(reason='left') {
      wanted = false; joined = false; setMuted(true, false);
      if (socket?.connected) socket.emit('v_leave', {});
      closePeers(); stopLocal(); selfToken = ''; meta.clear(); socket?.disconnect(); renderPeers(); setStatus('OFF'); syncControls(); ui.emit?.('voiceleft', { reason });
    }

    $('dbt-voice-consent-no').onclick = () => consent.close();
    $('dbt-voice-consent-yes').onclick = () => { localStorage.setItem('dbt-voice-consent', '1'); consent.close(); void startVoice(); };
    joinBtn.onclick = askConsent;
    leaveBtn.onclick = () => leaveVoice('user');
    micBtn.onclick = () => { if (joined && !ptt) setMuted(!muted, true); };
    micBtn.addEventListener('pointerdown', (event) => { if (joined && ptt) { event.preventDefault(); setMuted(false, true); ui.haptic?.(7); } });
    ['pointerup','pointercancel','pointerleave'].forEach((type) => micBtn.addEventListener(type, () => { if (joined && ptt && !muted) setMuted(true, true); }));
    pttBtn.onclick = () => setPtt(!ptt);
    focusBtn.onclick = () => setFocus(!focus);
    audioBtn.onclick = () => { const next = !(window.DBT_AUDIO?.enabled !== false); window.DBT_AUDIO?.setEnabled?.(next); syncControls(); };
    muteAllBtn.onclick = () => { const shouldMute = [...peers.values()].some((peer) => !peer.localMute); for (const peer of peers.values()) { peer.localMute = shouldMute; if (peer.audio) peer.audio.volume = shouldMute ? 0 : peer.volume; } muteAllBtn.textContent = shouldMute ? '🔊 UNMUTE ALL' : '🔇 MUTE ALL'; renderPeers(); };

    const head = dock.querySelector('.dbt-voice-head');
    const toggleDock = () => { dock.classList.toggle('dbt-voice-dock-compact'); $('dbt-voice-chevron').textContent = dock.classList.contains('dbt-voice-dock-compact') ? '▴' : '▾'; };
    head.onclick = toggleDock;
    head.onkeydown = (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); toggleDock(); } };
    document.addEventListener('keydown', (event) => { if (!joined || !ptt || event.repeat || event.code !== 'KeyV' || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return; event.preventDefault(); setMuted(false, true); });
    document.addEventListener('keyup', (event) => { if (joined && ptt && event.code === 'KeyV') { event.preventDefault(); setMuted(true, true); } });
    window.addEventListener('pagehide', () => leaveVoice('pagehide'));
    window.addEventListener('beforeunload', () => stream?.getTracks().forEach((track) => track.stop()));

    roomWatch = setInterval(() => {
      try {
        const active = !!session() && inRoom();
        dock.hidden = !active;
        if (!active && wanted) leaveVoice('room-left');
        if (!active) { clearInterval(roomWatch); roomWatch = 0; }
      } catch (error) { fail('room-watch', error); }
    }, 1000);

    setPtt(ptt); setFocus(focus); renderPeers(); syncControls();
    window.DBT_VOICE = { join:askConsent, leave:leaveVoice, get joined(){return joined;}, get muted(){return muted;}, setMuted, setPtt, setFocus };
  } catch (error) {
    fail('boot', error);
    document.getElementById('dbt-voice-dock')?.remove();
    document.getElementById('dbt-voice-consent')?.remove();
  }
})();
