/* Device pairing and browser-local E2EE sync. No personal credentials are exported. */
(()=>{'use strict';const C=window.DeskSyncCore,K=window.DeskSyncCrypto,P=window.DeskSyncPreferences,$=id=>document.getElementById(id),KEY='ai-desk-hub-sync-v1',CAL='ai-desk-hub-calendar-v1';let applying=false,timer=null,blocked=false,previewed=null,currentConflicts=null,devicesLoading=false,localError=false;
 const clone=C.copy,read=()=>JSON.parse(localStorage.getItem(KEY)||'null');
 let initialMeta=null;try{initialMeta=read();}catch{blocked=true;}
 function serviceURL(value){const u=new URL(value);if(u.username||u.password||u.pathname!=='/'||u.search||u.hash||!(u.protocol==='https:'||(u.protocol==='http:'&&['127.0.0.1','localhost'].includes(u.hostname))))throw Error('请填写同步服务的 HTTPS 根地址。');return u.origin;}
 function saveMeta(value){localStorage.setItem(KEY,JSON.stringify(value));}
 const dateLabel=value=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
 const statusLabels={synced:'已配对 · 已同步',local:'未配对',pending:'已配对 · 待同步',syncing:'同步中',failed:'同步失败',conflict:'同步冲突',revoked:'配对已失效'};
 let listedDevices=null,listCheckedAt=0,pairing=false,deviceName='';
 function renderIdentity(kind=$('deviceSyncState').dataset.state){
  let meta;
  try{meta=read();}catch{}
  const name=deviceName||meta?.connection?.name;
  const identity=$('syncIdentity');
  identity.textContent=kind==='revoked'?'当前设备配对已失效':meta?.connection?(name?'当前设备 · '+name+' · 已配对':'当前设备已配对'):blocked?'无法读取本机配对状态':'当前设备未配对';
  identity.dataset.state=kind;
  const last=$('syncLastSuccess');
  last.hidden=!meta?.connection;
  last.textContent=meta?.lastSync?'上次成功同步：'+dateLabel(meta.lastSync)+'（北京时间）':'首次同步尚未完成';
 }
 function status(kind,message){
  if(localError&&['synced','pending','syncing'].includes(kind)){
   kind='failed';message='本机保存失败 · 新修改尚未同步，请保留输入后重试。';
  }
  const detail=$('deviceSyncState');
  detail.dataset.state=kind;
  if(detail.textContent!==message)detail.textContent=message;
  const compact=$('deviceSyncCompact');
  compact.textContent=statusLabels[kind]||'查看同步';
  compact.setAttribute('aria-label','打开跨设备同步：'+compact.textContent);
  compact.dataset.state=kind;
  renderIdentity(kind);
  if(kind==='synced'&&$('syncPairFeedback').dataset.state==='first-sync'){
   pairFeedback((deviceName||connection()?.name||'此设备')+' 配对成功，首次同步已完成。','synced');
  }
  if(kind==='revoked')pairFeedback('','');
 }
 function pairFeedback(message,kind){
  const feedback=$('syncPairFeedback');
  feedback.dataset.state=kind;
  feedback.textContent=message;
 }
 function connection(){return read()?.connection;}
 function snapshot(){return C.project(JSON.parse(localStorage.getItem(STORAGE_KEY)||'{"tasks":[],"notes":[]}'),JSON.parse(localStorage.getItem(CAL)||'[]'),P.project(localStorage));}
 function counts(rows){const live=Object.entries(rows).filter(([,v])=>v!==null);return live.filter(([k])=>k.startsWith('task/')).length+' 项待办、'+live.filter(([k])=>k.startsWith('note/')).length+' 条记录、'+live.filter(([k])=>k.startsWith('event/')).length+' 项本机日程、'+live.filter(([k])=>!/^task\/|^note\/|^event\//.test(k)).length+' 项流程或设置数据';}
 function canApply(){return !blocked&&!localError&&!window.deskDayStale&&C.same(C.project(state,window.deskCalendarEvents?.()||[],P.project(localStorage)),snapshot())&&!document.hidden&&!document.querySelector('dialog[open]:not(#deviceSyncDialog)')&&!document.activeElement?.matches('input:not(#syncConsent):not([readonly]),textarea:not([readonly]),select');}
 async function request(config,method,path,body){if(!navigator.onLine)throw Error('网络不可用，内容已留在本机');const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000);try{const response=await fetch(config.service+path,{method,headers:{...(body?{'Content-Type':'application/json'}:{}),...(config.token?{Authorization:'Bearer '+config.token}:{})},body:body?JSON.stringify(body):undefined,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:controller.signal});let data;try{data=await response.json();}catch{throw Error('同步服务未返回有效响应，请检查网络后重试。');}if(!response.ok){const error=Error(({setup_denied:'创建授权码无效',pairing_expired:'配对已过期或已使用，请在原设备重新生成',revision_conflict:'其他设备已更新',vault_limit:'同步空间数量达到上限',unauthorized:'设备未授权'})[data.error]||'服务请求失败（'+response.status+'）');error.status=response.status;throw error;}return data;}finally{clearTimeout(timeout);}}
 function apply(rows,meta){const current=clone(state),data=C.materialize(rows,current),samples=(window.deskCalendarEvents?.()||[]).filter(e=>e.extendedProps?.sample),events=[...samples,...data.events];const target={state:data.state,events,preferences:data.preferences,meta};
  // Write-ahead record makes the multi-key local update recoverable after a crash.
  saveMeta({...read(),pending:target});applyTarget(target);
 }
 function applyTarget(target){applying=true;try{localStorage.setItem(STORAGE_KEY,JSON.stringify(target.state));localStorage.setItem(CAL,JSON.stringify(target.events));const preferencesChanged=P.apply(target.preferences||{},localStorage);saveMeta(target.meta);state=clone(target.state);window.deskApplySyncedCalendar?.(target.events);renderTasks();renderNotes();if(preferencesChanged)window.dispatchEvent(new Event('desk-preferences-applied'));window.dispatchEvent(new Event('desk-data-change'));}catch(e){blocked=true;throw Error('本机写入未完成，请释放空间并刷新以恢复；云端版本未被丢弃');}finally{applying=false;}}
 function showConflicts(value){currentConflicts=value;const box=$('syncConflicts');box.replaceChildren();if(!value)return;const choices={};for(const item of value.items){const section=document.createElement('section');section.className='day-step';const title=document.createElement('h4');title.textContent=item.local?.text||item.local?.title||item.remote?.text||item.remote?.title||item.key.split('/')[0];section.append(title);for(const [label,v] of [['本机',item.local],['另一设备',item.remote]]){const pre=document.createElement('pre');pre.textContent=label+'：'+(v===null?'已删除':JSON.stringify(v,null,2));section.append(pre);}const select=document.createElement('select');select.setAttribute('aria-label','冲突选择：'+item.key);for(const [label,v] of [['请选择',''],['保留本机版本','local'],['保留另一设备版本','remote']])select.add(new Option(label,v));select.addEventListener('change',()=>choices[item.key]=select.value);section.append(select);box.append(section);}
 const button=document.createElement('button');button.className='btn btn-primary';button.textContent='确认冲突选择并同步';button.addEventListener('click',()=>{if(value.items.some(i=>!choices[i.key])){status('conflict','请为每一项冲突选择版本。');return;}engine.resolve(choices);});box.append(button);
 }
 const engine=window.DeskSyncEngine.create({loadMeta:read,saveMeta,snapshot,crypto:K,request,apply,canApply,status,conflicts:showConflicts});
 function schedule(){if(applying)return;clearTimeout(timer);try{if(!connection()){status('local','已保存到本机 · 未启用同步');return;}status('pending','已保存到本机 · 等待同步');timer=setTimeout(()=>engine.sync(),1500);}catch{status('failed','同步配置读取失败，请导出本机数据后检查。');}}
 function refreshControls(){try{const connected=!!connection();$('syncConnectPanel').hidden=connected;$('syncConnectedPanel').hidden=!connected;}catch{status('failed','同步配置异常，请先导出本机记录。');}}
 function error(error){status('failed',error.message||'操作失败，本机内容保留。');}
 function consent(){if(!$('syncConsent').checked||!previewed||!C.same(previewed,snapshot()))throw Error('请预览当前本机记录并勾选确认，再启用同步。');if(!$('syncDeviceName').value.trim())throw Error('请给当前设备起一个名称。');}
 $('syncPreview').addEventListener('click',()=>{previewed=snapshot();$('syncPreviewText').textContent=counts(previewed)+'。启用后这些数据将加密同步到独立服务。配对后采用已有工作台的设置，记录和收藏会合并，冲突需选择；建议先导出备份。';$('syncConsent').checked=false;});
 $('syncBackup').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({exportedAt:new Date().toISOString(),...state,calendarEvents:window.deskCalendarEvents?.()||[],preferences:P.project(localStorage)},null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='ai-desk-before-sync.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
 async function pairDevice(joining){
  if(pairing||connection())return;
  pairing=true;
  const create=$('syncCreate'),join=$('syncJoin');
  create.disabled=join.disabled=true;
  pairFeedback(joining?'正在配对此设备…':'正在创建同步空间…','pending');
  try{
   consent();
   const name=$('syncDeviceName').value.trim();
   const service=serviceURL($('syncService').value.trim());
   let seed,response;
   if(joining){
    const pair=K.decodePair($('syncPairInput').value.trim());
    if(![pair.vault,pair.seed,pair.code].every(value=>/^[a-f0-9]{64}$/.test(value||'')))throw Error('配对内容不完整');
    if(service!==serviceURL(pair.service))throw Error('请先读取配对内容，核对其中的同步服务地址。');
    seed=pair.seed;
    response=await request({service},'POST','/v1/join',{name,code:pair.code});
    if(response.vault!==pair.vault)throw Error('配对空间不一致');
   }else{
    seed=K.seed();
    response=await request({service},'POST','/v1/vaults',{name,setupCode:$('syncSetupCode').value});
   }
   saveMeta({version:1,connection:{service,seed,vault:response.vault,deviceId:response.deviceId,token:response.token,name},base:{},revision:0,lastSync:0,adoptPreferences:joining});
   $('syncSetupCode').value='';
   $('syncPairInput').value='';
   refreshControls();
   pairFeedback(name+' 已配对，正在检查首次同步。','first-sync');
   if($('deviceSyncDialog').open){
    $('syncClose').focus({preventScroll:true});
    $('deviceSyncDialog').scrollTop=0;
   }
   toast(name+' 配对成功');
   const [,synced]=await Promise.all([listDevices(),engine.sync()]);
   if(connection()?.deviceId!==response.deviceId)return;
   if(!synced&&$('syncPairFeedback').dataset.state==='first-sync'){
    pairFeedback(name+' 已配对，首次同步待完成。','first-sync');
   }
  }catch(e){
   pairFeedback((joining?'配对未完成：':'创建未完成：')+(e.message||'请重试。'),'failed');
   if($('deviceSyncDialog').open)$('syncPairFeedback').scrollIntoView({block:'nearest'});
  }finally{
   pairing=false;
   create.disabled=join.disabled=false;
  }
 }
 $('syncCreate').addEventListener('click',()=>pairDevice(false));
 $('syncJoin').addEventListener('click',()=>pairDevice(true));
 $('syncPairRead').addEventListener('click',()=>{try{const pair=K.decodePair($('syncPairInput').value.trim());$('syncService').value=serviceURL(pair.service);$('syncPairReadStatus').textContent='已读取同步服务地址。配对后将采用已连接设备的工作台设置。';}catch(e){error(e);}});
 $('syncPairGenerate').addEventListener('click',async()=>{try{const config=connection(),result=await request(config,'POST','/v1/pair');$('syncPairOutput').value=K.encodePair({service:config.service,vault:config.vault,seed:config.seed,code:result.code});$('syncPairNotice').textContent='配对内容 5 分钟有效、仅可使用一次，含解密密钥。只交给你自己的设备，勿发到公开聊天。';setTimeout(()=>{$('syncPairOutput').value='';},5*60000);}catch(e){error(e);}});
 function listNotice(message){
  if($('syncDevicesStatus').textContent!==message)$('syncDevicesStatus').textContent=message;
 }
 function renderDevices(devices,currentId,config){
  const rows=devices.map(device=>{
   const row=document.createElement('li');
   row.className='sync-device-row';
   const title=document.createElement('strong');
   title.textContent=device.name+(device.id===currentId?'（当前设备）':'');
   const paired=document.createElement('span');
   paired.className='sync-device-badge';
   paired.textContent='已配对';
   const date=document.createElement('span');
   date.className='sync-device-date';
   date.textContent='加入于 '+dateLabel(device.createdAt)+'（北京时间）';
   row.append(title,paired,date);
   if(device.id!==currentId){
    const button=document.createElement('button');
    button.className='btn btn-light';
    button.textContent='撤销此设备';
    button.setAttribute('aria-label','撤销设备 '+device.name);
    button.addEventListener('click',async()=>{
     if(button.dataset.confirm!=='yes'){
      button.dataset.confirm='yes';
      button.textContent='确认撤销';
      button.setAttribute('aria-label','确认撤销设备 '+device.name);
      return;
     }
     button.disabled=true;
     try{
      await request(config,'DELETE','/v1/devices/'+device.id);
      await listDevices(true);
      toast('已撤销 '+device.name+' 的配对');
     }catch(e){listNotice('撤销失败：'+e.message);}
     finally{button.disabled=false;}
    });
    row.append(button);
   }
   return row;
  });
  $('syncDevices').replaceChildren(...rows);
 }
 async function listDevices(manual=false){
  if(devicesLoading)return;
  let config;
  try{config=connection();}catch{return;}
  if(!config)return;
  devicesLoading=true;
  $('syncDevicesRefresh').disabled=true;
  if(manual||!listedDevices)listNotice('正在核对已配对设备…');
  try{
   const result=await request(config,'GET','/v1/devices');
   if(connection()?.deviceId!==config.deviceId)return;
   const current=result.devices.find(device=>device.id===config.deviceId);
   if(result.currentId!==config.deviceId||!current)throw Error('服务未能确认当前设备。');
   deviceName=current.name;
   const devices=[current,...result.devices.filter(device=>device.id!==current.id)];
   if(!C.same(listedDevices,devices)){
    const previous=new Set(listedDevices?.map(device=>device.id)||[]);
    const added=listedDevices?devices.filter(device=>!previous.has(device.id)):[];
    renderDevices(devices,current.id,config);
    listedDevices=devices;
    if(added.length)toast(added.map(device=>device.name).join('、')+' 已加入工作台');
   }
   listCheckedAt=Date.now();
   listNotice('已确认 '+devices.length+' 台设备已配对');
   renderIdentity();
  }catch(e){
   if(connection()?.deviceId!==config.deviceId)return;
   if(e.status===401){
    listedDevices=null;
    $('syncDevices').replaceChildren();
    status('revoked','此设备授权已失效，请断开后重新配对。');
   }
   listNotice((listedDevices?'暂时无法核对，以下为上次名单（'+dateLabel(listCheckedAt)+'）：':'未能核对设备名单：')+e.message);
  }finally{
   devicesLoading=false;
   $('syncDevicesRefresh').disabled=false;
  }
 }
 $('syncDevicesRefresh').addEventListener('click',()=>listDevices(true));
 $('syncDisconnect').addEventListener('click',async()=>{const button=$('syncDisconnect');if(button.dataset.confirm!=='yes'){button.dataset.confirm='yes';button.textContent='确认撤销当前设备并断开';return;}try{const config=connection();engine.cancel();try{await request(config,'DELETE','/v1/devices/'+config.deviceId);}catch(e){if(e.status!==401)throw e;}localStorage.removeItem(KEY);listedDevices=null;deviceName='';$('syncDevices').replaceChildren();pairFeedback('','');$('syncPairOutput').value='';showConflicts(null);refreshControls();status('local','已断开同步并撤销当前设备；本机记录保留。');}catch(e){error(e);}finally{button.dataset.confirm='';button.textContent='撤销当前设备并断开';}});
 $('syncNow').addEventListener('click',()=>engine.sync());
 document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('close',()=>{if(connection())setTimeout(()=>engine.sync(),100);}));
 function open(){refreshControls();if($('deskSettings').open)$('deskSettings').close();$('deviceSyncDialog').showModal();$('deviceSyncDialog').scrollTop=0;if(connection())listDevices(true);}
 $('deviceSyncCompact').addEventListener('click',open);$('openDeviceSync').addEventListener('click',open);$('syncClose').addEventListener('click',()=>$('deviceSyncDialog').close());
 window.addEventListener('desk-preferences-change',schedule);window.addEventListener('desk-data-change',schedule);window.addEventListener('desk-calendar-change',schedule);window.addEventListener('online',()=>engine.sync());window.addEventListener('offline',()=>{if(connection())status('pending','已保存到本机 · 离线，等待恢复网络');});document.addEventListener('visibilitychange',()=>{if(!document.hidden)engine.sync();});setInterval(()=>{if(!document.hidden){engine.sync();if($('deviceSyncDialog').open)listDevices();}},15000);
 window.deskSyncLocalFailure=()=>{localError=true;status('failed','本机保存失败 · 尚未提交同步，请导出备份或重试。');};
 window.deskSyncLocalSuccess=()=>{localError=false;};
 window.addEventListener('storage',e=>{if(e.key===KEY){engine.cancel();blocked=true;status('failed','另一页面修改了同步设置，请刷新后继续。');}});
 try{if(initialMeta?.pending){applyTarget(initialMeta.pending);blocked=false;}refreshControls();if(connection()){status('pending','已保存到本机 · 等待检查同步');setTimeout(()=>engine.sync(),1000);}else status('local','已保存到本机 · 未启用同步');}catch(e){blocked=true;error(e);}
 fetch('./sync-config.json',{cache:'no-store'}).then(r=>r.json()).then(data=>{if(!$('syncService').value&&data.serviceURL)$('syncService').value=serviceURL(data.serviceURL);}).catch(()=>{});
})();
