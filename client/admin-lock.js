(() => {
  const wantsEditor = new URLSearchParams(location.search).get('edit') === '1';

  const removeEditorUI = () => {
    document.getElementById('dbt-admin-open')?.remove();
    if (!wantsEditor) {
      document.getElementById('dbt-visual-toolbar')?.remove();
      document.getElementById('dbt-visual-inspector')?.remove();
      document.body?.classList.remove('dbt-editing','dbt-move-mode');
    }
  };

  const enforceHiddenButton = () => {
    document.getElementById('dbt-admin-open')?.remove();
  };

  removeEditorUI();

  const observer = new MutationObserver(() => {
    enforceHiddenButton();
    if (!wantsEditor && (document.getElementById('dbt-visual-toolbar') || document.getElementById('dbt-visual-inspector'))) {
      removeEditorUI();
    }
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });

  if (wantsEditor) {
    fetch('/api/admin/me', { cache:'no-store', credentials:'same-origin' })
      .then((r) => { if (r.ok) document.documentElement.dataset.dbtAdmin = '1'; })
      .catch(() => {});
  }
})();
