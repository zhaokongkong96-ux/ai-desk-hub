/* Dedicated read-only Feishu OAuth gateway. No notification-project data or credentials. */
import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomBytes,createHash,createCipheriv,createDecipheriv,timingSafeEqual} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
process.umask(0o077);
const API='https://open.feishu.cn/open-apis',AUTHORIZE='https://accounts.feishu.cn/open-apis/authen/v1/authorize';
export const SCOPES='calendar:calendar:readonly offline_access';
const sha=value=>createHash('sha256').update(String(value)).digest('hex');
const random=()=>randomBytes(32).toString('base64url');
const equal=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));
class Failure extends Error{constructor(status,code){super(code);this.status=status;this.code=code;}}
function fail(status,code){throw new Failure(status,code);}
export function normalizeEvent(e,calendarID){
 if(!e?.event_id||e.status==='cancelled')return null;
 const allDay=!!e.start_time?.date;
 const parse=t=>{if(t?.date&&/^\d{4}-\d{2}-\d{2}$/.test(t.date))return Number.isFinite(Date.parse(t.date))?t.date:null;const value=Number(t?.timestamp)*1000;if(!/^\d+$/.test(t?.timestamp||'')||!Number.isFinite(value)||Math.abs(value)>8640000000000000)return null;return new Date(value).toISOString();};
 const start=parse(e.start_time),end=parse(e.end_time);if(!start||!end||!Number.isFinite(Date.parse(start))||Date.parse(end)<=Date.parse(start))return null;
 // A calendar API can expose busy-only events. Never infer private titles.
 return {id:'feishu-'+sha(calendarID+'\0'+e.event_id+'\0'+start),title:typeof e.summary==='string'&&e.summary.trim()?e.summary.slice(0,200):'忙碌（飞书）',start,end,allDay,editable:false,startEditable:false,durationEditable:false,extendedProps:{source:'feishu',category:'meeting',sample:false,status:'normal'}};
}
export function createService({env=process.env,dbPath,fetcher=fetch,now=Date.now}={}){
 let origin;try{origin=new URL(env.PUBLIC_URL).origin;}catch{}
 const key=/^[a-fA-F0-9]{64}$/.test(env.TOKEN_ENCRYPTION_KEY||'')?Buffer.from(env.TOKEN_ENCRYPTION_KEY,'hex'):null;
 const configured=!!(origin&&origin.startsWith('https://')&&/^cli_[\w]+$/.test(env.FEISHU_APP_ID||'')&&env.FEISHU_APP_SECRET&&key);
 const redirect=origin?origin+'/oauth/feishu/callback':'';
 const origins=new Set((env.ALLOWED_ORIGINS||'https://zhaokongkong96-ux.github.io').split(',').map(s=>s.trim()));
 if(!dbPath){mkdirSync(env.DATA_DIR||'/data',{recursive:true,mode:0o700});dbPath=(env.DATA_DIR||'/data')+'/feishu.sqlite';}
 const db=new DatabaseSync(dbPath);db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE IF NOT EXISTS attempts(id TEXT PRIMARY KEY,state_hash TEXT UNIQUE,claim_hash TEXT NOT NULL,verifier TEXT NOT NULL,expires INTEGER NOT NULL,result TEXT,error TEXT);
 CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY,secret_hash TEXT NOT NULL,tokens TEXT NOT NULL,expires INTEGER NOT NULL);`);
 const seal=value=>{const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,cipher.update(JSON.stringify(value)),cipher.final(),cipher.getAuthTag()]).toString('base64');};
 const unseal=value=>{const b=Buffer.from(value,'base64'),decipher=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));decipher.setAuthTag(b.subarray(-16));return JSON.parse(Buffer.concat([decipher.update(b.subarray(12,-16)),decipher.final()]).toString());};
 const rates=new Map(),refreshing=new Map();
 function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(data));}
 async function body(req){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>8192)fail(413,'body_too_large');}try{return JSON.parse(raw||'{}');}catch{fail(400,'invalid_json');}}
 async function tokenRequest(data){
  let r,b;try{r=await fetcher(API+'/authen/v2/oauth/token',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({client_id:env.FEISHU_APP_ID,client_secret:env.FEISHU_APP_SECRET,...data}),signal:AbortSignal.timeout(15000)});b=await r.json();}catch{fail(502,'feishu_unavailable');}
  if(!r.ok||b.error||(b.code&&b.code!==0)||!b.access_token)fail(b.error==='invalid_grant'?401:502,'reauthorize');
  return {access:b.access_token,refresh:b.refresh_token||null,accessExpires:now()+(Number(b.expires_in)||7200)*1000};
 }
 function session(req){const bearer=(req.headers.authorization||'').replace(/^Bearer /,''),[id,secret]=bearer.split('.');if(!id||!secret)fail(401,'not_connected');const row=db.prepare('SELECT * FROM sessions WHERE id=? AND expires>?').get(id,now());if(!row||!equal(row.secret_hash,sha(secret)))fail(401,'not_connected');return row;}
 async function access(row){
  let tokens=unseal(row.tokens);if(tokens.accessExpires>now()+60000)return tokens.access;
  if(!refreshing.has(row.id))refreshing.set(row.id,(async()=>{if(!tokens.refresh)fail(401,'reauthorize');const fresh=await tokenRequest({grant_type:'refresh_token',refresh_token:tokens.refresh});fresh.refresh||=tokens.refresh;db.prepare('UPDATE sessions SET tokens=? WHERE id=?').run(seal(fresh),row.id);return fresh.access;})().finally(()=>refreshing.delete(row.id)));
  return refreshing.get(row.id);
 }
 async function get(path,token){let r,b;try{r=await fetcher(API+path,{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(15000)});b=await r.json();}catch{fail(502,'feishu_unavailable');}if(!r.ok||b.code){if(r.status===401||[99991663,99991664,99991668].includes(b.code))fail(401,'reauthorize');if(r.status===403||[99991672,191002].includes(b.code))fail(403,'scope_or_calendar_access');fail(502,'feishu_api_error');}return b.data||{};}
 async function calendars(row){const token=await access(row),items=[];let page='';for(let n=0;n<10;n++){const query=new URLSearchParams({page_size:'100'});if(page)query.set('page_token',page);const data=await get('/calendar/v4/calendars?'+query,token);for(const c of data.calendar_list||[])if(!c.is_deleted&&['primary','shared','resource'].includes(c.type)&&['reader','writer','owner'].includes(c.role))items.push({id:c.calendar_id,name:String(c.summary||'飞书日历').slice(0,100),primary:c.type==='primary'});if(!data.has_more)return items;page=data.page_token;if(!page)break;}fail(502,'too_many_calendars');}
 function callbackPage(res,ok){res.writeHead(ok?200:400,{'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'"});res.end('<!doctype html><meta name="viewport" content="width=device-width"><title>AI Desk Hub 飞书授权</title><body style="background:#000;color:#eef;font:18px system-ui;padding:36px"><h1>'+ (ok?'授权已接收':'授权未完成')+'</h1><p>'+(ok?'请回到原来的 AI Desk Hub 页面，连接结果会自动更新。':'请回到 AI Desk Hub 重新点击连接。若仍失败，请检查飞书应用权限及回调地址。')+'</p>');}
 const server=http.createServer(async(req,res)=>{
  res.setHeader('Cache-Control','no-store');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Content-Type-Options','nosniff');
  const url=new URL(req.url,'http://localhost'),path=url.pathname;
  try{
   if(path==='/health'&&req.method==='GET'){json(res,200,{ok:true,configured,service:'ai-desk-hub-feishu'});return;}
   if(path==='/oauth/feishu/callback'&&req.method==='GET'){
    if(!configured){callbackPage(res,false);return;}
    const state=url.searchParams.get('state')||'',attempt=db.prepare('SELECT * FROM attempts WHERE state_hash=? AND expires>?').get(sha(state),now());
    if(!attempt){callbackPage(res,false);return;}
    db.prepare('UPDATE attempts SET state_hash=NULL WHERE id=?').run(attempt.id);
    if(url.searchParams.has('error')||!url.searchParams.get('code')){db.prepare('UPDATE attempts SET error=? WHERE id=?').run('authorization_denied',attempt.id);callbackPage(res,false);return;}
    try{const tokens=await tokenRequest({grant_type:'authorization_code',code:url.searchParams.get('code'),redirect_uri:redirect,code_verifier:unseal(attempt.verifier)});db.prepare('UPDATE attempts SET result=? WHERE id=?').run(seal(tokens),attempt.id);callbackPage(res,true);}catch{db.prepare('UPDATE attempts SET error=? WHERE id=?').run('authorization_failed',attempt.id);callbackPage(res,false);}return;
   }
   const source=req.headers.origin;if(!origins.has(source))fail(403,'origin_not_allowed');res.setHeader('Access-Control-Allow-Origin',source);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, DELETE, OPTIONS');
   if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
   if(path==='/api/config'&&req.method==='GET'){json(res,200,{configured,redirectURI:redirect,scopes:SCOPES});return;}
   if(!configured)fail(503,'not_configured');
   const stamp=now();db.prepare('DELETE FROM attempts WHERE expires<=?').run(stamp);db.prepare('DELETE FROM sessions WHERE expires<=?').run(stamp);
   const ip=req.socket.remoteAddress||'local',rate=rates.get(ip)||{at:stamp,count:0};if(stamp-rate.at>60000){rate.count=0;rate.at=stamp;}if(++rate.count>120)fail(429,'rate_limited');rates.set(ip,rate);if(rates.size>1000)for(const [ip,v]of rates)if(stamp-v.at>60000)rates.delete(ip);
   if(path==='/api/oauth/start'&&req.method==='POST'){
    const {claimHash}=await body(req);if(!/^[a-f0-9]{64}$/.test(claimHash||''))fail(400,'invalid_claim');if(db.prepare('SELECT count(*) n FROM attempts').get().n>=20||db.prepare('SELECT count(*) n FROM sessions').get().n>=10)fail(429,'connection_limit');
    const id=random(),state=random(),verifier=random(),challenge=createHash('sha256').update(verifier).digest('base64url');db.prepare('INSERT INTO attempts(id,state_hash,claim_hash,verifier,expires) VALUES(?,?,?,?,?)').run(id,sha(state),claimHash,seal(verifier),stamp+600000);
    const authorization=new URL(AUTHORIZE);for(const [k,v]of Object.entries({client_id:env.FEISHU_APP_ID,redirect_uri:redirect,response_type:'code',scope:SCOPES,state,code_challenge:challenge,code_challenge_method:'S256'}))authorization.searchParams.set(k,v);
    json(res,201,{attemptId:id,authorizationURL:authorization.href,expiresAt:stamp+600000});return;
   }
   if(path==='/api/oauth/claim'&&req.method==='POST'){
    const {attemptId,claim}=await body(req);if(typeof attemptId!=='string'||typeof claim!=='string'||claim.length>100)fail(400,'invalid_claim');const attempt=db.prepare('SELECT * FROM attempts WHERE id=? AND expires>?').get(attemptId,stamp);if(!attempt||!equal(attempt.claim_hash,sha(claim)))fail(401,'invalid_claim');if(attempt.error){db.prepare('DELETE FROM attempts WHERE id=?').run(attempt.id);fail(400,attempt.error);}if(!attempt.result){json(res,200,{pending:true});return;}
    const id=random(),secret=random();db.prepare('INSERT INTO sessions(id,secret_hash,tokens,expires) VALUES(?,?,?,?)').run(id,sha(secret),attempt.result,stamp+30*86400000);db.prepare('DELETE FROM attempts WHERE id=?').run(attempt.id);json(res,200,{token:id+'.'+secret,expiresAt:stamp+30*86400000});return;
   }
   const row=session(req);
   if(path==='/api/connection'&&req.method==='GET'){json(res,200,{connected:true,expiresAt:row.expires});return;}
   if(path==='/api/connection'&&req.method==='DELETE'){db.prepare('DELETE FROM sessions WHERE id=?').run(row.id);json(res,200,{removed:true});return;}
   // Read-only allowlist: arbitrary upstream URLs and all calendar writes are impossible.
   if(req.method!=='GET')fail(405,'read_only');
   if(path==='/api/calendars'){json(res,200,{calendars:await calendars(row)});return;}
   if(path==='/api/events'){
    const from=Number(url.searchParams.get('start')),to=Number(url.searchParams.get('end')),calendarID=url.searchParams.get('calendar');if(!url.searchParams.has('start')||!url.searchParams.has('end')||!Number.isFinite(from)||!Number.isFinite(to)||to<=from||to-from>62*86400000||from<stamp-366*86400000||to>stamp+366*86400000)fail(400,'invalid_range');
    const available=await calendars(row);if(!available.some(c=>c.id===calendarID))fail(403,'scope_or_calendar_access');const token=await access(db.prepare('SELECT * FROM sessions WHERE id=?').get(row.id));const result=new Map();
    for(let day=from;day<to;day+=7*86400000){const query=new URLSearchParams({start_time:String(Math.floor(day/1000)),end_time:String(Math.ceil(Math.min(to,day+7*86400000)/1000))});const data=await get('/calendar/v4/calendars/'+encodeURIComponent(calendarID)+'/events/instance_view?'+query,token);if(!Array.isArray(data.items))fail(502,'invalid_events');if(data.has_more||data.items.length>=1000)fail(502,'too_many_events');for(const item of data.items){const event=normalizeEvent(item,calendarID);if(event&&Date.parse(event.start)<to&&Date.parse(event.end)>from)result.set(event.id,event);}}
    json(res,200,{events:[...result.values()],from,to,syncedAt:now()});return;
   }
   fail(404,'not_found');
  }catch(error){json(res,error.status||500,{error:error.code||'request_failed'});}
 });

 return {server,db,close:()=>{server.close();db.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const app=createService();app.server.listen(Number(process.env.PORT)||8080,'0.0.0.0');for(const sig of ['SIGINT','SIGTERM'])process.on(sig,()=>{app.close();process.exit(0);});}
