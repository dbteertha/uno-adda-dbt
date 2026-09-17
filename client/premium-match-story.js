(() => {
  if (window.DBT_MATCH_STORY_V1) return;
  window.DBT_MATCH_STORY_V1 = true;

  const stable = window.DBT_STABILITY;
  const mode = location.pathname.startsWith('/flex') ? 'flex' : 'classic';
  const socket = mode === 'flex' ? window.DBT_FLEX_SOCKET : window.DBT_CLASSIC_SOCKET;
  if (!socket?.on) return;

  const safe = (name, fn) => {
    try {
      const value = fn();
      if (value && typeof value.catch === 'function') value.catch((error) => stable?.record?.(`story:${name}`, error));
      return value;
    } catch (error) {
      stable?.record?.(`story:${name}`, error);
      return undefined;
    }
  };

  const session = () => safe('session', () => {
    const raw = localStorage.getItem(mode === 'flex' ? 'flex-session' : 'uno-session');
    const data = raw ? JSON.parse(raw) : null;
    return data || null;
  });
  const roomCode = () => String(session()?.roomCode || '----').toUpperCase();
  const timelineKey = () => `dbt-story:${mode}:${roomCode()}`;
  const seriesKey = () => `dbt-series:${mode}:${roomCode()}`;
  let state = null;
  let timeline = [];
  let lastId = '';
  let turnStartedAt = Date.now();
  let previousTurn = '';

  function load() {
    try { timeline = JSON.parse(sessionStorage.getItem(timelineKey()) || '[]') || []; } catch { timeline = []; }
    if (!Array.isArray(timeline)) timeline = [];
    timeline = timeline.slice(-160);
  }
  function persist() {
    try { sessionStorage.setItem(timelineKey(), JSON.stringify(timeline.slice(-160))); } catch {}
  }
  load();

  const dialog = document.createElement('dialog');
  dialog.id = 'dbt-match-story';
  dialog.innerHTML = `
    <div class="dbt-story-shell">
      <header><div><small>DBT GAMES · MATCH STORY</small><h2 id="dbt-story-title">Match recap</h2></div><button id="dbt-story-close" type="button" aria-label="Close match story">✕</button></header>
      <div class="dbt-story-hero"><div class="dbt-story-trophy">🏆</div><div><small id="dbt-story-mode">${mode.toUpperCase()}</small><h3 id="dbt-story-winner">Match complete</h3><p id="dbt-story-summary">Your match highlights will appear here.</p></div></div>
      <div id="dbt-story-stats" class="dbt-story-stats"></div>
      <section><div class="dbt-story-section-head"><b>HIGHLIGHTS</b><small>saved for this tab/session</small></div><div id="dbt-story-highlights" class="dbt-story-list"></div></section>
      <section><div class="dbt-story-section-head"><b>BEST OF 3</b><small>passive series tracker</small></div><div id="dbt-story-series" class="dbt-story-series"></div></section>
      <div class="dbt-story-actions"><button id="dbt-story-copy" type="button">COPY RECAP</button><button id="dbt-story-reset-series" type="button">RESET SERIES</button></div>
    </div>`;
  document.body.appendChild(dialog);

  const storyButton = document.createElement('button');
  storyButton.id = 'dbt-story-open';
  storyButton.type = 'button';
  storyButton.hidden = true;
  storyButton.textContent = '🏆 MATCH STORY';
  document.body.appendChild(storyButton);

  const $ = (id) => dialog.querySelector(`#${id}`);
  const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, 180);
  const now = () => Date.now();

  function push(type, text, extra = {}) {
    const item = { id: `${now()}:${Math.random().toString(36).slice(2,7)}`, at: now(), type, text: clean(text), ...extra };
    timeline.push(item);
    if (timeline.length > 160) timeline.shift();
    persist();
    return item;
  }

  function classicText(ev) {
    if (!ev) return '';
    const actor = clean(ev.actor || 'Player');
    const target = clean(ev.target || '');
    const value = clean(ev.value || '');
    switch (ev.type) {
      case 'draw4': return `${actor} dropped +4${target ? ` on ${target}` : ''}`;
      case 'draw2': return `${actor} hit ${target || 'the table'} with +2`;
      case 'reverse': return `${actor} reversed the table`;
      case 'skip': return `${actor} skipped ${target || 'the next player'}`;
      case 'uno': return `${actor} ${value === 'called' ? 'called UNO' : 'missed UNO'}`;
      case 'catch': return `${actor} caught ${target || 'a rival'} missing UNO`;
      case 'devil': return `${actor} played DEVIL`;
      case 'wild': return `${actor} changed the color`;
      case 'draw': return `${actor} drew a card`;
      case 'win': return `${actor} won the round`;
      case 'play': return `${actor} played ${value || 'a card'}`;
      default: return actor ? `${actor} · ${clean(ev.type || 'event')}` : '';
    }
  }

  function getSeries() {
    try { return JSON.parse(sessionStorage.getItem(seriesKey()) || '{"wins":{},"rounds":0}') || { wins:{}, rounds:0 }; }
    catch { return { wins:{}, rounds:0 }; }
  }
  function saveSeries(series) {
    try { sessionStorage.setItem(seriesKey(), JSON.stringify(series)); } catch {}
  }
  function recordWin(name) {
    const winner = clean(name || 'Winner');
    const series = getSeries();
    series.wins ||= {};
    series.wins[winner] = Number(series.wins[winner] || 0) + 1;
    series.rounds = Number(series.rounds || 0) + 1;
    saveSeries(series);
    return series;
  }

  function deriveStats() {
    const count = (re) => timeline.filter((x) => re.test(`${x.type} ${x.text}`)).length;
    const draws = timeline.filter((x) => /draw|\+2|\+4/i.test(`${x.type} ${x.text}`));
    const fastest = timeline.filter((x) => Number.isFinite(x.turnMs)).sort((a,b) => a.turnMs-b.turnMs)[0];
    const longest = timeline.filter((x) => Number.isFinite(x.turnMs)).sort((a,b) => b.turnMs-a.turnMs)[0];
    return {
      events: timeline.length,
      drawMoments: draws.length,
      uno: count(/uno/i),
      powers: count(/reverse|skip|draw4|draw2|wild|devil|shield|robbery|freeze|magnet|\+4|\+2/i),
      fastest,
      longest,
    };
  }

  function topHighlights() {
    return timeline.filter((x) => /win|uno|catch|draw4|devil|reverse|comeback|\+4/i.test(`${x.type} ${x.text}`)).slice(-8).reverse();
  }

  function renderSeries() {
    const box = $('dbt-story-series');
    const series = getSeries();
    const entries = Object.entries(series.wins || {}).sort((a,b) => b[1]-a[1]);
    box.replaceChildren();
    if (!entries.length) {
      const empty = document.createElement('small'); empty.textContent = 'Series begins after the first completed round.'; box.appendChild(empty); return;
    }
    for (const [name, wins] of entries) {
      const row = document.createElement('div'); row.className = 'dbt-series-row';
      const label = document.createElement('span'); label.textContent = name;
      const score = document.createElement('b'); score.textContent = `${wins} / 2 wins`;
      const bar = document.createElement('i'); bar.style.setProperty('--series-progress', `${Math.min(100, Number(wins) * 50)}%`);
      row.append(label, score, bar); box.appendChild(row);
    }
    if (entries[0]?.[1] >= 2) {
      const champ = document.createElement('div'); champ.className = 'dbt-series-champ'; champ.textContent = `👑 ${entries[0][0]} wins the best-of-3 series`; box.prepend(champ);
    }
  }

  function render(winner='') {
    const stats = deriveStats();
    $('dbt-story-title').textContent = winner ? 'Round complete' : 'Match recap';
    $('dbt-story-winner').textContent = winner ? `${winner} takes the round` : 'Match story';
    $('dbt-story-summary').textContent = winner
      ? `${stats.events} tracked moments · ${stats.powers} power moments · ${stats.uno} UNO moments`
      : 'Your current match timeline is saved for this tab and can survive a refresh.';
    const statsBox = $('dbt-story-stats');
    statsBox.innerHTML = '';
    const cards = [
      ['EVENTS', stats.events], ['POWER MOMENTS', stats.powers], ['UNO MOMENTS', stats.uno], ['DRAW MOMENTS', stats.drawMoments],
      ['FASTEST TURN', stats.fastest ? `${Math.max(1, Math.round(stats.fastest.turnMs/1000))}s` : '—'],
      ['LONGEST THINK', stats.longest ? `${Math.max(1, Math.round(stats.longest.turnMs/1000))}s` : '—'],
    ];
    for (const [label, value] of cards) {
      const card = document.createElement('div'); const s = document.createElement('small'); s.textContent = label; const b = document.createElement('b'); b.textContent = String(value); card.append(s,b); statsBox.appendChild(card);
    }
    const list = $('dbt-story-highlights'); list.replaceChildren();
    const highlights = topHighlights();
    if (!highlights.length) { const e=document.createElement('small');e.textContent='Major moments will appear here.';list.appendChild(e); }
    for (const item of highlights) { const row=document.createElement('div');row.className='dbt-story-event';const ico=document.createElement('span');ico.textContent=/win/i.test(item.type)?'🏆':/uno|catch/i.test(`${item.type} ${item.text}`)?'🚨':/draw4|\+4/i.test(`${item.type} ${item.text}`)?'💥':'✨';const text=document.createElement('span');text.textContent=item.text;row.append(ico,text);list.appendChild(row); }
    renderSeries();
    storyButton.hidden = timeline.length === 0;
  }

  function noteTurn(turnKey) {
    const key = clean(turnKey);
    if (!key || key === previousTurn) return;
    if (previousTurn) push('turn_time', `${previousTurn} turn`, { turnMs: Math.max(0, now() - turnStartedAt), actor: previousTurn });
    previousTurn = key;
    turnStartedAt = now();
  }

  function completeRound(winner) {
    const name = clean(winner || 'Winner');
    push('win', `${name} won the round`);
    recordWin(name);
    render(name);
    storyButton.hidden = false;
    if (!dialog.open) dialog.showModal();
    window.DBT_UI?.haptic?.([35,40,70]);
  }

  function onClassic(next) {
    safe('classic', () => {
      state = next;
      const ev = next?.lastEvent;
      if (ev?.id && ev.id !== lastId) {
        lastId = ev.id;
        const text = classicText(ev);
        if (text) push(ev.type || 'event', text, { actor:clean(ev.actor), target:clean(ev.target), value:clean(ev.value) });
        if (ev.type === 'win') completeRound(ev.actor || next?.winner || 'Winner');
      }
      const meTurn = next?.players?.find?.((p) => p.token === next?.currentToken || p.isCurrent)?.displayName || next?.turnName || next?.currentPlayerName;
      if (meTurn) noteTurn(meTurn);
      render();
    });
  }

  function onFlex(next) {
    safe('flex', () => {
      state = next;
      const action = clean(next?.lastAction || '');
      if (action && action !== lastId) {
        lastId = action;
        push('flex', action);
        const match = action.match(/(.+?)\s+(?:wins|won|জিত)/i);
        if (match) completeRound(match[1]);
      }
      const current = (next?.players || []).find((p) => p.token === next?.currentToken);
      if (current?.name) noteTurn(current.name);
      render();
    });
  }

  storyButton.onclick = () => { render(); dialog.showModal(); };
  $('dbt-story-close').onclick = () => dialog.close();
  dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  $('dbt-story-reset-series').onclick = () => { try { sessionStorage.removeItem(seriesKey()); } catch {} render(); window.DBT_UI?.toast?.('Series tracker reset'); };
  $('dbt-story-copy').onclick = () => safe('copy', async () => {
    const highlights = topHighlights().slice(0,6).map((x) => `• ${x.text}`);
    const series = getSeries();
    const score = Object.entries(series.wins || {}).sort((a,b)=>b[1]-a[1]).map(([name,wins])=>`${name} ${wins}`).join(' · ');
    const text = `DBT Games · ${mode.toUpperCase()} · Room ${roomCode()}\n${score ? `Series: ${score}\n` : ''}${highlights.length ? highlights.join('\n') : 'No major highlights yet.'}`;
    try { await navigator.clipboard.writeText(text); window.DBT_UI?.toast?.('Match story copied ✅'); }
    catch { window.DBT_UI?.toast?.(text); }
  });

  if (mode === 'classic') socket.on('s_sync_state', onClassic);
  else socket.on('f_state', onFlex);
  window.addEventListener('beforeunload', persist);
  render();
})();
