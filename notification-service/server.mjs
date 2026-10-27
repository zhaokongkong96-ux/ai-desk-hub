import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {createHash,randomBytes,timingSafeEqual} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import webpush from 'web-push';
process.umask(0o077);
const APP='https://zhaokongkong96-ux.github.io/ai-desk-hub/';
const digest=value=>createHash('sha256').update(String(value)).digest('hex');
function same(a,b){return typeof a==='string'&&typeof b==='string'&&a.length===b.length&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export function validSubscription(s){
  try{const u=new URL(s.endpoint),h=u.hostname;return u.protocol==='https:'&&!u.username&&!u.password&&(h==='fcm.googleapis.com'||h==='updates.push.services.mozilla.com'||h==='web.push.apple.com'||h.endsWith('.notify.windows.com'))&&typeof s.keys?.p256dh==='string'&&/^[\w-]{80,100}$/.test(s.keys.p256dh)&&typeof s.keys?.auth==='string'&&/^[\w-]{20,30}$/.test(s.keys.auth)&&s.endpoint.length<2048;}catch{return false;}
}
export function createService({env=process.env,dbPath,send=webpush.sendNotification.bind(webpush),now=Date.now}={}){
  const configured=!!(env.VAPID_PUBLIC_KEY&&env.VAPID_PRIVATE_KEY&&env.PAIRING_CODE?.length>=16);
  if(configured)webpush.setVapidDetails(APP,env.VAPID_PUBLIC_KEY,env.VAPID_PRIVATE_KEY);
  if(!dbPath){mkdirSync(env.DATA_DIR||'/data',{recursive:true,mode:0o700});dbPath=(env.DATA_DIR||'/data')+'/notifications.sqlite';}
  const db=new DatabaseSync(dbPath);db.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;');
  db.exec(`CREATE TABLE IF NOT EXISTS devices(id TEXT PRIMARY KEY,token_hash TEXT NOT NULL,endpoint TEXT UNIQUE NOT NULL,subscription TEXT NOT NULL,paused INTEGER DEFAULT 0,updated_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reminders(device_id TEXT NOT NULL REFERENCES devices(id) ON DELETE CASCADE,event_key TEXT NOT NULL,at INTEGER NOT NULL,expires INTEGER NOT NULL,state TEXT DEFAULT 'pending',attempts INTEGER DEFAULT 0,next_try INTEGER DEFAULT 0,PRIMARY KEY(device_id,event_key));`);
  const origins=new Set((env.ALLOWED_ORIGINS||new URL(APP).origin).split(',').map(s=>s.trim()));
  const rates=new Map();let ticking=false;
  function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(data));}
  function authorized(req,id){const device=db.prepare('SELECT * FROM devices WHERE id=?').get(id);return device&&same(device.token_hash,digest((req.headers.authorization||'').replace(/^Bearer /,'')))?device:null;}
  async function body(req){let size=0,raw='';for await(const chunk of req){size+=chunk.length;if(size>65536)throw Object.assign(Error('body'),{status:413});raw+=chunk;}try{return JSON.parse(raw||'{}');}catch{throw Object.assign(Error('json'),{status:400});}}
  async function push(device,payload){return send(JSON.parse(device.subscription),JSON.stringify(payload),{TTL:Math.max(0,Math.min(600,Math.ceil((payload.expiresAt-now())/1000))),urgency:'high',timeout:10000});}
  const server=http.createServer(async(req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname,origin=req.headers.origin;
    if(path==='/health'&&req.method==='GET'){json(res,configured?200:503,{ok:configured,service:'ai-desk-hub-notifications'});return;}
    if(!origin||!origins.has(origin)){json(res,403,{error:'origin_not_allowed'});return;}
    res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET, POST, PUT, DELETE, OPTIONS');
    if(req.method==='OPTIONS'){res.writeHead(204);res.end();return;}
    if(!configured){json(res,503,{error:'service_not_configured'});return;}
    const ip=req.socket.remoteAddress||'local',stamp=now(),rate=rates.get(ip)||{since:stamp,count:0};if(stamp-rate.since>60000){rate.since=stamp;rate.count=0;}rate.count++;rates.set(ip,rate);if(rate.count>100){json(res,429,{error:'rate_limited'});return;}if(rates.size>1000)for(const [key,v]of rates)if(stamp-v.since>60000)rates.delete(key);
    try{
      if(path==='/api/push/public-key'&&req.method==='GET'){json(res,200,{publicKey:env.VAPID_PUBLIC_KEY});return;}
      if(path==='/api/push/devices'&&req.method==='POST'){
        const data=await body(req);if(!same(digest(data.pairingCode||''),digest(env.PAIRING_CODE))){json(res,401,{error:'pairing_required'});return;}
        if(!validSubscription(data.subscription)){json(res,400,{error:'invalid_subscription'});return;}
        let device=db.prepare('SELECT id FROM devices WHERE endpoint=?').get(data.subscription.endpoint);
        if(!device&&db.prepare('SELECT count(*) AS n FROM devices').get().n>=5){json(res,409,{error:'device_limit'});return;}
        const id=device?.id||randomBytes(16).toString('hex'),token=randomBytes(32).toString('base64url');
        db.prepare('INSERT INTO devices(id,token_hash,endpoint,subscription,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(endpoint) DO UPDATE SET token_hash=excluded.token_hash,subscription=excluded.subscription,updated_at=excluded.updated_at').run(id,digest(token),data.subscription.endpoint,JSON.stringify(data.subscription),stamp);
        json(res,201,{id,token});return;
      }
      const match=path.match(/^\/api\/push\/devices\/([a-f0-9]{32})(?:\/(reminders|test))?$/);if(!match){json(res,404,{error:'not_found'});return;}
      const device=authorized(req,match[1]);if(!device){json(res,401,{error:'device_auth_required'});return;}
      if(!match[2]&&req.method==='DELETE'){db.prepare('DELETE FROM devices WHERE id=?').run(device.id);json(res,200,{removed:true});return;}
      if(!match[2]&&req.method==='GET'){json(res,200,{active:true,paused:!!device.paused,syncedAt:device.updated_at});return;}
      if(match[2]==='reminders'&&req.method==='PUT'){
        const data=await body(req);if(!Array.isArray(data.events)||data.events.length>100||typeof data.paused!=='boolean'){json(res,400,{error:'invalid_reminders'});return;}
        const events=data.events.filter(e=>e&&/^[a-f0-9]{64}$/.test(e.key)&&Number.isFinite(e.at)&&Number.isFinite(e.expiresAt)&&e.expiresAt>stamp&&e.expiresAt<=stamp+31*86400000&&e.at<=e.expiresAt&&e.expiresAt-e.at<=600000&&e.at>=stamp-600000);
        if(events.length!==data.events.length){json(res,400,{error:'invalid_reminders'});return;}
        db.exec('BEGIN');try{
          const keep=new Set(events.map(e=>e.key));for(const job of db.prepare("SELECT event_key FROM reminders WHERE device_id=? AND state!='sent'").all(device.id))if(!keep.has(job.event_key))db.prepare('DELETE FROM reminders WHERE device_id=? AND event_key=?').run(device.id,job.event_key);
          for(const e of events)db.prepare('INSERT INTO reminders(device_id,event_key,at,expires) VALUES(?,?,?,?) ON CONFLICT(device_id,event_key) DO UPDATE SET at=excluded.at,expires=excluded.expires').run(device.id,e.key,e.at,e.expiresAt);
          db.prepare('UPDATE devices SET paused=?,updated_at=? WHERE id=?').run(data.paused?1:0,stamp,device.id);db.exec('COMMIT');
        }catch(error){db.exec('ROLLBACK');throw error;}
        json(res,200,{accepted:events.length,paused:data.paused,syncedAt:stamp});return;
      }
      if(match[2]==='test'&&req.method==='POST'){await push(device,{type:'test',key:'test-'+stamp,expiresAt:stamp+60000});json(res,200,{requested:true});return;}
      json(res,405,{error:'method_not_allowed'});
    }catch(error){json(res,error.status||500,{error:error.status?'invalid_body':'request_failed'});}
  });
  async function tick(){if(ticking)return;ticking=true;try{
    const stamp=now();db.prepare('DELETE FROM reminders WHERE expires<?').run(stamp-86400000);
    const jobs=db.prepare("SELECT r.*,d.subscription,d.id FROM reminders r JOIN devices d ON d.id=r.device_id WHERE r.state='pending' AND r.at<=? AND r.expires>? AND r.next_try<=? AND d.paused=0 LIMIT 30").all(stamp,stamp,stamp);
    for(const job of jobs){
      try{await push(job,{type:'reminder',key:job.event_key,expiresAt:job.expires});db.prepare("UPDATE reminders SET state='sent' WHERE device_id=? AND event_key=?").run(job.device_id,job.event_key);}
      catch(error){if([404,410].includes(error.statusCode)){db.prepare('DELETE FROM devices WHERE id=?').run(job.device_id);continue;}db.prepare('UPDATE reminders SET attempts=attempts+1,next_try=?,state=? WHERE device_id=? AND event_key=?').run(stamp+Math.min(120000,30000*2**job.attempts),job.attempts>=3?'failed':'pending',job.device_id,job.event_key);}
    }
  }finally{ticking=false;}}
  const timer=setInterval(()=>tick().catch(()=>{}),15000);timer.unref();
  return {server,tick,db,close:()=>{clearInterval(timer);server.close();db.close();}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const service=createService();service.server.listen(Number(process.env.PORT)||8080,'0.0.0.0');for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{service.close();process.exit(0);});}
