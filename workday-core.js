/* Local calendar-day rules; no network or model dependencies. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DeskDayCore=api;})(typeof window!=='undefined'?window:globalThis,()=>{
 'use strict';
 const copy=x=>JSON.parse(JSON.stringify(x));
 const day=(now=Date.now())=>new Date(+new Date(now)+8*3600000).toISOString().slice(0,10);
 const addDay=(value,n)=>new Date(Date.parse(value+'T00:00:00+08:00')+(n*86400000)+8*3600000).toISOString().slice(0,10);
 const defaultData=()=>({version:1,flows:[['start','开工',['查看今日日程','选定最多三项重点','开始当前事项']],['create','创作',['确定选题','整理材料','完成初稿','检查与修改']],['finish','收工',['整理未完成事项','保存今日记录','查看明日准备']]].map(([id,name,steps])=>({id,name,steps:steps.map((text,i)=>({id:id+'-'+i,text}))})),runs:{},repeats:[],issued:[],projects:[],preparations:{}});
 function data(raw){if(!raw)return defaultData();if(raw.version!==1||!Array.isArray(raw.flows)||!raw.runs||!Array.isArray(raw.repeats)||!Array.isArray(raw.issued)||!Array.isArray(raw.projects)||!raw.preparations)throw Error('每日使用数据格式异常，请先导出备份。');return raw;}
 function due(template,date){return template.active&&date>=template.startsOn&&(template.frequency==='daily'||template.days.includes(new Date(date+'T12:00:00+08:00').getUTCDay()));}
 function ensureTasks(state,date){const next=copy(state),w=data(next.workday);let changed=false;const issued=new Set(w.issued);for(const r of w.repeats){const id='repeat:'+r.id+':'+date;if(!due(r,date)||issued.has(id))continue;if(!next.tasks.some(t=>t.id===id))next.tasks.push({id,text:r.text,done:false,important:!!r.important,category:'重复 · '+date,repeatId:r.id,occurrenceDay:date});w.issued.push(id);issued.add(id);changed=true;}if(changed)next.workday=w;return {state:next,changed};}
 function start(w,id,date){const key=date+'/'+id;if(!w.runs[key]){const f=w.flows.find(f=>f.id===id);if(!f)throw Error('流程不存在');w.runs[key]={date,flowId:id,name:f.name,steps:f.steps.map(s=>({...s,status:'pending',taskId:null}))};}return w.runs[key];}
 function stepStatus(step,tasks){const linked=step.taskId&&tasks.find(t=>t.id===step.taskId);return linked?linked.done?'done':'pending':step.status;}
 function summary(events,tasks,date){const from=Date.parse(date+'T00:00:00+08:00'),to=from+86400000;
  const list=events.filter(e=>!e.extendedProps?.sample&&e.extendedProps?.status!=='done'&&Number.isFinite(Date.parse(e.start))&&Number.isFinite(Date.parse(e.end))&&Date.parse(e.end)>Date.parse(e.start)&&Date.parse(e.start)<to&&Date.parse(e.end)>from).slice().sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
  const timed=list.filter(e=>!e.allDay),conflicts=[];for(let i=0;i<timed.length;i++)for(let j=i+1;j<timed.length;j++)if(Math.max(from,Date.parse(timed[i].start),Date.parse(timed[j].start))<Math.min(to,Date.parse(timed[i].end),Date.parse(timed[j].end)))conflicts.push([timed[i],timed[j]]);
  return {events:list,conflicts,important:tasks.filter(t=>!t.done&&t.important)};
 }
 return {copy,day,addDay,defaultData,data,due,ensureTasks,start,stepStatus,summary};
});
