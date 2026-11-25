/* Same-origin pairing is reused. No credential is included in the public config or URL. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.DeskStudioTransport=factory();})(typeof window!=='undefined'?window:globalThis,()=>{
'use strict';
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
function connection(storage){try{const c=JSON.parse(storage.getItem('ai-desk-hub-sync-v1')||'null')?.connection;return c&&/^[a-f0-9]{64}$/.test(c.token||'')?{token:c.token,deviceId:c.deviceId}:null;}catch{return null;}}
function create({serviceURL,storage=localStorage,fetcher=fetch,onStatus=()=>{}}){
 const service=new URL(serviceURL);if(service.protocol!=='https:'||service.username||service.password||service.pathname!=='/'||service.search||service.hash)throw Error('内容服务地址无效');
 const getConnection=()=>{const c=connection(storage);if(!c)throw Error('请先返回工作台完成设备配对');return c;};
 async function request(path,method='GET',body,requestId){
  const c=getConnection();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),25000);
  try{
   const response=await fetcher(service.origin+path,{method,headers:{Authorization:'Bearer '+c.token,...(body?{'Content-Type':'application/json'}:{}),...(requestId?{'X-Request-ID':requestId}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});
   if(!response.ok){let data;try{data=await response.json();}catch{}const error=Error(data?.detail||'内容服务请求失败（'+response.status+'）');error.status=response.status;throw error;}
   return response;
  }catch(e){if(e.name==='AbortError')throw Error('网络响应超时，请检查网络后刷新；未自动重复提交。');throw e;}finally{clearTimeout(timer);}
 }
 async function finish(id){
  for(let i=0;i<180;i++){
   let op;try{op=await (await request('/api/operations/'+id)).json();}catch(e){if(e.status===404){storage.setItem('studio-pending-operations',JSON.stringify(JSON.parse(storage.getItem('studio-pending-operations')||'[]').filter(x=>x!==id)));throw Error('云端确认未收到上次操作，可以重新提交。');}throw e;}
   if(op.status==='done'){
    const pending=JSON.parse(storage.getItem('studio-pending-operations')||'[]').filter(x=>x!==id);storage.setItem('studio-pending-operations',JSON.stringify(pending));
    if(op.result.status>=400)throw Error(op.result.data.detail||'Mac 未能完成此操作');return op.result.data;
   }
   if(['interrupted','revoked'].includes(op.status))throw Error(op.status==='revoked'?'设备配对已被撤销，此操作未执行':'处理意外中断，请刷新检查，系统未自动重复执行。');
   onStatus(op.status==='queued'?'操作已提交云端 · 等待 Mac 处理，完成后才显示已保存':'Mac 正在处理 · 请稍候');await sleep(2000);
  }
  throw Error('操作仍在队列中，尚未确认完成。可稍后刷新查看，请勿重复提交。');
 }
 async function api(path,method='GET',data){
  const id=method==='GET'?undefined:crypto.randomUUID().replaceAll('-','');
  if(id){const pending=JSON.parse(storage.getItem('studio-pending-operations')||'[]');if(pending.length)throw Error('请先检查上一项操作的处理结果，避免重复提交。');storage.setItem('studio-pending-operations',JSON.stringify([id]));}
  let response;try{response=await request(path,method,method==='GET'?data:(data||{}),id);}catch(e){if(id&&e.status)storage.setItem('studio-pending-operations','[]');throw e;}const result=await response.json();
  if(response.status===202&&result.operation_id){
   const pending=JSON.parse(storage.getItem('studio-pending-operations')||'[]');storage.setItem('studio-pending-operations',JSON.stringify([...new Set([...pending,result.operation_id])]));return finish(result.operation_id);
  }return result;
 }
 async function download(job,onProgress=()=>{}){
  const path='/api/media/'+job+'/video.mp4';let info;
  for(let i=0;i<120;i++){try{info=await api(path);break;}catch(e){if(e.status!==409)throw e;if(i===0)await request('/api/media/'+job+'/prepare','POST',{});onStatus('视频等待 Mac 上传 · 准备好后将继续播放');await sleep(2000);}}
  if(!info)throw Error('视频仍等待 Mac 上传，请稍后重试。');
  const blobs=new Array(info.parts);let cursor=0,done=0;
  async function next(){while(cursor<info.parts){const part=cursor++;const response=await request(path+'?part='+part);blobs[part]=await response.blob();done++;onProgress(Math.round(done/info.parts*100));}}
  await Promise.all([next(),next(),next()]);const blob=new Blob(blobs,{type:'video/mp4'});if(blob.size!==info.size)throw Error('视频未完整下载，请重试');
  const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await blob.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');if(digest!==info.sha256)throw Error('视频校验失败，请重试');return blob;
 }
 return {api,download,request,paired:()=>!!connection(storage),pending:()=>JSON.parse(storage.getItem('studio-pending-operations')||'[]'),finish};
}
return {create,connection};
});
