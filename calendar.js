/* FullCalendar is vendored locally under its MIT license. All events stay in this browser. */
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
  try {
    const raw = localStorage.getItem(KEY);
    if (raw === null) events = seedEvents();
    else {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) throw new Error('日程数据格式异常');
      events = parsed.filter(e => e && typeof e.id==='string' && typeof e.title==='string' && Number.isFinite(Date.parse(e.start)) && Number.isFinite(Date.parse(e.end)) && Date.parse(e.end)>Date.parse(e.start));
    }
  } catch (e) { document.getElementById('storageWarning').hidden=false; }
  const calendarElement = document.getElementById('calendar');
  if (!window.FullCalendar) {
    calendarElement.textContent = '日历组件加载失败，请在线刷新一次或检查本地文件。';
    document.getElementById('addEvent').disabled = true;
    return;
  }
  function serialize() {
    return calendar.getEvents().map(e => ({id:e.id,title:e.title,start:e.start.toISOString(),end:(e.end || new Date(e.start.getTime()+1800000)).toISOString(),allDay:e.allDay,extendedProps:{category:e.extendedProps.category || 'work',sample:!!e.extendedProps.sample,status:e.extendedProps.status||'normal'}}));
  }
  function persistCalendar() {
    events = serialize();
    document.getElementById('calendarSource').textContent=events.some(e=>e.extendedProps.sample)?'本机日历 · 含示例':'本机日历';
    try { localStorage.setItem(KEY,JSON.stringify(events)); }
    catch(e) { document.getElementById('storageWarning').hidden=false; }
    renderNext();
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
    document.getElementById('eventSource').textContent = data.extendedProps?.sample ? '这是一条示例日程。保存后成为你的本机日程。' : '仅保存在本机浏览器，尚未连接外部日历。';
    deleteButton.hidden = !selectedId;
    deleteButton.textContent = '删除日程';
    deleteButton.dataset.confirm = '';
    error.textContent = '';
    dialog.showModal();
    title.focus();
  }
  function closeEditor() { dialog.close(); if(returnFocus?.isConnected)returnFocus.focus(); }
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
    dateClick(info) { openEditor({start:info.date,end:new Date(info.date.getTime()+3600000)}); },
    select(info) { openEditor({start:info.start,end:info.end}); calendar.unselect(); },
    eventClick(info) { info.jsEvent.preventDefault();openEditor(info.event); },
    eventDrop() {persistCalendar();toast('日程时间已更新');},
    eventResize() {persistCalendar();toast('日程时长已更新');},
    eventClassNames(info){return ['event-'+(info.event.extendedProps.status||'normal')];},
    eventDidMount(info) {const state=info.event.extendedProps.status||'normal';info.el.setAttribute('aria-label',info.event.title+'，'+(statusNames[state]||'正常')+'，点击编辑');if(state!=='normal'){const badge=document.createElement('span');badge.className='event-state';badge.textContent='['+(statusNames[state]||'正常')+'] ';info.el.querySelector('.fc-event-title')?.prepend(badge);}info.el.setAttribute('tabindex','0');info.el.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();openEditor(info.event);}});}
  });
  window.deskCalendar = calendar;
  window.deskCalendarEvents = () => serialize();
  calendar.render();
  const expandButton=document.getElementById('expandCalendar');
  function expandCalendar(force){const panel=document.querySelector('.calendar-panel');const expanded=typeof force==='boolean'?force:!panel.classList.contains('is-expanded');panel.classList.toggle('is-expanded',expanded);expandButton.textContent=expanded?'收起日历':'放大日历';expandButton.setAttribute('aria-expanded',String(expanded));requestAnimationFrame(()=>calendar.updateSize());}
  expandButton.addEventListener('click',()=>expandCalendar());
  document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!dialog.open)expandCalendar(false);});
  document.querySelectorAll('.nav button').forEach(button=>button.addEventListener('click',()=>expandCalendar(false)));
  persistCalendar();
  setInterval(renderNext,30000);
  document.getElementById('addEvent').addEventListener('click',()=>openEditor());
  document.getElementById('quickTask').addEventListener('click',()=>{document.getElementById('captureType').value='待办';document.getElementById('captureInput').focus();});
  for(const id of ['closeEvent','cancelEvent'])document.getElementById(id).addEventListener('click',closeEditor);
  form.addEventListener('submit',event=>{
    event.preventDefault();
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
