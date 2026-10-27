/* Camera activation is always a user click. Frames remain on-device. */
(() => {
 'use strict';
 const $=id=>document.getElementById(id),video=$('presenceVideo'),gate=new window.DeskPresenceGate();
 const preview=video.parentElement,anchor=document.createComment('camera-preview-home');preview.before(anchor);
 let stream=null,detector=null,timer=null,session=0,active=false,starting=false,lastVideo=-1,lastFresh=0;
 const status=text=>{$('presenceStatus').textContent=text;};
 const privateScreen=()=>document.documentElement.classList.contains('return-private');
 video.hidden=true;
 const cameraFiles='./vendor/mediapipe-0.10.21/';
 function placement(){
  const floating=(active||starting)&&(!$('page-return').classList.contains('active')||$('ambientDialog').open),target=floating?($('ambientDialog').open?$('ambientDialog'):document.body):anchor.parentNode;
  if(preview.parentNode!==target){if(floating)target.append(preview);else anchor.after(preview);if(active&&stream)video.play().catch(()=>stop('摄像头预览被系统暂停，已关闭检测，请重新开启。'));}
  preview.classList.toggle('is-floating',floating);const button=$('presenceGlobalStop');const owner=floating?target:document.body;if(button.parentNode!==owner)owner.append(button);
 }
 function controls(){ $('presenceModeBadge').textContent=active?'检测中 · 本机处理':starting?'正在开启 · 本机处理':'未开启 · 本机处理';$('presenceGlobalStop').textContent=active?'● 摄像头检测中 · 点击关闭':'● 摄像头准备中 · 点击关闭';$('presenceStart').disabled=active||starting;$('presenceStop').disabled=!active&&!starting;$('presenceGlobalStop').hidden=!active&&!starting; }
 function stop(reason='摄像头已关闭。需点击按钮重新开启。'){
  session++;active=false;starting=false;clearTimeout(timer);timer=null;const old=stream;stream=null;for(const track of old?.getTracks()||[])track.stop();video.pause();video.srcObject=null;video.hidden=true;detector?.close();detector=null;window.deskAttention?.stopPresenceVoice?.();gate.reset();lastVideo=-1;$('presenceReview').disabled=true;controls();placement();status(reason);$('presenceMetrics').textContent='未采集画面';
 }
 async function start(){
  if(active||starting)return;if(document.hidden||privateScreen()){status('请先回到前台并退出隐私画面。');return;}
  if(!isSecureContext||!navigator.mediaDevices?.getUserMedia){status('摄像头需要支持此功能的 HTTPS 页面。请使用 iPad Safari 或主屏幕 APP。');return;}
  starting=true;const token=++session;controls();status('正在请求前置摄像头权限…');
  if($('presenceVoice').checked)window.deskAttention?.enablePresenceVoice?.();
  let acquired,stage='permission';
  try{
   // Request only video; no microphone. User may stop while a permission prompt is pending.
   acquired=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'user'},width:{ideal:320},height:{ideal:240},frameRate:{ideal:5,max:10}},audio:false});
   if(token!==session){for(const t of acquired.getTracks())t.stop();return;}stream=acquired;stage='preview';video.hidden=false;video.srcObject=stream;await video.play();if(token!==session)return;
   status('正在加载本机检测模型，首次需联网下载约 10 MB…');
   stage='model';const {FilesetResolver,FaceDetector}=await import('./vendor/mediapipe-0.10.21/vision_bundle.mjs');
   const files=await FilesetResolver.forVisionTasks(new URL(cameraFiles+'wasm',location.href).href);
   const loaded=await FaceDetector.createFromOptions(files,{baseOptions:{modelAssetPath:new URL(cameraFiles+'blaze_face_short_range.tflite',location.href).href,delegate:'CPU'},runningMode:'VIDEO',minDetectionConfidence:.7});
   if(token!==session){loaded.close();return;}detector=loaded;starting=false;active=true;gate.reset();lastFresh=performance.now();lastVideo=-1;controls();status('检测已开启，等待一张人脸持续出现 3 秒。');
   for(const track of stream.getTracks()){track.addEventListener('ended',()=>{if(token===session)stop('摄像头已被系统停止，请重新开启。');});track.addEventListener('mute',()=>{if(token===session)stop('摄像头画面被系统暂停，已停止检测。请回到前台后重新开启。');});}
   tick(token);
  }catch(error){if(token!==session)return;const messages={NotAllowedError:'摄像头权限被拒绝。请在 Safari／主屏幕 APP 的网站权限中允许后重试。',NotFoundError:'未找到可用摄像头。',NotReadableError:'摄像头被占用或无法读取，请关闭其他相机页面后重试。',OverconstrainedError:'摄像头不支持请求的参数。'};stop(stage==='permission'?(messages[error.name]||'无法打开摄像头，请重试。'):stage==='preview'?'摄像头权限已取得，但视频预览未能启动。请关闭其他相机页面后重试。':'本机模型加载失败，请检查网络与浏览器兼容性后重试；不会退回模拟检测。');}
 }
 function tick(token){
  if(token!==session||!active)return;if(document.hidden||privateScreen()){stop('页面不在前台或进入隐私画面，摄像头已关闭。');return;}
  const begin=performance.now();
  try{
   if(video.readyState<2||video.currentTime===lastVideo){if(begin-lastFresh>8000){stop('未获得新的摄像头画面，已停止检测，请重试。');return;}timer=setTimeout(()=>tick(token),1000);return;}
   lastFresh=begin;lastVideo=video.currentTime;
   const result=detector.detectForVideo(video,begin),count=result.detections.length,elapsed=performance.now()-begin,state=gate.update(count,begin);
   $('presenceMetrics').textContent='人脸数 '+count+' · 单次检测 '+Math.round(elapsed)+' ms · '+video.videoWidth+'×'+video.videoHeight+' · 本机 CPU';
   const text={empty:'镜头范围内未检测到人脸。',leaving:'暂未检测到人脸，连续离开 15 秒后重新等待到桌。',multiple:'检测到多张人脸，暂停问候；无法判断谁是主人。',settling:'检测到一张人脸，正在确认持续出现…',present:'已完成本轮到桌判断；离开后再出现才重新触发。',cooldown:'检测到人脸，仍在问候冷却中（'+state.remaining+' 秒）。'};
   if(state.phase==='arrival'){
    const accepted=window.deskAttention?.presenceWelcome?.($('presenceVoice').checked);
    if(accepted){gate.accept(begin);$('presenceReview').disabled=false;status('已检测到人脸持续出现，已触发通用问候。尚未识别主人身份。');}
    else status('已检测到人脸持续出现；当前免打扰、隐私、编辑或弹窗状态阻止了问候。');
   }else status(text[state.phase]||'检测中…');
   timer=setTimeout(()=>tick(token),Math.min(3000,Math.max(1000,elapsed*3)));
  }catch{stop('本机推理失败，已关闭摄像头；请重试。此设备兼容性尚需确认。');}
 }
 $('presenceStart').onclick=start;$('presenceStop').onclick=()=>stop();$('presenceGlobalStop').onclick=()=>stop();
 $('presenceCooldown').onchange=()=>{gate.cooldown=Number($('presenceCooldown').value)*60000;};
 $('presenceReview').onclick=()=>{if(privateScreen())return;window.switchPage?.('today');$('reviewPriorities').click();};
 document.addEventListener('visibilitychange',()=>{if(document.hidden&&(active||starting))stop('页面进入后台，摄像头已关闭。返回后需手动开启。');});
 window.addEventListener('pagehide',()=>stop());
 new MutationObserver(()=>{if(privateScreen()&&(active||starting))stop('隐私画面已开启，摄像头已关闭。');}).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
 new MutationObserver(placement).observe($('page-return'),{attributes:true,attributeFilter:['class']});
 new MutationObserver(placement).observe($('ambientDialog'),{attributes:true,attributeFilter:['open']});
 controls();
})();
