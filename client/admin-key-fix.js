(() => {
  // Assign the same deterministic edit keys on every page load BEFORE saved edits are applied.
  // This makes selectors like [data-admin-key="dbt-12"] exist after refresh too.
  const assignKeys = () => {
    let n = 0;
    document.querySelectorAll('body *').forEach((el) => {
      if (el.closest?.('#dbt-visual-toolbar,#dbt-visual-inspector,#dbt-admin-login')) return;
      if (!el.id && !el.dataset.adminKey) el.dataset.adminKey = `dbt-${++n}`;
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', assignKeys, { once: true });
  } else {
    assignKeys();
  }

  // Dynamic UI can appear after load. Keep keys deterministic for newly-created unkeyed elements.
  // Existing elements never have their keys changed.
  const observer = new MutationObserver(() => assignKeys());
  const startObserver = () => {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startObserver, { once: true });
  else startObserver();
})();
