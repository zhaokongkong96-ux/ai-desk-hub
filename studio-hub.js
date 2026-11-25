(()=>{'use strict';
const $=id=>document.getElementById(id);let transport,busy=false;
const day=value=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
async function refresh(){
 if(busy||document.hidden)return;busy=true;
 try{
  if(!transport){const response=await fetch('./studio-config.json',{cache:'no-store'});if(!response.ok)throw Error('内容服务配置未加载');transport=window.DeskStudioTransport.create({serviceURL:(await response.json()).serviceURL});}
  if(!transport.paired()){$('studioDailyTitle').textContent='每日内容选题 · 配对后查看';$('studioDailySummary').textContent='沿用同一套工作台的设备配对，可在电脑、手机与 iPad 继续创作。';$('studioDailyPair').hidden=false;return;}
  $('studioDailyPair').hidden=true;
  const [topics,runs,status]=await Promise.all([transport.api('/api/topics'),transport.api('/api/runs'),transport.api('/api/status')]);const run=runs[0];
  if(!run){$('studioDailyTitle').textContent='每日内容选题 · 等待首次采集';$('studioDailySummary').textContent=status.online?'Mac 已在线，可进入工作室采集。':'Mac 离线，等待上线后采集。';return;}
  const rows=topics.filter(t=>t.run_id===run.id),today=day(run.created_at)===day(new Date());
  $('studioDailyTitle').textContent=(today?'今日内容选题':'最近内容选题 · 尚未更新到今天')+' · '+rows.length+' 个候选';
  const picked=rows.filter(t=>t.recommended).slice(0,3);const time=new Date(run.created_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
  $('studioDailySummary').textContent='采集 '+time+'（北京时间） · '+(status.online?'Mac 在线':'Mac 离线，操作将等待处理')+' · '+picked.map(t=>t.options?.display_title||t.title).join(' / ');
 }catch(e){$('studioDailyTitle').textContent='每日内容选题 · 暂未连接';$('studioDailySummary').textContent=e.message+'。进入内容工作室查看详情。';}finally{busy=false;}
}
$('studioDailyPair').onclick=()=>document.getElementById('deviceSyncCompact')?.click();
window.addEventListener('storage',e=>{if(e.key==='ai-desk-hub-sync-v1')refresh();});window.addEventListener('online',refresh);document.addEventListener('visibilitychange',refresh);setInterval(refresh,60000);
if(new URLSearchParams(location.search).get('open')==='sync')setTimeout(()=>document.getElementById('deviceSyncCompact')?.click(),500);
refresh();
})();
