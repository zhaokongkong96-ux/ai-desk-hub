/* Generic foreground greetings and opt-in Web Push. No sensors or calendar titles leave this page. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),KEY='ai-desk-hub-attention-v1';
 const read=(key,fallback={})=>{try{return JSON.parse(localStorage.getItem(key))||fallback;}catch{return fallback;}};
 let prefs={auto:true,start:'08:00',end:'23:00',cooldown:120,voice:false,readContent:true,lastGreeting:0,seen:[],...read(KEY)},device=read('ai-desk-hub-push-device',null),base='',publicKey='',speechReady=false,hiddenAt=0,syncTimer,healthy=false;
 const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch{$('voiceStatus').textContent='设置未能保存，请检查浏览器存储。';}};
 const rules=()=>read('ai-desk-hub-return-v04');
 const quiet=()=>rules().quiet||rules().privacyHidden||document.documentElement.classList.contains('return-private');
 const busy=()=>document.hidden||quiet()||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')||!!document.querySelector('dialog[open]:not(#ambientDialog)');
 const playing=()=>!$('deskAudio').paused;
 let speechRestore=null;
 function stopSpeech(){window.speechSynthesis?.cancel();speechRestore?.();speechRestore=null;}
 const status=text=>{$('pushStatus').textContent=text;diagnostics();};
 function diagnostics(){const permitted=window.Notification?.permission||'不支持';const detail='系统权限：'+permitted+' · 本机配对：'+(device?'已保存':'未完成')+' · 重要提醒：'+(read('ai-desk-hub-companion-v1').reminders?'开启':'关闭')+' · 免打扰：'+(quiet()?'开启':'关闭')+' · 语音：'+(prefs.voice?(speechReady?'本次已允许':'需点击试听'):'关闭');$('pushDiagnostics').textContent=detail;$('attentionHealth').textContent=device&&healthy?(quiet()?'提醒免打扰':read('ai-desk-hub-companion-v1').reminders?'提醒已连接':'提醒未开启'):'提醒待设置';}
 $('attentionHealth').onclick=()=>$('deskSettings').showModal();
 const banner=document.createElement('aside');banner.id='attentionBanner';banner.hidden=true;banner.setAttribute('role','status');banner.setAttribute('aria-live','polite');
 const message=document.createElement('span'),dismiss=document.createElement('button');dismiss.textContent='关闭';dismiss.className='btn btn-light';dismiss.onclick=()=>{banner.hidden=true;};banner.append(message,dismiss);document.body.append(banner);let bannerTimer;
 function speak(text,manual=false,priority=false){
  if(!prefs.voice||!speechReady||document.hidden||quiet()||(!priority&&playing())||(!manual&&busy())||!window.speechSynthesis)return;
  stopSpeech();const audio=$('deskAudio'),volume=audio.volume;if(priority&&!audio.paused){audio.volume=Math.min(volume,.2);speechRestore=()=>{if(audio.volume===Math.min(volume,.2))audio.volume=volume;};}const utterance=new SpeechSynthesisUtterance(text);utterance.lang='zh-CN';
  const voices=speechSynthesis.getVoices();utterance.voice=voices.find(v=>v.lang==='zh-CN'&&v.localService)||voices.find(v=>/^zh/.test(v.lang))||null;
  utterance.onstart=()=>{$('voiceStatus').textContent='正在播报。';};utterance.onend=()=>{speechRestore?.();speechRestore=null;$('voiceStatus').textContent='播报结束；本次页面已允许前台语音。';};utterance.onerror=()=>{speechRestore?.();speechRestore=null;$('voiceStatus').textContent='系统未能播报，请重新点击试听或检查音量。';};speechSynthesis.speak(utterance);
 }
 function show(text,voice=true,manual=false,priority=false){if((manual?document.hidden||quiet():busy())||(!priority&&playing()))return false;(manual?(document.querySelector('dialog[open]')||document.body):$('ambientDialog').open?$('ambientDialog'):document.body).append(banner);message.textContent=text;banner.hidden=false;clearTimeout(bannerTimer);bannerTimer=setTimeout(()=>banner.hidden=true,12000);if(voice)speak(text,manual,priority);return true;}
 function greet(){
  const clock=new Date().toLocaleTimeString('en-GB',{timeZone:'Asia/Shanghai',hour:'2-digit',minute:'2-digit',hour12:false}),inWindow=prefs.start===prefs.end|| (prefs.start<prefs.end?clock>=prefs.start&&clock<prefs.end:clock>=prefs.start||clock<prefs.end);
  if(!prefs.auto||!inWindow||Date.now()-Math.max(prefs.lastGreeting,read(KEY).lastGreeting||0)<prefs.cooldown*60000)return;
  const hour=Number(clock.slice(0,2)),text=(hour<12?'上午好':hour<18?'下午好':'晚上好')+'，欢迎回到工作台。';
  if(show(text)){prefs.lastGreeting=Date.now();save();}
 }
 function important(){return (window.deskCalendarEvents?.()||[]).filter(e=>!e.allDay&&!e.extendedProps?.sample&&e.extendedProps?.status==='important'&&Date.parse(e.start)>Date.now()&&Date.parse(e.start)<Date.now()+30*86400000).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));}
 function remindImportant(){
  if(!read('ai-desk-hub-companion-v1').reminders||busy())return;
  const old=read('ai-desk-hub-companion-v1').reminded||[],due=important().find(e=>Date.parse(e.start)-Date.now()<=600000&&!prefs.seen.includes(e.id+'@'+e.start)&&!old.includes(e.id+'@'+e.start));
  if(due&&show(reminderText(due),true,false,true)){prefs.seen=[...prefs.seen,due.id+'@'+due.start].slice(-200);save();}
 }
 function reminderText(e){return prefs.readContent?new Date(e.start).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})+'，'+String(e.title||'重要日程').slice(0,200)+'即将开始。':'10 分钟内有重要日程开始，请查看全天安排。';}
 window.deskAttention={remindImportant,
  stopPresenceVoice:stopSpeech,
  enablePresenceVoice(){prefs.voice=true;speechReady=true;$('voiceEnabled').checked=true;save();diagnostics();speak('正在准备到桌检测，请允许摄像头。',true,true);},
  presenceWelcome(voice){return show('欢迎回来。点击「确认并查看重点」了解接下来的安排。',!!voice,false,true);}
 };
 for(const [id,prop]of [['autoGreeting','auto'],['voiceEnabled','voice'],['readReminderContent','readContent'],['greetStart','start'],['greetEnd','end'],['greetCooldown','cooldown']]){
  const input=$(id);if(input.type==='checkbox')input.checked=!!prefs[prop];else input.value=prefs[prop];
  input.addEventListener('change',()=>{prefs[prop]=input.type==='checkbox'?input.checked:input.type==='select-one'?Number(input.value):input.value;if((prop==='start'||prop==='end')&&!/^([01]\d|2[0-3]):[0-5]\d$/.test(prefs[prop]))prefs[prop]=prop==='start'?'08:00':'23:00';save();diagnostics();if(!prefs.voice)stopSpeech();});
 }
 $('voiceTest').onclick=()=>{if(quiet()){$('voiceStatus').textContent='免打扰或隐私遮挡已开启，请先关闭后试听。';return;}if(!window.speechSynthesis){$('voiceStatus').textContent='当前浏览器不支持系统语音。';return;}prefs.voice=true;$('voiceEnabled').checked=true;speechReady=true;save();diagnostics();speak('你好，欢迎使用 AI Desk Hub。语音播报已开启。',true,true);};
 $('voiceStop').onclick=()=>{stopSpeech();$('voiceStatus').textContent='已停止播报。';};
 async function request(path,method='GET',data,auth=true){if(!base)throw Error('请先检查通知服务。');const response=await fetch(base+path,{method,headers:{...(data?{'Content-Type':'application/json'}:{}),...(auth&&device?{Authorization:'Bearer '+device.token}:{})},...(data?{body:JSON.stringify(data)}:{}),cache:'no-store',signal:AbortSignal.timeout(15000)});if(!response.ok){if(response.status===401){healthy=false;throw Error('配对码或设备授权无效，请重新配对。');}throw Error('通知服务暂不可用（'+response.status+'）。');}return response.json();}
 async function check(){const config=await fetch('./push-config.json',{cache:'no-store'}).then(r=>r.json());const url=new URL(config.serviceURL);if(url.protocol!=='https:')throw Error('通知服务需要 HTTPS。');base=url.origin;publicKey=(await request('/api/push/public-key','GET',undefined,false)).publicKey;if(device){await request('/api/push/devices/'+device.id);healthy=true;await sync();const counts=(await request('/api/push/devices/'+device.id)).reminders;if(counts)status($('pushStatus').textContent+' 服务端：待发 '+counts.pending+' / 已提交 '+counts.sent+' / 失败 '+counts.failed+'。');}else status('服务可用。填写配对码后点击「开启后台通知」。');}
 const error=e=>{healthy=false;status(e.message||'连接失败，请检查网络。');};
 async function sync(){if(!device||!base)return;const events=[];for(const e of important().slice(0,100)){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(e.id+'@'+e.start));events.push({key:Array.from(new Uint8Array(digest),n=>n.toString(16).padStart(2,'0')).join(''),at:Math.max(Date.now(),Date.parse(e.start)-600000),expiresAt:Date.parse(e.start)});}await request('/api/push/devices/'+device.id+'/reminders','PUT',{events,paused:!!(quiet()||!read('ai-desk-hub-companion-v1').reminders)});healthy=true;status((quiet()||!read('ai-desk-hub-companion-v1').reminders?'后台提醒已暂停':'后台提醒已同步：'+events.length+' 条')+' · '+new Date().toLocaleTimeString('zh-CN')+'。送达须以设备实测为准。');}
 const scheduleSync=()=>{diagnostics();clearTimeout(syncTimer);syncTimer=setTimeout(()=>sync().catch(error),500);if(quiet())stopSpeech();};
 $('pushCheck').onclick=()=>check().catch(error);
 $('pushEnable').onclick=async()=>{
  if(!('Notification'in window)||!('PushManager'in window)||!('serviceWorker'in navigator)){status('此浏览器不支持 Web Push。iPad 请先添加到主屏幕后打开。');return;}
  const ios=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(ios&&!navigator.standalone&&!matchMedia('(display-mode: standalone)').matches){status('请先通过 Safari 分享菜单添加到主屏幕，再从主屏幕打开并授权通知。');return;}
  if(!publicKey){status('请先点击「检查服务」，然后再开启通知。');return;}
  if(!$('pushPairing').value){status('请填写 Railway 私有变量中的配对码。');return;}
  // Permission is requested directly in this click, before any asynchronous work.
  const permission=Notification.requestPermission();
  try{if(await permission!=='granted'){status('通知权限未授予。可在系统设置中更改。');return;}const registration=await navigator.serviceWorker.ready;const bytes=Uint8Array.from(atob(publicKey.replace(/-/g,'+').replace(/_/g,'/').padEnd(Math.ceil(publicKey.length/4)*4,'=')),c=>c.charCodeAt(0));let subscription=await registration.pushManager.getSubscription();if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:bytes});const paired=await request('/api/push/devices','POST',{pairingCode:$('pushPairing').value,subscription:subscription.toJSON()},false);device=paired;try{localStorage.setItem('ai-desk-hub-push-device',JSON.stringify(device));}catch{await request('/api/push/devices/'+device.id,'DELETE');device=null;throw Error('无法保存设备授权，配对已撤销。');}$('pushPairing').value='';await sync();}catch(e){error(e);}
 };
 $('pushSync').onclick=()=>device?sync().catch(error):status('请先开启后台通知。');
 $('pushTest').onclick=()=>{show(important()[0]?reminderText(important()[0]):'这是一条通知测试。前台语音已准备就绪。',true,true,true);return device?request('/api/push/devices/'+device.id+'/test','POST',{}).then(()=>status('测试通知已提交推送服务，请检查设备通知中心；提交成功不代表已送达。')).catch(error):status('前台测试已触发。后台测试还需要开启通知。');};
 $('pushDisable').onclick=async()=>{try{if(device){await request('/api/push/devices/'+device.id,'DELETE');device=null;localStorage.removeItem('ai-desk-hub-push-device');}const registration=await navigator.serviceWorker.getRegistration();const sub=await registration?.pushManager.getSubscription();if(sub)await sub.unsubscribe();healthy=false;status('已删除服务端订阅和提醒，并关闭本机订阅。');}catch(e){status('尚未确认关闭：'+e.message+' 可先在系统设置中禁用此 APP 的通知。');}};
 window.addEventListener('desk-calendar-change',scheduleSync);$('importantReminders').addEventListener('change',scheduleSync);$('returnSettingsForm').addEventListener('submit',scheduleSync);$('resetReturnSettings').addEventListener('click',scheduleSync);
 window.addEventListener('storage',()=>{if(quiet()){banner.hidden=true;stopSpeech();}scheduleSync();});
 new MutationObserver(()=>{if(quiet()){banner.hidden=true;stopSpeech();}scheduleSync();}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
 navigator.serviceWorker?.addEventListener('message',event=>{if(event.data?.type==='desk-push'&&event.data.kind==='reminder')remindImportant();if(event.data?.type==='desk-open')window.switchPage?.('today');});
 document.addEventListener('visibilitychange',()=>{if(document.hidden){hiddenAt=Date.now();banner.hidden=true;stopSpeech();}else{if(hiddenAt&&Date.now()-hiddenAt>=300000)greet();check().catch(error);}});
 setInterval(()=>{diagnostics();remindImportant();},15000);setTimeout(greet,1500);check().catch(error);
})();
