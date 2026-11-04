/* Quiet, on-demand ambience. Never starts a download behind the workbench. */
(()=>{
 'use strict';const $=id=>document.getElementById(id),video=$('ambientVideo'),dialog=$('ambientDialog'),bar=$('ambientVideoControls'),button=$('ambientVideoToggle'),retry=$('ambientVideoRetry'),status=$('wallpaperStatus');
 let selected=null,userPaused=false,ticket=0,failed=false;
 const reduced=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches||false;
 function visible(){return !!selected&&dialog.open&&!document.hidden&&!document.documentElement.classList.contains('return-private');}
 function labels(){button.textContent=userPaused||video.paused?'播放视频':'暂停视频';button.setAttribute('aria-pressed',String(!video.paused));}
 function feedback(text){status.textContent=text;}
 function pause(){video.pause();labels();}
 function showVideo(){video.hidden=false;$('ambientImage').hidden=true;$('ambientArt').hidden=true;}
 function failedLoad(){if(!selected)return;failed=true;pause();video.hidden=true;$('ambientImage').src=selected.poster;$('ambientImage').alt=selected.title+'封面';$('ambientImage').style.objectFit='cover';$('ambientImage').hidden=false;retry.hidden=false;feedback('视频载入失败，已显示封面。请检查网络后重试。');}
 function sync(){
  if(!visible()||userPaused||failed){pause();return;}
  const request=ticket;showVideo();video.muted=true;video.defaultMuted=true;video.loop=true;video.playsInline=true;
  if(!video.getAttribute('src')){video.src=selected.file;video.load();feedback('视频载入中…');}
  const pending=video.play();
  if(pending?.then)pending.then(()=>{if(request!==ticket)return;if(!visible()||userPaused){pause();return;}feedback('静音循环播放');labels();}).catch(error=>{
   if(request!==ticket||!visible()||userPaused||error.name==='AbortError')return;
   if(error.name==='NotAllowedError'){userPaused=true;feedback('轻点“播放视频”开始播放。');labels();}else failedLoad();
  });
 }
 function clear(){ticket++;selected=null;failed=false;pause();video.removeAttribute('src');video.removeAttribute('poster');video.load();video.hidden=true;bar.hidden=true;retry.hidden=true;}
 function select(item){
  if(selected?.id!==item.id){clear();selected=item;userPaused=reduced();video.poster=item.poster;}
  bar.hidden=false;retry.hidden=!failed;video.setAttribute('aria-label',item.title+'，静音循环视频');if(failed){failedLoad();return;}showVideo();
  if(userPaused)feedback('视频已暂停，轻点“播放视频”开始。');sync();
 }
 button.addEventListener('click',()=>{userPaused=!userPaused;if(userPaused){pause();feedback('视频已暂停');}else sync();});
 retry.addEventListener('click',()=>{failed=false;userPaused=false;retry.hidden=true;ticket++;video.removeAttribute('src');sync();});
 for(const event of ['playing','pause'])video.addEventListener(event,labels);
 video.addEventListener('waiting',()=>{if(visible()&&!userPaused&&!failed)feedback('视频缓冲中…');});
 video.addEventListener('playing',()=>{if(visible()&&!userPaused)feedback('静音循环播放');});
 video.addEventListener('error',()=>{if(selected&&video.getAttribute('src'))failedLoad();});
 dialog.addEventListener('close',pause);document.addEventListener('visibilitychange',sync);
 window.addEventListener('pageshow',sync);window.addEventListener('pagehide',pause);
 new MutationObserver(sync).observe(dialog,{attributes:true,attributeFilter:['open']});
 new MutationObserver(sync).observe(document.documentElement,{attributes:true,attributeFilter:['class']});
 window.DeskAmbientVideo={select,clear,sync};
})();
