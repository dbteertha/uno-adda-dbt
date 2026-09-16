(() => {
  if (window.__dbtCinematicProfessional) return;
  window.__dbtCinematicProfessional = true;

  const style = document.createElement('style');
  style.id = 'dbt-cinematic-professional-style';
  style.textContent = `
    #dbt-cinematic-intro{
      background:#000!important;
      color:#fff!important;
      font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important;
    }
    #dbt-cinematic-intro .ci-bg{
      background:#000!important;
      animation:none!important;
    }
    #dbt-cinematic-intro .ci-grid,
    #dbt-cinematic-intro .ci-flare,
    #dbt-cinematic-intro .ci-scan{
      display:none!important;
    }
    #dbt-cinematic-intro .ci-vignette{
      box-shadow:inset 0 0 180px #000!important;
    }
    #dbt-cinematic-intro .ci-kicker,
    #dbt-cinematic-intro .ci-presents,
    #dbt-cinematic-intro .ci-title,
    #dbt-cinematic-intro .ci-title span,
    #dbt-cinematic-intro .ci-tag,
    #dbt-cinematic-intro .ci-dbt{
      color:#fff!important;
      -webkit-text-fill-color:#fff!important;
      background:none!important;
      text-shadow:none!important;
    }
    #dbt-cinematic-intro .ci-kicker{
      letter-spacing:.42em!important;
      font-weight:700!important;
      opacity:0;
    }
    #dbt-cinematic-intro .ci-dbt{
      font-family:Inter,ui-sans-serif,system-ui,sans-serif!important;
      font-weight:900!important;
      letter-spacing:-.055em!important;
    }
    #dbt-cinematic-intro .ci-presents{
      font-weight:600!important;
      letter-spacing:.34em!important;
    }
    #dbt-cinematic-intro .ci-title{
      font-family:Inter,ui-sans-serif,system-ui,sans-serif!important;
      font-weight:950!important;
      letter-spacing:-.06em!important;
    }
    #dbt-cinematic-intro .ci-title span{
      font-weight:750!important;
      letter-spacing:.34em!important;
    }
    #dbt-cinematic-intro .ci-tag{
      color:#d8d8d8!important;
      font-weight:600!important;
      letter-spacing:.14em!important;
    }
    #dbt-cinematic-intro .ci-card{
      filter:grayscale(1) contrast(1.15)!important;
      border:1px solid #ffffff33!important;
      box-shadow:0 28px 70px #000!important;
    }
    #dbt-cinematic-intro .ci-loading{
      background:#ffffff18!important;
      height:2px!important;
    }
    #dbt-cinematic-intro .ci-loading:after{
      background:#fff!important;
      box-shadow:none!important;
    }
    #dbt-cinematic-intro .ci-final{
      display:none!important;
      animation:none!important;
      opacity:0!important;
    }
    #uno-transition{
      display:none!important;
    }
  `;
  document.head.appendChild(style);

  const removeFlash = () => document.querySelector('#dbt-cinematic-intro .ci-final')?.remove();
  removeFlash();
  new MutationObserver(removeFlash).observe(document.documentElement, { childList:true, subtree:true });
})();
