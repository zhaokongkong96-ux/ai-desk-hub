/* Companion experience layer: original calendar/Radar data and layouts remain authoritative. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id), KEY='ai-desk-hub-companion-v1';
  const themes=['gallery','nature'], wallpapers=window.DeskWallpapers||[];
  let wallpaperRequest=0;
  let prefs={theme:'gallery',wallpapers:{},idle:0,netease:'',reminders:false,reminded:[]}, idleSince=Date.now(),imageURL='',weatherPosition=null,weatherAt=0,weatherRequest=0;
  let weatherAbort=null, mediaMode='netease',playlist=[],trackIndex=0,nativeLaunchRequested=false,editor=null,returnFocus=null;
  const audio=$('deskAudio');
  try{const saved=JSON.parse(localStorage.getItem(KEY)||'null');if(saved){if(saved.wallpapers&&typeof saved.wallpapers==='object')for(const theme of ['gallery','nature'])if(wallpapers.some(w=>w.theme===theme&&w.id===saved.wallpapers[theme]))prefs.wallpapers[theme]=saved.wallpapers[theme];if(themes.includes(saved.theme))prefs.theme=saved.theme;if([0,2,5,15].includes(saved.idle))prefs.idle=saved.idle;if(typeof saved.reminders==='boolean')prefs.reminders=saved.reminders;if(Array.isArray(saved.reminded))prefs.reminded=saved.reminded.filter(v=>typeof v==='string'&&v.length<300).slice(-100);if(typeof saved.netease==='string'&&neteaseURL(saved.netease))prefs.netease=saved.netease;}}catch{}
  function savePrefs(){try{localStorage.setItem(KEY,JSON.stringify(prefs));}catch{$('storageWarning').hidden=false;}}
  function showDialog(id){const d=$(id);if(d.open)return;returnFocus=document.activeElement;d.showModal();}
  function closeDialog(id){$(id).close();if(returnFocus?.isConnected)returnFocus.focus();idleSince=Date.now();}
  document.querySelectorAll('dialog').forEach(dialog=>dialog.addEventListener('close',()=>{idleSince=Date.now();}));
  document.querySelectorAll('[data-close-dialog]').forEach(b=>b.addEventListener('click',()=>closeDialog(b.dataset.closeDialog)));
  $('openDeskSettings').addEventListener('click',()=>showDialog('deskSettings'));
  // AMBIENT deliberately has no task, note or calendar content.
  function clock(){const now=new Date();$('ambientClock').textContent=now.toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false});$('ambientDate').textContent=now.toLocaleDateString('zh-CN',{month:'long',day:'numeric',weekday:'long'});}
  function displayWallpaper(src,alt,fit){
    const request=++wallpaperRequest, probe=new Image();
    $('wallpaperStatus').textContent='图片载入中…';
    probe.onload=()=>{if(request!==wallpaperRequest)return;$('ambientImage').src=src;$('ambientImage').alt=alt;$('ambientImage').style.objectFit=fit;$('ambientImage').hidden=false;$('ambientArt').hidden=true;$('wallpaperStatus').textContent='';};
    probe.onerror=()=>{if(request!==wallpaperRequest)return;$('ambientImage').hidden=true;$('ambientArt').hidden=false;$('wallpaperStatus').textContent='图片未能载入，请切换另一张。';};
    probe.src=src;
  }
  function setTheme(theme){
    if(!themes.includes(theme))return;
    prefs.theme=theme;$('ambientArt').dataset.theme=theme;
    document.querySelectorAll('button[data-theme]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.theme===theme)));
    const group=wallpapers.filter(w=>w.theme===theme), chosen=group.find(w=>w.id===prefs.wallpapers[theme])||group[0];
    $('ambientWallpaper').hidden=!chosen;$('wallpaperPrev').disabled=false;$('wallpaperNext').disabled=false;
    if(chosen){
      prefs.wallpapers[theme]=chosen.id;
      $('wallpaperCount').textContent=(group.indexOf(chosen)+1)+' / '+group.length;
      $('wallpaperCredit').textContent=chosen.title+' · '+chosen.artist+' · '+chosen.source+' ↗';
      $('wallpaperCredit').href=chosen.sourceURL;$('wallpaperCredit').title=chosen.license;
      displayWallpaper(chosen.file,chosen.title+' — '+chosen.artist,theme==='gallery'?'contain':'cover');
    }else{++wallpaperRequest;$('ambientImage').hidden=true;$('ambientArt').hidden=false;$('wallpaperStatus').textContent='';}
    savePrefs();
  }
  function stepWallpaper(delta){const group=wallpapers.filter(w=>w.theme===prefs.theme);if(!group.length)return;const at=group.findIndex(w=>w.id===prefs.wallpapers[prefs.theme]);prefs.wallpapers[prefs.theme]=group[(at+delta+group.length)%group.length].id;setTheme(prefs.theme);}
  $('wallpaperPrev').addEventListener('click',()=>stepWallpaper(-1));
  $('wallpaperNext').addEventListener('click',()=>stepWallpaper(1));
  function enterAmbient(){if(document.querySelector('dialog[open]'))return;clock();showDialog('ambientDialog');}
  $('openAmbient').addEventListener('click',enterAmbient);$('leaveAmbient').addEventListener('click',()=>{closeDialog('ambientDialog');switchPage('today');});
  $('ambientReturn').addEventListener('click',()=>{closeDialog('ambientDialog');switchPage('return');});
  $('ambientMusic').addEventListener('click',()=>{closeDialog('ambientDialog');showDialog('mediaDialog');});
  $('ambientCapture').addEventListener('click',()=>{closeDialog('ambientDialog');$('captureInput').focus();});
  document.querySelectorAll('button[data-theme]').forEach(b=>b.addEventListener('click',()=>setTheme(b.dataset.theme)));
  $('ambientImageFile').addEventListener('change',e=>{const file=e.target.files[0];if(!file)return;if(!file.type.startsWith('image/')||file.size>15*1024*1024){toast('请选择 15MB 以内的图片');return;}if(imageURL)URL.revokeObjectURL(imageURL);imageURL=URL.createObjectURL(file);$('ambientWallpaper').hidden=false;document.querySelectorAll('button[data-theme]').forEach(b=>b.setAttribute('aria-pressed','false'));$('wallpaperPrev').disabled=true;$('wallpaperNext').disabled=true;$('wallpaperCount').textContent='本机图片';$('wallpaperCredit').textContent='自己的画作 · 仅本次页面';$('wallpaperCredit').removeAttribute('href');$('wallpaperCredit').removeAttribute('title');displayWallpaper(imageURL,'你选择的环境画作','contain');toast('画作仅用于当前页面，刷新后需重新选择');});
  $('ambientIdle').value=String(prefs.idle);$('ambientIdle').addEventListener('change',()=>{prefs.idle=Number($('ambientIdle').value);idleSince=Date.now();savePrefs();});
  for(const event of ['pointerdown','keydown','wheel','touchstart','input'])document.addEventListener(event,()=>{idleSince=Date.now();},{passive:true});
  document.addEventListener('visibilitychange',()=>{idleSince=Date.now();if(!document.hidden&&weatherPosition&&Date.now()-weatherAt>=900000){if(weatherPosition.source==='manual')updateWeather();else locateWeather();}});
  setInterval(()=>{clock();if(!document.hidden&&prefs.idle&&Date.now()-idleSince>=prefs.idle*60000&&audio.paused&&!$('neteaseFrame').getAttribute('src')&&!document.querySelector('dialog[open]')&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')&&!document.documentElement.classList.contains('return-private')&&!document.querySelector('.calendar-panel.is-expanded'))enterAmbient();},1000);
  setTheme(prefs.theme);clock();
  // NOW PLAYING: official public NetEase iframe, or actual local HTML audio.
  function neteaseURL(value){try{const u=new URL(value);if(u.protocol!=='https:'||!['music.163.com','y.music.163.com'].includes(u.hostname)||u.username||u.password)return null;const route=u.hash?u.hash.slice(1):u.pathname+u.search;const match=route.match(/\/(playlist|song|album)\?(?:[^#]*&)?id=(\d+)(?:&|$)/);if(!match)return null;const kind={playlist:0,song:2,album:1}[match[1]];return {href:'https://music.163.com/#/'+match[1]+'?id='+match[2],embed:'https://music.163.com/outchain/player?type='+kind+'&id='+match[2]+'&auto=0&height=430'};}catch{return null;}}
  function mode(which){mediaMode=which;$('neteasePanel').hidden=which!=='netease';$('localAudioPanel').hidden=which!=='local';$('showNetease').setAttribute('aria-pressed',String(which==='netease'));$('showLocalAudio').setAttribute('aria-pressed',String(which==='local'));}
  $('expandMedia').addEventListener('click',()=>showDialog('mediaDialog'));
  // NetEase's official mobile bundle declares ORPHEUS_SCHEME='orpheus://'.
  // Keep a normal user-activated link; do not auto-navigate or infer installation/success.
  $('openNeteaseApp').addEventListener('click',()=>{
    nativeLaunchRequested=true;audio.pause();$('mediaQuickPlay').textContent='播放本地音频';$('neteaseFrame').removeAttribute('src');$('neteaseFrame').hidden=true;$('unloadNetease').hidden=true;
    $('mediaTitle').textContent='网易云音乐 App';
    $('mediaStatus').textContent='已请求打开 App。若未跳转，可用“更多播放方式”。';
  });
  $('showNetease').addEventListener('click',()=>mode('netease'));$('showLocalAudio').addEventListener('click',()=>mode('local'));
  $('neteaseLink').value=prefs.netease;
  if(prefs.netease){$('neteaseOriginal').href=prefs.netease;$('mediaStatus').textContent='可直接打开已安装的 App；网页歌单在“更多播放方式”中。';}
  $('neteaseForm').addEventListener('submit',e=>{e.preventDefault();const url=neteaseURL($('neteaseLink').value.trim());if(!url){$('neteaseFeedback').textContent='请输入网易云 HTTPS 歌单、歌曲或专辑链接；短链接请先在网易云中展开。';return;}prefs.netease=url.href;savePrefs();nativeLaunchRequested=false;audio.pause();$('neteaseFrame').src=url.embed;$('neteaseFrame').hidden=false;$('unloadNetease').hidden=false;$('neteaseOriginal').href=url.href;$('neteaseFeedback').textContent='官方播放器已载入请求。播放请用下方原生控件；版权、登录或嵌入限制时，可在网易云打开。';$('mediaTitle').textContent='网易云音乐';$('mediaStatus').textContent='官方播放器 · 播放状态由网易云管理';});
  $('unloadNetease').addEventListener('click',()=>{$('neteaseFrame').removeAttribute('src');$('neteaseFrame').hidden=true;$('unloadNetease').hidden=true;$('mediaStatus').textContent='网易云播放器已关闭';});
  function syncAudio(){if(nativeLaunchRequested||!playlist.length||$('neteaseFrame').getAttribute('src'))return;$('mediaTitle').textContent=playlist[trackIndex].name;$('localMediaName').textContent=playlist[trackIndex].name;$('mediaStatus').textContent=(audio.paused?'本地音频 · 已暂停':'本地音频 · 播放中')+' · '+(trackIndex+1)+' / '+playlist.length;$('mediaQuickPlay').textContent=audio.paused?'播放':'暂停';}
  function chooseTrack(index){nativeLaunchRequested=false;trackIndex=(index+playlist.length)%playlist.length;audio.src=playlist[trackIndex].url;audio.load();syncAudio();}
  async function playAudio(){if(!playlist.length)return;nativeLaunchRequested=false;$('neteaseFrame').removeAttribute('src');$('neteaseFrame').hidden=true;$('unloadNetease').hidden=true;if(!audio.paused){audio.pause();return;}try{await audio.play();}catch{toast('未能播放，请在播放器中重试或换一种音频格式');}}
  $('audioFiles').addEventListener('change',e=>{const files=[...e.target.files].filter(f=>f.type.startsWith('audio/')||/\.(mp3|m4a|aac|wav|ogg|flac)$/i.test(f.name));if(!files.length){toast('没有可播放的音频文件');return;}audio.pause();playlist.forEach(t=>URL.revokeObjectURL(t.url));playlist=files.map(f=>({name:f.name,url:URL.createObjectURL(f)}));$('neteaseFrame').removeAttribute('src');$('neteaseFrame').hidden=true;$('unloadNetease').hidden=true;chooseTrack(0);$('mediaQuickPlay').hidden=false;$('mediaQuickPlay').disabled=false;$('nextAudio').disabled=$('previousAudio').disabled=playlist.length<2;});
  $('mediaQuickPlay').addEventListener('click',playAudio);
  for(const [id,direction]of [['previousAudio',-1],['nextAudio',1]])$(id).addEventListener('click',()=>{const wasPlaying=!audio.paused;chooseTrack(trackIndex+direction);if(wasPlaying)playAudio();});
  audio.addEventListener('ended',()=>{if(trackIndex+1<playlist.length){chooseTrack(trackIndex+1);playAudio();}else syncAudio();});
  for(const event of ['play','pause','loadedmetadata'])audio.addEventListener(event,()=>{if(event==='play')nativeLaunchRequested=false;syncAudio();});
  audio.addEventListener('error',()=>{$('mediaStatus').textContent='音频无法解码，请更换文件格式';});
  mode(mediaMode);
  // Editable local records, including legacy notes without IDs.
  function editRecord(kind,key){const item=kind==='task'?state.tasks.find(t=>t.id===key):state.notes[Number(key)];if(!item)return;editor={kind,key};$('recordEditorTitle').textContent=kind==='task'?'编辑待办':'编辑记录';$('recordText').value=item.text;$('recordImportantLabel').hidden=kind!=='task';$('recordImportant').checked=!!item.important;$('deleteRecord').textContent='删除';$('deleteRecord').dataset.confirm='';$('recordEditorFeedback').textContent='';showDialog('recordEditor');}
  $('taskList').addEventListener('click',e=>{const b=e.target.closest('[data-edit-task]');if(b)editRecord('task',b.dataset.editTask);});
  $('noteList').addEventListener('click',e=>{const b=e.target.closest('[data-edit-note]');if(b)editRecord('note',b.dataset.editNote);});
  $('recordEditorForm').addEventListener('submit',e=>{e.preventDefault();if(!editor)return;const text=$('recordText').value.trim();if(!text){$('recordEditorFeedback').textContent='请填写内容。';return;}const item=editor.kind==='task'?state.tasks.find(t=>t.id===editor.key):state.notes[Number(editor.key)];if(item){item.text=text;if(editor.kind==='task')item.important=$('recordImportant').checked;const saved=persist();renderTasks();renderNotes();if(!saved){$('recordEditorFeedback').textContent='保存失败，修改仅保留在当前页面，请立即导出备份或重试保存。';return;}}closeDialog('recordEditor');toast('已保存修改');});
  $('deleteRecord').addEventListener('click',()=>{if(!editor)return;if($('deleteRecord').dataset.confirm!=='yes'){$('deleteRecord').dataset.confirm='yes';$('deleteRecord').textContent='确认删除';return;}if(editor.kind==='task')state.tasks=state.tasks.filter(t=>t.id!==editor.key);else state.notes.splice(Number(editor.key),1);const saved=persist();renderTasks();renderNotes();closeDialog('recordEditor');toast(saved?'记录已删除':'删除未保存到本机，刷新可能恢复原记录，请先导出当前数据');});
  // A local rules brief, never labelled as AI-generated or newly collected news.
  function brief(){const now=Date.now(),day=new Date();day.setHours(0,0,0,0);const tomorrow=new Date(day);tomorrow.setDate(tomorrow.getDate()+1);
    const tasks=state.tasks.filter(t=>!t.done).slice().sort((a,b)=>Number(!!b.important)-Number(!!a.important));
    const events=(window.deskCalendarEvents?.()||[]).filter(e=>!e.extendedProps?.sample&&e.extendedProps?.status!=='done'&&Date.parse(e.end)>now&&Date.parse(e.start)<+tomorrow).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
    const top=tasks.slice(0,3),text=events.length?'今天还有 '+events.length+' 项日程。': '今天暂无后续真实日程。';$('dailySummary').textContent=text+(tasks.length?' '+tasks.length+' 项待办未完成'+(tasks.some(t=>t.important)?'，优先处理标记的重点。':'。'):' 暂无未完成待办。');
    const box=$('briefDetails');box.replaceChildren();for(const headingText of ['接下来','最多三项待办']){const h=document.createElement('h3');h.textContent=headingText;box.append(h);const list=headingText==='接下来'?events.slice(0,3).map(e=>new Date(e.start).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit',hour12:false})+' · '+e.title):top.map(t=>(t.important?'重点 · ':'')+t.text);for(const line of list.length?list:['暂无']){const p=document.createElement('p');p.textContent=line;box.append(p);}}
    const note=document.createElement('p');note.className='companion-note';note.textContent='AI 热点请查看已确认的 AI RADAR。自动采集、更新检测与模型简报尚未接入。';box.append(note);
  }
  $('reviewPriorities').addEventListener('click',()=>{brief();showDialog('briefDialog');});$('briefOpenDesk').addEventListener('click',()=>{closeDialog('briefDialog');switchPage('today');});window.addEventListener('desk-data-change',brief);$('eventDialog').addEventListener('close',brief);setInterval(brief,30000);brief();
  // Optional foreground reminder: one generic nudge per important event/start.
  $('importantReminders').checked=prefs.reminders;
  $('importantReminders').addEventListener('change',()=>{prefs.reminders=$('importantReminders').checked;savePrefs();remindImportant();});
  function remindImportant(){
    if(window.deskAttention){window.deskAttention.remindImportant();return;}
    if(!prefs.reminders||document.hidden||document.documentElement.classList.contains('return-private')||document.querySelector('dialog[open]')||/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')||$('toast').classList.contains('show'))return;
    try{const rules=JSON.parse(localStorage.getItem('ai-desk-hub-return-v04')||'null');if(rules?.quiet)return;}catch{return;}
    const now=Date.now();
    const due=(window.deskCalendarEvents?.()||[]).filter(e=>!e.allDay&&!e.extendedProps?.sample&&e.extendedProps?.status==='important'&&Date.parse(e.start)>now&&Date.parse(e.start)-now<=600000).sort((a,b)=>Date.parse(a.start)-Date.parse(b.start));
    const event=due.find(e=>!prefs.reminded.includes(e.id+'@'+e.start));if(!event)return;
    prefs.reminded.push(event.id+'@'+event.start);prefs.reminded=prefs.reminded.slice(-100);savePrefs();
    toast('10 分钟内有重要日程开始，可点“查看重点”了解安排');
  }
  $('deskSettings').addEventListener('close',remindImportant);$('eventDialog').addEventListener('close',remindImportant);window.addEventListener('desk-data-change',remindImportant);setInterval(remindImportant,15000);
  // Location stays in memory. No location request happens before explicit action.
  function weatherText(text){$('weatherChip').textContent=text;$('ambientWeather').textContent=text;}
  function weatherName(code){if(code===0)return '晴';if([1,2,3].includes(code))return '多云';if([45,48].includes(code))return '雾';if([51,53,55,56,57].includes(code))return '毛毛雨';if([61,63,65,66,67,80,81,82].includes(code))return '雨';if([71,73,75,77,85,86].includes(code))return '雪';if([95,96,99].includes(code))return '雷雨';return '天气';}
  async function weatherFetch(url,signal){const res=await fetch(url,{signal,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer'});if(!res.ok)throw Error('服务 HTTP '+res.status);return res.json();}
  async function updateWeather(){
    if(!weatherPosition)return;const request=++weatherRequest,position=weatherPosition;weatherAbort?.abort();weatherAbort=new AbortController();const controller=weatherAbort,timer=setTimeout(()=>controller.abort(),15000);$('enableWeather').disabled=true;
    try{
      const params=new URLSearchParams({latitude:position.lat,longitude:position.lon,current:'temperature_2m,weather_code',timezone:'auto',forecast_days:'1'});
      const nameRequest=position.source!=='manual'&&$('weatherPlace').checked?weatherFetch('https://api.bigdatacloud.net/data/reverse-geocode-client?'+new URLSearchParams({latitude:position.rawLat,longitude:position.rawLon,localityLanguage:'zh'}),controller.signal).then(d=>[...new Set([d.city,d.locality].filter(Boolean))].join(' · ')).catch(()=>null):Promise.resolve(null);
      const [data,place]=await Promise.all([weatherFetch('https://api.open-meteo.com/v1/forecast?'+params,controller.signal),nameRequest]);
      if(request!==weatherRequest)return;if(!Number.isFinite(data.current?.temperature_2m)||!Number.isFinite(data.current?.weather_code)||typeof data.current?.time!=='string')throw Error('数据格式异常');weatherAt=Date.now();
      position.place=place||position.place||'';const prefix=position.source==='manual'?'手动 · '+position.place:position.place||'当前位置';weatherText(prefix+' · '+Math.round(data.current.temperature_2m)+'°C · '+weatherName(data.current.weather_code));
      $('weatherStatus').textContent=prefix+'；'+(position.source==='manual'?'未使用设备定位。':'浏览器报告精度约 '+Math.round(position.accuracy)+' 米，不代表门牌地址。')+' 数据时间 '+data.current.time.replace('T',' ')+'；本次刷新 '+new Date().toLocaleTimeString('zh-CN')+'。'+($('weatherPlace').checked&&!place&&position.source!=='manual'?'地名解析暂不可用，天气已更新。':'');
    }catch(e){if(request!==weatherRequest)return;weatherText('天气查询失败 · 点击重试');$('weatherStatus').textContent='位置已取得，但天气请求失败：'+(e.name==='AbortError'?'网络超时':e.message)+'。可重试或手动搜索地区。';}finally{clearTimeout(timer);if(request===weatherRequest)$('enableWeather').disabled=false;}
  }
  function locateWeather(){
    if(!navigator.geolocation){$('weatherStatus').textContent='此浏览器不支持定位，可使用地区搜索。';return;}if(!window.isSecureContext){$('weatherStatus').textContent='定位需要 HTTPS；在平板请使用正式网站，勿使用局域网 HTTP 地址。';return;}
    weatherAbort?.abort();const request=++weatherRequest;$('enableWeather').disabled=true;$('weatherStatus').textContent='正在重新定位（最长约 30 秒）…';weatherText('正在定位…');
    const success=position=>{if(request!==weatherRequest)return;const {latitude,longitude,accuracy}=position.coords;if(!Number.isFinite(latitude)||!Number.isFinite(longitude)){failed({code:2});return;}weatherPosition={lat:Number(latitude.toFixed(2)),lon:Number(longitude.toFixed(2)),rawLat:latitude,rawLon:longitude,accuracy,source:'device'};updateWeather();};
    const failed=error=>{if(request!==weatherRequest)return;weatherPosition=null;$('enableWeather').disabled=false;weatherText('定位未完成 · 点击重试');$('weatherStatus').textContent=error.code===1?'位置权限被拒绝。请在 iPad 设置 → 隐私与安全性 → 定位服务中开启定位，并检查 Safari 网站／主屏幕 APP 权限；回到 APP 点击刷新。':error.code===3?'定位超时。请检查 Wi-Fi、定位服务后重试；也可手动搜索地区。':'设备未能提供位置。Wi-Fi 型号、网络或系统定位服务可能影响结果；也可手动搜索地区。';};
    navigator.geolocation.getCurrentPosition(success,error=>{if(request!==weatherRequest)return;if(error.code===1){failed(error);return;}$('weatherStatus').textContent='精确定位未完成，正在尝试网络定位…';navigator.geolocation.getCurrentPosition(success,failed,{enableHighAccuracy:false,timeout:10000,maximumAge:0});},{enableHighAccuracy:true,timeout:20000,maximumAge:0});
  }
  $('weatherChip').addEventListener('click',()=>showDialog('deskSettings'));$('enableWeather').addEventListener('click',locateWeather);
  $('weatherSearch').addEventListener('click',async()=>{const name=$('weatherCity').value.trim();if(!name){$('weatherStatus').textContent='请先填写城市或地区名称。';return;}const request=++weatherRequest;weatherAbort?.abort();weatherAbort=new AbortController();const timer=setTimeout(()=>weatherAbort?.abort(),12000);$('weatherSearch').disabled=true;try{const data=await weatherFetch('https://geocoding-api.open-meteo.com/v1/search?'+new URLSearchParams({name,count:'5',language:'zh',format:'json'}),weatherAbort.signal);if(request!==weatherRequest)return;$('weatherChoices').replaceChildren();for(const item of data.results||[]){const button=document.createElement('button');button.className='btn btn-light';button.textContent=[item.name,item.admin1,item.country].filter(Boolean).join(' · ');button.onclick=()=>{weatherPosition={lat:item.latitude,lon:item.longitude,place:item.name,source:'manual'};$('weatherChoices').replaceChildren();updateWeather();};$('weatherChoices').append(button);}$('weatherStatus').textContent=data.results?.length?'请选择匹配的地区；不会将手动地区当作设备定位。':'未找到地区，可尝试城市名称或拼音。';}catch{if(request===weatherRequest)$('weatherStatus').textContent='地区搜索失败，请检查网络后重试。';}finally{clearTimeout(timer);$('weatherSearch').disabled=false;$('enableWeather').disabled=false;}});
  $('disableWeather').addEventListener('click',()=>{weatherPosition=null;weatherAt=0;weatherRequest++;weatherAbort?.abort();$('enableWeather').disabled=false;$('weatherChoices').replaceChildren();weatherText('启用定位天气');$('weatherStatus').textContent='已停止更新并清除本页位置和天气；未保存坐标。';});
  setInterval(()=>{if(!document.hidden&&weatherPosition&&Date.now()-weatherAt>=900000){if(weatherPosition.source==='manual')updateWeather();else locateWeather();}},900000);

})();
