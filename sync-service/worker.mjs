/* Dedicated ciphertext transport. No plaintext records, keys, tokens, or request bodies in logs. */
const json=(data,status=200,headers={})=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
const random=()=>Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join('');
const hash=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');
const equal=(a,b)=>{if(typeof a!=='string'||typeof b!=='string'||a.length!==b.length)return false;let n=0;for(let i=0;i<a.length;i++)n|=a.charCodeAt(i)^b.charCodeAt(i);return n===0;};
async function body(request){if(!request.headers.get('content-type')?.startsWith('application/json'))throw Error('content_type');const reader=request.body?.getReader();if(!reader)throw Error('invalid_request');let size=0,chunks=[];while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>900000){await reader.cancel();throw Error('payload_too_large');}chunks.push(value);}const data=new Uint8Array(size);let pos=0;for(const chunk of chunks){data.set(chunk,pos);pos+=chunk.length;}return JSON.parse(new TextDecoder().decode(data));}
const name=value=>typeof value==='string'&&value.trim().length>0&&value.length<=60?value.trim():null;
export default {async fetch(request,env){const origin=request.headers.get('Origin'),allowed=(env.ALLOWED_ORIGINS||'').split(',').includes(origin),headers=allowed?{'Access-Control-Allow-Origin':origin,'Vary':'Origin','Access-Control-Allow-Headers':'Content-Type, Authorization','Access-Control-Allow-Methods':'GET, POST, PUT, DELETE, OPTIONS'}:{};
 const reply=(d,s=200)=>json(d,s,headers);const path=new URL(request.url).pathname;
 if(origin&&!allowed)return reply({error:'origin_denied'},403);
 if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
 if(request.method==='GET'&&path==='/health')return reply({ok:true,service:'ai-desk-sync',encryptedOnly:true,configured:!!env.DB&&!!env.CREATE_CODE_HASH});
 if(!env.DB)return reply({error:'not_configured'},503);
 try{
 if(request.method==='POST'&&path==='/v1/vaults'){
  const input=await body(request);if(!env.CREATE_CODE_HASH||!equal(await hash(String(input.setupCode||'')),env.CREATE_CODE_HASH))return reply({error:'setup_denied'},403);
  if(!name(input.name))return reply({error:'invalid_name'},400);
  const id=random(),token=random(),deviceId=random(),now=Date.now();
  const result=await env.DB.batch([env.DB.prepare('INSERT INTO vaults(id,updated_at) SELECT ?,? WHERE (SELECT COUNT(*) FROM vaults)<8').bind(id,now),env.DB.prepare('INSERT INTO devices(id,vault_id,token_hash,name,created_at) SELECT ?,?,?,?,? WHERE EXISTS (SELECT 1 FROM vaults WHERE id=?)').bind(deviceId,id,await hash(token),name(input.name),now,id)]);
  if(!result[0].meta.changes)return reply({error:'vault_limit'},429);
  return reply({vault:id,deviceId,token},201);
 }
 if(request.method==='POST'&&path==='/v1/join'){
  const input=await body(request);if(!/^[a-f0-9]{64}$/.test(input.code||'')||!name(input.name))return reply({error:'invalid_request'},400);
  // DELETE RETURNING consumes the invite atomically; revoked issuer cannot pair.
  const invitation=await env.DB.prepare('DELETE FROM pairings WHERE code_hash=? AND expires_at>? AND EXISTS (SELECT 1 FROM devices WHERE devices.id=pairings.issuer_id) RETURNING vault_id').bind(await hash(input.code),Date.now()).first();
  if(!invitation)return reply({error:'pairing_expired'},403);
  const token=random(),deviceId=random();await env.DB.prepare('INSERT INTO devices(id,vault_id,token_hash,name,created_at) VALUES(?,?,?,?,?)').bind(deviceId,invitation.vault_id,await hash(token),name(input.name),Date.now()).run();return reply({vault:invitation.vault_id,deviceId,token},201);
 }
 const token=request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
 if(!token)return reply({error:'unauthorized'},401);
 const device=await env.DB.prepare('SELECT id,vault_id FROM devices WHERE token_hash=?').bind(await hash(token)).first();if(!device)return reply({error:'unauthorized'},401);
 if(request.method==='GET'&&path==='/v1/data'){
  const vault=await env.DB.prepare('SELECT revision,payload,updated_at FROM vaults WHERE id=?').bind(device.vault_id).first();if(!vault)return reply({error:'unauthorized'},401);return reply({revision:vault.revision,payload:vault.payload?JSON.parse(vault.payload):null,updatedAt:vault.updated_at});
 }
 if(request.method==='PUT'&&path==='/v1/data'){
  const input=await body(request),p=input.payload;
  if(!Number.isSafeInteger(input.expectedRevision)||input.expectedRevision<0||p?.version!==1||typeof p.iv!=='string'||!/^[a-f0-9]{24}$/.test(p.iv)||typeof p.ciphertext!=='string'||p.ciphertext.length<20||p.ciphertext.length>850000||!/^[A-Za-z0-9+/]+=*$/.test(p.ciphertext))return reply({error:'invalid_envelope'},400);
  const result=await env.DB.prepare('UPDATE vaults SET revision=revision+1,payload=?,updated_at=? WHERE id=? AND revision=?').bind(JSON.stringify({version:1,iv:p.iv,ciphertext:p.ciphertext}),Date.now(),device.vault_id,input.expectedRevision).run();
  if(!result.meta.changes)return reply({error:'revision_conflict'},409);return reply({revision:input.expectedRevision+1});
 }
 if(request.method==='POST'&&path==='/v1/pair'){
  const code=random(),expiresAt=Date.now()+5*60000;await env.DB.batch([env.DB.prepare('DELETE FROM pairings WHERE issuer_id=? OR expires_at<?').bind(device.id,Date.now()),env.DB.prepare('INSERT INTO pairings(code_hash,vault_id,issuer_id,expires_at) VALUES(?,?,?,?)').bind(await hash(code),device.vault_id,device.id,expiresAt)]);return reply({code,expiresAt});
 }
 if(request.method==='GET'&&path==='/v1/devices'){const result=await env.DB.prepare('SELECT id,name,created_at AS createdAt FROM devices WHERE vault_id=? ORDER BY created_at').bind(device.vault_id).all();return reply({devices:result.results,currentId:device.id});}
 if(request.method==='DELETE'&&/^\/v1\/devices\/[a-f0-9]{64}$/.test(path)){
  const id=path.split('/').pop();await env.DB.batch([env.DB.prepare('DELETE FROM pairings WHERE issuer_id=? AND vault_id=?').bind(id,device.vault_id),env.DB.prepare('DELETE FROM devices WHERE id=? AND vault_id=?').bind(id,device.vault_id)]);return reply({ok:true});
 }
 return reply({error:'not_found'},404);
 }catch(error){return reply({error:['payload_too_large','content_type'].includes(error.message)?error.message:'request_failed'},error.message==='payload_too_large'?413:400);}
}};
