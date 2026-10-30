const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
(async()=>{for(const engine of [chromium,webkit]){
const browser=await engine.launch(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}:{headless:true});
const page=await browser.newPage({serviceWorkers:'block',viewport:{width:1366,height:1024}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
const now=new Date().toISOString();let fail=false;
const data={schemaVersion:1,generatedAt:now,attemptedAt:now,history:[],items:[{name:'example/momentum',url:'https://github.com/example/momentum',description:'用于验证展示状态的合成项目',stars:120,label:'今日新上榜',shownDays7:0,growth:{count:35,hours:24,source:'GitHub Trending 今日新增',url:'https://github.com/trending?since=daily'},activeThreads:4,discussionURL:'https://github.com/example/momentum/issues'}]};
await page.route('**/feishu-config.json',r=>r.fulfill({json:{serviceURL:''}}));
await page.route('**/push-config.json',r=>r.fulfill({json:{serviceURL:''}}));
await page.route('**/hotlist-feed.json*',r=>fail?r.abort():r.fulfill({json:data}));
await page.goto('http://127.0.0.1:8772/ai-desk-hub/');await page.locator('[data-page=radar]').click();await page.waitForFunction(()=>document.querySelectorAll('.hotlist-card').length===1);
assert.match(await page.locator('#hotlistGrid').innerText(),/35 Star \/ 24 小时/);assert.match(await page.locator('#hotlistStatus').innerText(),/采集于/);assert.equal(await page.locator('.hotlist-card h3 a').getAttribute('href'),'https://github.com/example/momentum');
data.generatedAt='2026-01-01T08:17:00+08:00';data.refreshError=true;await page.locator('#hotlistRefresh').click();await page.waitForFunction(()=>document.getElementById('hotlistStatus').textContent.includes('历史快照'));
assert.match(await page.locator('#hotlistGrid').innerText(),/上次标注：今日新上榜/);
fail=true;await page.locator('#hotlistRefresh').click();await page.waitForFunction(()=>!document.getElementById('hotlistRefresh').disabled);assert.match(await page.locator('#hotlistStatus').innerText(),/采集失败/);assert.equal(await page.locator('.hotlist-card').count(),1);
fail=false;data.generatedAt=now;delete data.refreshError;data.partial=true;await page.locator('#hotlistRefresh').click();await page.waitForFunction(()=>document.getElementById('hotlistStatus').textContent.includes('部分来源'));
for(const size of [{width:1366,height:1024},{width:1024,height:768},{width:768,height:1024},{width:390,height:844}]){await page.setViewportSize(size);await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,JSON.stringify(size));}
await page.setViewportSize({width:1366,height:1024});await page.locator('.daily-hotlist').screenshot({path:'artifacts/hotlist-'+engine.name()+'.png'});
assert.deepEqual(errors,[]);console.log(engine.name()+': momentum evidence, repository links, stale snapshot, outage fallback, partial status and four widths passed (synthetic feed).');await browser.close();
}})().catch(e=>{console.error(e);process.exit(1)});
