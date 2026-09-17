(() => {
  if (window.DBT_VOICE_LAB_V1) return;
  window.DBT_VOICE_LAB_V1 = true;
  const stable=window.DBT_STABILITY;
  const safe=(name,fn)=>{try{const v=fn();if(v&&typeof v.catch==='function')v.catch(e=>stable?.record?.(`voice-lab:${name}`,e));return v}catch(e){stable?.record?.(`voice-lab:${name}`,e);return undefined}};
  let mounted=false,stream=null,ctx=null,analyser=null,raf=0,monitor=null;

  const dialog=document.createElement('dialog');
  dialog.id='dbt-voice-lab';
  dialog.innerHTML=`<div class="dbt-vlab-shell"><header><div><small>DBT GAMES · VOICE LAB</small><h2>Microphone test</h2></div><button data-close type="button">✕</button></header><p>Test your microphone before joining voice. Nothing is recorded or uploaded.</p><div class="dbt-vlab-status"><span class="dot"></span><b data-status>Checking microphone support…</b></div><label>Input device<select data-device><option value="">Default microphone</option></select></label><div class="dbt-vlab-meter"><i data-meter></i></div><div class="dbt-vlab-readout"><span data-level>0%</span><small>INPUT LEVEL</small></div><div class="dbt-vlab-actions"><button data-start type="button">START MIC TEST</button><button data-stop type="button" disabled>STOP TEST</button></div><label class="dbt-vlab-monitor"><input data-monitor type="checkbox"> <span><b>Hear my mic during test</b><small>Local monitor only. Disable if you hear echo.</small></span></label><small class="dbt-vlab-note">Headphones are recommended if your speakers cause echo. Voice chat itself remains opt-in and starts muted.</small></div>`;
  document.body.appendChild(dialog);
  const $=(sel)=>dialog.querySelector(sel);
  const status=$('[data-status]'),device=$('[data-device]'),meter=$('[data-meter]'),level=$('[data-level]'),start=$('[data-start]'),stop=$('[data-stop]'),monitorToggle=$('[data-monitor]');

  function setStatus(text,kind=''){status.textContent=text;dialog.dataset.state=kind;}
  async function enumerate(){
    if(!navigator.mediaDevices?.enumerateDevices){setStatus('Microphone device listing is unavailable in this browser.','warn');return;}
    try{
      const devices=await navigator.mediaDevices.enumerateDevices();
      const mics=devices.filter(d=>d.kind==='audioinput');
      const current=device.value;device.replaceChildren(new Option('Default microphone',''));
      mics.forEach((d,i)=>device.appendChild(new Option(d.label||`Microphone ${i+1}`,d.deviceId)));
      if([...device.options].some(o=>o.value===current))device.value=current;
      setStatus(mics.length?`${mics.length} microphone${mics.length===1?'':'s'} detected`:'No microphone detected',mics.length?'ok':'warn');
    }catch(error){stable?.record?.('voice-lab:enumerate',error);setStatus('Unable to read microphone devices.','warn');}
  }
  function frame(){
    if(!analyser)return;
    const data=new Uint8Array(analyser.fftSize);analyser.getByteTimeDomainData(data);let sum=0;for(const v of data){const n=(v-128)/128;sum+=n*n}const rms=Math.sqrt(sum/data.length);const pct=Math.min(100,Math.round(rms*320));meter.style.width=`${pct}%`;level.textContent=`${pct}%`;raf=requestAnimationFrame(frame);
  }
  function stopTest(){
    cancelAnimationFrame(raf);raf=0;analyser=null;
    if(ctx){ctx.close().catch(()=>{});ctx=null}
    if(monitor){monitor.srcObject=null;monitor.remove();monitor=null}
    if(stream){stream.getTracks().forEach(t=>t.stop());stream=null}
    meter.style.width='0%';level.textContent='0%';start.disabled=false;stop.disabled=true;monitorToggle.checked=false;void enumerate();
  }
  async function startTest(){
    stopTest();
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){setStatus('Mic test needs HTTPS and browser microphone support.','warn');return;}
    start.disabled=true;
    try{
      const exact=device.value?{exact:device.value}:undefined;
      stream=await navigator.mediaDevices.getUserMedia({video:false,audio:{deviceId:exact,echoCancellation:true,noiseSuppression:true,autoGainControl:true,channelCount:1}});
      const AudioCtor=window.AudioContext||window.webkitAudioContext;if(AudioCtor){ctx=new AudioCtor();const source=ctx.createMediaStreamSource(stream);analyser=ctx.createAnalyser();analyser.fftSize=256;source.connect(analyser);frame()}
      setStatus(`Testing ${stream.getAudioTracks()[0]?.label||'microphone'}`,'ok');stop.disabled=false;await enumerate();
    }catch(error){stable?.record?.('voice-lab:start',error);start.disabled=false;stop.disabled=true;const name=error?.name||'';setStatus(name==='NotAllowedError'?'Microphone permission denied. Enable it in browser site settings and retry.':name==='NotFoundError'?'No microphone was found.':'Microphone could not start.','warn');}
  }
  function syncMonitor(){
    if(!stream||!monitorToggle.checked){if(monitor){monitor.srcObject=null;monitor.remove();monitor=null}return;}
    monitor=document.createElement('audio');monitor.autoplay=true;monitor.playsInline=true;monitor.volume=.65;monitor.srcObject=stream;document.body.appendChild(monitor);monitor.play().catch(()=>{});
  }
  start.onclick=()=>void startTest();stop.onclick=stopTest;monitorToggle.onchange=syncMonitor;device.onchange=()=>{if(stream)void startTest()};
  $('[data-close]').onclick=()=>{stopTest();dialog.close()};dialog.addEventListener('close',stopTest);dialog.addEventListener('click',e=>{if(e.target===dialog){stopTest();dialog.close()}});

  function mount(){
    if(mounted)return;
    const dock=document.getElementById('dbt-voice-dock');if(!dock)return;
    const controls=dock.querySelector('.dbt-voice-setting-row')||dock.querySelector('.dbt-voice-controls');if(!controls)return;
    const b=document.createElement('button');b.id='dbt-voice-test';b.type='button';b.textContent='🎚 MIC TEST';b.onclick=()=>{void enumerate();dialog.showModal()};controls.appendChild(b);mounted=true;void enumerate();
  }
  if(navigator.mediaDevices?.addEventListener)navigator.mediaDevices.addEventListener('devicechange',()=>safe('devicechange',enumerate));
  const obs=new MutationObserver(()=>{mount();if(mounted)obs.disconnect()});obs.observe(document.body,{childList:true,subtree:true});mount();
  window.addEventListener('pagehide',stopTest,{once:true});
})();
