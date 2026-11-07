/* A view of saved data: no duplicate archive, no provider calls, no implicit writes. */
(()=>{'use strict';const C=window.DeskHistoryCore,$=id=>document.getElementById(id),labels={events:'日程',notes:'记录',tasks:'待办',flows:'流程'};let kind='all',limit=80,scheduled=false;
 const el=(tag,text,parent,cls='')=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;if(parent)parent.append(n);return n;};
 const clock=value=>new Date(value).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false});
 function options(){let from='',to='',range=$('historyRange').value;const today=C.day(Date.now());if(range==='custom'){from=$('historyFrom').value;to=$('historyTo').value;}else if(range!=='all'){to=today;from=C.day(Date.parse(today+'T00:00:00+08:00')-(Number(range)-1)*86400000);}return {query:$('historySearch').value,from,to,status:$('historyStatus').value,noteType:kind==='notes'?$('historyNoteType').value:'all',includeUndated:$('historyUndated').checked};}
 function entry(row,parent,expanded){const article=el('article',undefined,parent,'history-entry');article.dataset.kind=row.kind;const details=el('details',undefined,article);details.dataset.key=row.key;details.open=expanded.has(row.key);const summary=el('summary',undefined,details);const top=el('div',undefined,summary,'history-entry-head');el('span',labels[row.kind],top,'history-type');el('span',row.statusLabel,top,'history-status');el('span',row.category,top,'history-category');
 el('h3',row.title,summary);const meta=el('p',row.source,summary,'history-meta');if(row.kind==='events')meta.append(document.createTextNode(' · '+(row.allDay?'全天':clock(row.start)+'–'+clock(row.end))));else if(row.at&&row.kind!=='flows'&&row.timeLabel!=='安排日期')meta.append(document.createTextNode(' · '+row.timeLabel+' '+clock(row.at)));else if(row.kind==='flows')meta.append(document.createTextNode(' · '+row.done+' 项完成 / '+row.steps.length+' 步'));
 if(row.missingCompletion)el('p','完成日期未记录'+(row.date?' · 按'+row.timeLabel+'归组':''),summary,'history-date-note');
 const body=el('div',undefined,details,'history-entry-detail');if(row.kind==='notes'){el('p',row.title,body);if(row.legacy)el('p','日期来自旧版记录标识。',body,'history-meta');if(row.legacyTime)el('p','旧记录仅保存时刻：'+row.legacyTime+'，未据此推断日期。',body,'history-meta');}
 if(row.kind==='tasks'&&row.createdAt)el('p','创建于 '+new Date(row.createdAt).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}),body,'history-meta');
 if(row.preparation){el('strong','准备材料',body);el('p',row.preparation,body);}if(row.detail){el('strong','已确认的原始片段',body);el('p',row.detail,body);}
 if(row.steps){const list=el('ol',undefined,body);for(const s of row.steps)el('li',s.text+' · '+({done:'已完成',pending:'未完成',skipped:'已跳过'}[s.status]||'未完成'),list);}
 if(row.kind==='events'){el('p',new Date(row.start).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false})+' 至 '+new Date(row.end).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false}),body,'history-meta');const button=el('button','在日历中查看 ↗',body,'btn btn-light');button.type='button';button.addEventListener('click',()=>{switchPage('today');window.deskCalendar?.gotoDate(row.date);document.querySelector('.calendar-panel')?.scrollIntoView({block:'start'});});}
 if(!body.children.length)el('p',row.title,body);
 }
 function render(){scheduled=false;if($('returnHistory').hidden||!$('page-return').classList.contains('active'))return;const expanded=new Set([...$('historyList').querySelectorAll('details[open]')].map(n=>n.dataset.key));$('historyList').replaceChildren();$('historyError').textContent='';let rows;try{rows=C.filter(C.project(state,window.deskCalendarEvents?.()||[]),options());}catch(e){$('historyError').textContent=e.message;$('historyCount').textContent='请检查筛选条件';$('historyMore').hidden=true;return;}
 for(const b of document.querySelectorAll('[data-history-kind]')){const key=b.dataset.historyKind;b.setAttribute('aria-pressed',String(key===kind));b.querySelector('small').textContent=String(key==='all'?rows.length:rows.filter(r=>r.kind===key).length);}
 const visible=kind==='all'?rows:rows.filter(r=>r.kind===kind),shown=visible.slice(0,limit);$('historyCount').textContent=visible.length+' 项'+(visible.length>limit?' · 已显示 '+shown.length+' 项':'');$('historyMore').hidden=shown.length>=visible.length;
 $('historyNoteTypeField').hidden=kind!=='notes';let group=null,last=null;for(const row of shown){const d=row.date||'日期未记录';if(d!==last){group=el('section',undefined,$('historyList'),'history-day');const heading=el('div',undefined,group,'history-day-heading');el('h2',d,heading);if(row.date)el('span',new Date(row.date+'T12:00:00+08:00').toLocaleDateString('zh-CN',{timeZone:'Asia/Shanghai',weekday:'long'}),heading);last=d;}entry(row,group,expanded);}
 if(!visible.length){el('p','没有符合条件的历史内容。', $('historyList'),'history-empty');el('p','可以切换类型、放宽日期范围，或清空关键词。', $('historyList'),'history-empty-hint');}
 }
 function refresh(){if(scheduled)return;scheduled=true;requestAnimationFrame(render);}
 for(const b of document.querySelectorAll('[data-history-kind]'))b.addEventListener('click',()=>{kind=b.dataset.historyKind;limit=80;render();});
 for(const id of ['historySearch','historyFrom','historyTo','historyStatus','historyNoteType','historyUndated'])$(id).addEventListener(id==='historySearch'?'input':'change',()=>{limit=80;render();});
 $('historyRange').addEventListener('change',()=>{$('historyDates').hidden=$('historyRange').value!=='custom';$('historyUndated').checked=$('historyRange').value==='all';limit=80;render();});
 $('historyReset').addEventListener('click',()=>{kind='all';limit=80;$('historySearch').value='';$('historyRange').value='all';$('historyDates').hidden=true;$('historyFrom').value=$('historyTo').value='';$('historyStatus').value=$('historyNoteType').value='all';$('historyUndated').checked=true;render();});
 $('historyMore').addEventListener('click',()=>{limit+=80;render();});
 const returnViews=document.querySelectorAll('[data-return-view]');
 function showReturnView(view){
  const showHistory=view==='history';
  $('returnHome').hidden=showHistory;
  $('returnHistory').hidden=!showHistory;
  for(const button of returnViews){
   button.setAttribute('aria-pressed',String(button.dataset.returnView===view));
  }
  if(showHistory)render();
 }
 window.deskShowReturnHome=()=>showReturnView('home');
 for(const button of returnViews){
  button.addEventListener('click',()=>showReturnView(button.dataset.returnView));
 }
 for(const button of document.querySelectorAll('[data-open-history]')){
  button.addEventListener('click',()=>{
   kind=button.dataset.openHistory||'all';
   limit=80;
   switchPage('return');
   showReturnView('history');
   document.querySelector('[data-return-view=history]').focus({preventScroll:true});
  });
 }
 window.addEventListener('desk-data-change',refresh);
 window.addEventListener('desk-calendar-change',refresh);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden)refresh();});
})();
