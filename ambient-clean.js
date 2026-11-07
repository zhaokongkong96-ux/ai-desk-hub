/* All scenery opens clean. Pointer/touch reveals controls for 3 seconds; Tab
 * exposes them for keyboard use. No stored setting can restore a clock overlay. */
(()=>{
 'use strict';const dialog=document.getElementById('ambientDialog');
 const controls=[...dialog.querySelectorAll('.ambient-top,.ambient-bottom,#ambientWallpaper,#aquariumPanel')];
 let timer=null,keyboard=false,lastPoint=null,wasOpen=dialog.open;
 dialog.setAttribute('tabindex','-1');
 const timeLabel=document.getElementById('aquariumTime').closest('label');timeLabel.id='aquariumTimeLabel';timeLabel.hidden=true;
 function cancel(){if(timer!==null){clearTimeout(timer);timer=null;}}
 function hide(){cancel();if(dialog.contains(document.activeElement)&&controls.some(c=>c.contains(document.activeElement)))dialog.focus({preventScroll:true});dialog.dataset.controls='hidden';for(const c of controls){c.inert=true;c.setAttribute('aria-hidden','true');}}
 function show(){
  if(!dialog.open)return;cancel();dialog.dataset.controls='visible';for(const c of controls){c.inert=false;c.removeAttribute('aria-hidden');}
  if(!keyboard)timer=setTimeout(()=>{timer=null;hide();},3000);
 }
 function reset(){keyboard=false;lastPoint=null;hide();}
 dialog.addEventListener('pointerdown',()=>{keyboard=false;show();});
 dialog.addEventListener('pointermove',e=>{if(e.pointerType==='touch')return;const point=[e.clientX,e.clientY];if(!lastPoint){lastPoint=point;return;}if(Math.hypot(point[0]-lastPoint[0],point[1]-lastPoint[1])>=3){lastPoint=point;keyboard=false;show();}});
 dialog.addEventListener('keydown',e=>{if(e.key==='Tab'){keyboard=true;show();}});
 dialog.addEventListener('focusin',()=>{if(keyboard)show();});
 // A selection starts a fresh display window for the remaining controls.
 dialog.addEventListener('change',()=>{if(dialog.dataset.controls==='visible')show();});
 dialog.addEventListener('close',reset);
 new MutationObserver(()=>{const open=dialog.open;if(open!==wasOpen){wasOpen=open;reset();}}).observe(dialog,{attributes:true,attributeFilter:['open']});
 document.addEventListener('visibilitychange',()=>{if(document.hidden)reset();});
 reset();
})();
