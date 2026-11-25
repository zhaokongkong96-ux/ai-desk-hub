(()=>{
'use strict';
const $=id=>document.getElementById(id);
let topics=[],runs=[],selected=null,videoURL=null,busy=false,connected=false;
const preview=new URLSearchParams(location.search).has('preview');
let previewData=null,cloud=null;
$('endpoint').value=sessionStorage.getItem('studio-endpoint')||(location.port==='8876'?location.origin:'');
$('token').value=sessionStorage.getItem('studio-token')||'';
function message(value){$('status').textContent=value;}
function node(tag,value,css){const el=document.createElement(tag);if(value!==undefined)el.textContent=value;if(css)el.className=css;return el;}
function base(){const u=new URL($('endpoint').value);if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash)throw Error('请填写 Mac 后台的 HTTP 或 HTTPS 根地址');return u.origin;}
async function api(path,method='GET',data){
 if(preview)return demoAPI(path,method,data);
 if(cloud)return cloud.api(path,method,data);
 const response=await fetch(base()+path,{method,headers:{Authorization:'Bearer '+$('token').value.trim(),...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined,cache:'no-store'});
 if(!response.ok){let reason;try{reason=(await response.json()).detail;}catch{}throw Error(reason||'请求失败 '+response.status);}
 return response.json();
}
function step(value){document.querySelectorAll('[data-stage]').forEach(el=>el.dataset.active=el.dataset.stage===value?'true':'false');}
async function action(fn){if(busy)return;busy=true;document.querySelectorAll('button').forEach(b=>b.disabled=true);try{await fn();}catch(e){message('操作未完成 · '+e.message);$('dialogStatus').textContent=e.message;}finally{busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);if(cloud)renderPending();}}
function button(label,fn){const b=node('button',label);b.onclick=()=>action(fn);return b;}
async function fresh(t){
 const all=await api('/api/topics');
 Object.assign(t,all.find(row=>row.id===t.id));topics=all;render();return t;
}
function phase(t){
 if(!t.plan.selection?.confirmed_at)return t.plan.selection?'讨论中 · 待确认方向':'待你选角度';
 if(!t.plan.script)return '方向已确认 · 待研究';
 if(!t.plan.script_approval)return '脚本待你确认';
 return '脚本已确认 · 可制作';
}
function render(){
 const latest=runs[0]?.id,run=$('run').value||latest,category=$('category').value;
 const rows=topics.filter(t=>t.run_id===run&&(!category||t.category===category));
 $('topics').replaceChildren(...rows.map((t,index)=>{
  const card=node('article',undefined,'card');
  card.append(node('span',(t.recommended?'重点候选 · ':'')+t.plan.category,'badge'),node('h2',(t.options.ref||String(index+1))+' · '+t.options.display_title),
    node('p',t.options.overview,'overview'),node('small',t.provider+' · 评分 '+t.score),
    node('strong','两个可讨论的角度'));
  for(const angle of t.options.angles)card.append(node('p',angle.id.toUpperCase()+' · '+angle.title,'angle-summary'));
  const source=node('a','原始来源 ↗','source');source.href=t.url;source.target='_blank';source.rel='noopener';
  card.append(source,node('small','发布 '+new Date(t.published_at).toLocaleDateString('zh-CN')),
    node('span',phase(t),'badge'));
  const actions=node('div',undefined,'row actions');
  actions.append(button('讨论这个选题',async()=>openDirection(t)));
  if(t.plan.selection?.confirmed_at)actions.append(button('继续已确认方向',async()=>{
   if(t.plan.script)openScript(t);else openDirection(t);
  }));
  card.append(actions);return card;
 }));
 if(!rows.length)$('topics').append(node('p','本批次暂无此类真实数据，请查看来源状态。'));
}
function showDialog(){ $('dialogStatus').textContent='';if(!$('detail').open)$('detail').showModal(); }
function openDirection(t){
 selected=t;step('direction');
 const body=$('detailBody');
 body.replaceChildren(node('small','第二步 · 方向讨论'),node('h2',t.options.display_title),
   node('p',t.options.overview),node('p','请选择一个角度，也可以提出自己的问题。','muted'));
 let chosen=t.plan.selection?.id||'';
 const inputs=[];
 for(const angle of [...t.options.angles,{id:'custom',title:'我有自己的切入角度',focus:'写下你希望讲的问题与人群。'}]){
  const label=node('label',undefined,'angle-choice'),radio=node('input');
  radio.type='radio';radio.name='angle';radio.value=angle.id;radio.checked=chosen===angle.id;
  radio.onchange=()=>{chosen=angle.id;};inputs.push(radio);
  const copy=node('div');copy.append(node('strong',angle.id==='custom'?angle.title:angle.id.toUpperCase()+' · '+angle.title),node('p',angle.focus,'muted'));
  label.append(radio,copy);body.append(label);
 }
 const customTitle=node('input'),customFocus=node('textarea'),note=node('textarea');
 customTitle.placeholder='自定角度的标题';customTitle.value=t.plan.selection?.id==='custom'?t.plan.selection.title:'';
 customFocus.placeholder='这个角度具体想回答什么？';customFocus.value=t.plan.selection?.id==='custom'?t.plan.selection.focus:'';
 note.placeholder='补充想法，例如更偏设计分析、讲给谁听、希望控制在多久…';note.value=t.plan.selection?.note||'';
 for(const [el,label] of [[customTitle,'自定角度'],[customFocus,'自定问题'],[note,'想和我讨论的要求']]){
  el.setAttribute('aria-label',label);body.append(node('label',label),el);
 }
 async function save(confirmed){
  if(!chosen)throw Error('先选一个角度，或填写自己的方向');
  await api('/api/topics/'+t.id+'/selection','PUT',{angle_id:chosen,custom_title:customTitle.value,
   custom_focus:customFocus.value,note:note.value,confirmed,expected_version:t.plan_version});
  await fresh(t);
 }
 const actions=node('div',undefined,'row');
 actions.append(button('先记下想法，继续讨论',async()=>{await save(false);message('想法已保存 · 方向待你确认');$('detail').close();step('topics');}),
 button('确认这个选题与角度',async()=>{await save(true);openDirection(t);$('dialogStatus').textContent='方向已确认。可以继续研究和起草脚本，也可以回到选题列表。';}));
 body.append(actions);
 if(t.plan.selection?.confirmed_at){
  body.append(node('p','已确认方向 · '+t.plan.selection.title,'badge'),
   button('按已确认方向研究并起草',async()=>{
    message('正在按你确认的方向获取正文并起草…');
    await api('/api/topics/'+t.id+'/plan','POST');await fresh(t);openScript(t);
   }));
 }
 if(t.plan.discussion?.length){
  const history=node('details');history.append(node('summary','方向讨论记录'));
  for(const item of t.plan.discussion.slice(-6))history.append(node('p',item.angle+' · '+(item.note||'已选择方向')+' · '+(item.action==='confirmed'?'已确认':'讨论中'),'muted'));
  body.append(history);
 }
 showDialog();
}
function openScript(t){
 selected=t;step('script');
 const body=$('detailBody');body.replaceChildren(node('small','第三步 · 核对脚本与分镜'),node('h2',t.options.display_title),
 node('p','你已确认的角度 · '+t.plan.selection.title,'badge'),node('p',t.plan.selection.note||''),
 node('p',t.plan.method||'待研究草稿','muted'),
 node('p','正文取证 '+(t.plan.research?.status||'待采集')+' · '+t.url,'muted'));
 if(t.plan.working_title)body.append(node('strong','工作标题 · 讨论稿'),node('p',t.plan.working_title));
 if(t.plan.editorial_notes){
  const notes=t.plan.editorial_notes;
  const research=node('details');research.append(node('summary','研究要点与判断依据'));
  for(const fact of notes.confirmed_facts||[])research.append(node('p',fact,'muted'));
  research.append(node('p',notes.interpretation||''),node('p',notes.limits||'','muted'));
  if(t.plan.editorial_packaging){
   research.append(node('strong','本稿的叙事主线'),node('p',t.plan.editorial_packaging.throughline));
   for(const layer of t.plan.editorial_packaging.layers||[])research.append(
    node('strong',layer.meaning),node('p',layer.question),node('p',layer.anchor,'muted'));
  }
  for(const background of t.plan.conceptual_background||[]){
   const link=node('a',background.provider);link.href=background.url;link.target='_blank';link.rel='noopener';
   research.append(link,node('p',background.supports+' · '+background.access,'muted'));
  }
  for(const source of t.plan.sources||[]){
   const a=node('a',source.provider||'原始来源');a.href=source.url;a.target='_blank';a.rel='noopener';
   research.append(a,node('br'));
  }
  body.append(research,node('p',notes.duration||'','muted'));
 }
 const editors=[];
 let dirty=false;
 for(const scene of t.plan.script||[]){
  const group=node('div',undefined,'editor'),title=node('input'),narration=node('textarea');
  title.value=scene.title;narration.value=scene.narration;
  title.setAttribute('aria-label','分镜标题');narration.setAttribute('aria-label','分镜口播');
  title.oninput=narration.oninput=()=>{dirty=true;$('dialogStatus').textContent='有未保存修改，请先保存，再确认脚本。';};
  group.append(title,narration,node('p',scene.visual,'muted'));body.append(group);
  editors.push({title,narration,scene});
 }
 const actions=node('div',undefined,'row');
 actions.append(button('保存修改',async()=>{
  await api('/api/topics/'+t.id+'/script','PUT',{script:editors.map(e=>({...e.scene,title:e.title.value,narration:e.narration.value})),expected_version:t.plan_version});
  await fresh(t);dirty=false;openScript(t);message('脚本已保存，等待你确认');
 }),button('确认当前脚本',async()=>{
  if(dirty)throw Error('请先保存脚本修改');
  await api('/api/topics/'+t.id+'/approve-script','POST',{expected_version:t.plan_version});
  await fresh(t);openScript(t);message('当前脚本已确认，等待你点击开始制作');
 }),button('返回讨论角度',async()=>openDirection(t)));
 body.append(actions);
 if(t.plan.script_approval){
  body.append(node('p','脚本已确认 · 点下面的按钮开始制作','badge'),
   button('开始制作这条视频',async()=>{
    if(dirty)throw Error('请先保存并重新确认修改后的脚本');
    await api('/api/topics/'+t.id+'/produce','POST');
    if(preview){
     step('production');
     const body=$('detailBody');body.replaceChildren(node('small','第四步 · 制作与审核 · 界面示意'),node('h2',t.options.display_title),
      node('p','正式模式会在这里显示 Mac 的排队、素材准备、渲染进度。完成后出现可播放视频和素材台账。'),
      node('div','成片播放器区域','review-placeholder'),
      node('p','你可退回修改角度、脚本或镜头，也可通过审核。每次调整后重新确认相应内容。','muted'));
     body.append(button('演示 · 退回并填写修改意见',async()=>{
      const note=node('textarea');note.placeholder='例如开头再短一点，第二段多用原始画面…';body.append(note);
      body.append(button('演示 · 保存意见并返回脚本',async()=>{openScript(t);$('dialogStatus').textContent='演示中的修改意见已记录，正式模式会保存到这条成片的审核记录。';}));
     }),button('演示 · 通过成片审核',async()=>{$('dialogStatus').textContent='已体验完整流程。实际制作从正式模式下确认的选题与角度开始。';}));
     $('dialogStatus').textContent='交互演示 · 这里展示成片完成后的审核操作。';return;
    }
    message('已按你确认的选题、角度和脚本排队制作');$('detail').close();step('production');await loadJobs();$('jobs').scrollIntoView({behavior:'smooth'});
   }));
 }
 body.append(node('h3','研究材料'),node('pre',t.plan.research?.excerpt||'正文未取得，需核对原始来源。'));
 showDialog();
}
function open(t){
 if(t.plan.selection?.confirmed_at&&t.plan.script)openScript(t);else openDirection(t);
}
async function loadJobs(){
 const jobs=await api('/api/jobs');
 $('joblist').replaceChildren(...jobs.map(j=>{
  const card=node('article',undefined,'card');
  card.append(node('strong',topics.find(t=>t.id===j.topic_id)?.title||j.topic_id),
   node('p',j.status+' · '+j.stage+' · 成片审核 '+(j.review||'pending')+(j.error?' · '+j.error:'')));
  if(j.status==='complete'&&j.result?.shots){
   card.append(node('p',(j.result.resolution||'')+' · '+j.result.shots+' 个素材镜头 · 全屏剪辑','muted'));
   card.append(button('查看素材来源',async()=>{
    const entries=await api('/api/media/'+j.id+'/media-sources.json');
    $('detailBody').replaceChildren(node('h2','素材与取景台账'),
      node('pre',entries.map(e=>{
       const source=typeof e.source==='object'?e.source:{page:e.source,credit:e.credit,kind:e.kind};
       const seconds=e.seconds??((e.end||0)-(e.start||0));
       return '分镜 '+e.scene+' / 镜头 '+(e.shot??e.index??'')+' · '+seconds.toFixed(2)+' 秒\n'+(source.kind||'')+' · '+(source.credit||'')+'\n'+(source.page||'');
      }).join('\n\n')));
    $('detail').showModal();
   }));
  }
  if(j.status==='complete'&&j.review!=='rejected')card.append(button('播放审核视频',async()=>{
   let blob;
   if(cloud)blob=await cloud.download(j.id,percent=>message('正在读取审核视频 · '+percent+'%'));
   else{
    const r=await fetch(base()+'/api/media/'+j.id+'/video.mp4',{headers:{Authorization:'Bearer '+$('token').value.trim()}});
    if(!r.ok)throw Error('视频读取失败');blob=await r.blob();
   }
   if(videoURL)URL.revokeObjectURL(videoURL);
   videoURL=URL.createObjectURL(blob);
   const video=node('video');video.controls=true;video.playsInline=true;video.src=videoURL;
   const heading=node('h2','成片审核'),body=$('detailBody');body.replaceChildren(heading,video);
   const t=topics.find(t=>t.id===j.topic_id);
   if(t)body.append(button('核对脚本',async()=>open(t)));
   const reviewNote=node('textarea');reviewNote.placeholder='这条成片的审核意见';reviewNote.setAttribute('aria-label','成片审核意见');body.append(reviewNote);
   for(const [label,status] of [['通过这条成片','approved'],['退回这条成片','rejected']]){
    body.append(button(label,async()=>{await api('/api/jobs/'+j.id+'/review','PUT',{status,note:reviewNote.value});message('成片审核已保存 '+status);$('detail').close();await loadJobs();}));
   }
   $('detail').showModal();
  }));
  if(j.status==='failed')card.append(button('检查方向与脚本后重试',async()=>{
   const t=topics.find(t=>t.id===j.topic_id);if(!t)throw Error('请在历史批次中打开这个选题');
   open(t);
  }));
  return card;
 }));
}
async function load(){
 [topics,runs]=await Promise.all([api('/api/topics'),api('/api/runs')]);
 const value=$('run').value;$('run').replaceChildren(node('option','最新批次'));$('run').firstChild.value='';
 for(const run of runs){const option=node('option',new Date(run.created_at).toLocaleString()+' · '+run.status);option.value=run.id;$('run').append(option);}
 $('run').value=value;
 const latest=runs[0];
 $('coverage').textContent=latest?(beijingDay(latest.created_at)===beijingDay(new Date())?'今日选题':'当前最新批次不是今天，请查看采集状态')+' · 采集于 '+new Date(latest.created_at).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})+'（北京时间）\n'+latest.result.outcomes.map(o=>o.provider+' · '+o.status+' · '+o.count+' 条').join(' / '):'还没有采集批次。';
 render();await loadJobs();
}
$('connect').onclick=()=>action(async()=>{
 cloud=null;
 await api('/api/topics');
 sessionStorage.setItem('studio-endpoint',base());sessionStorage.setItem('studio-token',$('token').value.trim());
 connected=true;message('已连接 Mac · 审核内容保存在此 Mac 后台');await load();
});
$('refresh').onclick=()=>action(load);
$('collect').onclick=()=>action(async()=>{message('正在采集真实来源…');const r=await api('/api/collect','POST');message('采集 '+r.status+' · '+r.count+' 个候选');await load();});
$('category').onchange=render;$('run').onchange=render;$('close').onclick=()=>{$('detail').close();step('topics');};
setInterval(()=>{if(connected&&!preview&&!busy&&!document.hidden&&!$('detail').open)(cloud?refreshCloud():loadJobs()).catch(e=>message('连接未完成 · '+e.message));},20000);
async function demoAPI(path,method,data){
 if(path==='/api/topics')return previewData.topics;
 if(path==='/api/runs')return previewData.runs;
 if(path==='/api/jobs')return [];
 const id=path.split('/')[3],t=previewData.topics.find(row=>row.id===id);
 if(!t)throw Error('演示选题不存在');
 if(path.endsWith('/selection')){
  const angle=data.angle_id==='custom'?{id:'custom',title:data.custom_title,focus:data.custom_focus}:t.options.angles.find(a=>a.id===data.angle_id);
  if(!angle?.title||!angle?.focus)throw Error('请填写完整角度');
  delete t.plan.script;delete t.plan.script_approval;
  t.plan.selection={...angle,note:data.note,confirmed_at:data.confirmed?'preview':null};
 }else if(path.endsWith('/plan')){
  t.plan.method='交互演示脚本 · 正式内容在你确认方向后研究起草';
  t.plan.script=[
   {title:'开场钩子的位置',narration:'正式研究后，在这里核对与所选角度有关的开场问题。',visual:'此处核对镜头素材'},
   {title:t.plan.selection.title,narration:'正式研究后，在这里逐镜核对事实、口播与画面。',visual:t.plan.selection.focus},
   {title:'结尾收束与关注引导',narration:'在这里确认主题收束和关注邀请。',visual:'核对收束镜头与字幕'}];
 }else if(path.endsWith('/script')){t.plan.script=data.script;delete t.plan.script_approval;
 }else if(path.endsWith('/approve-script')){t.plan.script_approval={at:'preview'};
 }else if(path.endsWith('/produce'))return {preview:true};
 t.plan_version=String(Number(t.plan_version||0)+1);
 return {plan:t.plan,plan_version:t.plan_version};
}
if(preview){
 $('connectionPanel').hidden=true;
 $('previewNotice').hidden=false;
 fetch('./studio-preview.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('演示数据读取失败');return r.json();})
 .then(async data=>{previewData=data;connected=true;await load();message('交互演示 · 使用今日真实选题快照，操作仅在此页预览');})
 .catch(e=>message(e.message));
 $('collect').hidden=true;
}
function beijingDay(date){return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));}
async function refreshCloud(){
 await load();
 const status=await api('/api/status');
 message((status.online?'Mac 在线 · 可继续创作':'Mac 当前离线 · 可查看云端选题，提交的操作等待 Mac 处理')+
  ' · '+(status.schedule?'每日采集已开启':'每日采集状态待检查')+(status.last_seen?' · 最近连接 '+new Date(status.last_seen).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'}):'')+(status.pending?' · '+status.pending+' 个操作待处理':''));
 renderPending();
}
function renderPending(){
 const box=$('pendingOperations');if(!box||!cloud)return;
 const pending=cloud.pending();box.hidden=!pending.length;box.replaceChildren();
 if(pending.length){box.append(node('strong',pending.length+' 个操作等待确认结果'));
  box.append(button('检查处理结果',async()=>{for(const id of cloud.pending())await cloud.finish(id);await refreshCloud();}));
 }
}
async function connectCloud(){
 try{
  const r=await fetch('./studio-config.json',{cache:'no-store'});if(!r.ok)throw Error('内容服务配置未加载');const config=await r.json();
  cloud=window.DeskStudioTransport.create({serviceURL:config.serviceURL,onStatus:message});
  if(!cloud.paired()){
   message('请先在工作台完成设备配对。已配对设备会自动连接同一套选题和创作进度。');
   $('pairStudio').hidden=false;return;
  }
  $('pairStudio').hidden=true;$('connectionFields').hidden=true;$('connectionHelp').textContent='沿用本设备的工作台配对身份。云端保存选题和创作进度，Mac 处理研究及视频任务。';
  connected=true;await refreshCloud();
 }catch(e){message('云端连接未完成 · '+e.message);if(e.status===401||e.status===403)$('pairStudio').hidden=false;}
}
$('pairStudio').onclick=()=>{location.href='./index.html?open=sync';};
if(!preview&&location.port!=='8876')connectCloud();
if(!preview&&location.port==='8876')$('legacyConnection').hidden=false;
step('topics');
})();
