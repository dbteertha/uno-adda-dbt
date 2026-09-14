(() => {
  let config = null;
  let style = null;
  let editing = false;
  let selected = null;
  let selectedSelector = '';
  let mode = 'select';
  let dirty = false;
  let drag = null;

  const text = (selector, value) => {
    const el = document.querySelector(selector);
    if (el && typeof value === 'string') el.textContent = value;
  };
  const toggle = (selector, visible) => {
    const el = document.querySelector(selector);
    if (el) el.hidden = !visible;
  };
  const safeCss = (value) => String(value || '').replace(/[{};]/g, '');

  function cssPath(el) {
    if (!el || el === document.body) return 'body';
    if (el.id) return `#${CSS.escape(el.id)}`;
    if (el.dataset?.adminKey) return `[data-admin-key="${CSS.escape(el.dataset.adminKey)}"]`;
    const parts = [];
    let cur = el;
    while (cur && cur !== document.body && parts.length < 6) {
      if (cur.id) { parts.unshift(`#${CSS.escape(cur.id)}`); break; }
      const tag = cur.tagName.toLowerCase();
      const parent = cur.parentElement;
      if (!parent) break;
      const siblings = [...parent.children].filter((x) => x.tagName === cur.tagName);
      const nth = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(cur) + 1})` : '';
      parts.unshift(tag + nth);
      cur = parent;
    }
    return parts.join(' > ');
  }

  function ensureKeys() {
    let n = 0;
    document.querySelectorAll('body *').forEach((el) => {
      if (el.closest('#dbt-visual-toolbar,#dbt-visual-inspector,#dbt-admin-login')) return;
      if (!el.id && !el.dataset.adminKey) el.dataset.adminKey = `dbt-${++n}`;
    });
  }

  function ensureAdminButton() {
    if (document.getElementById('dbt-admin-open')) return;
    const actions = document.querySelector('.top-actions');
    if (!actions) return;
    const b = document.createElement('button');
    b.id = 'dbt-admin-open';
    b.className = 'icon-btn';
    b.type = 'button';
    b.title = 'Edit this site directly';
    b.textContent = '✏️';
    b.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (editing) return stopEditor();
      await startEditor();
    });
    actions.prepend(b);
  }

  function ensureAnnouncement(message) {
    let bar = document.getElementById('admin-announcement');
    if (!message) { if (bar) bar.remove(); return; }
    if (!bar) {
      bar = document.createElement('div');
      bar.id = 'admin-announcement';
      bar.className = 'admin-announcement';
      document.body.prepend(bar);
    }
    bar.textContent = message;
  }

  function applyAvatars(list) {
    const wrap = document.getElementById('avatars');
    if (!wrap || !Array.isArray(list) || !list.length) return;
    const selectedPerson = wrap.querySelector('.avatar.active')?.dataset?.person;
    wrap.innerHTML = '';
    list.forEach((item, index) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'avatar' + ((item.label === selectedPerson || (!selectedPerson && index === 0)) ? ' active' : '');
      b.dataset.avatar = item.icon || '🎮';
      b.dataset.person = item.label || 'Player';
      const icon = document.createElement('span'); icon.textContent = item.icon || '🎮';
      const label = document.createElement('small'); label.textContent = item.label || 'Player';
      b.append(icon, label);
      wrap.appendChild(b);
    });
  }

  function applyVisualEdits(edits) {
    if (!Array.isArray(edits)) return;
    for (const edit of edits) {
      if (!edit?.selector) continue;
      let el;
      try { el = document.querySelector(edit.selector); } catch { continue; }
      if (!el) continue;
      if (typeof edit.text === 'string') el.textContent = edit.text;
      if (typeof edit.hidden === 'boolean') el.hidden = edit.hidden;
      if (edit.styles && typeof edit.styles === 'object') Object.assign(el.style, edit.styles);
    }
  }

  function apply(next) {
    if (!next || typeof next !== 'object') return;
    config = next;
    if (!Array.isArray(config.visualEdits)) config.visualEdits = [];
    document.documentElement.style.setProperty('--admin-accent', next.accent || '#ff2f92');
    document.documentElement.style.setProperty('--admin-accent2', next.accent2 || '#41d9ff');
    document.documentElement.style.setProperty('--admin-bg', next.background || '#080817');

    text('.featured-copy h1 span', next.launcherTitle || 'UNO');
    const launcherSubtitle = document.querySelector('.featured-actions span');
    if (launcherSubtitle) launcherSubtitle.textContent = next.launcherSubtitle || '';
    text('.uno-hype-card h1', next.promoTitle || 'UNO ADDA');
    const promoParas = document.querySelectorAll('.uno-hype-card p');
    if (promoParas[0]) promoParas[0].textContent = next.collaborationText || next.promoText || '';
    if (promoParas[1]) promoParas[1].textContent = next.awardsText || '';
    text('#room-browser .room-browser-head b', next.roomsTitle || 'ACTIVE ROOMS');
    text('.suggested-users .room-browser-head b', next.usersTitle || 'USERS YOU MAY PLAY WITH');
    text('#commentator-name', `🎙️ ${next.commentatorName || 'MR BEAN'}`);
    text('#create .primary.big', next.createButton || 'Create room');
    text('#bot-play', next.botButton || 'Play bot');
    text('#join button[type="submit"]', next.joinButton || 'Join');

    toggle('.uno-hype-card', next.showPromo !== false);
    toggle('#room-browser', next.showRooms !== false);
    toggle('.suggested-users', next.showSuggestedUsers !== false);
    toggle('#commentary', next.showCommentary !== false);
    toggle('.hype-metrics span:first-child', next.simulatedHype !== false);
    ensureAnnouncement(next.announcement || '');
    applyAvatars(next.avatars);
    applyVisualEdits(next.visualEdits);

    if (!style) {
      style = document.createElement('style');
      style.id = 'admin-custom-style';
      document.head.appendChild(style);
    }
    style.textContent = `
      .launcher-home{background-color:var(--admin-bg)!important}
      .launch-btn,.primary.big{box-shadow:0 0 30px color-mix(in srgb,var(--admin-accent) 28%,transparent)!important}
      .admin-announcement{position:sticky;top:0;z-index:99999;padding:10px 16px;text-align:center;font-weight:900;background:linear-gradient(90deg,var(--admin-accent),var(--admin-accent2));color:#08101a;box-shadow:0 8px 24px #0008}
      body.dbt-editing *{cursor:default!important}
      body.dbt-editing [data-dbt-editable="1"]{outline:1px dashed transparent;outline-offset:2px}
      body.dbt-editing [data-dbt-editable="1"]:hover{outline-color:#41d9ff}
      body.dbt-editing .dbt-selected{outline:3px solid #ff2f92!important;outline-offset:3px!important;box-shadow:0 0 0 5px #41d9ff44!important}
      body.dbt-editing.dbt-move-mode .dbt-selected{cursor:move!important}
      #dbt-visual-toolbar{position:fixed;z-index:2147483600;left:50%;bottom:max(12px,env(safe-area-inset-bottom));transform:translateX(-50%);display:flex;gap:7px;align-items:center;max-width:calc(100vw - 16px);overflow:auto;padding:8px;border:1px solid #ffffff2a;border-radius:18px;background:#0b1020ee;backdrop-filter:blur(18px);box-shadow:0 18px 60px #000b;color:#fff}
      #dbt-visual-toolbar button{white-space:nowrap;border:1px solid #ffffff25;background:#171f36;color:#fff;border-radius:11px;padding:9px 11px;font-weight:850}
      #dbt-visual-toolbar button.active{background:linear-gradient(135deg,#ff2f92,#8247ff)}
      #dbt-visual-toolbar .save{background:linear-gradient(135deg,#7dff8a,#24d4ff);color:#07110b}
      #dbt-visual-inspector{position:fixed;z-index:2147483599;right:12px;top:76px;width:min(310px,calc(100vw - 24px));max-height:calc(100vh - 170px);overflow:auto;padding:14px;border:1px solid #ffffff29;border-radius:18px;background:#0b1020f5;color:#fff;box-shadow:0 18px 60px #000b;backdrop-filter:blur(18px)}
      #dbt-visual-inspector h3{margin:0 0 3px}#dbt-visual-inspector small{color:#91a0bc}#dbt-visual-inspector label{display:grid;gap:5px;margin-top:10px;font-size:.72rem;font-weight:800;color:#c9d2e6}#dbt-visual-inspector input,#dbt-visual-inspector select,#dbt-visual-inspector textarea{width:100%;box-sizing:border-box;border:1px solid #ffffff20;border-radius:10px;padding:9px;background:#11182b;color:#fff}#dbt-visual-inspector .row{display:grid;grid-template-columns:1fr 1fr;gap:8px}#dbt-visual-inspector .danger{margin-top:10px;width:100%;padding:9px;border:1px solid #ff5f7b55;border-radius:10px;background:#3a1420;color:#ffb8c5;font-weight:900}
      #dbt-admin-login{position:fixed;z-index:2147483647;inset:0;display:grid;place-items:center;padding:18px;background:#03060ce8;backdrop-filter:blur(12px)}#dbt-admin-login>form{width:min(420px,100%);padding:22px;border:1px solid #ffffff24;border-radius:22px;background:#10172a;color:#fff;box-shadow:0 30px 100px #000c}#dbt-admin-login input{width:100%;box-sizing:border-box;margin:12px 0;padding:12px;border-radius:12px;border:1px solid #ffffff25;background:#090e1a;color:#fff}#dbt-admin-login button{width:100%;padding:12px;border:0;border-radius:12px;background:linear-gradient(135deg,#ff2f92,#41d9ff);font-weight:1000;color:#071019}
      ${next.customCSS || ''}
    `;

    window.DBT_ADMIN_CONFIG = next;
    window.dispatchEvent(new CustomEvent('dbt-admin-config', { detail: next }));
  }

  function getEdit(selector) {
    return config.visualEdits.find((x) => x.selector === selector);
  }
  function upsertEdit(selector) {
    let edit = getEdit(selector);
    if (!edit) { edit = { selector, styles: {} }; config.visualEdits.push(edit); }
    if (!edit.styles) edit.styles = {};
    dirty = true;
    return edit;
  }

  function selectElement(el) {
    if (selected) selected.classList.remove('dbt-selected');
    selected = el;
    if (!selected) { selectedSelector = ''; renderInspector(); return; }
    selected.classList.add('dbt-selected');
    selectedSelector = cssPath(selected);
    renderInspector();
  }

  function editableTextElement(el) {
    return !['INPUT','TEXTAREA','SELECT','IMG','AUDIO','VIDEO','CANVAS','SVG'].includes(el.tagName) && el.children.length === 0;
  }

  function renderInspector() {
    const box = document.getElementById('dbt-visual-inspector');
    if (!box) return;
    if (!selected) {
      box.innerHTML = '<h3>Visual Editor</h3><small>Tap anything on the real site. Then type, drag, resize or restyle it here.</small>';
      return;
    }
    const cs = getComputedStyle(selected);
    const edit = getEdit(selectedSelector) || {};
    box.innerHTML = `
      <h3>${selected.tagName.toLowerCase()}${selected.id ? '#' + selected.id : ''}</h3>
      <small>${selectedSelector}</small>
      ${editableTextElement(selected) ? `<label>TEXT<textarea id="dbt-inspector-text" rows="3"></textarea></label>` : ''}
      <div class="row"><label>WIDTH<input id="dbt-w" placeholder="auto"></label><label>HEIGHT<input id="dbt-h" placeholder="auto"></label></div>
      <div class="row"><label>FONT SIZE<input id="dbt-font" placeholder="${cs.fontSize}"></label><label>RADIUS<input id="dbt-radius" placeholder="${cs.borderRadius}"></label></div>
      <div class="row"><label>TEXT COLOR<input id="dbt-color" type="color"></label><label>BACKGROUND<input id="dbt-bg" type="color"></label></div>
      <div class="row"><label>OPACITY<input id="dbt-opacity" type="range" min="0" max="1" step="0.05"></label><label>ALIGN<select id="dbt-align"><option>left</option><option>center</option><option>right</option></select></label></div>
      <button id="dbt-hide" class="danger" type="button">${selected.hidden ? 'SHOW ELEMENT' : 'HIDE ELEMENT'}</button>
      <button id="dbt-reset-one" class="danger" type="button">RESET THIS ELEMENT</button>`;

    const t = document.getElementById('dbt-inspector-text'); if (t) t.value = selected.textContent || '';
    const w = document.getElementById('dbt-w'); if (w) w.value = selected.style.width || edit.styles?.width || '';
    const h = document.getElementById('dbt-h'); if (h) h.value = selected.style.height || edit.styles?.height || '';
    const f = document.getElementById('dbt-font'); if (f) f.value = selected.style.fontSize || edit.styles?.fontSize || '';
    const r = document.getElementById('dbt-radius'); if (r) r.value = selected.style.borderRadius || edit.styles?.borderRadius || '';
    const c = document.getElementById('dbt-color'); if (c) c.value = rgbToHex(cs.color) || '#ffffff';
    const bg = document.getElementById('dbt-bg'); if (bg) bg.value = rgbToHex(cs.backgroundColor) || '#111827';
    const o = document.getElementById('dbt-opacity'); if (o) o.value = cs.opacity || '1';
    const a = document.getElementById('dbt-align'); if (a) a.value = ['left','center','right'].includes(cs.textAlign) ? cs.textAlign : 'left';

    t?.addEventListener('input', () => { selected.textContent = t.value; upsertEdit(selectedSelector).text = t.value; });
    const styleInput = (id, prop, normalize = (v) => v) => document.getElementById(id)?.addEventListener('input', (e) => {
      const v = normalize(e.target.value); selected.style[prop] = v; upsertEdit(selectedSelector).styles[prop] = v;
    });
    styleInput('dbt-w','width',unit); styleInput('dbt-h','height',unit); styleInput('dbt-font','fontSize',unit); styleInput('dbt-radius','borderRadius',unit); styleInput('dbt-color','color'); styleInput('dbt-bg','backgroundColor'); styleInput('dbt-opacity','opacity'); styleInput('dbt-align','textAlign');
    document.getElementById('dbt-hide')?.addEventListener('click', () => {
      selected.hidden = !selected.hidden; upsertEdit(selectedSelector).hidden = selected.hidden; renderInspector();
    });
    document.getElementById('dbt-reset-one')?.addEventListener('click', () => {
      config.visualEdits = config.visualEdits.filter((x) => x.selector !== selectedSelector); dirty = true; location.reload();
    });
  }

  function unit(v) {
    const s = String(v || '').trim();
    if (!s) return '';
    return /^-?\d+(\.\d+)?$/.test(s) ? `${s}px` : safeCss(s);
  }
  function rgbToHex(rgb) {
    const m = String(rgb).match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
    if (!m) return null;
    return '#' + [m[1],m[2],m[3]].map((x) => Number(x).toString(16).padStart(2,'0')).join('');
  }

  function createToolbar() {
    if (document.getElementById('dbt-visual-toolbar')) return;
    const bar = document.createElement('div');
    bar.id = 'dbt-visual-toolbar';
    bar.innerHTML = `
      <button data-mode="select" class="active">☝ SELECT</button>
      <button data-mode="text">✍ TYPE</button>
      <button data-mode="move">✥ DRAG</button>
      <button id="dbt-save" class="save">✓ SAVE LIVE</button>
      <button id="dbt-reset-all">↺ RESET ALL</button>
      <button id="dbt-exit">✕ EXIT</button>`;
    document.body.appendChild(bar);
    const inspector = document.createElement('div'); inspector.id = 'dbt-visual-inspector'; document.body.appendChild(inspector);
    bar.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      bar.querySelectorAll('[data-mode]').forEach((x) => x.classList.toggle('active', x === b));
      document.body.classList.toggle('dbt-move-mode', mode === 'move');
      if (selected) selected.contentEditable = mode === 'text' && editableTextElement(selected) ? 'true' : 'false';
    }));
    document.getElementById('dbt-save').onclick = saveLive;
    document.getElementById('dbt-reset-all').onclick = () => { if (confirm('Reset ALL visual edits?')) { config.visualEdits = []; dirty = true; saveLive().then(() => location.reload()); } };
    document.getElementById('dbt-exit').onclick = stopEditor;
    renderInspector();
  }

  function captureClick(e) {
    if (!editing || e.target.closest('#dbt-visual-toolbar,#dbt-visual-inspector,#dbt-admin-login')) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    const el = e.target;
    selectElement(el);
    if (mode === 'text' && editableTextElement(el)) {
      el.contentEditable = 'true'; el.focus();
      const range = document.createRange(); range.selectNodeContents(el); range.collapse(false);
      const sel = getSelection(); sel.removeAllRanges(); sel.addRange(range);
    }
  }

  function pointerDown(e) {
    if (!editing || mode !== 'move' || !selected || e.target !== selected) return;
    e.preventDefault();
    const prev = getEdit(selectedSelector)?.styles?.transform || selected.style.transform || '';
    const m = prev.match(/translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/);
    drag = { x:e.clientX, y:e.clientY, ox:m ? Number(m[1]) : 0, oy:m ? Number(m[2]) : 0 };
    selected.setPointerCapture?.(e.pointerId);
  }
  function pointerMove(e) {
    if (!drag || !selected) return;
    const x = Math.round(drag.ox + e.clientX - drag.x), y = Math.round(drag.oy + e.clientY - drag.y);
    const v = `translate(${x}px, ${y}px)`;
    selected.style.transform = v; upsertEdit(selectedSelector).styles.transform = v;
  }
  function pointerUp() { drag = null; }

  async function loginOverlay() {
    return new Promise((resolve) => {
      const wrap = document.createElement('div'); wrap.id = 'dbt-admin-login';
      wrap.innerHTML = `<form><h2>DBT LIVE EDITOR</h2><p>Admin password required.</p><input type="password" autocomplete="current-password" placeholder="Admin password" required><button>UNLOCK REAL-SITE EDITING</button><small id="dbt-login-error"></small></form>`;
      document.body.appendChild(wrap);
      const form = wrap.querySelector('form'); const input = wrap.querySelector('input'); input.focus();
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const r = await fetch('/api/admin/login', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:input.value}) });
        if (r.ok) { wrap.remove(); resolve(true); }
        else { const d = await r.json().catch(()=>({})); wrap.querySelector('#dbt-login-error').textContent = d.error || 'Login failed'; }
      });
    });
  }

  async function startEditor() {
    let ok = await fetch('/api/admin/me', { cache:'no-store' }).then((r) => r.ok).catch(()=>false);
    if (!ok) ok = await loginOverlay();
    if (!ok) return;
    ensureKeys();
    editing = true; dirty = false; document.body.classList.add('dbt-editing');
    document.querySelectorAll('body *').forEach((el) => { if (!el.closest('#dbt-visual-toolbar,#dbt-visual-inspector,#dbt-admin-login')) el.dataset.dbtEditable = '1'; });
    createToolbar();
    window.addEventListener('click', captureClick, true);
    window.addEventListener('pointerdown', pointerDown, true);
    window.addEventListener('pointermove', pointerMove, true);
    window.addEventListener('pointerup', pointerUp, true);
  }

  function stopEditor() {
    if (dirty && !confirm('Exit without saving your latest edits?')) return;
    editing = false; mode = 'select'; selected = null; selectedSelector = ''; drag = null;
    document.body.classList.remove('dbt-editing','dbt-move-mode');
    document.querySelectorAll('[data-dbt-editable]').forEach((el) => { delete el.dataset.dbtEditable; el.contentEditable = 'false'; el.classList.remove('dbt-selected'); });
    document.getElementById('dbt-visual-toolbar')?.remove(); document.getElementById('dbt-visual-inspector')?.remove();
    window.removeEventListener('click', captureClick, true); window.removeEventListener('pointerdown', pointerDown, true); window.removeEventListener('pointermove', pointerMove, true); window.removeEventListener('pointerup', pointerUp, true);
  }

  async function saveLive() {
    if (!config) return;
    const btn = document.getElementById('dbt-save'); if (btn) btn.textContent = 'SAVING…';
    const r = await fetch('/api/admin/config', { method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify(config) });
    if (r.ok) { const d = await r.json(); config = d.config || config; dirty = false; if (btn) btn.textContent = '✓ SAVED LIVE'; setTimeout(()=>{ if(btn) btn.textContent='✓ SAVE LIVE'; },1200); }
    else { const d = await r.json().catch(()=>({})); alert(d.error || 'Save failed'); if(btn) btn.textContent='✓ SAVE LIVE'; }
  }

  ensureAdminButton();
  fetch('/api/config', { cache: 'no-store' }).then((r) => r.ok ? r.json() : null).then((x) => { apply(x); if (new URLSearchParams(location.search).get('edit') === '1') setTimeout(startEditor, 400); }).catch(() => {});

  const waitSocket = setInterval(() => {
    const socket = window.DBT_CLASSIC_SOCKET;
    if (!socket) return;
    clearInterval(waitSocket);
    socket.on('s_admin_config', (next) => { if (!editing) apply(next); });
  }, 250);
})();
