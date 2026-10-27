/* FullCalendar is vendored locally under its MIT license. Local events stay in this browser; Feishu events are a read-only, in-memory overlay. */
(() => {
  'use strict';
  const KEY = 'ai-desk-hub-calendar-v1';
  const dialog = document.getElementById('eventDialog');
  const form = document.getElementById('eventForm');
  const title = document.getElementById('eventTitle');
  const start = document.getElementById('eventStart');
  const end = document.getElementById('eventEnd');
  const category = document.getElementById('eventCategory');
  const error = document.getElementById('eventError');
  const deleteButton = document.getElementById('deleteEvent');
  const colors={work:{fill:'#00242c',line:'#008ca0',text:'#39d5e5'},research:{fill:'#25172f',line:'#8152a2',text:'#c89aee'},personal:{fill:'#06271d',line:'#14805c',text:'#4bd3a0'},meeting:{fill:'#2d1726',line:'#a34479',text:'#ee8dbe'},deadline:{fill:'#2d2011',line:'#a4712c',text:'#efb76f'}};
  const status=document.getElementById('eventStatus');
  const statusNames={normal:'正常',important:'重要',done:'已完成'};
  function eventPaint(key){const c=colors[key]||colors.work;return {backgroundColor:c.fill,borderColor:c.line,textColor:c.text};}
  let selectedId = null;
  function localValue(date) {
    const d = new Date(date);
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0,16);
  }
  function exampleAt(hour, minute) { const d = new Date(); d.setHours(hour,minute,0,0); return d.toISOString(); }
  function seedEvents() {
    return [
      {id:'sample-plan', title:'示例 · 整理今日优先级',start:exampleAt(9,30),end:exampleAt(10,0),extendedProps:{category:'work',sample:true}},
      {id:'sample-focus',title:'示例 · 深度工作',start:exampleAt(10,30),end:exampleAt(12,0),extendedProps:{category:'work',sample:true}},
      {id:'sample-research',title:'示例 · AI 硬件项目研究',start:exampleAt(14,0),end:exampleAt(15,0),extendedProps:{category:'research',sample:true}}
    ];
  }
  let events = [];
  let marks={};try{marks=JSON.parse(localStorage.getItem('ai-desk-hub-feishu-marks')||'{}');}catch{}
  const remote=e=>e.extendedProps?.source==='feishu';
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) events = seedEvents();
    else {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('日程数据格式异常');
      events = parsed.filter(e => e && e.extendedProps?.source!=='feishu' && typeof e.id==='string' && typeof e.title==='string' && Number.isFinite(Date.parse(e.start)) && Number.isFinite(Date.parse(e.end)) && Date.parse(e.end)>Date.parse(e.start));
    }
  } catch (e) { document.getElementById('storageWarning').hidden=false; }
  const calendarElement = document.getElementById('calendar');
  if (!window.FullCalendar) {
    calendarElement.textContent = '日历组件加载失败，请在线刷新一次或检查本地文件。';
    document.getElementById('addEvent').disabled = true;
    return;
  }
  function serialize() {
    return calendar.getEvents().map(e => ({id:e.id,title:e.title,start:e.start.toISOString(),end:(e.end || new Date(e.start.getTime()+1800000)).toISOString(),allDay:e.allDay,extendedProps:{category:e.extendedProps.category || 'work',sample:!!e.extendedProps.sample,status:e.extendedProps.status||'normal',...(remote(e)?{source:'feishu'}:{})}}));
  }
  function persistCalendar() {
    events = serialize();
    document.getElementById('calendarSource').textContent=(events.some(remote)?'本机 + 飞书只读':'本机日历')+(events.some(e=>e.extendedProps.sample)?' · 含示例':'');
    try { localStorage.setItem(KEY,JSON.stringify(events.filter(e=>!remote(e)))); }
    catch(e) { document.getElementById('storageWarning').hidden=false; }
    renderNext();
    renderTimeline();
    window.dispatchEvent(new Event('desk-calendar-change'));
  }
  function renderNext() {
    const now = Date.now();
    const ordered = events.filter(e=>Date.parse(e.end)>now&&e.extendedProps?.status!=='done').sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
    const next = ordered[0];
    document.getElementById('nextEventTitle').textContent = next ? next.title : '今天，留一点自由时间';
    const node = document.getElementById('nextEventTime');
    node.textContent = next ? (Date.parse(next.start)<=now?'进行中 · ':'') + new Date(next.start).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false}) + ' — ' + new Date(next.end).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false}) : '没有接下来的日程，可点“新增日程”安排。';
  }
  let returnFocus = null;
  function openEditor(data={}) {
    returnFocus = document.activeElement;
    selectedId = data.id || null;
    const initial = data.start ? new Date(data.start) : new Date(calendar.getDate());
    if (!data.start) {
      const now = new Date(); initial.setHours(now.getHours()+1,0,0,0);
    }
    title.value = data.title || '';
    start.value = localValue(initial);
    end.value = localValue(data.end || new Date(initial.getTime()+3600000));
    category.value = data.extendedProps?.category || 'work';
    status.value=data.extendedProps?.status||'normal';
    document.getElementById('eventDialogTitle').textContent = selectedId ? '编辑日程' : '新增日程';
    const isRemote=remote(data);
    for(const input of [title,start,end,category])input.disabled=isRemote;
    document.querySelector('#eventForm button[type=submit]').textContent=isRemote?'保存本机提醒标记':'保存日程';
    document.getElementById('eventSource').textContent = isRemote?'飞书只读日程；标题和时间请在飞书修改。此处状态仅用于本机显示和提醒，不回写飞书。':data.extendedProps?.sample ? '这是一条示例日程。保存后成为你的本机日程。' : '本机日程，仅保存在当前浏览器，不回写飞书。';
    deleteButton.hidden = !selectedId||isRemote;
    deleteButton.textContent = '删除日程';
    deleteButton.dataset.confirm = '';
    error.textContent = '';
    dialog.showModal();
    title.focus();
  }
  function closeEditor() { dialog.close(); if(returnFocus?.isConnected)returnFocus.focus(); }
  // Share the existing FullCalendar store/editor; no premium timeline dependency.
  const timeline = document.getElementById('dayTimeline');
  const panel = document.querySelector('.calendar-panel');
  const timeText = date => date.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});
  function renderTimeline() {
    const visible = calendar.view.type === 'timeGridDay';
    panel.classList.toggle('horizontal-day',visible);
    timeline.hidden = !visible;
    if (!visible) return;
    const day = new Date(calendar.getDate()); day.setHours(0,0,0,0);
    const tomorrow = new Date(day); tomorrow.setDate(tomorrow.getDate()+1);
    const span = tomorrow-day;
    timeline.dataset.dayStart=String(+day);timeline.dataset.dayEnd=String(+tomorrow);
    const ratio = date => Math.max(0,Math.min(1,(date-day)/span));
    const items = calendar.getEvents().filter(e=>e.start<tomorrow && (e.end||new Date(+e.start+1800000))>day)
      .sort((a,b)=>a.start-b.start || a.id.localeCompare(b.id));
    timeline.replaceChildren();
    const graph = document.createElement('div'); graph.className='timeline-graph';
    const hours = document.createElement('div'); hours.className='timeline-hours';
    for(let hour=0;hour<=24;hour++) {
      const label=document.createElement('span');label.textContent=String(hour).padStart(2,'0');
      label.style.left=(hour/24*100)+'%';hours.append(label);
    }
    graph.append(hours);
    const scroll=document.createElement('div');scroll.className='timeline-scroll';
    const track=document.createElement('div');track.className='timeline-track';
    const lanes=[];
    const agenda=document.createElement('div');agenda.className='timeline-agenda';
    const heading=document.createElement('div');heading.className='timeline-agenda-heading';heading.textContent='全天安排 · '+items.length;agenda.append(heading);
    scroll.append(track);graph.append(scroll);timeline.append(graph,agenda);
    const minimumWidth=28/Math.max(1,track.clientWidth)*100;
    items.forEach(event=>{
      const finish=event.end||new Date(+event.start+1800000);
      const left=ratio(event.start)*100;
      const width=(ratio(finish)-ratio(event.start))*100;
      // Reserve a minimum hit area when assigning lanes, including short events.
      const right=Math.min(100,left+Math.max(width,minimumWidth));
      let lane=lanes.findIndex(edge=>edge<=left);if(lane<0)lane=lanes.length;lanes[lane]=right;
      const paint=colors[event.extendedProps.category]||colors.work;
      const state=event.extendedProps.status||'normal';
      const period=event.allDay?'全天':(event.start<day?'前日 ': '')+timeText(event.start)+' – '+(finish>=tomorrow?'次日 ':'')+timeText(finish);
      const label=period+' · '+event.title+(state==='normal'?'':' · '+statusNames[state]);
      const button=document.createElement('button');button.type='button';button.className='timeline-event event-'+state;
      button.style.cssText='left:'+left+'%;width:'+width+'%;max-width:'+(100-left)+'%;top:'+(lane*52+12)+'px;--event-fill:'+paint.fill+';--event-line:'+paint.line+';--event-text:'+paint.text;
      button.setAttribute('aria-label',label+(remote(event)?'，飞书只读，点击查看':'，点击编辑'));button.title=label;
      const name=document.createElement('span');name.textContent=event.title;button.append(name);
      const row=document.createElement('button');row.type='button';row.className='timeline-agenda-item event-'+state;
      row.style.setProperty('--event-text',paint.text);row.setAttribute('aria-label',label+(remote(event)?'，飞书只读，点击查看':'，点击编辑'));
      const rowTime=document.createElement('small');rowTime.textContent=period;
      const rowName=document.createElement('span');rowName.textContent=event.title+(state==='normal'?'':' ['+statusNames[state]+']');row.append(rowTime,rowName);
      row.addEventListener('click',()=>openEditor(event));agenda.append(row);
      let drag=null,suppressClick=false;
      button.addEventListener('pointerdown',e=>{
        if(remote(event)||e.button!==0 || event.allDay || event.start<day || finish>tomorrow)return;
        drag={x:e.clientX,start:+event.start,end:+finish,moved:false};button.setPointerCapture(e.pointerId);
      });
      button.addEventListener('pointermove',e=>{
        if(!drag)return;
        const delta=e.clientX-drag.x;if(Math.abs(delta)<6&&!drag.moved)return;
        drag.moved=true;
        const step=900000;
        const shift=Math.round(delta/track.getBoundingClientRect().width*span/step)*step;
        drag.shift=Math.max(+day-drag.start,Math.min(+tomorrow-drag.end,shift));
        button.style.left=((drag.start+drag.shift-day)/span*100)+'%';button.classList.add('is-dragging');
      });
      button.addEventListener('pointerup',()=>{
        if(!drag)return;
        const moved=drag.moved,change=drag.shift||0,from=drag.start,to=drag.end;drag=null;
        if(moved){suppressClick=true;event.setDates(new Date(from+change),new Date(to+change));persistCalendar();toast('日程时间已更新');}
      });
      button.addEventListener('pointercancel',()=>{drag=null;renderTimeline();});
      button.addEventListener('click',e=>{e.stopPropagation();if(suppressClick){suppressClick=false;return;}openEditor(event);});
      track.append(button);
    });
    track.style.minHeight=Math.max(144,lanes.length*52+24)+'px';
    updateTimelineNow();
    if(!items.length){const empty=document.createElement('p');empty.className='timeline-empty';empty.textContent='今天还没有安排，点击“新增日程”开始。';track.append(empty);}
  }
  function updateTimelineNow(){
    const track=timeline.querySelector('.timeline-track');if(!track)return;
    const now=new Date(),from=Number(timeline.dataset.dayStart),to=Number(timeline.dataset.dayEnd);
    let line=track.querySelector('.timeline-now');
    if(now<from||now>=to){line?.remove();return;}
    if(!line){line=document.createElement('div');line.className='timeline-now';track.append(line);}
    line.style.left=((now-from)/(to-from)*100)+'%';line.setAttribute('aria-label','当前时间 '+timeText(now));
  }
  const calendar = new FullCalendar.Calendar(calendarElement, {
    initialView:'timeGridDay',height:'100%',locale:'zh-cn',firstDay:1,
    buttonText:{today:'今天',day:'日',week:'周',month:'月'},
    headerToolbar:{left:'prev,next today',center:'title',right:'timeGridDay,timeGridWeek,dayGridMonth'},
    allDayText:'全天',noEventsText:'暂无日程',nowIndicator:true,allDaySlot:false,
    slotMinTime:'06:00:00',slotMaxTime:'24:00:00',scrollTime:'09:00:00',slotDuration:'00:30:00',
    slotLabelFormat:{hour:'2-digit',minute:'2-digit',hour12:false},eventTimeFormat:{hour:'2-digit',minute:'2-digit',hour12:false},
    editable:true,selectable:true,selectMirror:true,longPressDelay:450,eventLongPressDelay:450,selectLongPressDelay:450,
    dayMaxEvents:2,eventMinHeight:28,eventShortHeight:44,expandRows:false,
    events:events.map(e=>({...e,...eventPaint(e.extendedProps?.category)})),
    datesSet(info) { renderTimeline();window.dispatchEvent(new CustomEvent('desk-calendar-range',{detail:{start:info.start.toISOString(),end:info.end.toISOString()}})); },
    dateClick(info) { openEditor({start:info.date,end:new Date(info.date.getTime()+3600000)}); },
    select(info) { openEditor({start:info.start,end:info.end}); calendar.unselect(); },
    eventClick(info) { info.jsEvent.preventDefault();openEditor(info.event); },
    eventDrop() {persistCalendar();toast('日程时间已更新');},
    eventResize() {persistCalendar();toast('日程时长已更新');},
    eventClassNames(info){return ['event-'+(info.event.extendedProps.status||'normal')];},
    eventDidMount(info) {const state=info.event.extendedProps.status||'normal';info.el.setAttribute('aria-label',info.event.title+'，'+(statusNames[state]||'正常')+(remote(info.event)?'，飞书只读，点击查看':'，点击编辑'));if(state!=='normal'){const badge=document.createElement('span');badge.className='event-state';badge.textContent='['+(statusNames[state]||'正常')+'] ';info.el.querySelector('.fc-event-title')?.prepend(badge);}info.el.setAttribute('tabindex','0');info.el.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();openEditor(info.event);}});}
  });
  window.deskCalendar = calendar;
  window.deskCalendarEvents = () => serialize();
  window.deskSetFeishuEvents=(items,syncedAt)=>{
    if(!Array.isArray(items))return;
    calendar.batchRendering(()=>{for(const e of calendar.getEvents())if(remote(e))e.remove();for(const e of items){if(e?.extendedProps?.source!=='feishu'||!e.id?.startsWith('feishu-')||!Number.isFinite(Date.parse(e.start))||Date.parse(e.end)<=Date.parse(e.start))continue;calendar.addEvent({...e,editable:false,startEditable:false,durationEditable:false,...eventPaint(e.extendedProps.category),extendedProps:{...e.extendedProps,status:marks[e.id]||'normal'}});}});
    persistCalendar();
  };

  calendar.render();
  const expandButton=document.getElementById('expandCalendar');
  function expandCalendar(force){const panel=document.querySelector('.calendar-panel');const expanded=typeof force==='boolean'?force:!panel.classList.contains('is-expanded');panel.classList.toggle('is-expanded',expanded);expandButton.textContent=expanded?'收起日历':'放大日历';expandButton.setAttribute('aria-expanded',String(expanded));requestAnimationFrame(()=>calendar.updateSize());}
  expandButton.addEventListener('click',()=>expandCalendar());
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open)expandCalendar(false);});
  document.querySelectorAll('.nav button').forEach(button=>button.addEventListener('click',()=>expandCalendar(false)));
  persistCalendar();
  setInterval(()=>{renderNext();updateTimelineNow();},30000);
  document.getElementById('addEvent').addEventListener('click',()=>openEditor());
  document.getElementById('quickTask').addEventListener('click',()=>{document.getElementById('captureType').value='待办';document.getElementById('captureInput').focus();});
  for(const id of ['closeEvent','cancelEvent'])document.getElementById(id).addEventListener('click',closeEditor);
  form.addEventListener('submit',event=>{
    event.preventDefault();
    const selected=selectedId&&calendar.getEventById(selectedId);
    if(selected&&remote(selected)){
      if(!['normal','important','done'].includes(status.value))return;
      marks[selectedId]=status.value;try{localStorage.setItem('ai-desk-hub-feishu-marks',JSON.stringify(marks));}catch{document.getElementById('storageWarning').hidden=false;}
      selected.setExtendedProp('status',status.value);persistCalendar();closeEditor();toast('本机提醒标记已保存，未修改飞书日程');return;
    }
    const eventTitle = title.value.trim();
    const from = new Date(start.value); const to = new Date(end.value);
    if(!eventTitle){error.textContent='请填写日程名称。';return;}
    if(!Number.isFinite(+from)||!Number.isFinite(+to)||to<=from){error.textContent='结束时间需要晚于开始时间。';return;}
    const data = {id:selectedId || 'event-'+Date.now()+'-'+Math.random().toString(16).slice(2),title:eventTitle,start:from,end:to,allDay:false,...eventPaint(category.value),extendedProps:{category:category.value,sample:false,status:status.value}};
    if(selectedId)calendar.getEventById(selectedId)?.remove();
    calendar.addEvent(data);
    persistCalendar();closeEditor();toast('日程已保存到本机');
  });
  deleteButton.addEventListener('click',()=>{
    if(selectedId&&remote(calendar.getEventById(selectedId)))return;
    if(deleteButton.dataset.confirm!=='yes'){deleteButton.dataset.confirm='yes';deleteButton.textContent='确认删除';return;}
    calendar.getEventById(selectedId)?.remove();persistCalendar();closeEditor();toast('日程已删除');
  });
  // iOS keyboard changes the visual viewport without reliably resizing the layout viewport.
  function adjustViewport() {
    const viewport = window.visualViewport;
    if(!viewport || viewport.scale>1.05)return;
    const editing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
    const offset = editing ? Math.max(0,window.innerHeight-viewport.height-viewport.offsetTop) : 0;
    document.documentElement.style.setProperty('--keyboard-offset',offset+'px');
  }
  if(window.visualViewport){visualViewport.addEventListener('resize',adjustViewport);visualViewport.addEventListener('scroll',adjustViewport);}
  document.addEventListener('focusin',adjustViewport);document.addEventListener('focusout',()=>setTimeout(adjustViewport,80));
})();
