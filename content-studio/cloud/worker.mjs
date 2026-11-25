/* Private Studio relay. Existing workspace devices authenticate; Studio has its own encrypted database. */
const encoder=new TextEncoder(),decoder=new TextDecoder();
const hex=b=>Array.from(new Uint8Array(b),x=>x.toString(16).padStart(2,'0')).join('');
const unhex=s=>new Uint8Array(s.match(/../g).map(x=>parseInt(x,16)));
const hash=async s=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(s)));
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;};
const objectID=s=>/^[a-f0-9]{32}$/.test(s||'');
const routes=/^\/api\/(collect|topics\/[a-f0-9]{32}\/(selection|plan|script|approve-script|produce)|jobs\/[a-f0-9]{32}\/review)$/;
const chunkSize=262144;
let cachedKey;
async function key(env){if(!cachedKey||cachedKey.secret!==env.STORAGE_KEY)cachedKey={secret:env.STORAGE_KEY,key:await crypto.subtle.importKey('raw',unhex(env.STORAGE_KEY),'AES-GCM',false,['encrypt','decrypt'])};return cachedKey.key;}
async function seal(env,aad,bytes){const iv=crypto.getRandomValues(new Uint8Array(12));return {iv:hex(iv),data:await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:encoder.encode(aad)},await key(env),bytes)};}
async function unseal(env,aad,row){return crypto.subtle.decrypt({name:'AES-GCM',iv:unhex(row.iv),additionalData:encoder.encode(aad)},await key(env),new Uint8Array(row.payload));}
async function putSnapshot(env,name,value){const p=await seal(env,'snapshot/'+name,encoder.encode(JSON.stringify(value)));await env.DB.prepare('INSERT INTO snapshots(name,iv,payload,updated_at) VALUES(?,?,?,?) ON CONFLICT(name) DO UPDATE SET iv=excluded.iv,payload=excluded.payload,updated_at=excluded.updated_at').bind(name,p.iv,p.data,Date.now()).run();}
async function getSnapshot(env,name){const row=await env.DB.prepare('SELECT * FROM snapshots WHERE name=?').bind(name).first();return row?JSON.parse(decoder.decode(await unseal(env,'snapshot/'+name,row))):null;}
async function jsonBody(request,limit=1500000){const length=Number(request.headers.get('Content-Length')||0);if(length>limit)throw Error('payload_too_large');const text=await request.text();if(encoder.encode(text).length>limit)throw Error('payload_too_large');return JSON.parse(text);}
const json=(v,status=200,headers={})=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
export default {async fetch(request,env){
 const url=new URL(request.url),path=url.pathname,origin=request.headers.get('Origin');
 const allowed=(env.ALLOWED_ORIGINS||'').split(',').includes(origin);
 const headers=allowed?{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'Authorization, Content-Type, X-Request-ID, Range','Access-Control-Expose-Headers':'Content-Range, X-Studio-Saved-At','Access-Control-Allow-Methods':'GET, POST, PUT, OPTIONS'}:{};
 const reply=(v,s=200)=>json(v,s,headers);
 if(origin&&!allowed)return reply({detail:'此页面来源未获允许'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(path==='/health'&&request.method==='GET')return reply({ok:true,service:'ai-content-studio',requires_pairing:true});
 try{
  if(!env.STORAGE_KEY||!env.MACHINE_TOKEN||!env.OWNER_VAULT)return reply({detail:'云端服务尚未完成配置'},503);
  const bearer=request.headers.get('Authorization')?.replace(/^Bearer /,'')||'';
  if(path.startsWith('/internal/')){
   if(!equal(bearer,env.MACHINE_TOKEN))return reply({detail:'unauthorized'},401);
   if(path==='/internal/snapshot'&&request.method==='PUT'){
    const input=await jsonBody(request);if(!['topics','runs','jobs'].includes(input.name)||!Array.isArray(input.data))return reply({detail:'invalid_snapshot'},400);
    await putSnapshot(env,input.name,input.data);return reply({ok:true});
   }
   if(path==='/internal/heartbeat'&&request.method==='PUT'){
    const input=await jsonBody(request,2000);await env.DB.prepare("INSERT INTO meta VALUES('heartbeat',?) ON CONFLICT(name) DO UPDATE SET value=excluded.value").bind(JSON.stringify({at:Date.now(),schedule:input.schedule===true})).run();return reply({ok:true});
   }
   if(path==='/internal/pull'&&request.method==='POST'){
    // An interrupted operation is never blindly replayed: it may already have produced a video.
    await env.DB.prepare("UPDATE commands SET status='interrupted' WHERE status='running' AND claimed_at<?").bind(Date.now()-900000).run();
    for(let attempt=0;attempt<5;attempt++){
     const row=await env.DB.prepare("UPDATE commands SET status='running',claimed_at=? WHERE id=(SELECT id FROM commands WHERE status='queued' ORDER BY created_at,id LIMIT 1) RETURNING *").bind(Date.now()).first();
     if(!row)return reply({command:null});
     const active=await env.AUTH_DB.prepare('SELECT id FROM devices WHERE id=? AND vault_id=?').bind(row.device_id,env.OWNER_VAULT).first();
     if(!active){await env.DB.prepare("UPDATE commands SET status='revoked' WHERE id=?").bind(row.id).run();continue;}
     return reply({command:{id:row.id,path:row.path,method:row.method,body:JSON.parse(decoder.decode(await unseal(env,'command/'+row.id,row)))}});
    }return reply({command:null});
   }
   const result=path.match(/^\/internal\/result\/([a-f0-9]{32})$/);
   if(result&&request.method==='PUT'){
    const value=await jsonBody(request);const p=await seal(env,'result/'+result[1],encoder.encode(JSON.stringify(value)));
    await env.DB.prepare("UPDATE commands SET status='done',result_iv=?,result=? WHERE id=? AND status IN ('running','interrupted')").bind(p.iv,p.data,result[1]).run();return reply({ok:true});
   }
   const info=path.match(/^\/internal\/media\/([a-f0-9]{32})$/);
   if(info&&request.method==='GET'){const rows=await env.DB.prepare('SELECT part FROM media WHERE job=? ORDER BY part').bind(info[1]).all();return reply({uploaded:rows.results.map(x=>x.part)});}
   if(info&&request.method==='PUT'){
    const input=await jsonBody(request,2000);if(!Number.isSafeInteger(input.size)||input.size<1||input.size>250000000||input.parts!==Math.ceil(input.size/chunkSize)||!['uploading','ready'].includes(input.status)||!/^[a-f0-9]{64}$/.test(input.sha256||''))return reply({detail:'invalid_media'},400);
    if(input.status==='ready'){const count=await env.DB.prepare('SELECT COUNT(*) AS n FROM media WHERE job=?').bind(info[1]).first();if(count.n!==input.parts)return reply({detail:'incomplete_media'},409);}
    // Bound encrypted review copies within D1 Free; originals remain on the Mac.
    if(input.status==='uploading'){const all=(await env.DB.prepare('SELECT job,size FROM media_info WHERE job<>? ORDER BY updated_at').bind(info[1]).all()).results;let total=all.reduce((n,x)=>n+x.size,0)+input.size;while(total>350000000&&all.length){const old=all.shift();await env.DB.prepare('DELETE FROM media WHERE job=?').bind(old.job).run();await env.DB.prepare('DELETE FROM media_info WHERE job=?').bind(old.job).run();total-=old.size;}}
    const existing=await env.DB.prepare('SELECT sha256 FROM media_info WHERE job=?').bind(info[1]).first();if(existing&&existing.sha256!==input.sha256)await env.DB.prepare('DELETE FROM media WHERE job=?').bind(info[1]).run();
    await env.DB.prepare('INSERT INTO media_info VALUES(?,?,?,?,?,?) ON CONFLICT(job) DO UPDATE SET size=excluded.size,parts=excluded.parts,sha256=excluded.sha256,status=excluded.status,updated_at=excluded.updated_at').bind(info[1],input.size,input.parts,input.sha256,input.status,Date.now()).run();if(input.status==='ready')await env.DB.prepare('DELETE FROM meta WHERE name=?').bind('media-request/'+info[1]).run();return reply({ok:true});
   }
   const part=path.match(/^\/internal\/media\/([a-f0-9]{32})\/([0-9]+)$/);
   if(part&&request.method==='PUT'){
    const bytes=await request.arrayBuffer();if(!bytes.byteLength||bytes.byteLength>chunkSize)return reply({detail:'invalid_chunk'},400);
    const m=await env.DB.prepare('SELECT size,parts FROM media_info WHERE job=?').bind(part[1]).first();const n=Number(part[2]);if(!m||n>=m.parts||bytes.byteLength!==Math.min(chunkSize,m.size-n*chunkSize))return reply({detail:'invalid_chunk'},400);
    const p=await seal(env,'media/'+part[1]+'/'+n,bytes);await env.DB.prepare('INSERT INTO media VALUES(?,?,?,?) ON CONFLICT(job,part) DO UPDATE SET iv=excluded.iv,payload=excluded.payload').bind(part[1],n,p.iv,p.data).run();return reply({ok:true});
   }
   if(path==='/internal/media-requests'&&request.method==='GET'){const rows=await env.DB.prepare("SELECT name FROM meta WHERE name LIKE 'media-request/%' ORDER BY value DESC LIMIT 4").all();return reply(rows.results.map(x=>x.name.split('/')[1]));}
   if(path==='/internal/media'&&request.method==='GET'){const data=await env.DB.prepare('SELECT * FROM media_info').all();return reply(data.results);}
   return reply({detail:'not_found'},404);
  }
  const device=/^[a-f0-9]{64}$/.test(bearer)?await env.AUTH_DB.prepare('SELECT id,vault_id FROM devices WHERE token_hash=?').bind(await hash(bearer)).first():null;
  if(!device)return reply({detail:'请先在工作台完成设备配对'},401);
  if(!equal(device.vault_id,env.OWNER_VAULT))return reply({detail:'此设备不属于已连接的内容工作台'},403);
  if(path==='/api/status'&&request.method==='GET'){
   const h=await env.DB.prepare("SELECT value FROM meta WHERE name='heartbeat'").first();const heartbeat=h?JSON.parse(h.value):null;
   const snap=await env.DB.prepare('SELECT MAX(updated_at) AS at FROM snapshots').first();const pending=await env.DB.prepare("SELECT COUNT(*) AS n FROM commands WHERE status IN ('queued','running')").first();
   return reply({online:!!heartbeat&&Date.now()-heartbeat.at<90000,last_seen:heartbeat?.at||null,snapshot_at:snap?.at||null,pending:pending.n,schedule:heartbeat?.schedule||false,device_id:device.id});
  }
  if(request.method==='GET'&&['/api/topics','/api/runs','/api/jobs'].includes(path)){
   const value=await getSnapshot(env,path.split('/').pop());return value?reply(value):reply({detail:'Mac 尚未上传选题，请稍后刷新'},503);
  }
  const op=path.match(/^\/api\/operations\/([a-f0-9]{32})$/);
  if(op&&request.method==='GET'){
   const row=await env.DB.prepare('SELECT status,result_iv AS iv,result AS payload,created_at FROM commands WHERE id=?').bind(op[1]).first();if(!row)return reply({detail:'操作不存在'},404);
   const value=row.status==='done'?JSON.parse(decoder.decode(await unseal(env,'result/'+op[1],row))):null;
   return reply({id:op[1],status:row.status,created_at:row.created_at,result:value});
  }
  const prepareMedia=path.match(/^\/api\/media\/([a-f0-9]{32})\/prepare$/);
  if(prepareMedia&&request.method==='POST'){const jobs=await getSnapshot(env,'jobs');if(!jobs?.some(j=>j.id===prepareMedia[1]&&j.status==='complete'&&j.review!=='rejected'))return reply({detail:'这条成片不可播放'},404);await env.DB.prepare('INSERT INTO meta VALUES(?,?) ON CONFLICT(name) DO UPDATE SET value=excluded.value').bind('media-request/'+prepareMedia[1],String(Date.now())).run();return reply({status:'waiting_for_upload'});}
  const mi=path.match(/^\/api\/media\/([a-f0-9]{32})\/video.mp4$/);
  if(mi&&request.method==='GET'){
   const jobs=await getSnapshot(env,'jobs');if(!jobs?.some(j=>j.id===mi[1]&&j.status==='complete'&&j.review!=='rejected'))return reply({detail:'这条成片不可播放，请刷新任务状态'},404);
   const m=await env.DB.prepare("SELECT * FROM media_info WHERE job=? AND status='ready'").bind(mi[1]).first();if(!m)return reply({detail:'视频尚未上传到云端，Mac 在线后将补传'},409);
   if(!url.searchParams.has('part')){await env.DB.prepare('UPDATE media_info SET updated_at=? WHERE job=?').bind(Date.now(),mi[1]).run();return reply({...m,chunk_size:chunkSize});}
   const n=Number(url.searchParams.get('part'));if(!Number.isInteger(n)||n<0||n>=m.parts)return reply({detail:'无效片段'},400);
   const row=await env.DB.prepare('SELECT iv,payload FROM media WHERE job=? AND part=?').bind(mi[1],n).first();if(!row)return reply({detail:'视频片段缺失'},409);
   return new Response(await unseal(env,'media/'+mi[1]+'/'+n,row),{headers:{...headers,'Content-Type':'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
  }
  const source=path.match(/^\/api\/media\/([a-f0-9]{32})\/media-sources.json$/);
  if(source&&request.method==='GET'){
   const jobs=await getSnapshot(env,'jobs');const job=jobs?.find(j=>j.id===source[1]);return job?.sources?reply(job.sources):reply({detail:'暂无素材台账'},404);
  }
  if(['POST','PUT'].includes(request.method)&&routes.test(path)){
   const validMethod=(path.endsWith('/selection')||path.endsWith('/script')||path.endsWith('/review'))?'PUT':'POST';if(validMethod!==request.method)return reply({detail:'不支持此方法'},405);
   const input=await jsonBody(request,150000);const supplied=request.headers.get('X-Request-ID');const id=supplied||crypto.randomUUID().replaceAll('-','');if(!objectID(id))return reply({detail:'invalid_request_id'},400);
   const queued=await env.DB.prepare("SELECT COUNT(*) AS n FROM commands WHERE status IN ('queued','running')").first();if(queued.n>=30)return reply({detail:'待处理操作较多，请等待 Mac 完成'},429);
   const p=await seal(env,'command/'+id,encoder.encode(JSON.stringify(input)));
   const old=await env.DB.prepare('SELECT path,method,iv,payload FROM commands WHERE id=?').bind(id).first();
   if(old){const previous=JSON.parse(decoder.decode(await unseal(env,'command/'+id,old)));if(old.path!==path||old.method!==request.method||JSON.stringify(previous)!==JSON.stringify(input))return reply({detail:'操作编号冲突'},409);}
   else await env.DB.prepare('INSERT INTO commands(id,device_id,path,method,iv,payload,created_at) VALUES(?,?,?,?,?,?,?)').bind(id,device.id,path,request.method,p.iv,p.data,Date.now()).run();
   return reply({operation_id:id,status:'queued'},202);
  }
  return reply({detail:'not_found'},404);
 }catch(e){return reply({detail:e.message==='payload_too_large'?'请求内容太大':'服务暂时无法处理，请稍后重试'},e.message==='payload_too_large'?413:503);}
}};
