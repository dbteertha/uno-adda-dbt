(() => {
  if (window.__dbtCinematicProfessional) return;
  window.__dbtCinematicProfessional = true;

  const style = document.createElement('style');
  style.id = 'dbt-cinematic-professional-style';
  style.textContent = `
    #dbt-cinematic-intro{background:#000!important;color:#fff!important;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif!important}
    #dbt-cinematic-intro .ci-bg{background:#000!important;animation:none!important}
    #dbt-cinematic-intro .ci-grid,#dbt-cinematic-intro .ci-flare,#dbt-cinematic-intro .ci-scan,#dbt-cinematic-intro .ci-loading{display:none!important}
    #dbt-cinematic-intro .ci-vignette{box-shadow:inset 0 0 180px #000!important}
    #dbt-cinematic-intro .ci-kicker,#dbt-cinematic-intro .ci-presents,#dbt-cinematic-intro .ci-title,#dbt-cinematic-intro .ci-title span,#dbt-cinematic-intro .ci-tag,#dbt-cinematic-intro .ci-dbt{color:#fff!important;-webkit-text-fill-color:#fff!important;background:none!important;text-shadow:none!important}
    #dbt-cinematic-intro .ci-kicker{letter-spacing:.42em!important;font-weight:700!important;opacity:0}
    #dbt-cinematic-intro .ci-dbt{font-family:Inter,ui-sans-serif,system-ui,sans-serif!important;font-weight:900!important;letter-spacing:-.055em!important}
    #dbt-cinematic-intro .ci-presents{font-weight:600!important;letter-spacing:.34em!important}
    #dbt-cinematic-intro .ci-title{font-family:Inter,ui-sans-serif,system-ui,sans-serif!important;font-weight:950!important;letter-spacing:-.06em!important}
    #dbt-cinematic-intro .ci-title span{font-weight:750!important;letter-spacing:.34em!important}
    #dbt-cinematic-intro .ci-tag{display:none!important}
    #dbt-cinematic-intro .ci-card{filter:none!important;color:#fff!important;border:2px solid rgba(255,255,255,.35)!important;box-shadow:0 24px 70px rgba(0,0,0,.8),inset 0 0 0 3px rgba(255,255,255,.08)!important;text-shadow:0 2px 10px rgba(0,0,0,.4)!important}
    #dbt-cinematic-intro .ci-card.r{background:linear-gradient(145deg,#ff3b4f,#9c0017)!important}
    #dbt-cinematic-intro .ci-card.b{background:linear-gradient(145deg,#2d8cff,#063aa8)!important}
    #dbt-cinematic-intro .ci-card.w{background:conic-gradient(from 35deg,#ff3547 0 25%,#ffd636 25% 50%,#37d86b 50% 75%,#2f8fff 75% 100%)!important}
    #dbt-cinematic-intro .ci-card.g{background:linear-gradient(145deg,#35d875,#08743a)!important;animation:ciCardG 2.8s 4.08s cubic-bezier(.2,.8,.2,1) forwards}
    #dbt-cinematic-intro .ci-card.y{background:linear-gradient(145deg,#ffe04a,#c89200)!important;color:#111!important;text-shadow:none!important;animation:ciCardY 2.8s 4.18s cubic-bezier(.2,.8,.2,1) forwards}
    #dbt-cinematic-intro .ci-card.skip{background:linear-gradient(145deg,#ff5b3d,#b51600)!important;animation:ciCardSkip 2.8s 4.28s cubic-bezier(.2,.8,.2,1) forwards}
    #dbt-cinematic-intro .ci-cat{position:absolute;z-index:7;bottom:-10px;width:clamp(120px,20vw,240px);filter:drop-shadow(0 24px 35px #000);opacity:0;pointer-events:none}
    #dbt-cinematic-intro .ci-cat.misti{left:2vw;animation:ciMisti 1.3s 3.2s cubic-bezier(.2,.9,.2,1) forwards}
    #dbt-cinematic-intro .ci-cat.suji{right:2vw;animation:ciSuji 1.3s 3.45s cubic-bezier(.2,.9,.2,1) forwards}
    #dbt-cinematic-intro .ci-cat-name{position:absolute;bottom:18px;padding:8px 12px;border:1px solid #ffffff33;border-radius:999px;background:#000a;color:#fff;font-size:11px;font-weight:900;letter-spacing:.12em}
    #dbt-cinematic-intro .ci-cat.misti + .ci-cat-name.misti{left:7vw}
    #dbt-cinematic-intro .ci-cat.suji + .ci-cat-name.suji{right:7vw}
    #dbt-cinematic-intro .ci-final{display:none!important;animation:none!important;opacity:0!important}
    #uno-transition{display:none!important}
    @keyframes ciMisti{0%{opacity:0;transform:translate(-30px,40px) rotate(-6deg) scale(.8)}100%{opacity:1;transform:translate(0,0) rotate(-2deg) scale(1)}}
    @keyframes ciSuji{0%{opacity:0;transform:translate(30px,40px) rotate(6deg) scale(.8)}100%{opacity:1;transform:translate(0,0) rotate(2deg) scale(1)}}
    @keyframes ciCardG{0%{opacity:0;transform:translate(-50%,-40%) rotate(-12deg) scale(.25)}25%{opacity:1}65%,100%{opacity:1;transform:translate(-310%,-80%) rotate(-20deg) scale(.78)}}
    @keyframes ciCardY{0%{opacity:0;transform:translate(-50%,-40%) rotate(12deg) scale(.25)}25%{opacity:1}65%,100%{opacity:1;transform:translate(210%,-85%) rotate(20deg) scale(.78)}}
    @keyframes ciCardSkip{0%{opacity:0;transform:translate(-50%,-40%) rotate(0) scale(.2)}25%{opacity:1}65%,100%{opacity:1;transform:translate(-50%,-175%) rotate(-6deg) scale(.68)}}
    @media(max-width:600px){#dbt-cinematic-intro .ci-cat{width:112px;bottom:0}#dbt-cinematic-intro .ci-cat-name{display:none}#dbt-cinematic-intro .ci-card.g{animation-name:ciCardGMobile}#dbt-cinematic-intro .ci-card.y{animation-name:ciCardYMobile}#dbt-cinematic-intro .ci-card.skip{animation-name:ciCardSkipMobile}@keyframes ciCardGMobile{0%{opacity:0;transform:translate(-50%,-40%) scale(.2)}25%{opacity:1}65%,100%{opacity:1;transform:translate(-215%,-72%) rotate(-18deg) scale(.62)}}@keyframes ciCardYMobile{0%{opacity:0;transform:translate(-50%,-40%) scale(.2)}25%{opacity:1}65%,100%{opacity:1;transform:translate(115%,-72%) rotate(18deg) scale(.62)}}@keyframes ciCardSkipMobile{0%{opacity:0;transform:translate(-50%,-40%) scale(.2)}25%{opacity:1}65%,100%{opacity:1;transform:translate(-50%,-150%) rotate(-5deg) scale(.58)}}}
  `;
  document.head.appendChild(style);

  const upgradeCards = () => {
    const intro = document.getElementById('dbt-cinematic-intro');
    const cards = intro?.querySelector('.ci-cards');
    if (!intro || !cards) return;
    if (!cards.querySelector('.ci-card.g')) { const x=document.createElement('div'); x.className='ci-card g'; x.textContent='⊘'; cards.appendChild(x); }
    if (!cards.querySelector('.ci-card.y')) { const x=document.createElement('div'); x.className='ci-card y'; x.textContent='+2'; cards.appendChild(x); }
    if (!cards.querySelector('.ci-card.skip')) { const x=document.createElement('div'); x.className='ci-card skip'; x.textContent='⏭'; cards.appendChild(x); }
    if (!intro.querySelector('.ci-cat.misti')) {
      const m=document.createElement('img'); m.className='ci-cat misti'; m.src='/misti.svg'; m.alt='Misti'; intro.appendChild(m);
      const n=document.createElement('div'); n.className='ci-cat-name misti'; n.textContent='MISTI · TABLE QUEEN'; intro.appendChild(n);
    }
    if (!intro.querySelector('.ci-cat.suji')) {
      const s=document.createElement('img'); s.className='ci-cat suji'; s.src='/suji.svg'; s.alt='Suji'; intro.appendChild(s);
      const n=document.createElement('div'); n.className='ci-cat-name suji'; n.textContent='SUJI · CHAOS ASSISTANT'; intro.appendChild(n);
    }
    intro.querySelector('.ci-final')?.remove();
    intro.querySelector('.ci-loading')?.remove();
  };

  upgradeCards();
  new MutationObserver(upgradeCards).observe(document.documentElement,{childList:true,subtree:true});
})();