/* Read-only Feishu connection. Provider tokens never enter this page. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),KEY='ai-desk-hub-feishu-session',PENDING='ai-desk-hub-feishu-pending',SERVICE='ai-desk-hub-feishu-service';
 const load=(key,fallback=null)=>{try{return JSON.parse(localStorage.getItem(key))||fallback;}catch{return fallback;}};
 let connection=load(KEY),base='',configured=false,selected=load('ai-desk-hub-feishu-calendar',''),generation=0,loading=false,queued=false,lastSync=0,pollTimer,rangeTimer,pending=null;
 try{pending=JSON.parse(sessionStorage.getItem(PENDING)||'null');}catch{}
 const messages={not_configured:'飞书服务尚未配置 App ID、App Secret 或回调地址。',not_connected:'连接已失效，请重新授权。',reauthorize:'飞书授权已过期或被撤销，请重新连接。',scope_or_calendar_access:'没有日历读取权限。请检查用户身份权限、应用可用范围及版本发布，然后重新授权。',authorization_denied:'你取消了飞书授权。',authorization_failed:'飞书未完成授权，请检查回调地址和已发布的只读权限。',too_many_events:'时间段内日程过多，未替换现有数据，请缩小查看范围。',invalid_range:'当前日期范围超出同步范围，请回到最近一年内的日／周／月视图。',feishu_unavailable:'飞书服务暂不可用，当前显示内容可能不是最新。'};
 function status(text){$('feishuStatus').textContent=text;}
 function top(text){$('calendarConnectionStatus').textContent='本机保存 · '+text;}
 function controls(){for(const id of ['feishuSync','feishuDisconnect','feishuCalendar'])$(id).disabled=!connection;$('feishuConnect').disabled=!configured;}
 async function api(path,method='GET',data,auth=true){if(!base)throw Error('请先配置独立飞书授权服务地址。');let response;try{response=await fetch(base+path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(auth&&connection?{Authorization:'Bearer '+connection.token}:{})},...(data?{body:JSON.stringify(data)}:{}),cache:'no-store',signal:AbortSignal.timeout(20000)});}catch{throw Error('连接失败，请检查网络和飞书授权服务。');}const result=await response.json();if(!response.ok){const error=Error(messages[result.error]||'飞书连接请求失败（'+response.status+'）。');error.status=response.status;error.code=result.error;throw error;}return result;}
 function clear(){generation++;connection=null;localStorage.removeItem(KEY);lastSync=0;window.deskSetFeishuEvents?.([],0);$('feishuCalendar').replaceChildren(new Option('授权后选择',''));top('飞书未连接');controls();}
 function report(error){if(error.status===401&&connection)clear();else if(connection)top('飞书同步待重试');status(error.message);}
 async function check(){
  const value=$('feishuServiceURL').value.trim();let url;try{url=new URL(value);if(url.protocol!=='https:'||url.username||url.password||url.pathname!=='/'||url.search||url.hash)throw Error();}catch{throw Error('请填入独立飞书服务的 HTTPS 根地址，例如 https://你的服务.up.railway.app。');}
  base=url.origin;const result=await api('/api/config','GET',undefined,false);configured=result.configured;localStorage.setItem(SERVICE,JSON.stringify(base));$('feishuCallback').textContent=result.redirectURI||'服务尚未设置回调地址。';controls();
  if(!configured){status(messages.not_configured);return;}if(connection&&connection.service!==base){clear();status('服务地址已更换，请重新授权。');return;}if(connection){await sync();}else status('服务已就绪，点击「连接飞书日历」，在飞书页面完成只读授权。');
 }
 async function list(){const data=await api('/api/calendars');const options=$('feishuCalendar');options.replaceChildren();for(const c of data.calendars){const option=document.createElement('option');option.value=c.id;option.textContent=c.name+(c.primary?' · 主日历':'');options.append(option);}if(!data.calendars.length)throw Error('授权成功，但未找到可读取的飞书日历。请检查应用权限和日历成员权限。');if(!data.calendars.some(c=>c.id===selected))selected=data.calendars.find(c=>c.primary)?.id||data.calendars[0].id;options.value=selected;localStorage.setItem('ai-desk-hub-feishu-calendar',JSON.stringify(selected));}
 async function sync(){
  if(!connection||!configured||document.hidden)return;if(loading){queued=true;return;}const version=generation,session=connection.token;loading=true;$('feishuSync').disabled=true;status('正在只读同步飞书日程…');
  try{await list();if(version!==generation||session!==connection?.token)return;
   const view=window.deskCalendar?.view,now=Date.now(),start=Math.min(+new Date(view?.activeStart||now),now-86400000),end=Math.max(+new Date(view?.activeEnd||now),now+30*86400000);
   const query=new URLSearchParams({calendar:selected,start:String(start),end:String(end)});const result=await api('/api/events?'+query);if(version!==generation||session!==connection?.token)return;
   if(!Array.isArray(result.events))throw Error('服务返回的日程格式不正确，未替换现有内容。');window.deskSetFeishuEvents?.(result.events,result.syncedAt);lastSync=Date.now();top('飞书已连接 · 只读');status('已同步 '+result.events.length+' 条日程 · '+new Date(result.syncedAt).toLocaleString('zh-CN')+'。前台每 5 分钟刷新，已包含未来 30 天日程；关闭 APP 后不自动更新。');
  }finally{loading=false;controls();if(queued){queued=false;setTimeout(()=>sync().catch(report),0);}}
 }
 async function poll(){
  if(!pending)return;if(Date.now()>pending.expiresAt){sessionStorage.removeItem(PENDING);pending=null;status('本次授权已超时，请重新点击连接。');return;}
  if(document.hidden){pollTimer=setTimeout(poll,2500);return;}
  try{const result=await api('/api/oauth/claim','POST',{attemptId:pending.attemptId,claim:pending.claim},false);if(result.pending){pollTimer=setTimeout(poll,2500);return;}
   connection={token:result.token,expiresAt:result.expiresAt,service:base};try{localStorage.setItem(KEY,JSON.stringify(connection));}catch{await api('/api/connection','DELETE');connection=null;throw Error('无法保存本机连接凭据，服务端连接已撤销。');}sessionStorage.removeItem(PENDING);pending=null;generation++;controls();await sync();
  }catch(error){if([400,401].includes(error.status)){pending=null;sessionStorage.removeItem(PENDING);}report(error);if(pending)pollTimer=setTimeout(poll,5000);}
 }
 $('feishuCheck').onclick=()=>check().catch(report);
 $('feishuConnect').onclick=async()=>{
  if(!configured){status('请先检查飞书服务配置。');return;}if(connection){status('已有连接。更换飞书账号前请先断开连接。');return;}
  // Open synchronously to preserve user gesture in iPad Safari/PWA.
  const popup=window.open('about:blank','_blank');if(!popup){status('授权窗口被拦截，请允许此网站打开弹出窗口后重试。');return;}
  try{popup.opener=null;const bytes=crypto.getRandomValues(new Uint8Array(32)),claim=Array.from(bytes,n=>n.toString(16).padStart(2,'0')).join(''),digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(claim)),claimHash=Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join('');
   const result=await api('/api/oauth/start','POST',{claimHash},false);const target=new URL(result.authorizationURL);if(target.origin!=='https://accounts.feishu.cn')throw Error('授权地址不是飞书官方域名，已停止。');pending={attemptId:result.attemptId,claim,expiresAt:result.expiresAt};sessionStorage.setItem(PENDING,JSON.stringify(pending));popup.location.href=target.href;status('请在新窗口完成飞书授权，再回到此 APP；不需要复制授权码。');clearTimeout(pollTimer);pollTimer=setTimeout(poll,2000);
  }catch(error){popup.close();report(error);}
 };
 $('feishuSync').onclick=()=>sync().catch(report);
 $('feishuCalendar').onchange=()=>{selected=$('feishuCalendar').value;localStorage.setItem('ai-desk-hub-feishu-calendar',JSON.stringify(selected));generation++;window.deskSetFeishuEvents?.([],0);sync().catch(report);};
 $('feishuDisconnect').onclick=async()=>{try{if(connection){try{await api('/api/connection','DELETE');}catch(e){if(e.status!==401)throw e;}}clear();status('已删除本服务保存的授权令牌并移除飞书日程，本机日程保留。若需彻底撤销飞书侧授权，请在飞书的应用授权管理中操作。');}catch(error){status('尚未确认断开：'+error.message+' 可先在飞书中撤销该应用授权。');}};
 window.addEventListener('desk-calendar-range',()=>{clearTimeout(rangeTimer);rangeTimer=setTimeout(()=>sync().catch(report),500);});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){if(pending){clearTimeout(pollTimer);poll();}else if(Date.now()-lastSync>60000)sync().catch(report);}});
 setInterval(()=>{if(Date.now()-lastSync>=300000)sync().catch(report);},60000);
 window.addEventListener('storage',event=>{if(event.key===KEY){const next=load(KEY);generation++;connection=next;window.deskSetFeishuEvents?.([],0);controls();if(next&&next.service===base)sync().catch(report);else top('飞书未连接');}});
 controls();
 (async()=>{const config=await fetch('./feishu-config.json',{cache:'no-store'}).then(r=>r.json());$('feishuServiceURL').value=load(SERVICE,'')||config.serviceURL||'';if($('feishuServiceURL').value){await check();if(pending)poll();}else status(config.setupStatus==='hosting-limit'?'独立飞书服务尚未创建：Railway 免费计划资源额度已满。升级后可继续部署并配置飞书；当前未连接。':'接入代码已准备；需先部署独立飞书授权服务并完成飞书应用配置，然后填写服务地址。');})().catch(report);
})();
