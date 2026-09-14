(() => {
  const clone = (v) => JSON.parse(JSON.stringify(v || []));
  const stringify = (v) => JSON.stringify(v || []);
  const baseline = new Map();
  const undoStack = [];
  const redoStack = [];
  let lastSeen = '';
  let pending = null;
  let pendingTimer = null;
  let applying = false;

  function cfg() { return window.DBT_ADMIN_CONFIG; }
  function edits() { return Array.isArray(cfg()?.visualEdits) ? cfg().visualEdits : []; }

  function snapshotBaseline() {
    if (baseline.size) return;
    document.querySelectorAll('[data-admin-key], [id]').forEach((el) => {
      if (!(el instanceof HTMLElement) || el.closest('#dbt-visual-toolbar,#dbt-visual-inspector,#dbt-admin-login')) return;
      const selector = el.id ? `#${CSS.escape(el.id)}` : `[data-admin-key="${CSS.escape(el.dataset.adminKey || '')}"]`;
      baseline.set(selector, { text: el.textContent ?? '', cssText: el.style.cssText, hidden: !!el.hidden });
    });
  }

  function resetTouched(allSnapshots) {
    const selectors = new Set();
    allSnapshots.forEach((list) => (list || []).forEach((e) => e?.selector && selectors.add(e.selector)));
    selectors.forEach((selector) => {
      let el; try { el = document.querySelector(selector); } catch { return; }
      if (!(el instanceof HTMLElement)) return;
      const base = baseline.get(selector);
      if (base) {
        el.textContent = base.text;
        el.style.cssText = base.cssText;
        el.hidden = base.hidden;
      }
    });
  }

  function paint(list, previousList = []) {
    snapshotBaseline();
    resetTouched([previousList, list]);
    (list || []).forEach((edit) => {
      if (!edit?.selector) return;
      let el; try { el = document.querySelector(edit.selector); } catch { return; }
      if (!(el instanceof HTMLElement)) return;
      if (typeof edit.text === 'string') el.textContent = edit.text;
      if (typeof edit.hidden === 'boolean') el.hidden = edit.hidden;
      if (edit.styles && typeof edit.styles === 'object') Object.assign(el.style, edit.styles);
    });
  }

  function updateButtons() {
    const u = document.getElementById('dbt-undo');
    const r = document.getElementById('dbt-redo');
    if (u) { u.disabled = undoStack.length <= 1 && !pending; u.style.opacity = u.disabled ? '.45' : '1'; }
    if (r) { r.disabled = redoStack.length === 0; r.style.opacity = r.disabled ? '.45' : '1'; }
  }

  function commitPending() {
    if (!pending) return;
    const snap = clone(pending);
    pending = null;
    clearTimeout(pendingTimer);
    pendingTimer = null;
    const s = stringify(snap);
    if (undoStack.length === 0 || stringify(undoStack[undoStack.length - 1]) !== s) undoStack.push(snap);
    if (undoStack.length > 80) undoStack.shift();
    redoStack.length = 0;
    updateButtons();
  }

  function noteChange() {
    if (applying || !cfg()) return;
    const now = stringify(edits());
    if (now === lastSeen) return;
    lastSeen = now;
    pending = clone(edits());
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(commitPending, 280);
    updateButtons();
  }

  function applyHistory(list) {
    if (!cfg()) return;
    const before = clone(edits());
    applying = true;
    cfg().visualEdits = clone(list);
    paint(list, before);
    lastSeen = stringify(list);
    applying = false;
    document.documentElement.dataset.dbtUnsaved = '1';
    const save = document.getElementById('dbt-save');
    if (save && !save.textContent.includes('SAVING')) save.textContent = '✓ SAVE LIVE •';
    updateButtons();
  }

  function undo() {
    if (pending) commitPending();
    if (undoStack.length <= 1) return;
    const current = undoStack.pop();
    redoStack.push(clone(current));
    applyHistory(undoStack[undoStack.length - 1]);
  }

  function redo() {
    if (pending) commitPending();
    if (!redoStack.length) return;
    const next = redoStack.pop();
    undoStack.push(clone(next));
    applyHistory(next);
  }

  function installButtons() {
    const bar = document.getElementById('dbt-visual-toolbar');
    if (!bar || document.getElementById('dbt-undo')) return;
    const save = document.getElementById('dbt-save');
    const undoBtn = document.createElement('button');
    undoBtn.id = 'dbt-undo'; undoBtn.type = 'button'; undoBtn.textContent = '↶ UNDO'; undoBtn.title = 'Undo (Ctrl+Z)';
    const redoBtn = document.createElement('button');
    redoBtn.id = 'dbt-redo'; redoBtn.type = 'button'; redoBtn.textContent = '↷ REDO'; redoBtn.title = 'Redo (Ctrl+Shift+Z)';
    undoBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); undo(); });
    redoBtn.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); redo(); });
    if (save) { bar.insertBefore(undoBtn, save); bar.insertBefore(redoBtn, save); }
    else bar.append(undoBtn, redoBtn);
    updateButtons();
  }

  document.addEventListener('keydown', (e) => {
    if (!document.getElementById('dbt-visual-toolbar')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const key = e.key.toLowerCase();
    if (key === 'z') {
      e.preventDefault(); e.stopPropagation();
      if (e.shiftKey) redo(); else undo();
    } else if (key === 'y') {
      e.preventDefault(); e.stopPropagation(); redo();
    }
  }, true);

  const observer = new MutationObserver(() => installButtons());
  observer.observe(document.documentElement, { childList: true, subtree: true });

  const ready = setInterval(() => {
    if (!cfg()) return;
    snapshotBaseline();
    if (!undoStack.length) {
      const initial = clone(edits());
      undoStack.push(initial);
      lastSeen = stringify(initial);
    }
    installButtons();
    noteChange();
  }, 120);
  ready.unref?.();
})();
