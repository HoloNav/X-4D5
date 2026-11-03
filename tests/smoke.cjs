/* X-4D5 browser/audio regression suite — runs against GitHub checkout.
   Only asserts behavior that a headless browser can actually verify. */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright-core');

const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function main(){
  const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium','/snap/bin/chromium'].find(fs.existsSync);
  if(!chrome)throw Error('Chromium/Google Chrome not found in runner');
  const browser=await chromium.launch({headless:true,executablePath:chrome,
    args:['--no-sandbox','--disable-dev-shm-usage','--autoplay-policy=no-user-gesture-required']});
  fs.mkdirSync('screenshots',{recursive:true});
  try{
    for(const [name,w,h] of [['portrait',390,844],['landscape',844,390],['landscape-small',740,360]]){
      const page=await browser.newPage({viewport:{width:w,height:h},deviceScaleFactor:1,isMobile:true,hasTouch:true});
      const errors=[];
      page.on('pageerror',e=>errors.push('pageerror: '+e.stack));
      await page.addInitScript(()=>{
        // Record audio routing without changing the actual Web Audio DSP.
        const orig=AudioNode.prototype.connect;
        window.__audioLinks=[];
        AudioNode.prototype.connect=function(destination,...args){
          window.__audioLinks.push([this.constructor.name,destination?.constructor?.name]);
          return orig.call(this,destination,...args);
        };
      });
      await page.goto('file://'+path.resolve('index.html'),{waitUntil:'load'});
      assert.equal(await page.locator('#oscillators .osc-row').count(),3,name+' oscillator rows');
      assert.equal(await page.locator('#keyboard .key').count(),25,name+' keyboard count');
      assert.equal(await page.locator('#keyboard .key.black').count(),10,name+' black keys');
      assert.equal(await page.locator('#keyboard .key:not(.black)').count(),15,name+' white keys');
      assert.equal(await page.locator('#seq-steps .seq-step').count(),8,name+' arp steps');
      // Every accidental must fall between its correct adjacent white keys.
      for(const blackNote of [49,51,54,56,58,61,63,66,68,70]){
        const b=await page.locator('.key[data-note="'+blackNote+'"]').boundingBox();
        const lower=await page.locator('.key[data-note="'+(blackNote-1)+'"]').boundingBox();
        const higher=await page.locator('.key[data-note="'+(blackNote+1)+'"]').boundingBox();
        if(!b||!lower||!higher)throw Error('Keyboard note missing: '+blackNote);
        assert.ok(b.x>lower.x&&b.x<higher.x+4,
          name+' accidental '+blackNote+' should lie between neighboring whites');
      }

      const key=page.locator('.key[data-note="60"]');
      await key.scrollIntoViewIfNeeded();
      const box=await key.boundingBox();
      const x=box.x+box.width*.4,y=box.y+box.height*.8;
      async function press(){
        await page.mouse.move(x,y);await page.mouse.down();await sleep(65);
        assert.ok((await key.getAttribute('class')).includes('active'),'Key press should play');
        await page.mouse.up();await sleep(25);
      }
      await press();
      assert.match(await page.locator('#engine-state').innerText(),/AUDIO ENGINE READY/,'Audio engine must start');
      // The old code wrongly silenced any second tap of a note.
      await press();
      const links=await page.evaluate(()=>window.__audioLinks);
      assert.ok(links.some(([from,to])=>from==='GainNode'&&to==='DelayNode'),
        'Chorus delay must receive a real audio input');
      assert.ok(links.filter(([from,to])=>from==='BiquadFilterNode'&&to==='BiquadFilterNode').length>=1,
        '24 dB 2-stage filter should be routed in series');

      // Sound-changing controls must update during an active note without error.
      await page.mouse.down();await sleep(60);
      await page.evaluate(()=>{
        for(const [id,value] of [['cutoff','3700'],['resonance','3.2'],
          ['drive','.8'],['keytrack','.7'],['lfo-depth','60'],
          ['lfo-rate','9'],['mod-wheel','.65'],['noise-level','.3'],
          ['sub-level','.25'],['chorus-mix','.4'],['reverb-mix','.25']]){
          const el=document.getElementById(id);
          el.value=value;el.dispatchEvent(new Event('input',{bubbles:true}));
        }
        document.getElementById('filter-type').value='highpass';
        document.getElementById('filter-type').dispatchEvent(new Event('change'));
        document.getElementById('lfo-destination').value='amp';
        document.getElementById('lfo-destination').dispatchEvent(new Event('change'));
        document.getElementById('chorus-on').checked=true;
        document.getElementById('chorus-on').dispatchEvent(new Event('change'));
        document.getElementById('reverb-size').value='2.5';
        document.getElementById('reverb-size').dispatchEvent(new Event('change'));
      });
      await sleep(50);await page.mouse.up();
      assert.match(await page.locator('#matrix-dest').innerText(),/AMP/,'LFO amp modulation destination');
      assert.ok(Number(await page.locator('#voice-count').innerText().then(x=>x.match(/\d+/)?.[0]))>=1,
        'Active/releasing voice tails should be counted');
      assert.ok(!/JS ERROR/.test(await page.locator('#engine-state').innerText()),'No in-app audio error');

      // Saved patch must include every parameter and load back without duplicates.
      await page.locator('#save-preset').click({timeout:4000,force:true}).catch(()=>{});
      // Dismiss any unexpected modal from test automation; later use explicit
      // window.prompt override for deterministic, nonblocking patch naming.
      await page.evaluate(()=>{window.prompt=()=>'TEST PATCH';});
      await page.locator('#save-preset').click({force:true});
      let saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('x4d5-patches')||'[]'));
      assert.ok(saved.some(p=>p.name==='TEST PATCH'),'User patch must save');
      const p=saved.find(p=>p.name==='TEST PATCH');
      assert.equal(p.controls['drive'],'0.8');
      assert.equal(p.controls['filter-type'],'highpass');
      assert.equal(p.controls['chorus-on'],true);
      assert.equal(p.controls['lfo-destination'],'amp');
      await page.locator('#next-preset').click({force:true});
      // Reload via patch list only visible on perform tab.
      await page.locator('[data-target="perform-panel"]').click({force:true});
      await page.locator('#patch-list .patch-item').last().click({force:true});
      assert.equal(await page.locator('#drive').inputValue(),'0.8');
      assert.equal(await page.locator('#filter-type').inputValue(),'highpass');
      assert.equal(await page.locator('#chorus-on').isChecked(),true);
      assert.equal(await page.locator('#lfo-destination').inputValue(),'amp');
      assert.equal(await page.locator('#patch-list .patch-item').count(),saved.length,
        'Reloading a user patch must not duplicate the library');

      // Both arp and step modes should run and respond to stop/PANIC.
      // Select the mode first: changing modes deliberately clears the old
      // chord, so the performer enters a new root in the chosen mode.
      await page.locator('#seq-mode').selectOption('step');
      await page.locator('.key[data-note="60"]').click({force:true});
      assert.equal(await page.locator('#seq-steps .seq-step').count(),16);
      await page.locator('#seq-play').click({force:true});
      await sleep(350);
      assert.match(await page.locator('#seq-play').innerText(),/RUNNING/,'Step sequencer started');
      await page.locator('#panic').click({force:true});
      assert.match(await page.locator('#seq-position').innerText(),/STOPPED/,'PANIC stops sequencer');
      assert.match(await page.locator('#seq-play').innerText(),/PLAY/);
      await page.locator('#seq-mode').selectOption('arp');
      await page.locator('#arp-direction').selectOption('asplayed');
      await page.locator('#seq-play').click({force:true});
      await sleep(250);
      assert.match(await page.locator('#seq-play').innerText(),/RUNNING/,'Arpeggiator started');
      await page.locator('#seq-stop').click({force:true});
      assert.match(await page.locator('#seq-position').innerText(),/STOPPED/);
      assert.deepEqual(errors,[],name+' no browser JS errors');
      console.log(name,'PASS',JSON.stringify({audioLinks:links.length,savedControls:Object.keys(p.controls).length,
        keyboard:25,oscillators:3}));
      await page.screenshot({path:'screenshots/'+name+'-X4D5.png',fullPage:true});
      await page.close();
    }
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e.stack||e);process.exit(1)});
