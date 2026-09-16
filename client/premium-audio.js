(() => {
  if (window.DBT_AUDIO) return;
  const stable = window.DBT_STABILITY;
  if (stable && !stable.feature('audio')) return;

  try {
    const ui = window.DBT_UI || { bus:new EventTarget(), emit:()=>{} };
    const root = document.documentElement;
    let ctx=null, master=null, padGain=null, filter=null, oscA=null, oscB=null;
    let enabled=localStorage.getItem('dbt-ambient')!=='off';
    let unlocked=false, voiceSpeaking=false, voiceFocus=localStorage.getItem('dbt-voice-focus')==='1';
    let currentBase=110;

    const gameVisible = () => ['playing','flex-playing'].includes(root.dataset.dbtScreen||'') || (!!document.getElementById('board') && !document.getElementById('board').hidden) || (!!document.getElementById('game') && !document.getElementById('game').hidden);
    const targetGain = () => !enabled || !gameVisible() ? 0 : voiceSpeaking ? .0022 : voiceFocus ? .0035 : .009;

    function ensure(){
      if(ctx) return ctx;
      try{
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtor) return null;
        ctx=new AudioCtor();
        master=ctx.createGain(); padGain=ctx.createGain(); filter=ctx.createBiquadFilter();
        master.gain.value=.9; padGain.gain.value=0; filter.type='lowpass'; filter.frequency.value=620; filter.Q.value=.7;
        oscA=ctx.createOscillator(); oscB=ctx.createOscillator();
        oscA.type='sine'; oscB.type='triangle';
        oscA.frequency.value=currentBase; oscB.frequency.value=currentBase*1.5;
        oscA.detune.value=-3; oscB.detune.value=4;
        oscA.connect(filter); oscB.connect(filter); filter.connect(padGain); padGain.connect(master); master.connect(ctx.destination);
        oscA.start(); oscB.start();
        return ctx;
      }catch(error){stable?.record?.('premium-audio:init',error);return null}
    }

    function unlock(){
      const c=ensure(); if(!c)return; unlocked=true; if(c.state==='suspended') c.resume().catch(error=>stable?.record?.('premium-audio:resume',error)); sync();
    }
    document.addEventListener('pointerdown',unlock,{once:true,passive:true});
    document.addEventListener('keydown',unlock,{once:true});

    function ramp(param,value,time=.45){
      if(!ctx||!param)return; const now=ctx.currentTime; try{param.cancelScheduledValues(now);param.setValueAtTime(Math.max(.00001,param.value),now);param.linearRampToValueAtTime(value,now+time)}catch{}
    }
    function sync(){
      if(!ctx||!unlocked)return;
      const intensity=root.dataset.dbtIntensity||'calm';
      const base=intensity==='final'?146.83:intensity==='tense'?123.47:110;
      currentBase=base;
      ramp(oscA.frequency,base,.7); ramp(oscB.frequency,base*1.5,.7);
      if(filter) ramp(filter.frequency,intensity==='final'?980:intensity==='tense'?760:620,.65);
      if(padGain) ramp(padGain.gain,targetGain(),.5);
    }

    function sting(kind='play'){
      if(!enabled||!unlocked||!ctx||!gameVisible())return;
      const map={reverse:[520,660],skip:[710,510],draw2:[240,360],draw4:[170,260],wild:[440,660],devil:[155,310],magnet:[360,720],shield:[420,840],freeze:[760,570],robbery:[190,285],flex:[520,780],challenge:[260,520]};
      const notes=map[kind]||[520]; const now=ctx.currentTime;
      notes.forEach((freq,i)=>{
        try{
          const o=ctx.createOscillator(),g=ctx.createGain();o.type=i?'triangle':'sine';o.frequency.value=freq;g.gain.setValueAtTime(.0001,now);g.gain.exponentialRampToValueAtTime(.009,now+.012+i*.012);g.gain.exponentialRampToValueAtTime(.0001,now+.16+i*.04);o.connect(g).connect(master);o.start(now+i*.018);o.stop(now+.23+i*.04);
        }catch{}
      });
    }

    const setEnabled=(on)=>{enabled=!!on;localStorage.setItem('dbt-ambient',enabled?'on':'off');if(enabled)unlock();sync();ui.emit?.('audiochange',{enabled})};
    const setVoiceFocus=(on)=>{voiceFocus=!!on;localStorage.setItem('dbt-voice-focus',voiceFocus?'1':'0');sync()};

    ui.bus?.addEventListener('specialfx',e=>sting(e.detail?.kind));
    ui.bus?.addEventListener('cardimpactvisual',e=>{if(['draw4','devil'].includes(e.detail?.kind))sting(e.detail.kind)});
    ui.bus?.addEventListener('voiceactivity',e=>{voiceSpeaking=!!e.detail?.speaking;sync()});
    ui.bus?.addEventListener('voicefocus',e=>setVoiceFocus(!!e.detail?.enabled));
    new MutationObserver(sync).observe(root,{attributes:true,attributeFilter:['data-dbt-screen','data-dbt-intensity']});
    document.addEventListener('visibilitychange',()=>{if(!ctx)return;if(document.hidden)ctx.suspend().catch(()=>{});else if(unlocked){ctx.resume().catch(()=>{});sync()}});

    document.addEventListener('click',e=>{
      if(e.target?.closest?.('#sound-toggle')) setTimeout(()=>{if(localStorage.getItem('uno-sound')==='off')setEnabled(false)},0);
    },{passive:true});

    window.DBT_AUDIO={get enabled(){return enabled},setEnabled,setVoiceFocus,sting,unlock};
  } catch (error) {
    stable?.record?.('premium-audio', error);
    stable?.disable?.('audio', 'Adaptive audio disabled after runtime failure');
  }
})();