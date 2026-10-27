const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
(async()=>{for(const engine of [chromium,webkit]){
 const browser=await engine.launch(engine===chromium?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true}:{headless:true}),context=await browser.newContext({serviceWorkers:'block',viewport:{width:1366,height:1024}}),page=await context.newPage();const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));
 const day=new Date();day.setHours(10,0,0,0);const event={id:'feishu-ui-test',title:'飞书测试日程（替身）',start:day.toISOString(),end:new Date(+day+3600000).toISOString(),editable:false,startEditable:false,durationEditable:false,allDay:false,extendedProps:{source:'feishu',category:'meeting',status:'normal',sample:false}};let connected=true,networkFail=false;
 await page.addInitScript(()=>{localStorage.setItem('ai-desk-hub-feishu-session',JSON.stringify({token:'mock-browser-session',service:'https://feishu.example',expiresAt:Date.now()+86400000}));});
 await page.route('**/feishu-config.json',r=>r.fulfill({json:{serviceURL:'https://feishu.example'}}));
 await page.route('https://feishu.example/**',async r=>{const req=r.request(),path=new URL(req.url()).pathname;requests.push({method:req.method(),path,body:req.postData()});
 if(path==='/api/config')return r.fulfill({json:{configured:true,redirectURI:'https://feishu.example/oauth/feishu/callback'}});
 if(!connected)return r.fulfill({status:401,json:{error:'not_connected'}});
 if(req.method()==='DELETE'){connected=false;return r.fulfill({json:{removed:true}});}
 if(path==='/api/calendars')return r.fulfill({json:{calendars:[{id:'primary',name:'测试主日历',primary:true}]}});
 if(networkFail)return r.fulfill({status:502,json:{error:'feishu_unavailable'}});
 return r.fulfill({json:{events:[event],syncedAt:Date.now()}});});
 await page.goto('http://127.0.0.1:8765/ai-desk-hub/');await page.waitForFunction(()=>document.getElementById('feishuStatus').textContent.includes('已同步 1 条'),{timeout:10000}).catch(async e=>{console.log('Feishu failure diagnostics:',await page.locator('#feishuStatus').innerText(),errors,requests.map(r=>r.path));throw e;});
 assert.equal(await page.evaluate(()=>deskCalendarEvents().filter(e=>e.extendedProps.source==='feishu').length),1);
 assert.ok(!(await page.evaluate(()=>localStorage.getItem('ai-desk-hub-calendar-v1'))).includes('飞书测试'));
 const agenda=page.locator('.timeline-agenda-item').filter({hasText:event.title});assert.equal(await agenda.count(),1);await agenda.click();assert.equal(await page.locator('#eventTitle').isDisabled(),true);assert.equal(await page.locator('#deleteEvent').isHidden(),true);await page.locator('#eventStatus').selectOption('important');await page.locator('#eventForm button[type=submit]').click();assert.equal(await page.evaluate(()=>deskCalendarEvents().find(e=>e.id==='feishu-ui-test').extendedProps.status),'important');
 assert.ok(!requests.some(r=>r.method!=='GET')); // local importance never writes to Feishu gateway
 await page.evaluate(()=>{const e=deskCalendar.getEventById('feishu-ui-test');if(e.startEditable!==false||e.durationEditable!==false)throw Error('Editable remote event');deskCalendar.changeView('timeGridWeek');});
 await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>deskCalendarEvents().filter(e=>e.extendedProps.source==='feishu').length),1);
 await page.evaluate(()=>document.getElementById('deskSettings').showModal());networkFail=true;await page.locator('#feishuSync').click();await page.waitForFunction(()=>document.getElementById('feishuStatus').textContent.includes('不是最新'));assert.equal(await page.evaluate(()=>deskCalendarEvents().filter(e=>e.extendedProps.source==='feishu').length),1);
 await page.setViewportSize({width:1024,height:1366});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.locator('#feishuDisconnect').click();await page.waitForFunction(()=>document.getElementById('feishuStatus').textContent.includes('已删除本服务'));assert.equal(await page.evaluate(()=>deskCalendarEvents().filter(e=>e.extendedProps.source==='feishu').length),0);assert.ok((await page.evaluate(()=>deskCalendarEvents().length))>0);assert.equal(await page.evaluate(()=>localStorage.getItem('ai-desk-hub-feishu-session')),null);assert.equal(await page.locator('#feishuCalendar').innerText(),'授权后选择');
 assert.deepEqual(errors,[]);console.log(engine.name()+': read-only merge, local marks, no remote persistence/writes, week view, stale retry, portrait and disconnect passed');await browser.close();
}})().catch(e=>{console.error(e);process.exit(1)});
