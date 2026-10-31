/* Independent photographic fish sprites over the reference aquascape. */
(()=>{
 'use strict';
 const W=1448,H=1086,dialog=document.getElementById('ambientDialog'),canvas=document.getElementById('aquariumCanvas'),ctx=canvas.getContext('2d',{alpha:true}),panel=document.getElementById('aquariumPanel'),KEY='ai-desk-hub-aquarium-v1',reduce=matchMedia('(prefers-reduced-motion: reduce)');
 const backdrop=document.createElement('img');backdrop.id='aquariumBackdrop';backdrop.alt='';backdrop.setAttribute('aria-hidden','true');canvas.before(backdrop);
 const stage=document.createElement('div');stage.id='aquariumStage';while(dialog.firstChild)stage.append(dialog.firstChild);dialog.append(stage);
 let quality='quiet',showTime=true,paused=reduce.matches,frame=0,last=null,time=0,dpr=1,background=null,rig=null,fish=[],call=null,failed=false,reported=-1,bubbles=[],ripples=[],interactionCount=0;
 try{const data=JSON.parse(localStorage.getItem(KEY)||'null');if(data){if(['quiet','standard'].includes(data.quality))quality=data.quality;if(typeof data.showTime==='boolean')showTime=data.showTime;}}catch{}
 const definitions=[
  {rect:[130,149,280,220],x:326,y:313,w:207,dir:1,baseDepth:.65},
  {rect:[286,370,390,295],x:491,y:511,w:289,dir:1,baseDepth:.8},
  {rect:[677,483,495,400],x:905,y:614,w:362,dir:1,baseDepth:1},
  {rect:[426,786,302,216],x:569,y:804,w:250,dir:1,baseDepth:.85},
  {rect:[1183,598,246,242],x:1195,y:678,w:184,dir:-1,baseDepth:.72},
  {rect:[838,282,206,159],x:848,y:379,w:157,dir:-1,baseDepth:.38},
  ...[[448,174,89,47,490,281,1],[650,228,98,47,657,319,-1],[1080,158,140,62,1040,227,1],[150,456,101,52,213,327,1],[1210,426,96,56,1260,495,1],[306,704,105,52,420,636,1],[755,901,133,64,770,824,1],[84,539,92,46,354,597,1],[550,665,110,53,635,688,1],[1240,548,109,57,695,360,-1],[400,242,96,60,502,410,-1],[697,310,90,47,729,394,-1]].map(([x,y,w,h,px,py,dir],i)=>({rect:[x,y,w,h],x:px,y:py,w:40+(i%3)*6,dir,small:true,baseDepth:.2+(i%4)*.08}))
 ];
 const bubbleStamp=document.createElement('canvas');bubbleStamp.width=bubbleStamp.height=64;{
  const g=bubbleStamp.getContext('2d'),shine=g.createRadialGradient(23,21,2,32,32,29);shine.addColorStop(0,'#e9fff27a');shine.addColorStop(.22,'#bdebe32b');shine.addColorStop(.7,'#68bcb70a');shine.addColorStop(.9,'#bbe9df54');shine.addColorStop(1,'#dcfff39c');g.fillStyle=shine;g.beginPath();g.arc(32,32,29,0,Math.PI*2);g.fill();g.strokeStyle='#efffeb';g.lineWidth=2.5;g.beginPath();g.arc(29,29,19,Math.PI*1.04,Math.PI*1.49);g.stroke();
 }
 const active=()=>dialog.open&&dialog.dataset.theme==='aquarium'&&!document.hidden&&!document.documentElement.classList.contains('return-private');
 function save(){try{localStorage.setItem(KEY,JSON.stringify({quality,showTime}));document.getElementById('aquariumFeedback').textContent='';}catch{document.getElementById('aquariumFeedback').textContent='偏好未能保存，本次仍可使用。';}}
 function state(){panel.hidden=dialog.dataset.theme!=='aquarium';dialog.classList.toggle('aquarium-no-clock',!showTime);document.getElementById('aquariumTime').checked=showTime;document.getElementById('aquariumMotion').value=quality;document.getElementById('aquariumPause').textContent=paused?'继续游动':'暂停游动';document.getElementById('aquariumPause').setAttribute('aria-pressed',String(paused));canvas.dataset.state=failed?'unavailable':!active()?'inactive':!background?'loading':paused?'paused':'running';}
 function fit(){const r=dialog.getBoundingClientRect();stage.style.setProperty('--aquarium-scale',Math.min(r.width/W,r.height/H));dpr=quality==='quiet'?.8:1;if(canvas.width!==Math.round(W*dpr)||canvas.height!==Math.round(H*dpr)){canvas.width=Math.round(W*dpr);canvas.height=Math.round(H*dpr);}paint();}
 const load=src=>new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=src;});
 function drawFish(f){rig.draw(ctx,f,quality,time);}
 function drawInteraction(){
  bubbles=bubbles.filter(b=>time-b.at<b.life);ripples=ripples.filter(r=>time-r.at<1.1);
  for(const ripple of ripples){const progress=(time-ripple.at)/1.1;ctx.save();ctx.translate(ripple.x,ripple.y);ctx.scale(1,.55);ctx.strokeStyle='#c8fff0';ctx.lineWidth=1.3;ctx.globalAlpha=(1-progress)*.5;ctx.beginPath();ctx.arc(0,0,15+progress*77,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=(1-progress)*.2;ctx.beginPath();ctx.arc(0,0,9+progress*48,0,Math.PI*2);ctx.stroke();ctx.restore();}
  for(const b of bubbles){const p=AquariumMotion.bubbleAt(b,time);if(p.y<-p.r)continue;ctx.globalAlpha=p.alpha*.85;ctx.drawImage(bubbleStamp,p.x-p.r,p.y-p.r,p.r*2,p.r*2);}ctx.globalAlpha=1;
  if(canvas.dataset.bubbles!==String(bubbles.length))canvas.dataset.bubbles=String(bubbles.length);
 }
 function paint(){if(!ctx||!background)return;ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.setTransform(dpr,0,0,dpr,0,0);fish.forEach(drawFish);
  for(let i=0;i<(quality==='quiet'?9:21);i++){const column=i%3,x=[260,413,1102][column]+Math.sin(time*.65+i*2)*13+(i%4)*7,y=H-((time*(26+i%5*4)+i*61)%H),r=1.2+i%3*.65;ctx.globalAlpha=.13;ctx.strokeStyle='#d7fbef';ctx.lineWidth=.7;ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.stroke();ctx.globalAlpha=.3;ctx.fillStyle='#fffbe4';ctx.beginPath();ctx.arc(x-r*.3,y-r*.4,r*.23,0,Math.PI*2);ctx.fill();}ctx.globalAlpha=1;
  drawInteraction();if(Math.floor(time)!==reported){reported=Math.floor(time);canvas.dataset.swimmers=JSON.stringify(fish.filter(f=>!f.small).map(f=>({x:Math.round(f.x),y:Math.round(f.y),face:+f.face.toFixed(2)})));}
 }
 function stop(){if(frame)cancelAnimationFrame(frame);frame=0;last=null;}
 let perfStart=null,perfFrames=0,perfCost=0,perfMaxGap=0;
 function tick(now){
  if(!active()||paused||!background){frame=0;state();return;}
  frame=requestAnimationFrame(tick);
  const elapsed=AquariumMotion.frameDelta(last,now),gap=last===null?0:now-last;last=now;
  const count=Math.ceil(elapsed*60);for(let i=0;i<count;i++){const dt=elapsed/count;time+=dt;AquariumMotion.step(fish,dt,time,call);}
  const started=performance.now();paint();const paintMs=performance.now()-started;perfCost+=paintMs;perfMaxGap=Math.max(perfMaxGap,gap);perfFrames++;
  if(perfStart===null)perfStart=now;if(now-perfStart>=1000){canvas.dataset.frameStats=JSON.stringify({fps:Math.round((perfFrames-1)*1000/(now-perfStart)),meanPaintMs:+(perfCost/perfFrames).toFixed(2),maxGapMs:+perfMaxGap.toFixed(1)});perfStart=now;perfFrames=1;perfCost=paintMs;perfMaxGap=0;}
 }
 function reconcile(){const root=document.documentElement;if(root.classList.contains('ambient-screen-open')!==dialog.open)root.classList.toggle('ambient-screen-open',dialog.open);state();if(!ctx){document.getElementById('aquariumFeedback').textContent='浏览器绘图不可用，可切换其他环境主题。';return;}if(active()){fit();if(!paused&&background&&!frame)frame=requestAnimationFrame(tick);}else{stop();bubbles=[];ripples=[];call=null;canvas.dataset.bubbles='0';canvas.dataset.attracted='[]';if(!failed)document.getElementById('aquariumFeedback').textContent='';}}
 function summon(x=W*.5,y=H*.45,all=false){if(!active()||!background)return;call=AquariumMotion.attract(fish,x,y,time,all);bubbles.push(...AquariumMotion.bubbleBurst(x,y,time,quality==='quiet'));bubbles=bubbles.slice(-48);ripples.push({x,y,at:time});ripples=ripples.slice(-4);canvas.dataset.interactions=String(++interactionCount);canvas.dataset.attracted=JSON.stringify(call.ids);document.getElementById('aquariumFeedback').textContent=paused?'已暂停；继续游动后，鱼儿会靠近这里。':'';paint();}
 document.getElementById('aquariumPause').addEventListener('click',()=>{paused=!paused;if(paused)stop();else document.getElementById('aquariumFeedback').textContent='';reconcile();});document.getElementById('aquariumMotion').addEventListener('change',e=>{quality=e.target.value;save();reconcile();});document.getElementById('aquariumTime').addEventListener('change',e=>{showTime=e.target.checked;save();state();});document.getElementById('aquariumCall').addEventListener('click',()=>summon(W*.5,H*.45,true));canvas.addEventListener('pointerdown',e=>{if(e.button!==0||e.isPrimary===false)return;const r=canvas.getBoundingClientRect();summon((e.clientX-r.left)/r.width*W,(e.clientY-r.top)/r.height*H);});
 new MutationObserver(reconcile).observe(dialog,{attributes:true,attributeFilter:['open','data-theme']});new MutationObserver(reconcile).observe(document.documentElement,{attributes:true,attributeFilter:['class']});dialog.addEventListener('close',reconcile);window.addEventListener('resize',()=>{if(active())fit();});document.addEventListener('visibilitychange',reconcile);const changed=e=>{paused=e.matches;if(paused)stop();reconcile();};if(reduce.addEventListener)reduce.addEventListener('change',changed);else reduce.addListener(changed);
 Promise.all([load('./assets/aquarium/swim-background-v3.png'),load('./assets/aquarium/gold-morph-a-v8.png'),load('./assets/aquarium/gold-morph-b-v8.png'),load('./assets/aquarium/small-morph-v8.png')]).then(([plate,goldA,goldB,small])=>{rig=AquariumRig.create(null,goldA,definitions,small,goldB);fish=AquariumMotion.create(definitions).sort((a,b)=>a.baseDepth-b.baseDepth);backdrop.src=plate.src;background=plate;canvas.dataset.asset='flow-morph-v8';reconcile();}).catch(()=>{failed=true;document.getElementById('aquariumFeedback').textContent='鱼缸素材未能载入，请重新载入或切换其他环境主题。';state();});state();
})();
