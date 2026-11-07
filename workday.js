/* Local routines, recurring tasks, project steps, and tomorrow preparation. */
(()=>{
 'use strict';
 const C=window.DeskDayCore,$=id=>document.getElementById(id);let flowId='start',tab='today',repeatEdit=null,projectEdit=null,projectDraftDirty=false;
 const projectStepDrafts=new Map(),projectStepsOpen=new Map();
 const w=()=>C.data(state.workday),uid=()=>crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2);
 function el(tag,text,parent,cls){const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;parent.append(n);return n;}
 function action(text,parent,fn){const b=el('button',text,parent,'btn btn-light');b.type='button';b.addEventListener('click',fn);return b;}
 function feedback(text){$('workdayFeedback').textContent=text;$('briefFeedback').textContent=text;}
 window.deskDaySync=next=>{if(next.workday?.version!==1||!next.workday.runs)return;for(const run of Object.values(next.workday.runs))if(run?.date===C.day()&&Array.isArray(run.steps))for(const step of run.steps)if(step)step.status=C.stepStatus(step,next.tasks);};
 function commit(change){if(window.deskDayStale){feedback('另一个页面修改了记录，请先刷新再继续。');return false;}try{const next=C.copy(state);next.workday=C.copy(w());change(next,next.workday);window.deskDaySync(next);localStorage.setItem(STORAGE_KEY,JSON.stringify(next));state=next;window.deskSyncLocalSuccess?.();renderTasks();renderNotes();window.dispatchEvent(new Event('desk-data-change'));feedback('已保存到本机。');return true;}catch(error){window.deskSyncLocalFailure?.();$('storageWarning').hidden=false;feedback('保存失败，未提交本次修改。请保留输入、导出备份后重试。');return false;}}
 function lines(input){return input.split('\n').map(s=>s.trim()).filter(Boolean);}
 function renderFlow(){const box=$('flowRun');box.replaceChildren();const f=w().flows.find(f=>f.id===flowId),run=w().runs[C.day()+'/'+flowId];
  $('flowSelect').replaceChildren(...w().flows.map(f=>new Option(f.name,f.id)));$('flowSelect').value=flowId;
  if(!run){el('p','建议流程，可按你的习惯编辑。每次手动开始，当天进度会保留。',box);f.steps.forEach(s=>el('p',s.text,box));action('开始'+f.name,box,()=>commit((_,d)=>C.start(d,flowId,C.day())));return;}
  const statuses=run.steps.map(s=>C.stepStatus(s,state.tasks)),index=statuses.indexOf('pending');el('p',run.date+' · '+statuses.filter(s=>s==='done').length+' 项完成 / '+statuses.filter(s=>s==='skipped').length+' 项跳过 / '+run.steps.length+' 项',box,'companion-note');
  run.steps.forEach((s,i)=>{const row=el('div','',box,'day-step'+(index===i?' day-current':''));el('strong',(index===i?'当前一步 · ':'')+s.text,row);el('span',{pending:'未完成',done:'已完成',skipped:'已跳过'}[statuses[i]],row,'companion-note');
   const controls=el('div','',row,'day-actions');action(statuses[i]==='done'?'返回未完成':'完成',controls,()=>commit((next,d)=>{const step=C.start(d,flowId,C.day()).steps[i],task=next.tasks.find(t=>t.id===step.taskId);if(task)task.done=statuses[i]!=='done';step.status=statuses[i]==='done'?'pending':'done';}));
   if(statuses[i]==='pending'&&!s.taskId)action('跳过',controls,()=>commit((_,d)=>{C.start(d,flowId,C.day()).steps[i].status='skipped';}));
   if(statuses[i]==='skipped')action('返回',controls,()=>commit((_,d)=>{C.start(d,flowId,C.day()).steps[i].status='pending';}));
   const select=el('select','',row);select.setAttribute('aria-label','关联待办：'+s.text);select.add(new Option('不关联待办',''));for(const t of state.tasks)select.add(new Option(t.text,t.id));if(s.taskId&&!state.tasks.some(t=>t.id===s.taskId))select.add(new Option('原待办已删除',s.taskId));select.value=s.taskId||'';select.addEventListener('change',()=>{const chosen=select.value;commit((_,d)=>{const step=C.start(d,flowId,C.day()).steps[i];step.status=C.stepStatus(step,state.tasks);step.taskId=chosen||null;});});
  });if(index<0)el('p','本轮流程已结束，可以随时返回调整。',box);
 }
 function renderHistory(){const box=$('flowHistory');box.replaceChildren();const runs=Object.values(w().runs).filter(r=>r.date<C.day()).sort((a,b)=>b.date.localeCompare(a.date));if(!runs.length)el('p','开始使用后，这里保留过去的流程记录。',box);for(const r of runs){const item=el('details','',box);el('summary',r.date+' · '+r.name,item);r.steps.forEach(s=>el('p',s.text+' · '+({done:'已完成',pending:'未完成',skipped:'已跳过'}[s.status]||'未完成'),item));}}
 function renderRepeats(){const box=$('repeatList');box.replaceChildren();if(!w().repeats.length)el('p','还没有重复任务。只生成启用后当天的任务，不补造过去日期。',box,'companion-note');
  for(const r of w().repeats){const row=el('div','',box,'day-step');el('strong',r.text,row);el('p',(r.active?'启用':'已暂停')+' · '+(r.frequency==='daily'?'每天':'每周 '+r.days.map(d=>'日一二三四五六'[d]).join('、'))+' · 自 '+r.startsOn+' 起',row,'companion-note');const controls=el('div','',row,'day-actions');action(r.active?'暂停后续':'恢复后续',controls,()=>{if(commit((_,d)=>{d.repeats.find(x=>x.id===r.id).active=!r.active;}))refreshDay();});action('编辑后续模板',controls,()=>{repeatEdit=r.id;$('repeatText').value=r.text;$('repeatFrequency').value=r.frequency;$('repeatImportant').checked=!!r.important;document.querySelectorAll('[name=repeatWeekday]').forEach(c=>c.checked=r.days.includes(Number(c.value)));$('repeatEditor').open=true;$('repeatSave').textContent='保存后续模板';$('repeatText').focus();});}
 }
 function resetProjectEditor(){projectEdit=null;projectDraftDirty=false;$('projectForm').reset();$('projectFormTitle').textContent='新建项目卡';$('projectSave').textContent='确认并创建项目卡';$('projectCancel').hidden=true;$('projectStepsField').hidden=false;}
 function editProject(p){
  if(projectDraftDirty){feedback('请先保存或取消当前项目草稿，再编辑其他项目。');$('projectForm').scrollIntoView({block:'nearest'});return;}
  projectEdit=p.id;const resume=p.resume||{};$('projectName').value=p.name;
  for(const [field,key] of [['projectDecision','decision'],['projectNextAction','nextAction'],['projectSource','source']])$(field).value=typeof resume[key]==='string'?resume[key]:'';
  $('projectLinks').value=Array.isArray(resume.links)?resume.links.map(link=>link.label+' | '+link.target).join('\n'):'';
  $('projectFormTitle').textContent='编辑项目卡';$('projectSave').textContent='确认并保存项目卡';$('projectCancel').textContent='取消编辑';$('projectCancel').hidden=false;$('projectStepsField').hidden=true;
  $('projectForm').scrollIntoView({block:'nearest'});$('projectName').focus();
 }
 function projectField(parent,label,text,fallback,cls=''){const block=el('div','',parent,'project-context '+cls);el('dt',label,block);el('dd',typeof text==='string'&&text.trim()?text:fallback,block);}
 function renderProjects(){
  const box=$('projectList');box.replaceChildren();
  if(!w().projects.length)el('p','还没有项目卡。先记录一个正在推进的项目，下次从这里继续。',box,'companion-note');
  for(const p of w().projects){
   const section=el('article','',box,'project-resume-card'),steps=state.tasks.filter(t=>t.projectId===p.id),resume=p.resume||{};
   section.setAttribute('aria-label','项目卡：'+p.name);const head=el('div','',section,'project-card-head');el('h3',p.name,head);action('编辑项目卡',head,()=>editProject(p));
   const context=el('dl','',section,'project-context-grid');
   projectField(context,'上次定了什么',resume.decision,'尚未记录确认结论');projectField(context,'下一步做什么',resume.nextAction,'尚未填写下一步','project-next-action');
   const meta=el('div','',section,'project-card-meta');el('p','来源 · '+(resume.source||'未填写'),meta);
   if(typeof resume.updatedAt==='string'&&Number.isFinite(Date.parse(resume.updatedAt))){const row=el('p','卡片更新 · ',meta),stamp=el('time',new Date(resume.updatedAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+'（北京时间）',row);stamp.dateTime=resume.updatedAt;}else el('p','尚未记录更新时间',meta);
   const links=el('div','',section,'project-continuations');
   if(!Array.isArray(resume.links)||!resume.links.length)el('p','继续入口尚未填写',links,'companion-note');
   for(const entry of Array.isArray(resume.links)?resume.links:[]){
    let target;try{target=C.projectTarget(entry.target);}catch{el('p','入口无效，请编辑项目卡。',links,'companion-note');continue;}
    if(target.kind==='web'){const a=el('a',(entry.label||'继续工作')+' ↗',links,'btn btn-light');a.href=target.target;a.target='_blank';a.rel='noopener noreferrer';a.title=target.target;}
    else {const file=el('div','',links,'project-file-entry');el('span',entry.label||'本机文件',file);el('code',target.target,file);
     const manual=el('input','',file);manual.type='text';manual.value=target.target;manual.readOnly=true;manual.hidden=true;manual.setAttribute('aria-label','文件路径：'+(entry.label||'本机文件'));
     action('复制路径',file,async()=>{try{if(!navigator.clipboard?.writeText)throw Error('Clipboard unavailable');await navigator.clipboard.writeText(target.target);feedback('已复制文件路径，请在文件所在电脑打开。');}catch{manual.hidden=false;manual.focus();manual.select();feedback('自动复制不可用，已选中路径，请手动复制。');}});
    }
   }
   const detail=el('details','',section,'project-steps');detail.open=projectStepsOpen.get(p.id)??true;
   el('summary',steps.filter(t=>t.done).length+' / '+steps.length+' 步完成',detail);detail.addEventListener('toggle',()=>projectStepsOpen.set(p.id,detail.open));
   for(const t of steps){const label=el('label','',detail,'day-check'),input=el('input','',label);input.type='checkbox';input.checked=!!t.done;input.addEventListener('change',()=>{const checked=input.checked;if(!commit(next=>{next.tasks.find(x=>x.id===t.id).done=checked;}))input.checked=!!t.done;});el('span',t.text,label);}
   const form=el('form','',detail,'day-actions'),input=el('input','',form);input.placeholder='添加项目步骤';input.setAttribute('aria-label','为'+p.name+'添加步骤');input.required=true;input.maxLength=240;input.value=projectStepDrafts.get(p.id)||'';
   input.addEventListener('input',()=>projectStepDrafts.set(p.id,input.value));el('button','添加步骤',form,'btn btn-light').type='submit';
   form.addEventListener('submit',e=>{e.preventDefault();const text=input.value.trim();if(text&&commit(next=>next.tasks.push({id:uid(),text,projectId:p.id,category:'项目 · '+p.name,done:false}))){projectStepDrafts.delete(p.id);renderProjects();}});
  }
 }
 function time(value){return new Date(value).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false});}
 function renderBrief(){if(tab==='today'){$('briefDetails').hidden=false;$('tomorrowDetails').hidden=true;return;}$('briefDetails').hidden=true;$('tomorrowDetails').hidden=false;const box=$('tomorrowDetails');box.replaceChildren();const date=C.addDay(C.day(),1),result=C.summary(window.deskCalendarEvents?.()||[],state.tasks,date);
  el('h3',date+' · 明日准备（北京时间）',box);el('p','本机规则整理，仅覆盖当前已读取的日程。'+($('calendarConnectionStatus').textContent||'')+'；未读取的外部日历无法判断。',box,'companion-note');
  if(!result.events.length)el('p','当前已读取的明日日程为空。',box);
  result.events.forEach((event,i)=>{const card=el('section','',box,'day-step');el('h3',(i===0?'第一项安排 · ':'')+event.title,card);el('p',(event.allDay?'全天':(C.day(event.start)<date?'前日开始 · ':'')+time(event.start)+'—'+time(event.end)+(C.day(event.end)>date?'（次日）':''))+' · '+(event.extendedProps?.source==='feishu'?'飞书只读':'本机日历'),card,'companion-note');
   const form=el('form','',card);const label=el('label','需要准备的材料（仅保存你填写的内容）',form,'companion-field');const input=el('textarea','',label);input.rows=2;input.maxLength=2000;input.value=Object.prototype.hasOwnProperty.call(w().preparations,event.id)?w().preparations[event.id]:(event.extendedProps?.preparation||'');input.placeholder='未填写';input.setAttribute('aria-label','准备材料：'+event.title);el('button','保存准备材料',form,'btn btn-light').type='submit';form.addEventListener('submit',e=>{e.preventDefault();commit((_,d)=>{d.preparations[event.id]=input.value.trim();});});
  });el('h3','时间冲突',box);if(!result.conflicts.length)el('p','当前已读取的定时日程未发现时间重叠。全天安排不按定时冲突判断。',box,'companion-note');result.conflicts.forEach(pair=>el('p',pair[0].title+' 与 '+pair[1].title+' 的时间重叠。',box));
  el('h3','尚未完成的重要待办',box);if(!result.important.length)el('p','暂无。',box,'companion-note');result.important.forEach(t=>el('p',t.text+(t.occurrenceDay?' · 所属日期 '+t.occurrenceDay:' · 未设置截止日期'),box));
  const planned=w().repeats.filter(r=>C.due(r,date));if(planned.length){el('h3','明日重复任务预览',box);planned.forEach(r=>el('p',r.text+' · 明日打开工作台后生成',box));}
 }
 function render(){try{renderFlow();renderHistory();renderRepeats();renderProjects();if($('briefDialog').open&&!$('briefDialog').contains(document.activeElement?.closest('textarea')))renderBrief();}catch(e){$('workdayFeedback').textContent=e.message;}}
 function refreshDay(){if(window.deskDayStale)return;try{const result=C.ensureTasks(state,C.day());if(result.changed){if(commit((next)=>{next.tasks=result.state.tasks;next.workday=result.state.workday;}))renderTasks();}if(!document.querySelector('#workdayDialog input:focus,#workdayDialog textarea:focus,#workdayDialog select:focus,#briefDialog textarea:focus'))render();}catch(e){feedback(e.message);}}
 $('reviewPriorities').textContent='今日 / 明日';
 $('openWorkday').addEventListener('click',()=>{refreshDay();$('workdayDialog').showModal();});
 $('flowSelect').addEventListener('change',()=>{flowId=$('flowSelect').value;renderFlow();});
 $('flowEdit').addEventListener('click',()=>{const f=w().flows.find(f=>f.id===flowId);$('flowSteps').value=f.steps.map(s=>s.text).join('\n');$('flowEditor').hidden=false;$('flowSelect').disabled=true;});
 $('flowCancel').addEventListener('click',()=>{$('flowEditor').hidden=true;$('flowSelect').disabled=false;});
 $('flowEditor').addEventListener('submit',e=>{e.preventDefault();const steps=lines($('flowSteps').value);if(steps.length<1||steps.length>10){$('workdayFeedback').textContent='请填写 1—10 步，每行一步。';return;}if(commit((_,d)=>{d.flows.find(f=>f.id===flowId).steps=steps.map(text=>({id:uid(),text}));})){$('flowEditor').hidden=true;$('flowSelect').disabled=false;}});
 $('repeatForm').addEventListener('submit',e=>{e.preventDefault();const text=$('repeatText').value.trim(),frequency=$('repeatFrequency').value,days=[...document.querySelectorAll('[name=repeatWeekday]:checked')].map(c=>Number(c.value));if(!text||(frequency==='weekly'&&!days.length)){$('workdayFeedback').textContent='请填写任务；每周任务至少选择一天。';return;}
  if(commit((_,d)=>{const old=d.repeats.find(r=>r.id===repeatEdit),value={id:old?.id||uid(),text,frequency,days,active:old?old.active:true,important:$('repeatImportant').checked,startsOn:old?.startsOn||C.day()};if(old)Object.assign(old,value);else d.repeats.push(value);})){repeatEdit=null;$('repeatForm').reset();$('repeatSave').textContent='保存重复任务';refreshDay();}});
 $('repeatCancel').addEventListener('click',()=>{repeatEdit=null;$('repeatForm').reset();$('repeatSave').textContent='保存重复任务';});
 $('projectForm').addEventListener('submit',e=>{
  e.preventDefault();const name=$('projectName').value.trim(),steps=projectEdit?[]:lines($('projectSteps').value),old=projectEdit?w().projects.find(p=>p.id===projectEdit):null;
  if(!name||name.length>100||steps.length>20||steps.some(text=>text.length>240)){feedback('请填写项目名称；最多 20 个步骤，每步不超过 240 字。');return;}
  if(projectEdit&&!old){feedback('原项目已不存在，请取消编辑并刷新。');return;}
  let resume;try{resume=C.projectResume({decision:$('projectDecision').value,nextAction:$('projectNextAction').value,source:$('projectSource').value,linksText:$('projectLinks').value},old?.resume);}catch(error){feedback(error.message);return;}
  if(old&&old.name!==name)resume.updatedAt=new Date().toISOString();
  if(commit((next,d)=>{if(old){const p=d.projects.find(p=>p.id===old.id);p.name=name;p.resume=resume;next.tasks.filter(t=>t.projectId===p.id).forEach(t=>{t.category='项目 · '+name;});}else{const id=uid();d.projects.push({id,name,resume});steps.forEach(text=>next.tasks.push({id:uid(),text,projectId:id,category:'项目 · '+name,done:false}));}}))resetProjectEditor();
 });
 $('projectForm').addEventListener('input',()=>{projectDraftDirty=true;$('projectCancel').hidden=false;$('projectCancel').textContent=projectEdit?'取消编辑':'清空草稿';});
 $('projectCancel').addEventListener('click',resetProjectEditor);
 document.querySelectorAll('[data-brief-tab]').forEach(b=>b.addEventListener('click',()=>{tab=b.dataset.briefTab;document.querySelectorAll('[data-brief-tab]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));renderBrief();}));
 $('reviewPriorities').addEventListener('click',()=>renderBrief());window.addEventListener('desk-data-change',render);window.addEventListener('desk-calendar-change',()=>{if($('briefDialog').open&&!$('briefDialog').querySelector('textarea:focus'))renderBrief();});
 window.addEventListener('storage',e=>{if(e.key===STORAGE_KEY||e.key===null){window.deskDayStale=true;$('storageWarning').hidden=false;feedback('另一个页面修改了本机记录，请关闭编辑并刷新后继续，避免覆盖。');$('workdayDialog').querySelectorAll('button,select,input,textarea').forEach(n=>{if(!n.hasAttribute('data-close-dialog'))n.disabled=true;});}});
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refreshDay();});window.addEventListener('pageshow',refreshDay);setInterval(()=>{if(!document.hidden)refreshDay();},30000);refreshDay();
})();
