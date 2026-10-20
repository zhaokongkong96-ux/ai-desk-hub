/* RETURN is a manual simulation. It never requests sensors or authenticates identity. */
(() => {
  'use strict';
  const KEY='ai-desk-hub-return-v04';
  const defaults={enabled:true,quiet:false,start:'18:00',end:'22:00',cooldown:120};
  const codes={home:'模拟到家',desk:'模拟主人到桌',blocked:'规则拦截',unknown:'模拟身份不确定',end:'结束模拟'};
  const descriptions={home:'到家阶段通过，等待到桌事件。',desk:'到桌阶段通过，仅在当前页面显示本机摘要。',unknown:'通用隐私画面已显示。',end:'本轮会话已结束。'};
  const $=id=>document.getElementById(id);
  const validTime=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v);
  const timestamp=v=>Number.isFinite(v)&&v>=0&&v<=Date.now()?v:0;
  let data={...defaults,lastHomeAt:0,lastDeskAt:0,homeAt:0,logs:[],privacyHidden:false};
  let revealUntil=0;
  try{
    const saved=JSON.parse(localStorage.getItem(KEY)||'null');
    if(saved&&typeof saved==='object'&&!Array.isArray(saved)){
      for(const key of ['enabled','quiet','privacyHidden'])if(typeof saved[key]==='boolean')data[key]=saved[key];
      for(const key of ['start','end'])if(validTime(saved[key]))data[key]=saved[key];
      if([30,60,120,240].includes(saved.cooldown))data.cooldown=saved.cooldown;
      for(const key of ['lastHomeAt','lastDeskAt','homeAt'])data[key]=timestamp(saved[key]);
      if(Array.isArray(saved.logs))data.logs=saved.logs.filter(e=>e&&codes[e.code]&&timestamp(e.at)>0).slice(0,8).map(e=>({code:e.code,at:e.at,reason:['disabled','quiet','window','cooldown','home','expired'].includes(e.reason)?e.reason:undefined}));
    }
  }catch(e){$('storageWarning').hidden=false;}
  function save(){try{localStorage.setItem(KEY,JSON.stringify(data));return true;}catch(e){$('storageWarning').hidden=false;return false;}}
  function settings(){for(const key of ['Enabled','Quiet'])$('return'+key).checked=data[key.toLowerCase()];$('returnStart').value=data.start;$('returnEnd').value=data.end;$('returnCooldown').value=String(data.cooldown);}
  function inWindow(now=Date.now()){
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now));
    const current=Number(parts.find(p=>p.type==='hour').value)*60+Number(parts.find(p=>p.type==='minute').value);
    const mins=t=>Number(t.slice(0,2))*60+Number(t.slice(3));const from=mins(data.start),to=mins(data.end);
    return from===to || (from<to ? current>=from&&current<to : current>=from||current<to);
  }
  const reasonText={disabled:'手动模拟已关闭。',quiet:'免打扰已开启，未显示主动问候或个人摘要。',window:'当前不在已保存的北京时间问候时段。',cooldown:'同类事件仍在冷却时间内。',home:'请先模拟到家，再模拟主人到桌。',expired:'到家会话已结束或超过 4 小时，请重新开始。'};
  function clearPersonal(){revealUntil=0;$('returnPersonal').hidden=true;$('returnTaskSummary').textContent='';$('returnCalendarSummary').textContent='';}
  function result(mode,title,detail,warning=false){$('returnResultTitle').textContent=title;$('returnResultText').textContent=detail;$('returnStateChip').textContent=warning?'未触发':mode==='desk'?'模拟到桌成功':mode==='home'?'模拟到家成功':'等待模拟';$('returnStateChip').classList.toggle('warn',warning);['Home','Desk','Brief'].forEach((name,i)=>$('returnStage'+name).classList.toggle('active',mode==='home'?i===0:mode==='desk'));}
  function log(code,reason){data.logs.unshift({code,reason,at:Date.now()});data.logs=data.logs.slice(0,8);save();renderLogs();}
  function renderLogs(){const box=$('returnLogs');box.replaceChildren();$('returnLogCount').textContent=data.logs.length+' EVENTS';if(!data.logs.length){const empty=document.createElement('p');empty.className='return-note';empty.textContent='暂无模拟事件。';box.append(empty);return;}for(const item of data.logs){const row=document.createElement('div');row.className='return-log';const time=document.createElement('time');time.textContent=new Date(item.at).toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false});const body=document.createElement('div');const heading=document.createElement('strong');heading.textContent=codes[item.code];const detail=document.createElement('p');detail.textContent=reasonText[item.reason]||descriptions[item.code]||'模拟事件未触发。';body.append(heading,detail);row.append(time,body);box.append(row);}}
  function commonReason(){if(!data.enabled)return 'disabled';if(data.quiet)return 'quiet';if(!inWindow())return 'window';return '';}
  function block(reason){clearPersonal();result('blocked','此次模拟未触发',reasonText[reason],true);log('blocked',reason);}
  function cooldown(last){return last>0&&Date.now()-last<data.cooldown*60000;}
  function home(){clearPersonal();const reason=commonReason();if(reason){block(reason);return;}if(cooldown(data.lastHomeAt)){block('cooldown');return;}data.lastHomeAt=Date.now();data.homeAt=Date.now();result('home','欢迎回来。先放松一下。','已模拟到家。来到书桌前后，可继续模拟主人到桌。');log('home');}
  function showSummary(){const tasks=state.tasks.filter(t=>!t.done);$('returnTaskSummary').textContent=tasks.length+' 项';const next=(window.deskCalendarEvents?.()||[]).filter(e=>Date.parse(e.end)>Date.now()&&e.extendedProps?.status!=='done').sort((a,b)=>Date.parse(a.start)-Date.parse(b.start))[0];$('returnCalendarSummary').textContent=next?next.title:'暂无接下来日程';$('returnPersonal').hidden=false;revealUntil=Date.now()+5*60000;}
  function owner(){clearPersonal();const reason=commonReason();if(reason){block(reason);return;}if(!data.homeAt){block('home');return;}if(Date.now()-data.homeAt>=4*3600000){data.homeAt=0;block('expired');return;}if(cooldown(data.lastDeskAt)){block('cooldown');return;}data.lastDeskAt=Date.now();result('desk','欢迎来到书桌前。','主人身份由按钮模拟确认，以下是当前本机数据。5 分钟后自动收起本页摘要。');showSummary();log('desk');}
  function privacy(){clearPersonal();if(!data.enabled){block('disabled');return;}data.homeAt=0;data.privacyHidden=true;log('unknown');result('idle','身份不确定','已进入通用隐私画面，当前会话结束。');applyPrivacy();}
  function applyPrivacy(){document.documentElement.classList.toggle('return-private',data.privacyHidden);if(data.privacyHidden){const eventDialog=$('eventDialog');if(eventDialog?.open)eventDialog.close();if(!$('returnPrivacy').open)$('returnPrivacy').showModal();$('endPrivacyDemo').focus();}else if($('returnPrivacy').open)$('returnPrivacy').close();}
  $('returnSettingsForm').addEventListener('submit',event=>{event.preventDefault();if(!validTime($('returnStart').value)||!validTime($('returnEnd').value)){$('returnSettingsFeedback').textContent='请填写有效的开始与结束时间。';return;}data.enabled=$('returnEnabled').checked;data.quiet=$('returnQuiet').checked;data.start=$('returnStart').value;data.end=$('returnEnd').value;data.cooldown=Number($('returnCooldown').value);clearPersonal();result('idle','规则已更新','请使用模拟按钮重新测试。');$('returnSettingsFeedback').textContent=save()?'规则已保存；按北京时间执行。':'保存失败，请先导出重要数据。';});
  $('resetReturnSettings').addEventListener('click',()=>{Object.assign(data,defaults);clearPersonal();settings();save();$('returnSettingsFeedback').textContent='默认规则已恢复，日志与冷却保留。';result('idle','规则已恢复','默认问候时间为北京时间 18:00–22:00。');});
  $('simulateHome').addEventListener('click',home);$('simulateDeskOwner').addEventListener('click',owner);$('simulateDeskUnknown').addEventListener('click',privacy);
  $('previewWelcome').addEventListener('click',()=>{clearPersonal();result('idle','你好，欢迎回来。','仅预览通用欢迎文字，不改变到家会话、冷却或日志，也不显示个人摘要。');});
  $('returnEndSession').addEventListener('click',()=>{clearPersonal();data.homeAt=0;result('idle','本轮模拟已结束','可以重新测试；同类事件仍遵守冷却规则。');log('end');});
  $('clearReturnLogs').addEventListener('click',()=>{data.logs=[];save();renderLogs();});
  $('returnOpenDesk').addEventListener('click',()=>{clearPersonal();switchPage('today');});
  $('returnPrivacy').addEventListener('cancel',e=>e.preventDefault());
  $('endPrivacyDemo').addEventListener('click',()=>{data.privacyHidden=false;data.homeAt=0;save();applyPrivacy();$('simulateDeskUnknown').focus();});
  document.querySelectorAll('.nav button').forEach(b=>b.addEventListener('click',clearPersonal));
  document.addEventListener('visibilitychange',()=>{if(document.hidden)clearPersonal();});
  setInterval(()=>{if(revealUntil&&Date.now()>=revealUntil){clearPersonal();result('idle','个人摘要已收起','模拟摘要展示已超过 5 分钟；重新操作仍遵守触发规则。');}},1000);
  settings();renderLogs();clearPersonal();applyPrivacy();
})();
