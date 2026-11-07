/* Explicitly reviewed local intake; drafts never write until confirmation. */
(()=>{
 'use strict';const C=window.DeskIntakeCore,$=id=>document.getElementById(id);let draftCount=0,opening=null,resolvedCount=0;
 function el(tag,text,parent,cls){const n=document.createElement(tag);n.textContent=text;if(cls)n.className=cls;parent.append(n);return n;}
 function feedback(message){$('intakeFeedback').textContent=message;}
 function field(parent,title,type,value){const label=el('label',title,parent,'companion-field'),n=el(type==='textarea'?'textarea':'input','',label);if(type!=='textarea')n.type=type;else n.rows=3;n.value=value||'';n.maxLength=type==='textarea'?2000:100;n.setAttribute('aria-label',title);return n;}
 const newID=()=> 'intake-'+(crypto.randomUUID?crypto.randomUUID():Date.now()+'-'+Math.random().toString(36).slice(2));
 function saveTask(item){if(window.deskDayStale)return {ok:false,error:'其他页面修改了记录，请刷新后再确认。'};try{const next=JSON.parse(JSON.stringify(state));if(next.tasks.some(t=>t.id===item.id))return {ok:true,duplicate:true};next.tasks.push({id:item.id,text:item.title,category:'通知收集',done:false,captureSource:item.captureSource,preparation:item.preparation});window.deskDaySync?.(next);localStorage.setItem(STORAGE_KEY,JSON.stringify(next));state=next;window.deskSyncLocalSuccess?.();renderTasks();window.dispatchEvent(new Event('desk-data-change'));return {ok:true};}catch{window.deskSyncLocalFailure?.();return {ok:false,error:'保存失败，草稿已保留，请释放空间后重试。'};}}
 function finishDraft(message){
  resolvedCount++;
  if(resolvedCount<draftCount){feedback(message+'，请继续处理其余草稿。');return;}
  $('intakeDialog').close();$('intakeDrafts').replaceChildren();$('intakeInput').value='';
  draftCount=resolvedCount=0;$('intakeReset').dataset.confirm='';$('intakeReset').textContent='重新整理';
  feedback('本次事项已处理完成。');toast(message);
 }
 function makeDraft(d){const card=el('article','',$('intakeDrafts'),'intake-draft'),heading=el('h3','草稿 '+(d.index+1),card);const form=el('form','',card);form.noValidate=true;let committed=false;
  if(d.warnings.length){el('p','初次识别提示，请结合下方已编辑字段核对：',form,'companion-note');const list=el('ul','',form,'intake-warnings');d.warnings.forEach(s=>el('li',s,list));}
  const typeLabel=el('label','加入到',form,'companion-field'),type=el('select','',typeLabel);type.setAttribute('aria-label','加入到');type.add(new Option('日程（需完整起止时间）','event'));type.add(new Option('待办（不推断截止时间）','task'));type.value=d.type;
  const title=field(form,'事项名称','text',d.title);title.required=true;
  const dates=el('div','',form,'date-fields');const start=field(dates,'开始（北京时间）','datetime-local',d.start),end=field(dates,'结束（北京时间）','datetime-local',d.end);
  const dailyFinish=field(dates,'每次结束时刻（北京时间）','time',d.end?.slice(11));
  const scheduling=el('div','',form,'intake-scheduling');
  const durations=el('div','',scheduling,'intake-durations');el('span','选个时长',durations);
  let selectedMinutes=null;
  const durationButtons=[15,30,45,60].map(minutes=>{
   const button=el('button',minutes+' 分钟',durations,'btn btn-light');button.type='button';button.setAttribute('aria-pressed','false');
   button.addEventListener('click',()=>{selectedMinutes=minutes;end.value=C.shiftTime(start.value,minutes);dailyFinish.value=end.value.slice(11);update();invalidate();});return [minutes,button];
  });
  const repeatLabel=el('label','重复',scheduling,'companion-field'),repeat=el('select','',repeatLabel);
  repeat.add(new Option('仅一次','once'));repeat.add(new Option('每天','daily'));repeat.value=d.repeat||'once';
  const days=field(scheduling,'连续安排天数','number','365');days.min='2';days.max='365';days.step='1';
  const preview=el('p','',scheduling,'intake-schedule-preview');preview.setAttribute('aria-live','polite');
  function update(){
   const event=type.value==='event',daily=repeat.value==='daily';dates.hidden=scheduling.hidden=!event;
   end.parentElement.hidden=daily;end.disabled=!event||daily;
   dailyFinish.parentElement.hidden=!daily;dailyFinish.disabled=!event||!daily;
   if(daily)end.value=C.dailyEnd(start.value,dailyFinish.value);
   start.required=event;days.parentElement.hidden=!daily;days.disabled=!event||!daily;
   for(const [minutes,button] of durationButtons){button.disabled=!start.value;button.setAttribute('aria-pressed',String(selectedMinutes===minutes));}
   const draft={type:'event',title:title.value,start:start.value,end:end.value,repeat:repeat.value,days:Number(days.value)};
   const error=C.validate(draft);
   if(error){preview.textContent=error;return;}
   const first=start.value.replace('T',' '),finish=end.value.replace('T',' ');
   preview.textContent=daily?`每天 ${start.value.slice(11)} 开始 · 共 ${days.value} 次。首场 ${first} 至 ${finish}，最后一次从 ${C.shiftTime(start.value,(Number(days.value)-1)*1440).replace('T',' ')} 开始。`:`${first} 至 ${finish}（北京时间）`;
  }
  const materialDetails=el('details','',form);materialDetails.open=!!d.materials;el('summary','准备材料（可选）',materialDetails);
  const materials=field(materialDetails,'准备材料（可编辑，无内容可留空）','textarea',d.materials);
  const source=el('details','',form);el('summary','核对原始片段',source);el('pre',d.source,source);el('p','相对日期参考：'+d.referenceDay+'（北京时间）；草稿生成后参考日期固定，跨日确认请重新核对。',form,'companion-note');
  const label=el('label','',form,'day-check'),review=el('input','',label);review.type='checkbox';review.required=true;review.setAttribute('aria-label','我已核对原文与草稿');el('span','我已核对原文、事项和时间',label);
  const buttons=el('div','',form,'day-actions'),submit=el('button','确认加入',buttons,'btn btn-primary');submit.type='submit';const skip=el('button','忽略此项',buttons,'btn btn-light');skip.type='button';
  const status=el('p','尚未入库',form,'intake-item-status');status.setAttribute('role','status');
  review.addEventListener('change',()=>{if(review.checked){status.dataset.error='false';status.textContent='已核对，可确认加入。';}});
  function showError(message,field){status.textContent=message;status.dataset.error='true';status.scrollIntoView({block:'nearest'});field?.focus();}
  const invalidate=()=>{if(!committed){review.checked=false;status.textContent='草稿已修改，请重新核对后确认。';}};
  for(const input of [title,start,end,dailyFinish,materials,type,repeat,days])input.addEventListener('input',()=>{
   if(input===start&&selectedMinutes!==null){end.value=C.shiftTime(start.value,selectedMinutes);dailyFinish.value=end.value.slice(11);}
   if(input===end){selectedMinutes=null;dailyFinish.value=end.value.slice(11);}
   if(input===dailyFinish)selectedMinutes=null;
   status.dataset.error='false';
   update();invalidate();
  });
  type.addEventListener('change',update);repeat.addEventListener('change',update);update();
  skip.addEventListener('click',()=>{if(committed)return;committed=true;heading.textContent+=' · 已忽略';form.querySelectorAll('input,textarea,select,button').forEach(n=>n.disabled=true);status.textContent='已忽略。';finishDraft('已忽略本次事项');});
  const id=newID();form.addEventListener('submit',e=>{e.preventDefault();if(committed)return;
   const draft={...d,title:title.value.trim(),start:start.value,end:repeat.value==='daily'?C.dailyEnd(start.value,dailyFinish.value):end.value,type:type.value,repeat:type.value==='event'?repeat.value:'once',days:Number(days.value),materials:materials.value.trim()},error=C.validate(draft);
   if(error){showError(error);return;}
   if(!review.checked){showError('请先勾选“我已核对原文、事项和时间”，再确认加入。',review);return;}
   const event=draft.type==='event',existing=event?(window.deskCalendarEvents?.()||[]):state.tasks;
   const occurrences=event?C.occurrences(draft):[draft];
   const pending=occurrences.map((entry,index)=>({entry,index})).filter(({entry})=>!C.duplicate(entry,existing));
   if(!pending.length){committed=true;form.querySelectorAll('input,textarea,select,button').forEach(n=>n.disabled=true);finishDraft('这些事项已在日历或待办中');return;}
   const captureSource={version:1,fragment:d.source,referenceDay:d.referenceDay,confirmedAt:new Date().toISOString()};
   const items=pending.map(({entry,index})=>({id:index?id+'-'+index:id,title:draft.title,start:entry.start+':00+08:00',end:entry.end+':00+08:00',preparation:draft.materials,captureSource}));
   submit.disabled=true;const result=event?window.deskImportLocalEvents?.(items):saveTask(items[0]);
   if(!result?.ok){submit.disabled=false;showError(result?.error||'本机日历不可用，草稿已保留。');$('storageWarning').hidden=false;return;}
   committed=true;form.querySelectorAll('input,textarea,select,button').forEach(n=>n.disabled=true);heading.textContent+=' · 已加入'+(event?'日程':'待办');status.textContent=`已保存 ${result.count??items.length} 项到本机`+(occurrences.length>items.length?`，跳过 ${occurrences.length-items.length} 项重复记录。`:'，可在原记录中查看来源。');finishDraft(status.textContent);
  });
 }
 function open(){opening=document.activeElement;if($('captureInput').value.trim()&&!$('intakeInput').value.trim()&&!draftCount)$('intakeInput').value=$('captureInput').value;$('intakeDialog').showModal();}
 $('openIntake').addEventListener('click',open);$('intakeClose').addEventListener('click',()=>$('intakeDialog').close());$('intakeDialog').addEventListener('close',()=>opening?.focus());
 $('intakeParse').addEventListener('click',()=>{const input=$('intakeInput').value.trim();if(!input){feedback('请先粘贴一段通知。');$('intakeInput').focus();return;}if(draftCount){feedback('已有草稿。请先逐项处理，或点击“重新整理”明确替换本次草稿。');return;}const drafts=C.parse(input);if(drafts.length>20){feedback('一次最多整理 20 个片段，请分批粘贴。');return;}draftCount=drafts.length;drafts.forEach(makeDraft);feedback('已生成 '+draftCount+' 项草稿，尚未写入日程或待办。这里使用本机规则，仅识别常见明确表达，请逐项核对。');});
 $('intakeReset').addEventListener('click',()=>{if($('intakeReset').dataset.confirm!=='yes'){$('intakeReset').dataset.confirm='yes';$('intakeReset').textContent='确认替换未保存草稿';feedback('再次点击会替换本次草稿；已经入库的记录保留。');return;}$('intakeDrafts').replaceChildren();draftCount=resolvedCount=0;$('intakeReset').dataset.confirm='';$('intakeReset').textContent='重新整理';$('intakeParse').click();});
 $('intakeInput').addEventListener('input',()=>{$('intakeReset').dataset.confirm='';$('intakeReset').textContent='重新整理';});
 $('noteList').addEventListener('click',()=>{$('taskProvenance').hidden=true;$('taskProvenanceText').textContent='';$('taskPreparationText').textContent='';});
 $('taskList').addEventListener('click',event=>{const button=event.target.closest('[data-edit-task]');if(!button)return;const task=state.tasks.find(t=>t.id===button.dataset.editTask);$('taskProvenance').hidden=!task?.captureSource;$('taskProvenanceText').textContent=task?.captureSource?.fragment||'';$('taskPreparationText').textContent=task?.preparation||'未填写';});
})();
