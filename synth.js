window.addEventListener("error", event => {
  const status = document.getElementById("engine-state");
  if (status) status.textContent = "JS ERROR: " + (event.message || "unknown error");
});
window.addEventListener("unhandledrejection", event => {
  const status = document.getElementById("engine-state");
  if (status) status.textContent = "JS ERROR: " + (event.reason?.message || String(event.reason));
});
(() => {
  const $ = (id) => document.getElementById(id);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const midiHz = (note) => 440 * Math.pow(2, (note - 69) / 12);
  const presets = [
    {name:"INITIAL PATCH",wave:["sawtooth","sawtooth","triangle"],level:[.55,.28,.2],oct:[0,0,-1],cutoff:900,resonance:.8,attack:.02,decay:.35,sustain:.72,release:.45},
    {name:"GLASS CURRENT",wave:["triangle","sine","sine"],level:[.3,.45,.18],oct:[0,1,2],cutoff:5200,resonance:.5,attack:.01,decay:1.8,sustain:.35,release:2.2},
    {name:"DARK MATTER",wave:["sawtooth","sawtooth","square"],level:[.55,.4,.25],oct:[0,0,-1],cutoff:420,resonance:2.4,attack:.04,decay:.8,sustain:.8,release:.65},
    {name:"SUB ORBIT",wave:["sine","triangle","sawtooth"],level:[.75,.2,.12],oct:[-1,0,1],cutoff:1200,resonance:.7,attack:.005,decay:.2,sustain:.9,release:.22},
    {name:"NEON STRINGS",wave:["sawtooth","sawtooth","triangle"],level:[.3,.32,.2],oct:[0,0,1],cutoff:3400,resonance:1.1,attack:.65,decay:1.2,sustain:.68,release:2.8},
    {name:"ACID BASS",wave:["sawtooth","square","sawtooth"],level:[.62,.28,.18],oct:[-1,-1,-2],cutoff:680,resonance:3.2,attack:.004,decay:.22,sustain:.18,release:.08},
    {name:"RUMBLE SUB",wave:["sine","sine","triangle"],level:[.85,.35,.08],oct:[-2,-1,-2],cutoff:520,resonance:.7,attack:.008,decay:.3,sustain:.95,release:.12},
    {name:"RIDDIM WUB",wave:["square","sawtooth","sine"],level:[.48,.42,.3],oct:[-1,-1,-2],cutoff:460,resonance:2.8,attack:.006,decay:.34,sustain:.42,release:.1},
    {name:"REESE ENGINE",wave:["sawtooth","sawtooth","square"],level:[.42,.42,.2],oct:[-1,-1,-2],cutoff:1150,resonance:1.6,attack:.012,decay:.5,sustain:.72,release:.18},
    {name:"FM KICK BASS",wave:["sine","square","sine"],level:[.8,.22,.22],oct:[-2,-1,-3],cutoff:780,resonance:1.1,attack:.002,decay:.16,sustain:.08,release:.09},
    {name:"DUB PLUCK",wave:["triangle","square","sine"],level:[.5,.2,.18],oct:[-1,0,-2],cutoff:1450,resonance:1.8,attack:.003,decay:.24,sustain:.12,release:.16},
    {name:"NEON LEAD",wave:["sawtooth","square","triangle"],level:[.42,.24,.18],oct:[0,1,0],cutoff:2600,resonance:1.5,attack:.015,decay:.28,sustain:.62,release:.22},
    {name:"LASER PLUCK",wave:["square","triangle","sine"],level:[.4,.25,.22],oct:[1,0,2],cutoff:4100,resonance:2.2,attack:.002,decay:.16,sustain:.04,release:.12},
    {name:"WARM ANALOG",wave:["sawtooth","triangle","sawtooth"],level:[.4,.32,.16],oct:[0,-1,1],cutoff:1850,resonance:.8,attack:.08,decay:.7,sustain:.7,release:.8},
    {name:"COSMIC PAD",wave:["triangle","sawtooth","sine"],level:[.35,.2,.32],oct:[0,1,2],cutoff:2300,resonance:.6,attack:1.1,decay:1.8,sustain:.8,release:3.4},
    {name:"CHOIR MACHINE",wave:["sine","triangle","sine"],level:[.45,.32,.22],oct:[0,1,-1],cutoff:3200,resonance:.5,attack:.7,decay:1.3,sustain:.76,release:2.5},
    {name:"PLASMA STAB",wave:["sawtooth","square","triangle"],level:[.5,.32,.16],oct:[0,0,1],cutoff:3100,resonance:2.4,attack:.004,decay:.42,sustain:.2,release:.18},
    {name:"DEEP SPACE",wave:["sine","triangle","sawtooth"],level:[.62,.22,.1],oct:[-1,-2,0],cutoff:850,resonance:.6,attack:.18,decay:1.4,sustain:.85,release:2.1},
    {name:"METAL PULSE",wave:["square","sawtooth","square"],level:[.35,.3,.18],oct:[0,1,-1],cutoff:1750,resonance:2.6,attack:.003,decay:.19,sustain:.26,release:.1}
  ];
  let audio=null, master=null, currentPreset=0, voices=0;
  const active=new Map(); // Only keys/tokens that are still held
  const voicePool=new Set(); // Includes release tails and scheduled sequencer notes
  let chorusDelay,chorusLfo,chorusWet,dryGain,reverbWet,convolver;
  let noiseBuffer=null, lastMidi=60, seqTimer=null, seqStep=0,seqDirection=1;
  let seqNextTime=0,seqEpoch=0,seqVisualTimers=new Set(),seqGateTimers=new Set();
  let heldNotes=new Map(),arpLatchNotes=[],arpTapNotes=[];
  let stepEnabled=Array(16).fill(true),stepOffsets=[0,2,4,7,9,7,4,2,0,-3,-5,-3,0,2,4,7];
  const oscSettings=[0,1,2].map(i=>({wave:"sawtooth",level:[.55,.28,.2][i],oct:0}));
  const noteNames=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const keyMap={a:60,w:61,s:62,e:63,d:64,f:65,t:66,g:67,y:68,h:69,u:70,j:71,k:72};
  const driveCurves=new Map();
  function initAudio(){
    if(audio){
      if(audio.state==="suspended")audio.resume().catch(err=>console.warn("Could not resume audio:",err));
      return;
    }
    const AC=window.AudioContext||window.webkitAudioContext;
    if(!AC){$("engine-state").textContent="AUDIO NOT SUPPORTED";return;}
    audio=new AC({latencyHint:"interactive"});
    master=audio.createGain();master.gain.value=read("master-level");
    const limiter=audio.createDynamicsCompressor();
    limiter.threshold.value=-8;limiter.knee.value=8;limiter.ratio.value=8;
    limiter.attack.value=.003;limiter.release.value=.18;
    dryGain=audio.createGain();dryGain.gain.value=.9;
    chorusDelay=audio.createDelay(.05);chorusDelay.delayTime.value=.018;
    chorusLfo=audio.createOscillator();chorusLfo.frequency.value=read("chorus-rate");
    const chorusDepth=audio.createGain();chorusDepth.gain.value=.006;
    chorusLfo.connect(chorusDepth);chorusDepth.connect(chorusDelay.delayTime);chorusLfo.start();
    chorusWet=audio.createGain();
    chorusWet.gain.value=$("chorus-on").checked?read("chorus-mix"):0;
    chorusDelay.connect(chorusWet);
    convolver=audio.createConvolver();convolver.buffer=makeImpulse(read("reverb-size"));
    reverbWet=audio.createGain();
    reverbWet.gain.value=$("reverb-on").checked?read("reverb-mix"):0;
    const fxSum=audio.createGain();
    // Dry, chorus send, and reverb send all receive signal. The old chorus
    // node had no input and could never produce a wet signal.
    dryGain.connect(fxSum);
    dryGain.connect(chorusDelay);chorusWet.connect(fxSum);
    dryGain.connect(convolver);convolver.connect(reverbWet);reverbWet.connect(fxSum);
    fxSum.connect(limiter);limiter.connect(master);master.connect(audio.destination);
    noiseBuffer=makeNoiseBuffer();
    $("engine-state").textContent="AUDIO ENGINE READY";
  }
  function makeImpulse(seconds){
    const rate=audio.sampleRate,length=Math.max(1,Math.floor(rate*clamp(seconds,.1,4)));
    const buffer=audio.createBuffer(2,length,rate);
    for(let c=0;c<2;c++){
      const data=buffer.getChannelData(c);
      for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/length,2.8);
    }
    return buffer;
  }
  function makeNoiseBuffer(){
    const b=audio.createBuffer(1,audio.sampleRate,audio.sampleRate),data=b.getChannelData(0);
    for(let i=0;i<data.length;i++)data[i]=Math.random()*2-1;
    return b; // shared between all voices, no per-note 1-second allocations
  }
  function makeDriveCurve(amount){
    const key=Math.round(clamp(amount,0,1)*100);
    if(driveCurves.has(key))return driveCurves.get(key);
    const curve=new Float32Array(2048),intensity=1+key*.14,normal=Math.tanh(intensity);
    for(let i=0;i<curve.length;i++){
      const x=2*i/(curve.length-1)-1;
      curve[i]=key===0?x:Math.tanh(intensity*x)/normal;
    }
    driveCurves.set(key,curve);
    return curve;
  }
  function filterCutoff(note){
    return clamp(read("cutoff")*Math.pow(2,(note-60)*read("keytrack")/12),
      35,audio?audio.sampleRate*.45:18000);
  }
  function updateVoices(){
    voices=voicePool.size;
    $("voice-count").textContent=voices+" VOICES ACTIVE";
  }
  function setHeld(note,on){
    const n=heldNotes.get(note)||0;
    if(on)heldNotes.set(note,n+1);
    else if(n<=1)heldNotes.delete(note);
    else heldNotes.set(note,n-1);
  }
  function configureLfo(v){
    if(!audio||!v||v.ended)return;
    const t=audio.currentTime;
    v.lfo.type=$("lfo-wave").value;
    v.lfo.frequency.setTargetAtTime(read("lfo-rate"),t,.02);
    v.lfoGain.disconnect();
    const depth=clamp(read("lfo-depth")/100+read("mod-wheel")*.45,0,1);
    const dest=$("lfo-destination").value;
    if(dest==="pitch"){
      v.lfoGain.gain.setTargetAtTime(depth*45,t,.02);
      v.oscs.filter(x=>x.osc.detune).forEach(x=>v.lfoGain.connect(x.osc.detune));
    }else if(dest==="cutoff"){
      v.lfoGain.gain.setTargetAtTime(depth*1500,t,.02);
      v.filters.forEach(x=>v.lfoGain.connect(x.frequency));
    }else{
      // AMP / TREMOLO rather than incorrectly claiming pulse-width modulation
      v.lfoGain.gain.setTargetAtTime(depth*.45,t,.02);
      v.lfoGain.connect(v.tremolo.gain);
    }
  }
  function updateLiveVoices(){
    if(!audio)return;
    const t=audio.currentTime;
    for(const v of voicePool){
      // Voices already in their release tail retain their original patch
      // sound and aren't reconfigured as the user edits another preset.
      if(v.ended||v.released)continue;
      v.filters.forEach(f=>{
        f.type=$("filter-type").value;
        f.frequency.setTargetAtTime(filterCutoff(v.note),t,.012);
        f.Q.setTargetAtTime(Math.max(.1,read("resonance")*.55),t,.012);
      });
      v.drive.curve=makeDriveCurve(read("drive"));
      v.oscs.forEach((o,i)=>{
        if(i>=3)return;
        const setting=oscSettings[i];
        o.osc.type=setting.wave;
        o.osc.frequency.setTargetAtTime(midiHz(v.note+setting.oct*12),t,.015);
        o.gain.gain.setTargetAtTime(setting.level,t,.012);
      });
      configureLfo(v);
    }
  }
  function terminateVoice(v,atTime,fast=false){
    if(!audio||!v||v.ended)return;
    const t=Math.max(audio.currentTime,atTime??audio.currentTime);
    const release=fast?.012:read("release");
    // A hard STOP/PANIC must cancel future, lookahead-scheduled notes too.
    // Delaying until v.when would allow a canceled note to sound later.
    const stopAt=fast?t+.035:Math.max(t,v.when||0)+release+.035;
    if(v.cleanupTimer)clearTimeout(v.cleanupTimer);
    const gain=v.amp.gain;
    if(typeof gain.cancelAndHoldAtTime==="function")gain.cancelAndHoldAtTime(t);
    else{
      gain.cancelScheduledValues(t);
      gain.setValueAtTime(Math.max(.0001,gain.value),t);
    }
    gain.setTargetAtTime(.00001,t,Math.max(.005,release/4));
    v.oscs.forEach(o=>{try{o.osc.stop(stopAt)}catch(err){}});
    try{v.lfo.stop(stopAt)}catch(err){}
    v.released=true;
    if(active.get(v.token)===v)active.delete(v.token);
    v.cleanupTimer=setTimeout(()=>{
      v.ended=true;
      v.oscs.forEach(o=>{try{o.osc.disconnect();o.gain.disconnect()}catch(err){}});
      try{v.lfo.disconnect();v.lfoGain.disconnect();v.input.disconnect();
        v.drive.disconnect();v.tremolo.disconnect();v.amp.disconnect();
        v.filters.forEach(f=>f.disconnect())}catch(err){}
      voicePool.delete(v);updateVoices();
    },Math.max(0,(stopAt-audio.currentTime)*1000)+45);
    updateVoices();
  }
  function startNote(note,velocity=.82,token=note,when=null){
    initAudio();
    if(!audio||active.has(token))return;
    // Count voices that are still in their release tails as real DSP voices.
    if(voicePool.size>=18){
      const oldest=voicePool.values().next().value;
      terminateVoice(oldest,audio.currentTime,true);
      // Immediately make a slot for the new voice: the old voice is fading
      // out and its cleanup remains scheduled.
      if(oldest)voicePool.delete(oldest);
    }
    const now=Math.max(audio.currentTime,when??audio.currentTime);
    const input=audio.createGain(),drive=audio.createWaveShaper();
    input.gain.value=.72;
    drive.curve=makeDriveCurve(read("drive"));drive.oversample="2x";
    const filters=[audio.createBiquadFilter(),audio.createBiquadFilter()];
    filters.forEach(f=>{
      f.type=$("filter-type").value;
      f.frequency.setValueAtTime(filterCutoff(note),now);
      f.Q.value=Math.max(.1,read("resonance")*.55);
    });
    const tremolo=audio.createGain();tremolo.gain.value=1;
    const amp=audio.createGain();
    input.connect(drive);drive.connect(filters[0]);filters[0].connect(filters[1]);
    filters[1].connect(tremolo);tremolo.connect(amp);amp.connect(dryGain);
    const oscs=[];
    oscSettings.forEach((setting,i)=>{
      const osc=audio.createOscillator(),gain=audio.createGain();
      osc.type=setting.wave;
      const target=midiHz(note+setting.oct*12);
      const glide=read("portamento");
      const initial=midiHz(lastMidi+setting.oct*12);
      osc.frequency.setValueAtTime(glide>0?initial:target,now);
      if(glide>0)osc.frequency.exponentialRampToValueAtTime(target,now+glide);
      gain.gain.value=setting.level;
      osc.connect(gain);gain.connect(input);osc.start(now);
      oscs.push({osc,gain});
    });
    let noiseVoice=null,subVoice=null;
    const noiseLevel=read("noise-level");
    if(noiseLevel>0){
      const n=audio.createBufferSource(),g=audio.createGain();n.buffer=noiseBuffer;
      n.loop=true;g.gain.value=noiseLevel;n.connect(g);g.connect(input);n.start(now);
      noiseVoice={osc:n,gain:g};oscs.push(noiseVoice);
    }
    const subLevel=read("sub-level");
    if(subLevel>0){
      const sub=audio.createOscillator(),g=audio.createGain();
      sub.type="sine";sub.frequency.setValueAtTime(midiHz(note-12),now);
      g.gain.value=subLevel;sub.connect(g);g.connect(input);sub.start(now);
      subVoice={osc:sub,gain:g};oscs.push(subVoice);
    }
    const attack=read("attack"),decay=read("decay"),sustain=read("sustain");
    amp.gain.setValueAtTime(.00001,now);
    amp.gain.linearRampToValueAtTime(Math.max(.0001,velocity),now+attack);
    amp.gain.linearRampToValueAtTime(Math.max(.0001,velocity*sustain),now+attack+decay);
    const lfo=audio.createOscillator(),lfoGain=audio.createGain();
    lfo.connect(lfoGain);
    const v={token,note,when:now,amp,oscs,filters,drive,input,tremolo,lfo,lfoGain,
      noise:noiseVoice,sub:subVoice,isSequence:false,
      released:false,ended:false,cleanupTimer:null};
    configureLfo(v);lfo.start(now);
    active.set(token,v);voicePool.add(v);lastMidi=note;updateVoices();
    return v;
  }
  function stopNote(token,when=null){
    const v=active.get(token);
    if(!v||!audio)return;
    terminateVoice(v,when??audio.currentTime);
  }
  function stopAll(){
    for(const v of [...voicePool])terminateVoice(v,audio?.currentTime,true);
    active.clear();
    heldNotes.clear();
    pointerNotes.clear();computerHeld.clear();
    document.querySelectorAll(".key.active").forEach(x=>x.classList.remove("active"));
  }
  function read(id){return Number($(id).value);}
  function bindRange(id,formatter=(v)=>v){
    const el=$(id),out=el.parentElement.querySelector("output");
    const update=()=>{if(out)out.textContent=formatter(Number(el.value));};
    el.addEventListener("input",()=>{
      update();
      if(id==="master-level"&&master)master.gain.setTargetAtTime(read(id),audio.currentTime,.012);
      if(id==="chorus-rate"&&chorusLfo)chorusLfo.frequency.setTargetAtTime(read(id),audio.currentTime,.02);
      if(id==="chorus-mix"&&chorusWet)chorusWet.gain.setTargetAtTime(
        $("chorus-on").checked?read(id):0,audio.currentTime,.025);
      if(id==="reverb-mix"&&reverbWet)reverbWet.gain.setTargetAtTime(
        $("reverb-on").checked?read(id):0,audio.currentTime,.025);
      if(id==="lfo-depth")$("matrix-amount").textContent=read(id)+"%";
      if(["cutoff","resonance","drive","keytrack","lfo-depth","lfo-rate","mod-wheel"].includes(id)){
        updateLiveVoices();
      }
      if(id==="noise-level"||id==="sub-level")updateAuxVoices();
    });
    // Buffer allocation is expensive: don't rebuild an impulse on every
    // drag pixel. Commit the change when a slider is released.
    if(id==="reverb-size")el.addEventListener("change",()=>{
      if(convolver&&audio)convolver.buffer=makeImpulse(read(id));
    });
    update();
  }

  function updateAuxVoices(){
    if(!audio)return;
    const t=audio.currentTime;
    for(const v of voicePool){
      if(v.ended||v.released)continue;
      const noiseLevel=read("noise-level"),subLevel=read("sub-level");
      if(noiseLevel>0&&!v.noise){
        const n=audio.createBufferSource(),g=audio.createGain();
        n.buffer=noiseBuffer;n.loop=true;g.gain.value=0;
        n.connect(g);g.connect(v.input);n.start(t);
        v.noise={osc:n,gain:g};v.oscs.push(v.noise);
      }
      if(subLevel>0&&!v.sub){
        const osc=audio.createOscillator(),g=audio.createGain();
        osc.type="sine";osc.frequency.value=midiHz(v.note-12);g.gain.value=0;
        osc.connect(g);g.connect(v.input);osc.start(t);
        v.sub={osc,gain:g};v.oscs.push(v.sub);
      }
      if(v.noise)v.noise.gain.gain.setTargetAtTime(noiseLevel,t,.025);
      if(v.sub)v.sub.gain.gain.setTargetAtTime(subLevel,t,.025);
    }
  }
  function sequenceNotes(){
    const mode=$("seq-mode").value;
    if(mode==="step"){
      const root=heldNotes.size?[...heldNotes.keys()][0]:
        arpTapNotes.length?arpTapNotes[0]:60;
      return [root+stepOffsets[seqStep%16]];
    }
    // Preserve insertion order for AS PLAYED; sorted pitch order for UP/DOWN.
    const base=arpLatchNotes.length?arpLatchNotes:
      heldNotes.size?[...heldNotes.keys()]:arpTapNotes;
    if(!base.length)return [];
    const notes=[...new Set(base)];
    const direction=$("arp-direction").value;
    if(direction!=="asplayed"&&direction!=="random")notes.sort((a,b)=>a-b);
    const expanded=[],octaves=Number($("arp-octaves").value);
    for(let o=0;o<octaves;o++)notes.forEach(n=>expanded.push(n+o*12));
    if(direction==="down")expanded.reverse();
    if(direction==="updown"&&expanded.length>2)
      return expanded.concat(expanded.slice(1,-1).reverse());
    if(direction==="random"){
      for(let i=expanded.length-1;i>0;i--){
        const j=Math.floor(Math.random()*(i+1));
        [expanded[i],expanded[j]]=[expanded[j],expanded[i]];
      }
    }
    return expanded;
  }
  function renderSteps(){
    const host=$("seq-steps");host.innerHTML="";
    const count=$("seq-mode").value==="step"?16:8;
    for(let i=0;i<count;i++){
      const b=document.createElement("button");
      b.className="seq-step"+(stepEnabled[i]?" enabled":"");
      b.textContent=String(i+1).padStart(2,"0");b.dataset.step=i;
      b.addEventListener("click",()=>{
        stepEnabled[i]=!stepEnabled[i];
        b.classList.toggle("enabled",stepEnabled[i]);
      });
      host.append(b);
    }
    $("arp-octave-wrap").style.display=$("seq-mode").value==="arp"?"flex":"none";
    $("arp-direction").disabled=$("seq-mode").value!=="arp";
    $("seq-help").textContent=$("seq-mode").value==="arp"?
      "Tap notes to build a chord, then PLAY. Each tap also plays the note.":
      "Tap a root note, then PLAY. The 16-step pitch pattern follows that root.";
  }
  function stopSequence(){
    if(seqTimer!==null){clearInterval(seqTimer);seqTimer=null;}
    seqEpoch++;
    for(const timer of seqVisualTimers)clearTimeout(timer);
    seqVisualTimers.clear();
    for(const timer of seqGateTimers)clearTimeout(timer);
    seqGateTimers.clear();
    for(const v of [...voicePool])if(v.isSequence)terminateVoice(v,audio?.currentTime,true);
    if(!$("arp-latch").checked)arpTapNotes=[];
    document.querySelectorAll(".seq-step").forEach(b=>b.classList.remove("playing"));
    $("seq-position").textContent="STOPPED";
    $("seq-play").textContent="▶ PLAY";
  }
  function sequenceTick(){
    if(seqTimer===null||!audio||audio.state==="suspended")return;
    // Schedule audio on AudioContext's clock, not the unreliable JS event
    // loop. The timer only fills the next 120 ms of the Web Audio timeline.
    let loops=0;
    while(seqNextTime<audio.currentTime+.12&&loops++<32){
      const mode=$("seq-mode").value,count=mode==="step"?16:8;
      const step=seqStep%count,epoch=seqEpoch;
      const beat=60/Math.max(1,Number($("seq-tempo").value));
      const swing=Number($("seq-swing").value)/100;
      const duration=beat*(step%2===0?1+swing:1-swing)*(mode==="arp"?.5:1);
      const gate=Number($("seq-gate").value)/100;
      const notes=sequenceNotes();
      if(stepEnabled[step]&&notes.length){
        const note=notes[mode==="step"?0:step%notes.length];
        const token="seq-"+epoch+"-"+seqNextTime.toFixed(5)+"-"+step;
        const v=startNote(note,.78,token,seqNextTime);
        if(v){
          v.isSequence=true;
          stopNote(token,seqNextTime+duration*gate);
        }
      }
      const delay=Math.max(0,(seqNextTime-audio.currentTime)*1000);
      const timer=setTimeout(()=>{
        seqVisualTimers.delete(timer);
        if(epoch!==seqEpoch)return;
        document.querySelectorAll(".seq-step").forEach(b=>
          b.classList.toggle("playing",Number(b.dataset.step)===step));
        $("seq-position").textContent="STEP "+String(step+1).padStart(2,"0")+" / "+count;
      },delay);
      seqVisualTimers.add(timer);
      seqNextTime+=duration;
      seqStep=(seqStep+1)%count;
    }
  }
  function startSequence(){
    if(seqTimer!==null)return;
    const mode=$("seq-mode").value;
    if(mode==="arp"&&!heldNotes.size&&!arpLatchNotes.length&&!arpTapNotes.length){
      $("seq-position").textContent="TAP KEYS, THEN PLAY";return;
    }
    if(mode==="step"&&!heldNotes.size&&!arpTapNotes.length){
      $("seq-position").textContent="TAP A ROOT NOTE FIRST";return;
    }
    initAudio();
    if(!audio)return;
    seqEpoch++;
    seqStep=0;
    seqNextTime=audio.currentTime+.04;
    $("seq-play").textContent="Ⅱ RUNNING";
    seqTimer=setInterval(sequenceTick,25);
    sequenceTick();
  }

  function buildOscillators(){
    const host=$("oscillators"),mix=$("mixer-controls");
    const waves=[["sawtooth","SAW"],["square","SQUARE"],["triangle","TRIANGLE"],["sine","SINE"]];
    for(let i=0;i<3;i++){
      const row=document.createElement("div");row.className="osc-row";
      row.innerHTML='<div class="osc-id">OSC '+(i+1)+'</div><div class="osc-fields"><select aria-label="Oscillator '+(i+1)+' waveform">'+waves.map(w=>'<option value="'+w[0]+'">'+w[1]+'</option>').join("")+'</select><select aria-label="Oscillator '+(i+1)+' octave"><option value="-2">-2 OCT</option><option value="-1">-1 OCT</option><option value="0" selected>0 OCT</option><option value="1">+1 OCT</option><option value="2">+2 OCT</option></select></div>';
      const selects=row.querySelectorAll("select");selects[0].value=oscSettings[i].wave;selects[1].value=oscSettings[i].oct;
      selects[0].addEventListener("change",()=>{oscSettings[i].wave=selects[0].value;updateLiveVoices();});
      selects[1].addEventListener("change",()=>{oscSettings[i].oct=Number(selects[1].value);updateLiveVoices();});
      host.append(row);
      const label=document.createElement("label");label.className="control";label.innerHTML='<span>OSC '+(i+1)+' LEVEL</span><input type="range" min="0" max="0.8" step="0.01" value="'+oscSettings[i].level+'"><output></output>';
      const range=label.querySelector("input"),out=label.querySelector("output");out.textContent=Math.round(oscSettings[i].level*100)+"%";
      range.addEventListener("input",()=>{oscSettings[i].level=Number(range.value);out.textContent=Math.round(oscSettings[i].level*100)+"%";updateLiveVoices();});
      mix.append(label);
    }
  }
  const pointerNotes=new Map(),computerHeld=new Map();
  function releasePointer(pointerId){
    const info=pointerNotes.get(pointerId);
    if(!info)return;
    stopNote("ptr-"+pointerId);
    pointerNotes.delete(pointerId);
    setHeld(info.note,false);
    const key=$('.key[data-note="'+info.base+'"]');
    if(key)key.classList.remove("active");
    if($("arp-latch").checked&&!arpLatchNotes.includes(info.note))
      arpLatchNotes.push(info.note);
  }
  function buildKeyboard(){
    const host=$("keyboard"),start=48,count=25,black=[1,3,6,8,10];
    const whiteCount=15; // C3–C5 inclusive: 15 whites and 10 accidentals
    let whitesBefore=0;
    for(let n=0;n<count;n++){
      const base=start+n,pc=base%12,octave=Math.floor(base/12)-1;
      const isBlack=black.includes(pc);
      const key=document.createElement("button");
      key.type="button";
      key.className="key"+(isBlack?" black":"");
      key.dataset.note=base;
      const label=noteNames[pc]+octave;
      key.textContent=label;
      key.setAttribute("aria-label",label);
      key.title=label;
      if(isBlack){
        // CSS .key.black translates itself -50%, so it must be placed at
        // the boundary between adjacent white keys. The original code
        // counted white keys incorrectly after the first octave.
        key.style.left=(whitesBefore/whiteCount*100)+"%";
      }else{
        key.style.flex="1";
        whitesBefore++;
      }
      key.addEventListener("pointerdown",e=>{
        if(e.button!==0&&e.pointerType==="mouse")return;
        e.preventDefault();
        if(pointerNotes.has(e.pointerId))return;
        const note=base+Number($("octave").value)*12;
        pointerNotes.set(e.pointerId,{note,base});
        try{key.setPointerCapture(e.pointerId)}catch(err){}
        key.classList.add("active");
        setHeld(note,true);
        // Building a performance chord must never steal the second
        // tap of a note. Clearing is done with the CLEAR control.
        if(!arpTapNotes.includes(note))arpTapNotes.push(note);
        startNote(note,.85,"ptr-"+e.pointerId);
      });
      host.append(key);
    }
  }
  window.addEventListener("pointerup",e=>releasePointer(e.pointerId));
  window.addEventListener("pointercancel",e=>releasePointer(e.pointerId));
  window.addEventListener("blur",()=>{stopSequence();stopAll()});

  // Every visible sound control belongs in a user patch. Older patches
  // (which stored only six sound values) still load with safe defaults.
  const patchControlIds=[
    "noise-level","sub-level","master-level","filter-type","cutoff",
    "resonance","drive","keytrack","attack","decay","sustain","release",
    "lfo-wave","lfo-rate","lfo-depth","lfo-destination",
    "chorus-on","chorus-rate","chorus-mix","reverb-on","reverb-size",
    "reverb-mix","portamento","mod-wheel"
  ];
  const patchDefaults=Object.fromEntries(patchControlIds.map(id=>{
    const el=$(id);return [id,el.type==="checkbox"?el.checked:el.value];
  }));
  function applyPreset(index){
    const isFactory=typeof index==="number";
    currentPreset=isFactory?(index%presets.length+presets.length)%presets.length:-1;
    const p=isFactory?presets[currentPreset]:index;
    if(!p||!Array.isArray(p.wave)||!Array.isArray(p.level)||!Array.isArray(p.oct))return;
    // Prevent "18 VOICES ACTIVE" saturation and layered notes while tapping
    // through patches: changing a patch stops the old performance entirely.
    // This is intentional and applies to user patches as well as factory ones.
    if(seqTimer!==null||voicePool.size||active.size){
      stopSequence();
      stopAll();
    }
    $("patch-name").textContent=p.name||"USER PATCH";
    document.querySelector(".screen-meta span:first-child").textContent=isFactory?
      "PATCH / A-"+String(currentPreset+1).padStart(3,"0"):"PATCH / USER";
    p.wave.forEach((w,i)=>{
      if(!oscSettings[i])return;
      oscSettings[i].wave=w;
      oscSettings[i].level=clamp(Number(p.level[i]||0),0,.8);
      oscSettings[i].oct=Number(p.oct[i]||0);
      const row=$("oscillators").children[i],mix=$("mixer-controls").children[i];
      row.querySelectorAll("select")[0].value=w;
      row.querySelectorAll("select")[1].value=String(oscSettings[i].oct);
      mix.querySelector("input").value=String(oscSettings[i].level);
      mix.querySelector("output").textContent=Math.round(oscSettings[i].level*100)+"%";
    });
    const controls=p.controls||{};
    patchControlIds.forEach(id=>{
      const el=$(id);
      const value=(p[id]!==undefined?p[id]:
        controls[id]!==undefined?controls[id]:patchDefaults[id]);
      if(el.type==="checkbox")el.checked=Boolean(value);
      else el.value=String(value);
      el.dispatchEvent(new Event("input",{bubbles:true}));
    });
    // Final controls can affect notes already sounding or their shared FX.
    updateLiveVoices();updateAuxVoices();
    if(chorusWet&&audio)chorusWet.gain.setTargetAtTime(
      $("chorus-on").checked?read("chorus-mix"):0,audio.currentTime,.02);
    if(reverbWet&&audio)reverbWet.gain.setTargetAtTime(
      $("reverb-on").checked?read("reverb-mix"):0,audio.currentTime,.02);
    if(convolver&&audio)convolver.buffer=makeImpulse(read("reverb-size"));
    $("matrix-dest").textContent=$("lfo-destination").selectedOptions[0].text;
  }
  function readSavedPatches(){
    try{
      const parsed=JSON.parse(localStorage.getItem("x4d5-patches")||"[]");
      return Array.isArray(parsed)?parsed:[];
    }catch(err){console.warn("Patch library could not be read",err);return [];}
  }
  function savePatch(){
    const name=prompt("Name this patch:",$("patch-name").textContent);
    if(!name||!name.trim())return;
    const p={name:name.trim().slice(0,80)};
    p.wave=oscSettings.map(x=>x.wave);
    p.level=oscSettings.map(x=>x.level);
    p.oct=oscSettings.map(x=>x.oct);
    p.controls=Object.fromEntries(patchControlIds.map(id=>{
      const el=$(id);return [id,el.type==="checkbox"?el.checked:el.value];
    }));
    // Legacy properties allow projects created with 0.1 to keep loading.
    ["cutoff","resonance","attack","decay","sustain","release"].forEach(
      id=>p[id]=read(id));
    const saved=readSavedPatches();saved.push(p);
    try{
      localStorage.setItem("x4d5-patches",JSON.stringify(saved));
      renderPatchList();$("patch-name").textContent=p.name;
      document.querySelector(".screen-meta span:first-child").textContent="PATCH / USER";
      currentPreset=-1;
    }catch(err){
      $("engine-state").textContent="COULD NOT SAVE PATCH";
      console.error(err);
    }
  }
  function renderPatchList(){
    const host=$("patch-list"),saved=readSavedPatches();host.replaceChildren();
    saved.forEach((p,i)=>{
      const b=document.createElement("button");
      b.className="patch-item";
      const name=document.createElement("strong"),slot=document.createElement("span");
      name.textContent=p.name||"UNTITLED";
      slot.textContent="USER "+String(i+1).padStart(2,"0");
      b.append(name,slot);
      b.addEventListener("click",()=>applyPreset(p));
      host.append(b);
    });
    if(!saved.length)host.textContent="NO USER PATCHES SAVED";
  }
  buildOscillators();buildKeyboard();
  bindRange("noise-level",v=>Math.round(v*100)+"%");bindRange("sub-level",v=>Math.round(v*100)+"%");
  bindRange("master-level",v=>Math.round(v*100)+"%");
  bindRange("cutoff",v=>Math.round(v)+" Hz");bindRange("resonance",v=>v.toFixed(1));bindRange("drive",v=>Math.round(v*100)+"%");bindRange("keytrack",v=>Math.round(v*100)+"%");
  bindRange("attack",v=>Math.round(v*1000)+" ms");bindRange("decay",v=>Math.round(v*1000)+" ms");bindRange("sustain",v=>Math.round(v*100)+"%");bindRange("release",v=>Math.round(v*1000)+" ms");
  bindRange("lfo-rate",v=>v.toFixed(2)+" Hz");bindRange("lfo-depth",v=>Math.round(v)+"%");
  bindRange("chorus-rate",v=>v.toFixed(1)+" Hz");bindRange("chorus-mix",v=>Math.round(v*100)+"%");bindRange("reverb-size",v=>v.toFixed(1)+" s");bindRange("reverb-mix",v=>Math.round(v*100)+"%");
  bindRange("portamento",v=>v===0?"OFF":v.toFixed(2)+" s");bindRange("mod-wheel",v=>Math.round(v*100)+"%");
  $("filter-type").addEventListener("change",updateLiveVoices);
  $("chorus-on").addEventListener("change",()=>{
    if(chorusWet&&audio)chorusWet.gain.setTargetAtTime(
      $("chorus-on").checked?read("chorus-mix"):0,audio.currentTime,.02);
  });
  $("reverb-on").addEventListener("change",()=>{
    if(reverbWet&&audio)reverbWet.gain.setTargetAtTime(
      $("reverb-on").checked?read("reverb-mix"):0,audio.currentTime,.02);
  });
  $("lfo-wave").addEventListener("change",updateLiveVoices);
  $("lfo-destination").addEventListener("change",()=>{
    $("matrix-dest").textContent=$("lfo-destination").selectedOptions[0].text;
    updateLiveVoices();
  });
  $("panic").addEventListener("click",()=>{stopSequence();stopAll();});
  $("prev-preset").addEventListener("click",()=>applyPreset(currentPreset-1));
  $("next-preset").addEventListener("click",()=>applyPreset(currentPreset+1));
  $("save-preset").addEventListener("click",savePatch);
  document.querySelectorAll(".mode-tab").forEach(tab=>tab.addEventListener("click",()=>{
    document.querySelectorAll(".mode-tab").forEach(t=>t.classList.toggle("active",t===tab));
    document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active",p.id===tab.dataset.target));
  }));
  window.addEventListener("keydown",e=>{
    if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||
       e.target?.matches?.("input,select,textarea"))return;
    const k=e.key.toLowerCase(),base=keyMap[k];
    if(base===undefined||computerHeld.has(k))return;
    e.preventDefault();
    const note=base+Number($("octave").value)*12;
    computerHeld.set(k,{note,base});
    setHeld(note,true);
    if(!arpTapNotes.includes(note))arpTapNotes.push(note);
    startNote(note,.8,"kbd-"+k);
    const key=$('.key[data-note="'+base+'"]');
    if(key)key.classList.add("active");
  });
  window.addEventListener("keyup",e=>{
    const k=e.key.toLowerCase(),info=computerHeld.get(k);
    if(!info)return;
    e.preventDefault();
    computerHeld.delete(k);
    stopNote("kbd-"+k);
    setHeld(info.note,false);
    if($("arp-latch").checked&&!arpLatchNotes.includes(info.note))
      arpLatchNotes.push(info.note);
    const key=$('.key[data-note="'+info.base+'"]');
    if(key)key.classList.remove("active");
  });
  $("seq-mode").addEventListener("change",()=>{
    stopSequence();seqStep=0;renderSteps();
  });
  $("seq-play").addEventListener("click",startSequence);
  $("seq-stop").addEventListener("click",stopSequence);
  $("seq-all").addEventListener("click",()=>{stepEnabled.fill(true);renderSteps();});
  $("seq-clear").addEventListener("click",()=>{
    stopSequence();stepEnabled.fill(false);
    arpTapNotes=[];arpLatchNotes=[];
    renderSteps();
  });
  $("arp-latch").addEventListener("change",e=>{
    if(!e.target.checked)arpLatchNotes=[];
    else arpLatchNotes=heldNotes.size?[...heldNotes.keys()]:[...arpTapNotes];
  });
  bindRange("seq-tempo",v=>Math.round(v)+" BPM");
  bindRange("seq-gate",v=>Math.round(v)+"%");
  bindRange("seq-swing",v=>Math.round(v)+"%");
  renderSteps();
  $("patch-name").textContent=presets[0].name;
  applyPreset(0);
  renderPatchList();
})();