(() => {
  if (window.DBT_MULTIPLAYER_LOADER_V1) return;
  window.DBT_MULTIPLAYER_LOADER_V1 = true;
  const qs = new URLSearchParams(location.search);
  const staging = location.hostname === 'addawithdbt-staging.onrender.com' || qs.get('dbtStaging') === '1';
  if (!staging && qs.get('dbtAdvanced') !== '1') return;
  const stable = window.DBT_STABILITY;
  if (!stable) return;
  stable.flags.advanced = true;
  void stable.guardAsync('advanced-multiplayer-loader', async () => {
    const css = await stable.style('premium-multiplayer-css','/premium-multiplayer.css?v=staging-1',{feature:'advanced',selector:'link[data-dbt-multiplayer-css]',dataset:{dbtMultiplayerCss:'1'}});
    if (!css) return;
    await stable.script('premium-multiplayer','/premium-multiplayer.js?v=staging-1',{feature:'advanced',selector:'script[data-dbt-multiplayer]',ready:()=>!!window.DBT_MULTIPLAYER_V1,dataset:{dbtMultiplayer:'1'}});
  });
})();
