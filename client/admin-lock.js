(() => {
  const removeEditorUI = () => {
    document.getElementById('dbt-admin-open')?.remove();
    document.getElementById('dbt-visual-toolbar')?.remove();
    document.getElementById('dbt-visual-inspector')?.remove();
    document.body?.classList.remove('dbt-editing','dbt-move-mode');
  };

  const check = async () => {
    let authed = false;
    try {
      authed = await fetch('/api/admin/me', { cache:'no-store', credentials:'same-origin' }).then((r) => r.ok);
    } catch {}

    const wantsEditor = new URLSearchParams(location.search).get('edit') === '1';
    if (!authed && !wantsEditor) {
      removeEditorUI();
      const observer = new MutationObserver(() => {
        const button = document.getElementById('dbt-admin-open');
        if (button) button.remove();
        if (document.getElementById('dbt-visual-toolbar') || document.getElementById('dbt-visual-inspector')) removeEditorUI();
      });
      observer.observe(document.documentElement, { childList:true, subtree:true });
      return;
    }

    if (authed) document.documentElement.dataset.dbtAdmin = '1';
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check, { once:true });
  else check();
})();
