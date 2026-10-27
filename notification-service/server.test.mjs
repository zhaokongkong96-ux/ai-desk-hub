import {test} from 'node:test';
import assert from 'node:assert/strict';
import webpush from 'web-push';
import {createService,validSubscription} from './server.mjs';
const origin='https://zhaokongkong96-ux.github.io',keys=webpush.generateVAPIDKeys();
const env={VAPID_PUBLIC_KEY:keys.publicKey,VAPID_PRIVATE_KEY:keys.privateKey,PAIRING_CODE:'test-only-pairing-code',ALLOWED_ORIGINS:origin};
const subscription={endpoint:'https://web.push.apple.com/test',keys:{p256dh:'a'.repeat(87),auth:'b'.repeat(22)}};
test('push endpoint restrictions prevent arbitrary server requests',()=>{assert.ok(validSubscription(subscription));for(const endpoint of ['http://web.push.apple.com/x','https://127.0.0.1/x','https://web.push.apple.com.evil.org/x','https://user:password@web.push.apple.com/x'])assert.equal(validSubscription({...subscription,endpoint}),false);});
test('pairing, authentication, private schedule, pause, cancellation, deduplication and expired devices',async()=>{
 let stamp=Date.now(),sent=[],failure;
 const app=createService({env,dbPath:':memory:',now:()=>stamp,send:async(sub,payload)=>{if(failure)throw {statusCode:failure};sent.push(JSON.parse(payload));}});
 await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));const url='http://127.0.0.1:'+app.server.address().port;
 const call=async(path,method='GET',data,token,source=origin)=>{const r=await fetch(url+path,{method,headers:{Origin:source,...(data?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},...(data?{body:JSON.stringify(data)}:{})});return {status:r.status,body:await r.json()};};
 try{
 assert.equal((await call('/api/push/public-key','GET',null,null,'https://evil.test')).status,403);
 assert.equal((await call('/api/push/devices','POST',{pairingCode:'wrong',subscription})).status,401);
 const pair=await call('/api/push/devices','POST',{pairingCode:env.PAIRING_CODE,subscription});assert.equal(pair.status,201);const {id,token}=pair.body,route='/api/push/devices/'+id;
 assert.equal((await call(route)).status,401);
 const event={key:'a'.repeat(64),at:stamp+1000,expiresAt:stamp+601000};
 assert.equal((await call(route+'/reminders','PUT',{events:[event],paused:true},token)).status,200);
 stamp+=1001;await app.tick();assert.equal(sent.length,0);
 await call(route+'/reminders','PUT',{events:[event],paused:false},token);await app.tick();await app.tick();assert.equal(sent.length,1);assert.deepEqual(Object.keys(sent[0]).sort(),['expiresAt','key','type']);
 await call(route+'/reminders','PUT',{events:[event],paused:false},token);await app.tick();assert.equal(sent.length,1);
 const second={...event,key:'b'.repeat(64)};await call(route+'/reminders','PUT',{events:[second],paused:false},token);await call(route+'/reminders','PUT',{events:[],paused:false},token);await app.tick();assert.equal(sent.length,1);
 await call(route+'/reminders','PUT',{events:[second],paused:false},token);failure=410;await app.tick();assert.equal((await call(route,'GET',null,token)).status,401);
 assert.equal(app.db.prepare('SELECT count(*) n FROM reminders').get().n,0);
 }finally{app.close();}
});
test('jobs survive process restarts and revoke removes persisted subscription',async()=>{
 const {mkdtempSync,rmSync}=await import('node:fs'),{tmpdir}=await import('node:os'),{join}=await import('node:path');const dir=mkdtempSync(join(tmpdir(),'desk-push-test-')),dbPath=join(dir,'test.sqlite');let app=createService({env,dbPath});
 try{app.db.prepare('INSERT INTO devices(id,token_hash,endpoint,subscription,updated_at) VALUES(?,?,?,?,?)').run('x','hash',subscription.endpoint,JSON.stringify(subscription),Date.now());app.db.prepare('INSERT INTO reminders(device_id,event_key,at,expires) VALUES(?,?,?,?)').run('x','key',Date.now()+1000,Date.now()+600000);app.close();app=createService({env,dbPath});assert.equal(app.db.prepare('SELECT count(*) n FROM reminders').get().n,1);app.db.prepare('DELETE FROM devices').run();assert.equal(app.db.prepare('SELECT count(*) n FROM reminders').get().n,0);}finally{app.close();rmSync(dir,{recursive:true,force:true});}
});
test('service worker always displays generic push and notification click focuses the app',async()=>{
 const vm=await import('node:vm'),fs=await import('node:fs/promises');const handlers={},shown=[],messages=[];let focused=false;
 const scope='https://zhaokongkong96-ux.github.io/ai-desk-hub/';const self={registration:{scope,showNotification:async(title,data)=>shown.push({title,...data})},addEventListener:(name,fn)=>handlers[name]=fn,clients:{matchAll:async()=>[{url:scope,focus:async()=>{focused=true;},postMessage:m=>messages.push(m)}]}};
 vm.runInNewContext(await fs.readFile(new URL('../sw.js',import.meta.url),'utf8'),{self,URL,Date});let pending;
 handlers.push({data:{json:()=>({type:'reminder',key:'anonymous-key',expiresAt:Date.now()+60000,title:'PRIVATE'})},waitUntil:p=>pending=p});await pending;assert.equal(shown.length,1);assert.ok(!JSON.stringify(shown).includes('PRIVATE'));assert.equal(messages[0].kind,'reminder');
 handlers.notificationclick({notification:{close(){}},waitUntil:p=>pending=p});await pending;assert.equal(focused,true);assert.equal(messages.at(-1).type,'desk-open');
});
