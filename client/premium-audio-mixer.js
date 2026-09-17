(() => {
  if (window.DBT_AUDIO_MIXER_V1) return;
  window.DBT_AUDIO_MIXER_V1 = true;
  const stable=window.DBT_STABILITY;
  const safe=(name,fn)=>{try{return fn()}catch(error){stable?.record?.(`audio-mixer:${name}`,error);return undefined}};
  const VOICE_KEY='dbt-voice-master-volume';
  let voiceVolume=Math.max(0,Math.min(1,Number(localStorage.getItem(VOICE_KEY) ?? .9)));

  const button=document.createElement('button');button.id='dbt-audio-mixer-open';button.type='button';button.textContent='🎚';button.title='Audio mixer';button.setAttribute('aria-label','Open audio mixer');
  const host=document.querySelector('.top-actions')||document.querySelector('.flex-top')||document.body;host.appendChild(button);

  const dialog=document.createElement('dialog');dialog.id='dbt-audio-mixer';dialog.innerHTML=`<div class="dbt-amix-shell"><header><div><small>DBT GAMES · AUDIO</small><h2>Table mix</h2></div><button data-close type="button">✕</button></header><p>Balance soundtrack, game effects and live voice separately. Critical gameplay stays visual even when audio is low.</p><div class="dbt-amix-grid"><label><span><b>Music / atmosphere</b><small>Adaptive table pad and tension layer.</small></span><output data-music-out>75%</output><input data-music type="range" min="0" max="1" step=".05"></label><label><span><b>Game effects</b><small>Power stings, UNO and impact tones.</small></span><output data-effects-out>80%</output><input data-effects type="range" min="0" max="1" step=".05"></label><label><span><b>Voice chat master</b><small>Scales all remote player voice on this device.</small></span><output data-voice-out>90%</output><input data-voice type="range" min="0" max="1" step=".05"></label></div><div class="dbt-amix-actions"><button data-mute-music type="button">MUTE MUSIC</button><button data-mute-effects type="button">MUTE EFFECTS</button><button data-mute-voice type="button">MUTE VOICE</button><button data-reset type="button">RESET MIX</button></div><small class="dbt-amix-note">Voice Focus and active-speaker ducking continue to work on top of these levels.</small></div>`;document.body.appendChild(dialog);
  const $=(s)=>dialog.querySelector(s),music=$('[data-music]'),effects=$('[data-effects]'),voice=$('[data-voice]');
  const pct=v=>`${Math.round(Number(v)*100)}%`;

  function applyVoice(){document.querySelectorAll('audio[data-dbt-voice-peer]').forEach(audio=>{const peerBase=Number(audio.dataset.dbtPeerBaseVolume ?? audio.volume ?? 1);if(!audio.dataset.dbtPeerBaseVolume)audio.dataset.dbtPeerBaseVolume=String(Math.max(0,Math.min(1,peerBase)));const muted=audio.dataset.dbtMixerMuted==='1';audio.volume=muted?0:Math.max(0,Math.min(1,Number(audio.dataset.dbtPeerBaseVolume||1)*voiceVolume));});}
  function sync(){const a=window.DBT_AUDIO;const mv=Number.isFinite(a?.musicVolume)?a.musicVolume:Number(localStorage.getItem('dbt-music-volume')??.75);const ev=Number.isFinite(a?.effectsVolume)?a.effectsVolume:Number(localStorage.getItem('dbt-effects-volume')??.8);music.value=String(mv);effects.value=String(ev);voice.value=String(voiceVolume);$('[data-music-out]').textContent=pct(mv);$('[data-effects-out]').textContent=pct(ev);$('[data-voice-out]').textContent=pct(voiceVolume);$('[data-mute-music]').textContent=mv>0?'MUTE MUSIC':'UNMUTE MUSIC';$('[data-mute-effects]').textContent=ev>0?'MUTE EFFECTS':'UNMUTE EFFECTS';$('[data-mute-voice]').textContent=voiceVolume>0?'MUTE VOICE':'UNMUTE VOICE';applyVoice();}
  function setMusic(v){window.DBT_AUDIO?.setMusicVolume?.(v);sync();}
  function setEffects(v){window.DBT_AUDIO?.setEffectsVolume?.(v);sync();}
  function setVoice(v){voiceVolume=Math.max(0,Math.min(1,Number(v)||0));localStorage.setItem(VOICE_KEY,String(voiceVolume));applyVoice();sync();window.DBT_UI?.emit?.('voicevolumechange',{volume:voiceVolume});}
  music.oninput=()=>setMusic(music.value);effects.oninput=()=>setEffects(effects.value);voice.oninput=()=>setVoice(voice.value);
  $('[data-mute-music]').onclick=()=>setMusic(Number(music.value)>0?0:.75);$('[data-mute-effects]').onclick=()=>setEffects(Number(effects.value)>0?0:.8);$('[data-mute-voice]').onclick=()=>setVoice(voiceVolume>0?0:.9);$('[data-reset]').onclick=()=>{setMusic(.75);setEffects(.8);setVoice(.9);window.DBT_UI?.toast?.('Audio mix reset')};
  $('[data-close]').onclick=()=>dialog.close();dialog.addEventListener('click',e=>{if(e.target===dialog)dialog.close()});button.onclick=()=>{sync();dialog.showModal()};

  const obs=new MutationObserver(records=>{let changed=false;for(const rec of records)for(const node of rec.addedNodes)if(node.nodeType===1&&(node.matches?.('audio[data-dbt-voice-peer]')||node.querySelector?.('audio[data-dbt-voice-peer]'))){changed=true;break}if(changed)requestAnimationFrame(applyVoice)});obs.observe(document.body,{childList:true,subtree:true});
  document.addEventListener('input',e=>{const range=e.target;if(!(range instanceof HTMLInputElement)||range.type!=='range')return;if(range.closest('#dbt-voice-peers'))requestAnimationFrame(()=>{document.querySelectorAll('audio[data-dbt-voice-peer]').forEach(audio=>{audio.dataset.dbtPeerBaseVolume=String(Math.max(0,Math.min(1,audio.volume/(voiceVolume||1))));});applyVoice()})},{passive:true});
  window.DBT_AUDIO_MIXER={get voiceVolume(){return voiceVolume},setVoiceVolume:setVoice,applyVoice};
  sync();
})();
