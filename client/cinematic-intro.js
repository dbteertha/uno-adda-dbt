(() => {
  if (window.__dbtCinematicIntroInstalled) return;
  window.__dbtCinematicIntroInstalled = true;

  const style = document.createElement('style');
  style.textContent = `
    #dbt-cinematic-intro{position:fixed;inset:0;z-index:2147483000;overflow:hidden;background:#020307;color:#fff;display:none;place-items:center;font-family:Inter,system-ui,sans-serif}
    #dbt-cinematic-intro.show{display:grid}
    #dbt-cinematic-intro .ci-bg{position:absolute;inset:-12%;background:radial-gradient(circle at 18% 75%,#ff164f44,transparent 30%),radial-gradient(circle at 78% 28%,#00d9ff38,transparent 28%),radial-gradient(circle at 52% 58%,#7b2cff2c,transparent 34%),linear-gradient(160deg,#03050a,#070b14 48%,#020306);animation:ciDrift 7s ease-in-out both}
    #dbt-cinematic-intro .ci-grid{position:absolute;inset:0;background-image:linear-gradient(#ffffff08 1px,transparent 1px),linear-gradient(90deg,#ffffff08 1px,transparent 1px);background-size:46px 46px;perspective:600px;transform:scale(1.2) rotateX(62deg) translateY(35%);transform-origin:50% 100%;opacity:.45;animation:ciGrid 7s linear both}
    #dbt-cinematic-intro .ci-flare{position:absolute;width:60vmax;height:60vmax;border-radius:50%;filter:blur(70px);background:#ff215f22;animation:ciFlare 2.2s ease-in-out infinite alternate}
    #dbt-cinematic-intro .ci-vignette{position:absolute;inset:0;box-shadow:inset 0 0 180px #000,inset 0 0 40px #000;pointer-events:none}
    #dbt-cinematic-intro .ci-scan{position:absolute;inset:0;background:repeating-linear-gradient(180deg,#fff0 0 3px,#fff08 4px);mix-blend-mode:soft-light;opacity:.12}
    #dbt-cinematic-intro .ci-stage{position:relative;z-index:4;width:min(1000px,92vw);text-align:center}
    #dbt-cinematic-intro .ci-kicker{font-size:clamp(.72rem,2.3vw,1rem);letter-spacing:.38em;font-weight:900;color:#9cb8d8;opacity:0;animation:ciKicker 1.1s .3s ease forwards}
    #dbt-cinematic-intro .ci-dbt{margin-top:14px;font:1000 clamp(3.7rem,17vw,10rem)/.8 Arial Black,Impact,sans-serif;letter-spacing:-.07em;opacity:0;transform:scale(.65);background:linear-gradient(105deg,#fff,#77e8ff 35%,#ff4e8d 72%,#ffd75e);-webkit-background-clip:text;background-clip:text;color:transparent;text-shadow:0 0 38px #16cfff33;animation:ciDBT 1.35s .75s cubic-bezier(.2,.9,.2,1) forwards}
    #dbt-cinematic-intro .ci-presents{margin-top:17px;font-weight:900;letter-spacing:.3em;color:#c3cada;opacity:0;animation:ciPresents .8s 1.8s ease forwards}
    #dbt-cinematic-intro .ci-title{margin-top:20px;font:1000 clamp(3.4rem,16vw,9rem)/.82 Arial Black,Impact,sans-serif;letter-spacing:-.07em;opacity:0;transform:translateY(50px) scale(.86);animation:ciTitle 1.1s 2.45s cubic-bezier(.18,.9,.25,1.15) forwards}
    #dbt-cinematic-intro .ci-title span{display:block;font-size:.42em;letter-spacing:.3em;color:#fff;margin-left:.3em;text-shadow:0 0 30px #fff5}
    #dbt-cinematic-intro .ci-tag{margin:22px auto 0;max-width:760px;font-size:clamp(.72rem,2.6vw,1.05rem);font-weight:850;letter-spacing:.09em;color:#dce6f4;opacity:0;animation:ciTag .8s 3.55s ease forwards}
    #dbt-cinematic-intro .ci-cards{position:absolute;inset:0;pointer-events:none}
    #dbt-cinematic-intro .ci-card{position:absolute;left:50%;top:50%;width:clamp(78px,15vw,145px);aspect-ratio:.68;border-radius:16px;display:grid;place-items:center;font:1000 clamp(2rem,7vw,4.8rem)/1 Arial Black;color:#fff;border:2px solid #ffffff4d;box-shadow:0 25px 65px #000a,0 0 28px currentColor;opacity:0}
    #dbt-cinematic-intro .ci-card.r{background:linear-gradient(145deg,#ff315e,#8c071d);color:#ff5273;animation:ciCardR 2.8s 3.9s cubic-bezier(.2,.8,.2,1) forwards}
    #dbt-cinematic-intro .ci-card.b{background:linear-gradient(145deg,#1dceff,#094fbd);color:#4bdcff;animation:ciCardB 2.8s 4.02s cubic-bezier(.2,.8,.2,1) forwards}
    #dbt-cinematic-intro .ci-card.w{background:conic-gradient(#ff325a,#ffd537,#38e67a,#28b7ff,#8d4dff,#ff325a);color:#fff;animation:ciCardW 2.8s 4.14s cubic-bezier(.2,.8,.2,1) forwards}
    #dbt-cinematic-intro .ci-final{position:absolute;z-index:8;inset:0;display:grid;place-items:center;background:#fff;opacity:0;pointer-events:none;animation:ciFlash .72s 6.15s ease forwards}
    #dbt-cinematic-intro .ci-loading{position:absolute;z-index:6;left:50%;bottom:max(28px,env(safe-area-inset-bottom));transform:translateX(-50%);width:min(480px,76vw);height:3px;background:#ffffff18;border-radius:999px;overflow:hidden}
    #dbt-cinematic-intro .ci-loading:after{content:'';display:block;height:100%;width:0;background:linear-gradient(90deg,#19ddff,#9d50ff,#ff2f6f,#ffd85b);box-shadow:0 0 16px #fff9;animation:ciLoad 6.45s linear forwards}
    @keyframes ciDrift{0%{transform:scale(1.05) rotate(-1deg)}100%{transform:scale(1.22) rotate(1.4deg)}}
    @keyframes ciGrid{from{background-position:0 0,0 0}to{background-position:0 220px,220px 0}}
    @keyframes ciFlare{from{transform:translate(-18%,-8%) scale(.8)}to{transform:translate(22%,12%) scale(1.15)}}
    @keyframes ciKicker{to{opacity:1}}
    @keyframes ciDBT{55%{opacity:1;transform:scale(1.08)}100%{opacity:1;transform:scale(1)}}
    @keyframes ciPresents{to{opacity:.92}}
    @keyframes ciTitle{to{opacity:1;transform:translateY(0) scale(1);text-shadow:0 0 28px #ff2f7290,0 0 65px #23d7ff55}}
    @keyframes ciTag{to{opacity:.95}}
    @keyframes ciCardR{0%{opacity:0;transform:translate(-50%,-40%) rotate(-26deg) scale(.35)}25%{opacity:1}65%,100%{opacity:1;transform:translate(-230%,-10%) rotate(-15deg) scale(1)}}
    @keyframes ciCardB{0%{opacity:0;transform:translate(-50%,-40%) rotate(18deg) scale(.35)}25%{opacity:1}65%,100%{opacity:1;transform:translate(130%,-8%) rotate(14deg) scale(1)}}
    @keyframes ciCardW{0%{opacity:0;transform:translate(-50%,-30%) rotate(0) scale(.2)}25%{opacity:1}65%,100%{opacity:1;transform:translate(-50%,92%) rotate(5deg) scale(.9)}}
    @keyframes ciLoad{to{width:100%}}
    @keyframes ciFlash{0%{opacity:0}35%{opacity:1}100%{opacity:0}}
    @media(max-width:600px){#dbt-cinematic-intro .ci-card{width:86px}#dbt-cinematic-intro .ci-card.r{animation-name:ciCardRMobile}#dbt-cinematic-intro .ci-card.b{animation-name:ciCardBMobile}@keyframes ciCardRMobile{0%{opacity:0;transform:translate(-50%,-40%) rotate(-25deg) scale(.3)}25%{opacity:1}65%,100%{opacity:1;transform:translate(-170%,5%) rotate(-14deg) scale(.82)}}@keyframes ciCardBMobile{0%{opacity:0;transform:translate(-50%,-40%) rotate(20deg) scale(.3)}25%{opacity:1}65%,100%{opacity:1;transform:translate(70%,5%) rotate(14deg) scale(.82)}}}
    @media(prefers-reduced-motion:reduce){#dbt-cinematic-intro *{animation-duration:.01ms!important;animation-delay:0ms!important}}
  `;
  document.head.appendChild(style);

  const overlay = document.createElement('div');
  overlay.id = 'dbt-cinematic-intro';
  overlay.setAttribute('aria-hidden','true');
  overlay.innerHTML = `
    <div class="ci-bg"></div><div class="ci-grid"></div><div class="ci-flare"></div><div class="ci-scan"></div>
    <div class="ci-stage"><div class="ci-kicker">AN ORIGINAL DBT GAMES EXPERIENCE</div><div class="ci-dbt">DBT</div><div class="ci-presents">PRESENTS</div><div class="ci-title">UNO<span>ADDA</span></div><div class="ci-tag">FAST CARDS · LOUD FRIENDS · ONE CHAOTIC TABLE</div></div>
    <div class="ci-cards"><div class="ci-card r">7</div><div class="ci-card b">↻</div><div class="ci-card w">+4</div></div>
    <div class="ci-loading"></div><div class="ci-vignette"></div><div class="ci-final"></div>`;
  document.body.appendChild(overlay);

  function sound() {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      const ctx = new AC();
      const master = ctx.createGain(); master.gain.value = .18; master.connect(ctx.destination);
      const now = ctx.currentTime;
      const pulse = (at, freq, dur=.18, type='sawtooth', level=.22) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.setValueAtTime(freq, now + at); o.frequency.exponentialRampToValueAtTime(Math.max(45,freq*.62), now + at + dur);
        g.gain.setValueAtTime(.0001, now + at); g.gain.exponentialRampToValueAtTime(level, now + at + .012); g.gain.exponentialRampToValueAtTime(.0001, now + at + dur);
        o.connect(g); g.connect(master); o.start(now+at); o.stop(now+at+dur+.03);
      };
      [0,.42,.84,1.26,1.68,2.1,2.52,2.94,3.36,3.78,4.2,4.62,5.04,5.46,5.88].forEach((t,i)=>pulse(t, i%4===0?78:110, .16, 'sawtooth', i%4===0?.32:.17));
      [2.42,2.72,3.02,3.32,4.0,4.3,4.6,4.9,5.35,5.62,5.89,6.12].forEach((t,i)=>pulse(t, 220*Math.pow(2,(i%5)/12), .22, i%2?'square':'triangle', .1));
      const sweep = ctx.createOscillator(), sg = ctx.createGain(); sweep.type='sawtooth'; sweep.frequency.setValueAtTime(70,now+.4); sweep.frequency.exponentialRampToValueAtTime(740,now+6.1); sg.gain.setValueAtTime(.0001,now+.4); sg.gain.exponentialRampToValueAtTime(.055,now+1.2); sg.gain.exponentialRampToValueAtTime(.0001,now+6.2); sweep.connect(sg); sg.connect(master); sweep.start(now+.4); sweep.stop(now+6.25);
      pulse(6.12,55,.5,'sine',.5); pulse(6.17,880,.24,'square',.13);
      setTimeout(()=>ctx.close().catch(()=>{}),7200);
    } catch {}
  }

  let running = false;
  function run(target) {
    if (running) return;
    running = true;
    overlay.classList.remove('show'); void overlay.offsetWidth; overlay.classList.add('show');
    document.body.style.overflow = 'hidden'; sound();
    setTimeout(() => {
      overlay.classList.remove('show');
      document.body.style.overflow = '';
      running = false;
      window.__dbtCinematicPass = true;
      target.dispatchEvent(new MouseEvent('click',{bubbles:true,cancelable:true,view:window}));
      setTimeout(()=>{window.__dbtCinematicPass=false;},0);
    }, 6650);
  }

  document.addEventListener('click', (e) => {
    if (window.__dbtCinematicPass) return;
    const target = e.target.closest?.('#home-play-uno,.game-tile[data-game="uno"]');
    if (!target) return;
    e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
    run(target);
  }, true);
})();