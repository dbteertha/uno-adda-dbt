(() => {
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

  function rememberText(el) {
    const cfg = window.DBT_ADMIN_CONFIG;
    if (!cfg || !el || el.closest?.('#dbt-visual-toolbar,#dbt-visual-inspector,#dbt-admin-login')) return;
    if (!Array.isArray(cfg.visualEdits)) cfg.visualEdits = [];
    const selector = cssPath(el);
    let edit = cfg.visualEdits.find((x) => x.selector === selector);
    if (!edit) {
      edit = { selector, styles: {} };
      cfg.visualEdits.push(edit);
    }
    edit.text = el.textContent ?? '';
    if (!edit.styles) edit.styles = {};
    document.documentElement.dataset.dbtUnsaved = '1';
    const save = document.getElementById('dbt-save');
    if (save && !save.textContent.includes('SAVING')) save.textContent = '✓ SAVE LIVE •';
  }

  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el instanceof HTMLElement && (el.isContentEditable || el.getAttribute('contenteditable') === 'true')) rememberText(el);
  }, true);

  document.addEventListener('blur', (e) => {
    const el = e.target;
    if (el instanceof HTMLElement && (el.isContentEditable || el.getAttribute('contenteditable') === 'true')) rememberText(el);
  }, true);

  document.addEventListener('click', (e) => {
    const save = e.target.closest?.('#dbt-save');
    if (!save) return;
    setTimeout(() => {
      if (save.textContent.includes('SAVED LIVE')) delete document.documentElement.dataset.dbtUnsaved;
    }, 900);
  }, true);
})();
