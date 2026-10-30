/* Injected adapters allow real transport and independent browser integration tests. */
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./sync-core'));else root.DeskSyncEngine=factory(root.DeskSyncCore);})(typeof window!=='undefined'?window:globalThis,C=>{
'use strict';
function create(a){let busy=false,generation=0,conflict=null;
 const status=(kind,message)=>a.status(kind,message);
 async function sync(resolutions){if(busy)return false;const meta=a.loadMeta();if(!meta?.connection){status('local','已保存到本机 · 未启用同步');return false;}if(!a.canApply()){status('pending','已保存到本机 · 正在编辑，稍后同步');return false;}busy=true;const epoch=generation;status('syncing','已保存到本机 · 正在同步…');
 try{for(let attempt=0;attempt<3;attempt++){
  if(epoch!==generation)return false;
  const current=a.snapshot(),local=C.localRows(meta.base||{},current),remote=await a.request(meta.connection,'GET','/v1/data');if(!Number.isSafeInteger(remote.revision)||remote.revision<0||remote.revision<(meta.revision||0)||(remote.revision>0&&remote.payload===null))throw Error('同步服务版本异常，未覆盖本机记录。');const rows=await a.crypto.decrypt(remote.payload,meta.connection.seed,meta.connection.vault);
  if(epoch!==generation)return false;
  if(!C.same(a.snapshot(),current)||!a.canApply()){status('pending','已保存到本机 · 本次操作中有新修改，稍后同步');return false;}
  let choices=resolutions?.choices||{};if(resolutions&&(resolutions.revision!==remote.revision||!C.same(resolutions.local,current))){choices={};resolutions=null;}
  const merged=C.merge(meta.base||{},local,rows,choices);if(merged.conflicts.length){conflict={local:current,revision:remote.revision,items:merged.conflicts};a.conflicts(conflict);status('conflict','已保存到本机 · 有 '+merged.conflicts.length+' 项冲突待选择');return false;}
  C.validate(merged.rows);let revision=remote.revision;
  if(!C.same(merged.rows,rows)){
   const payload=await a.crypto.encrypt(merged.rows,meta.connection.seed,meta.connection.vault);if(epoch!==generation||!C.same(a.snapshot(),current))return false;
   try{const saved=await a.request(meta.connection,'PUT','/v1/data',{expectedRevision:remote.revision,payload});revision=saved.revision;}catch(e){if(e.status===409){resolutions=null;continue;}throw e;}
  }
  if(epoch!==generation)return false;
  // If local edits occurred during the upload, only advance the common base.
  if(!C.same(a.snapshot(),current)||!a.canApply()){
   status('pending','已保存到本机 · 新修改等待下一次同步');return false;
  }
  const nextMeta={...meta,base:merged.rows,revision,lastSync:Date.now()};a.apply(merged.rows,nextMeta);conflict=null;a.conflicts(null);status('synced','已保存到本机 · 已同步 '+new Date(nextMeta.lastSync).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）');return true;
 }throw Error('其他设备正在更新，请稍后重试。');
 }catch(error){if(epoch!==generation)return false;status(error.status===401?'revoked':'failed',error.status===401?'已保存到本机 · 此设备授权已撤销，请重新配对':'已保存到本机 · 同步失败：'+error.message);return false;}finally{busy=false;}}
 return {sync,resolve:choices=>sync(conflict?{choices,revision:conflict.revision,local:conflict.local}:undefined),cancel:()=>{generation++;conflict=null;},get busy(){return busy;}};
}
return {create};
});
