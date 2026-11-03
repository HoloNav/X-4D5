(() => {
  const $ = (id) => document.getElementById(id);
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
  const midiHz = (note) => 440 * Math.pow(2, (note - 69) / 12);
  const presets = [
    {name:"INITIAL PATCH",wave:["sawtooth","sawtooth","triangle"],level:[.55,.28,.2],oct:[0,0,-1],cutoff:900,resonance:.8,attack:.02,decay:.35,sustain:.72,release:.45},
    {name:"GLASS CURRENT",wave:["triangle","sine","sine"],level:[.3,.45,.18],oct:[0,1,2],cutoff:5200,resonance:.5,attack:.01,decay:1.8,sustain:.35,release:2.2},
    {name:"DARK MATTER",wave:["sawtooth","sawtooth","square"],level:[.55,.4,.25],oct:[0,0,-1],cutoff:420,resonance:2.4,attack:.04,decay:.8,sustain:.8,release:.65},
    {name:"SUB ORBIT",wave:["sine","triangle","sawtooth"],level:[.75,.2,.12],oct:[-1,0,1],cutoff:1200,resonance:.7,attack:.005,decay:.2,sustain:.9,release:.22},
    {name:"NEON STRINGS",wave:["sawtooth","sawtooth","triangle"],level:[.3,.32,.2],oct:[0,0,1],cutoff:3400,resonance:1.1,attack:.65,decay:1.2,sustain:.68,release:2.8}
  ];
  let audio = null, master = null, active = new Map(), currentPreset = 0, voices = 0;
  let chorusDelay, chorusLfo, chorusWet, dryGain, reverbWet, reverbDry, convolver;\n  let seqTimer=null, seqStep=0, seqDirection=1, heldNotes=new Map(), arpLatchNotes=[];\n  let stepEnabled=Array(16).fill(true), stepOffsets=[0,2,4,7,9,7,4,2,0,-3,-5,-3,0,2,4,7];
  const oscSettings = [0,1,2].map(i => ({wave:"sawtooth",level:[.55,.28,.2][i],oct:0}));
  const noteNames = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  const keyMap = {a:60,w:61,s:62,e:63,d:64,f:65,t:66,g:67,y:68,h:69,u:70,j:71,k:72};
  function initAudio(){
    if(audio) { if(audio.state==="suspended") audio.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if(!AC){ $("engine-state").textContent="AUDIO NOT SUPPORTED"; return; }
    audio = new AC();
    master = audio.createGain(); master.gain.value = Number($("master-level").value);
    const limiter = audio.createDynamicsCompressor();
    limiter.threshold.value=-8; limiter.knee.value=8; limiter.ratio.value=8; limiter.attack.value=.003; limiter.release.value=.18;
    dryGain=audio.createGain(); dryGain.gain.value=.9;
    chorusDelay=audio.createDelay(.05); chorusDelay.delayTime.value=.018;
    chorusLfo=audio.createOscillator(); chorusLfo.frequency.value=.8;
    const chorusDepth=audio.createGain(); chorusDepth.gain.value=.006;
    chorusLfo.connect(chorusDepth); chorusDepth.connect(chorusDelay.delayTime); chorusLfo.start();
    chorusWet=audio.createGain(); chorusWet.gain.value=0;
    chorusDelay.connect(chorusWet);
    convolver=audio.createConvolver(); convolver.buffer=makeImpulse(1.8);
    reverbWet=audio.createGain(); reverbWet.gain.value=.18;
    reverbDry=audio.createGain(); reverbDry.gain.value=.82;
    const fxSum=audio.createGain();
    dryGain.connect(fxSum); chorusWet.connect(fxSum); reverbWet.connect(fxSum);
    // Reverb receives the shared dry signal, then returns to the master bus.
    dryGain.connect(convolver); convolver.connect(reverbWet);
    fxSum.connect(limiter); limiter.connect(master); master.connect(audio.destination);
    $("engine-state").textContent="AUDIO ENGINE READY";
  }
  function makeImpulse(seconds){
    const rate=audio.sampleRate, length=Math.floor(rate*seconds), buffer=audio.createBuffer(2,length,rate);
    for(let c=0;c<2;c++){const data=buffer.getChannelData(c);for(let i=0;i<length;i++)data[i]=(Math.random()*2-1)*Math.pow(1-i/length,2.8);}
    return buffer;
  }
  function read(id){return Number($(id).value);}
  function updateVoices(){ $("voice-count").textContent=voices+" VOICES ACTIVE"; }
  function startNote(note, velocity=0.82, token=note){
    initAudio(); if(!audio || active.has(token)) return;
    if(active.size>=18){const oldest=active.keys().next().value;stopNote(oldest);}
    const now=audio.currentTime, filter=audio.createBiquadFilter();
    filter.type=$("filter-type").value; filter.frequency.value=read("cutoff"); filter.Q.value=read("resonance");
    const amp=audio.createGain(), drive=read("drive");
    let input=audio.createGain(); input.gain.value=drive>0?1+drive*12:1;
    input.connect(filter); filter.connect(amp); amp.connect(dryGain);
    const oscs=[];
    oscSettings.forEach((setting,i)=>{
      const osc=audio.createOscillator(), gain=audio.createGain();
      osc.type=setting.wave; osc.frequency.value=midiHz(note+setting.oct*12);
      gain.gain.value=setting.level;
      osc.connect(gain); gain.connect(input); osc.start(now);
      oscs.push({osc,gain});
    });
    const noiseLevel=read("noise-level");
    if(noiseLevel>0){const n=audio.createBufferSource(),b=audio.createBuffer(1,audio.sampleRate,audio.sampleRate),d=b.getChannelData(0);for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;n.buffer=b;n.loop=true;const g=audio.createGain();g.gain.value=noiseLevel;n.connect(g);g.connect(input);n.start();oscs.push({osc:n,gain:g});}
    const subLevel=read("sub-level");
    if(subLevel>0){const sub=audio.createOscillator(),g=audio.createGain();sub.type="sine";sub.frequency.value=midiHz(note-12);g.gain.value=subLevel;sub.connect(g);g.connect(input);sub.start();oscs.push({osc:sub,gain:g});}
    const attack=read("attack"),decay=read("decay"),sustain=read("sustain");
    amp.gain.setValueAtTime(.0001,now);amp.gain.linearRampToValueAtTime(Math.max(.0001,velocity),now+attack);amp.gain.linearRampToValueAtTime(Math.max(.0001,velocity*sustain),now+attack+decay);
    // Optional pitch vibrato, routed to all pitched oscillators.
    const lfo=audio.createOscillator(),lfoGain=audio.createGain();
    lfo.type=$("lfo-wave").value;lfo.frequency.value=read("lfo-rate");
    const depth=read("lfo-depth")/100;
    const dest=$("lfo-destination").value;
    if(dest==="pitch"){lfoGain.gain.value=depth*18;oscs.filter(x=>x.osc.frequency).forEach(x=>lfo.connect(lfoGain).connect(x.osc.detune));}
    else if(dest==="cutoff"){lfoGain.gain.value=depth*3000;lfo.connect(lfoGain).connect(filter.frequency);}
    else {lfoGain.gain.value=depth*.45;oscs.slice(0,3).forEach(x=>lfo.connect(lfoGain).connect(x.gain.gain));}
    lfo.start(now);
    active.set(token,{amp,oscs,filter,lfo,lfoGain});
    voices=active.size;updateVoices();
  }
  function stopNote(token){
    const v=active.get(token); if(!v||!audio)return;
    const now=audio.currentTime, release=read("release");
    v.amp.gain.cancelScheduledValues(now);v.amp.gain.setTargetAtTime(.0001,now,Math.max(.01,release/4));
    v.oscs.forEach(o=>{try{o.osc.stop(now+release+.08);}catch(e){}});
    try{v.lfo.stop(now+release+.08);}catch(e){}
    active.delete(token);voices=active.size;updateVoices();
  }
  function stopAll(){[...active.keys()].forEach(stopNote);}
  function bindRange(id, formatter=(v)=>v){
    const el=$(id),out=el.parentElement.querySelector("output");
    const update=()=>{if(out)out.textContent=formatter(Number(el.value));};
    el.addEventListener("input",()=>{update();if(id==="master-level"&&master)master.gain.setTargetAtTime(read(id),audio.currentTime,.02);if(id==="chorus-rate"&&chorusLfo)chorusLfo.frequency.value=read(id);if(id==="chorus-mix"&&chorusWet)chorusWet.gain.value=$("chorus-on").checked?read(id):0;if(id==="reverb-mix"&&reverbWet)reverbWet.gain.value=$("reverb-on").checked?read(id):0;if(id==="reverb-size"&&convolver&&audio)convolver.buffer=makeImpulse(read(id));if(id==="lfo-depth")$("matrix-amount").textContent=read(id)+"%";if(id==="lfo-destination")$("matrix-dest").textContent=$("lfo-destination").selectedOptions[0].text;});
    update();
  }

  function sequenceNotes(){
    const mode=$("seq-mode").value;
    if(mode==="step"){
      const root=heldNotes.size?[...heldNotes.keys()].sort((a,b)=>a-b)[0]:60;
      return [root+stepOffsets[seqStep%16]];
    }
    const notes=arpLatchNotes.length?arpLatchNotes:[...heldNotes.keys()].sort((a,b)=>a-b);
    if(!notes.length)return [];
    const expanded=[];const oct=Number($("arp-octaves").value);
    for(let o=0;o<oct;o++)notes.forEach(n=>expanded.push(n+o*12));
    const dir=$("arp-direction").value;
    if(dir==="down")expanded.reverse();
    if(dir==="updown"&&expanded.length>2){const up=expanded.slice(0,-1),down=expanded.slice(1).reverse();return up.concat(down);}
    if(dir==="random"){for(let i=expanded.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[expanded[i],expanded[j]]=[expanded[j],expanded[i]];}}
    return expanded;
  }
  function renderSteps(){
    const host=$("seq-steps");host.innerHTML="";
    const count=$("seq-mode").value==="step"?16:8;
    for(let i=0;i<count;i++){
      const b=document.createElement("button");b.className="seq-step"+(stepEnabled[i]?" enabled":"");b.textContent=String(i+1).padStart(2,"0");b.dataset.step=i;
      b.addEventListener("click",()=>{stepEnabled[i]=!stepEnabled[i];b.classList.toggle("enabled",stepEnabled[i]);});
      host.append(b);
    }
    $("arp-octave-wrap").style.display=$("seq-mode").value==="arp"?"flex":"none";
    $("arp-direction").disabled=$("seq-mode").value!=="arp";
    $("seq-help").textContent=$("seq-mode").value==="arp"?"Hold a chord, then PLAY. Toggle steps for rhythmic rests.":"Hold a root note, then PLAY. 16 pitch steps form a repeating pattern.";
  }
  function stopSequence(){
    if(seqTimer){clearTimeout(seqTimer);seqTimer=null;}
    for(const token of [...active.keys()])if(String(token).startsWith("seq-"))stopNote(token);
    document.querySelectorAll(".seq-step").forEach(b=>b.classList.remove("playing"));
    $("seq-position").textContent="STOPPED";
    $("seq-play").textContent="▶ PLAY";
  }
  function sequenceTick(){
    if(!seqTimer)return;
    const mode=$("seq-mode").value,count=mode==="step"?16:8;
    const step=seqStep%count,buttons=[...document.querySelectorAll(".seq-step")];
    buttons.forEach(b=>b.classList.toggle("playing",Number(b.dataset.step)===step));
    $("seq-position").textContent="STEP "+String(step+1).padStart(2,"0")+" / "+count;
    const notes=sequenceNotes();
    if(stepEnabled[step]&&notes.length){
      const note=notes[mode==="step"?0:step%notes.length];
      const token="seq-"+step;
      startNote(note,.82,token);
      const beat=60/Number($("seq-tempo").value),swing=Number($("seq-swing").value)/100;
      const gate=Number($("seq-gate").value)/100;
      const duration=beat*(step%2===0?1+swing:1-swing);
      setTimeout(()=>stopNote(token),Math.max(30,duration*gate*1000));
    }
    const beat=60/Number($("seq-tempo").value),swing=Number($("seq-swing").value)/100;
    const duration=beat*(step%2===0?1+swing:1-swing);
    seqStep=(seqStep+1)%count;
    seqTimer=setTimeout(sequenceTick,duration*1000);
  }
  function startSequence(){
    if(seqTimer)return;
    if($("seq-mode").value==="arp"&&!heldNotes.size&&!arpLatchNotes.length){$("seq-position").textContent="HOLD NOTES FIRST";return;}
    if($("seq-mode").value==="step"&&!heldNotes.size){$("seq-position").textContent="HOLD A ROOT NOTE";return;}
    seqStep=0;$("seq-play").textContent="Ⅱ RUNNING";seqTimer=true;sequenceTick();
  }
\n  function buildOscillators(){
    const host=$("oscillators"),mix=$("mixer-controls");
    const waves=[["sawtooth","SAW"],["square","SQUARE"],["triangle","TRIANGLE"],["sine","SINE"]];
    for(let i=0;i<3;i++){
      const row=document.createElement("div");row.className="osc-row";
      row.innerHTML='<div class="osc-id">OSC '+(i+1)+'</div><div class="osc-fields"><select aria-label="Oscillator '+(i+1)+' waveform">'+waves.map(w=>'<option value="'+w[0]+'">'+w[1]+'</option>').join("")+'</select><select aria-label="Oscillator '+(i+1)+' octave"><option value="-2">-2 OCT</option><option value="-1">-1 OCT</option><option value="0" selected>0 OCT</option><option value="1">+1 OCT</option><option value="2">+2 OCT</option></select></div>';
      const selects=row.querySelectorAll("select");selects[0].value=oscSettings[i].wave;selects[1].value=oscSettings[i].oct;
      selects[0].addEventListener("change",()=>oscSettings[i].wave=selects[0].value);
      selects[1].addEventListener("change",()=>oscSettings[i].oct=Number(selects[1].value));
      host.append(row);
      const label=document.createElement("label");label.className="control";label.innerHTML='<span>OSC '+(i+1)+' LEVEL</span><input type="range" min="0" max="0.8" step="0.01" value="'+oscSettings[i].level+'"><output></output>';
      const range=label.querySelector("input"),out=label.querySelector("output");out.textContent=Math.round(oscSettings[i].level*100)+"%";
      range.addEventListener("input",()=>{oscSettings[i].level=Number(range.value);out.textContent=Math.round(oscSettings[i].level*100)+"%";});
      mix.append(label);
    }
  }
  function buildKeyboard(){
    const host=$("keyboard"),start=48,count=25,black=[1,3,6,8,10];
    for(let n=0;n<count;n++){
      const note=start+n,pc=note%12,key=document.createElement("button");key.className="key"+(black.includes(pc)?" black":"");key.dataset.note=note;
      key.textContent=pc===0?"C"+(Math.floor(note/12)-1):"";
      if(black.includes(pc)){const whiteBefore=n-black.filter(b=>b<pc).length;key.style.left=(whiteBefore*100/15+100/30)+"%";}
      else key.style.flex="1";
      key.addEventListener("pointerdown",e=>{e.preventDefault();key.setPointerCapture(e.pointerId);key.classList.add("active");heldNotes.set(note,true);startNote(note,.85,"ptr-"+e.pointerId);});
      const release=()=>{key.classList.remove("active");stopNote("ptr-"+lastPointer);};
      let lastPointer;
      key.addEventListener("pointerdown",e=>lastPointer=e.pointerId);
      key.addEventListener("pointerup",e=>{key.classList.remove("active");stopNote("ptr-"+e.pointerId);heldNotes.delete(note);if($("arp-latch").checked)arpLatchNotes=[...new Set([...arpLatchNotes,note])];});
      key.addEventListener("pointercancel",e=>{key.classList.remove("active");stopNote("ptr-"+e.pointerId);heldNotes.delete(note);});
      host.append(key);
    }
  }
  function applyPreset(index){
    currentPreset=(index+presets.length)%presets.length;const p=presets[currentPreset];
    $("patch-name").textContent=p.name;document.querySelector(".screen-meta span:first-child").textContent="PATCH / A-"+String(currentPreset+1).padStart(3,"0");
    p.wave.forEach((w,i)=>{oscSettings[i].wave=w;oscSettings[i].level=p.level[i];oscSettings[i].oct=p.oct[i];const row=$("oscillators").children[i];row.querySelectorAll("select")[0].value=w;row.querySelectorAll("select")[1].value=p.oct[i];const mix=$("mixer-controls").children[i];mix.querySelector("input").value=p.level[i];mix.querySelector("output").textContent=Math.round(p.level[i]*100)+"%";});
    ["cutoff","resonance","attack","decay","sustain","release"].forEach(id=>{$(id).value=p[id];$(id).dispatchEvent(new Event("input"));});
  }
  function savePatch(){
    const p={name:prompt("Name this patch:",$("patch-name").textContent)};if(!p.name)return;
    p.wave=oscSettings.map(x=>x.wave);p.level=oscSettings.map(x=>x.level);p.oct=oscSettings.map(x=>x.oct);
    ["cutoff","resonance","attack","decay","sustain","release"].forEach(id=>p[id]=read(id));
    const saved=JSON.parse(localStorage.getItem("x4d5-patches")||"[]");saved.push(p);localStorage.setItem("x4d5-patches",JSON.stringify(saved));renderPatchList();$("patch-name").textContent=p.name;
  }
  function renderPatchList(){
    const host=$("patch-list"),saved=JSON.parse(localStorage.getItem("x4d5-patches")||"[]");host.innerHTML="";
    saved.forEach((p,i)=>{const b=document.createElement("button");b.className="patch-item";b.innerHTML='<strong></strong><span>USER '+String(i+1).padStart(2,"0")+'</span>';b.querySelector("strong").textContent=p.name;b.addEventListener("click",()=>{presets.push(p);applyPreset(presets.length-1);});host.append(b);});
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
  $("filter-type").addEventListener("change",()=>{});$("chorus-on").addEventListener("change",()=>{if(chorusWet)chorusWet.gain.value=$("chorus-on").checked?read("chorus-mix"):0;});
  $("reverb-on").addEventListener("change",()=>{if(reverbWet)reverbWet.gain.value=$("reverb-on").checked?read("reverb-mix"):0;});
  $("lfo-destination").addEventListener("change",()=>{$("matrix-dest").textContent=$("lfo-destination").selectedOptions[0].text;});
  $("panic").addEventListener("click",stopAll);$("prev-preset").addEventListener("click",()=>applyPreset(currentPreset-1));$("next-preset").addEventListener("click",()=>applyPreset(currentPreset+1));$("save-preset").addEventListener("click",savePatch);
  document.querySelectorAll(".mode-tab").forEach(tab=>tab.addEventListener("click",()=>{document.querySelectorAll(".mode-tab").forEach(t=>t.classList.toggle("active",t===tab));document.querySelectorAll(".panel").forEach(p=>p.classList.toggle("active",p.id===tab.dataset.target));}));
  window.addEventListener("keydown",e=>{if(e.repeat||e.ctrlKey||e.metaKey||e.altKey||e.target.matches("input,select,textarea"))return;const note=keyMap[e.key.toLowerCase()];if(note!==undefined){const shifted=note+Number($("octave").value)*12;heldNotes.set(shifted,true);startNote(shifted,.8,"kbd-"+e.key.toLowerCase());const key=$(' .key[data-note="'+shifted+'"]'.trim());if(key)key.classList.add("active");}});
  window.addEventListener("keyup",e=>{const k="kbd-"+e.key.toLowerCase();stopNote(k);const held=keyMap[e.key.toLowerCase()];if(held!==undefined){const shifted=held+Number($("octave").value)*12;heldNotes.delete(shifted);if($("arp-latch").checked)arpLatchNotes=[...new Set([...arpLatchNotes,shifted])];}const note=keyMap[e.key.toLowerCase()];if(note!==undefined){const key=$('.key[data-note="'+(note+Number($("octave").value)*12)+'"]');if(key)key.classList.remove("active");}});
  $("seq-mode").addEventListener("change",()=>{stopSequence();seqStep=0;renderSteps();});\n  $("seq-play").addEventListener("click",startSequence);$("seq-stop").addEventListener("click",stopSequence);\n  $("seq-all").addEventListener("click",()=>{stepEnabled.fill(true);renderSteps();});\n  $("seq-clear").addEventListener("click",()=>{stepEnabled.fill(false);arpLatchNotes=[];renderSteps();});\n  $("arp-latch").addEventListener("change",e=>{if(!e.target.checked)arpLatchNotes=[];else if(heldNotes.size)arpLatchNotes=[...heldNotes.keys()];});\n  bindRange("seq-tempo",v=>Math.round(v)+" BPM");bindRange("seq-gate",v=>Math.round(v)+"%");bindRange("seq-swing",v=>Math.round(v)+"%");\n  renderSteps();$("patch-name").textContent=presets[0].name;applyPreset(0);renderPatchList();
})();