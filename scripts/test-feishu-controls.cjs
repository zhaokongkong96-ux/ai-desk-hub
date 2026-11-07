/* Synthetic DOM/transport regressions. No real credentials or provider calls. */
const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync('feishu.js','utf8'),SERVICE='https://calendar.example.invalid',KEY='ai-desk-hub-feishu-session';
const flush=()=>new Promise(resolve=>setImmediate(resolve));
function fixture({connected=true,hidden=false,denyServiceSave=false}={}){
 const elements=new Map(),timers=new Map(),listeners=new Map(),docListeners=new Map(),requests=[],held=[],saved=new Map();let mode='ok',nextTimer=0,applied=0;
 if(connected)saved.set(KEY,JSON.stringify({token:'synthetic-only',service:SERVICE}));
 class Element{constructor(){this.disabled=false;this.value='';this.children=[];this.dataset={};this.attributes={};this.history=[];}set textContent(v){this.text=v;this.history.push(v);}get textContent(){return this.text||'';}setAttribute(k,v){this.attributes[k]=v;}addEventListener(k,fn){this[k]=fn;}replaceChildren(...v){this.children=v;}append(v){this.children.push(v);}}
 const $=id=>{if(!elements.has(id))elements.set(id,new Element());return elements.get(id);};
 const storage={getItem:k=>saved.get(k)||null,setItem(k,v){if(denyServiceSave&&k==='ai-desk-hub-feishu-service')throw Error('quota');saved.set(k,v);},removeItem:k=>saved.delete(k)};
 const window={addEventListener:(k,fn)=>listeners.set(k,fn),deskSetFeishuEvents:items=>{applied=items.length;},deskCalendar:{view:{}}};
 const document={hidden,createElement:()=>new Element(),getElementById:$,addEventListener:(k,fn)=>docListeners.set(k,fn)};
 const fetch=async(url,options={})=>{
  requests.push({url,method:options.method||'GET'});
  if(url==='./feishu-config.json')return {ok:true,json:async()=>({serviceURL:SERVICE})};
  if(mode==='hold')return new Promise(resolve=>held.push(resolve));
  if(mode==='fail')throw Error('network');
  return {ok:true,json:async()=>url.endsWith('/api/config')?{configured:true,redirectURI:SERVICE+'/callback'}:url.endsWith('/api/calendars')?{calendars:[{id:'fixture-calendar',name:'测试日历',primary:true}]}:{events:[{id:'fixture-event'}],syncedAt:Date.now()}};
 };
 const context={window,document,fetch,localStorage:storage,sessionStorage:{getItem:()=>null,removeItem(){},setItem(){}},URL,URLSearchParams,Date,JSON,AbortController,Option:class{constructor(text,value){this.text=text;this.value=value;}},setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id),setInterval:()=>0,clearInterval(){}};
 vm.runInNewContext(source,context);
 return {$,window,document,requests,timers,held,saved,listeners,get applied(){return applied;},set mode(value){mode=value;},async click(id){assert.equal($(id).disabled,false,id+' must be enabled');$(id).onclick();await flush();}};
}
test('connected controls show explicit connection; manual check acknowledges immediately',async()=>{
 const f=fixture();await flush();assert.equal(f.applied,1,f.$('feishuStatus').textContent);assert.equal(f.$('feishuSync').disabled,false);assert.equal(f.$('feishuCalendar').disabled,false);assert.equal(f.$('feishuConnect').textContent,'已连接飞书');assert.equal(f.$('feishuConnect').disabled,true);
 f.mode='hold';await f.click('feishuCheck');assert.match(f.$('feishuStatus').textContent,/正在检查/);assert.equal(f.$('feishuCheck').disabled,true);assert.equal(f.$('feishuCheck').textContent,'正在检查…');
 f.mode='ok';f.held.shift()({ok:true,json:async()=>({configured:true})});await flush();assert.equal(f.$('feishuCheck').disabled,false);assert.equal(f.$('feishuSync').disabled,false);assert.match(f.$('feishuStatus').textContent,/已同步 1 条/);
});
test('explicit check and sync work despite a stale hidden flag; automatic work stays gated',async()=>{
 const f=fixture({hidden:true});await flush();assert.equal(f.applied,0);const before=f.requests.length;await f.click('feishuSync');assert.ok(f.requests.length>before);assert.equal(f.applied,1,f.$('feishuStatus').textContent);assert.match(f.$('feishuStatus').textContent,/已同步/);
 await f.click('feishuCheck');assert.equal(f.$('feishuSync').disabled,false);assert.match(f.$('feishuStatus').textContent,/已同步/);
});
test('timeout restores controls and preserves existing authorization even if fetch ignores abort',async()=>{
 const f=fixture();await flush();f.mode='hold';await f.click('feishuCheck');const timer=[...f.timers.values()].find(x=>x.ms===20000);assert.ok(timer);timer.fn();await flush();assert.match(f.$('feishuStatus').textContent,/超过 20 秒/);assert.equal(f.$('feishuCheck').disabled,false);assert.equal(f.$('feishuSync').disabled,false);assert.ok(f.saved.has(KEY));
});
test('service-address storage failure does not leave otherwise valid controls disabled',async()=>{
 const f=fixture({denyServiceSave:true});await flush();assert.equal(f.applied,1,f.$('feishuStatus').textContent);assert.equal(f.$('feishuSync').disabled,false);assert.equal(f.$('feishuCalendar').disabled,false);assert.match(f.$('feishuStatus').textContent,/地址未能保存/);assert.ok(f.saved.has(KEY));
});
test('unconnected service check enables authorization, never fabricates a connection',async()=>{
 const f=fixture({connected:false});await flush();assert.equal(f.$('feishuConnect').disabled,false);assert.equal(f.$('feishuSync').disabled,true);assert.equal(f.$('feishuCalendar').disabled,true);assert.match(f.$('feishuConnectionState').textContent,/本机授权/);assert.equal(f.saved.has(KEY),false);
});
test('network failure remains actionable; reopening settings repairs derived disabled state',async()=>{
 const f=fixture();await flush();f.mode='fail';await f.click('feishuCheck');assert.match(f.$('feishuStatus').textContent,/连接失败/);assert.equal(f.$('feishuCheck').disabled,false);f.$('feishuSync').disabled=true;f.listeners.get('pageshow')();assert.equal(f.$('feishuSync').disabled,false);assert.ok(f.saved.has(KEY));
});
