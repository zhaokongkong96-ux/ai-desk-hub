const {chromium,webkit}=require('playwright');
const assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}:{headless:true});const page=await browser.newPage({viewport:{width:1366,height:1024},serviceWorkers:'block'});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
 const now=Date.now();if(!localStorage.getItem('ai-desk-hub-attention-v1'))localStorage.setItem('ai-desk-hub-attention-v1',JSON.stringify({auto:true,start:'00:00',end:'00:00',cooldown:120,voice:false,lastGreeting:0,seen:[]}));
 window.speechLog=[];Object.defineProperty(window,'speechSynthesis',{value:{cancel(){},getVoices(){return []},speak(u){window.speechLog.push(u.text);u.onstart?.();u.onend?.();}}});window.SpeechSynthesisUtterance=function(text){this.text=text;};
 });
 // This suite exercises greetings, not real-account Feishu connectivity.
 await page.route('**/feishu-config.json',r=>r.fulfill({json:{serviceURL:''}}));
 await page.route('**/push-config.json',r=>r.fulfill({json:{serviceURL:'https://notification.example'}}));
 await page.route('https://notification.example/**',r=>r.fulfill({json:{publicKey:'B'+'a'.repeat(86)}}));
 await page.goto('http://127.0.0.1:8765/ai-desk-hub/');await page.waitForTimeout(2200);assert.ok(await page.locator('#attentionBanner').isVisible());
 const initial=await page.evaluate(()=>JSON.parse(localStorage.getItem('ai-desk-hub-attention-v1')).lastGreeting);assert.ok(initial>0);
 await page.reload();await page.waitForTimeout(2000);assert.equal(await page.locator('#attentionBanner').isVisible(),false);
 // Open settings and check the visible controls.
 await page.evaluate(()=>document.getElementById('deskSettings').showModal());
 await page.locator('#voiceTest').click();assert.equal(await page.evaluate(()=>speechLog.length),1);
 await page.locator('#voiceStop').click();await page.locator('#autoGreeting').uncheck();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('ai-desk-hub-attention-v1')).auto),false);
 await page.evaluate(()=>{const r=JSON.parse(localStorage.getItem('ai-desk-hub-return-v04')||'{}');r.quiet=true;localStorage.setItem('ai-desk-hub-return-v04',JSON.stringify(r));});await page.locator('#voiceTest').click();assert.equal(await page.evaluate(()=>speechLog.length),1);assert.match(await page.locator('#voiceStatus').innerText(),/免打扰/);
 await page.screenshot({path:root+'/artifacts/attention-settings-'+engine.name()+'.png'});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.setViewportSize({width:1024,height:1366});await page.waitForFunction(()=>document.documentElement.scrollWidth<=innerWidth);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
 assert.deepEqual(errors,[]);console.log(engine.name()+': greeting, persisted controls, opt-in stub voice, quiet mode, landscape/portrait passed');await browser.close();
}})().catch(e=>{console.error(e);process.exit(1)});
