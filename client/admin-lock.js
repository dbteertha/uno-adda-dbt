(() => {
  const wantsEditor = new URLSearchParams(location.search).get('edit') === '1';

  const removeEditorUI = () => {
    if (!wantsEditor) {
      document.getElementById('dbt-admin-open')?.remove();
      document.getElementById('dbt-visual-toolbar')?.remove();
      document.getElementById('dbt-visual-inspector')?.remove();
      document.body?.classList.remove('dbt-editing','dbt-move-mode');
    }
  };

  removeEditorUI();

  const observer = new MutationObserver(() => {
    if (!wantsEditor) removeEditorUI();
  });
  observer.observe(document.documentElement, { childList:true, subtree:true });

  if (wantsEditor) {
    fetch('/api/admin/me', { cache:'no-store', credentials:'same-origin' })
      .then((r) => { if (r.ok) document.documentElement.dataset.dbtAdmin = '1'; })
      .catch(() => {});
  }
})();
