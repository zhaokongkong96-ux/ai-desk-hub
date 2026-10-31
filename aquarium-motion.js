/* One authoritative yaw/speed state drives both fish motion and perspective. */
((root)=>{
 'use strict';const clamp=(n,a,b)=>Math.max(a,Math.min(b,n)),PI=Math.PI;
 const rules=small=>({duration:small?7.2:9,maxSpeed:small?27:23,acceleration:small?9:6,maxPitch:7.5*PI/180});
 const smooth=t=>{t=clamp(t,0,1);return t*t*(3-2*t);};
 function create(definitions){return definitions.map((f,i)=>{const speed=f.small?23+(i%3):17+(i%4);return {...f,id:i,phase:i*1.83,direction:f.dir,turnFrom:f.dir,turnTo:f.dir,turnProgress:1,turnCount:0,turnView:0,pendingDirection:f.dir,pendingFor:0,cooldown:0,yaw:f.dir===1?0:PI,face:f.dir,speed,cruise:speed,vx:f.dir*speed,vy:0,pitch:0,depth:f.baseDepth,travel:0,leg:0,goalX:f.dir>0?1280-f.w*.4:165+f.w*.4,goalY:clamp(f.y,260,840)};});}
 function attract(fish,x,y,time,all=false){const distance=f=>Math.hypot(f.x-x,f.y-y),near=group=>fish.filter(f=>!!f.small===group).sort((a,b)=>distance(a)-distance(b)),gold=near(false),small=near(true),ids=all?fish.map(f=>f.id):gold.filter((f,i)=>i===0||distance(f)<560).slice(0,3).concat(small.filter(f=>distance(f)<430).slice(0,2)).map(f=>f.id);return {x:clamp(x,0,1448),y:clamp(y,0,1086),at:time,ids};}
 function bubbleBurst(x,y,time,quiet=false){return Array.from({length:quiet?12:18},(_,i)=>({x:clamp(x,0,1448)+(Math.random()-.5)*26,y:clamp(y,0,1086)+(Math.random()-.5)*18,at:time,life:2.4+Math.random()*1.6,r:3+Math.random()*8,vx:(Math.random()-.5)*24,vy:42+Math.random()*60,phase:i*2.4+Math.random()}));}
 function bubbleAt(b,time){const age=Math.max(0,time-b.at),progress=age/b.life;return {x:b.x+b.vx*age+Math.sin(age*2+b.phase)*age*4,y:b.y-b.vy*age-9*age*age,r:b.r*(1+age*.13),alpha:progress>=1?0:Math.min(1,age*9+.2)*Math.min(1,(1-progress)*3)};}
 function begin(f,direction){f.turnFrom=f.direction;f.turnTo=direction;f.turnProgress=0;f.turnCount++;f.pendingFor=0;}
 function viewFrames(f){const coordinate=clamp(Number.isFinite(f.yaw)?f.yaw/PI:Math.acos(clamp(f.face,-1,1))/PI,0,1)*128,lower=Math.floor(coordinate);return {lower,upper:Math.min(128,lower+1),blend:coordinate-lower};}
 function frameDelta(previous,now){return previous===null?0:clamp((now-previous)/1000,0,.05);}
 function pose(f){const facing=Math.abs(f.face),side=smooth((facing-.55)/.4);return {sign:f.face<0?-1:1,width:.68+.32*facing,side,front:1-side,view:0,pitch:f.face};}
 function step(fish,dt,time,call){
  dt=clamp(dt,0,.12);
  for(const f of fish){
   const rule=rules(!!f.small),margin=f.w*.57+30,min=margin,max=1448-margin;
   const response=call&&time-call.at<9&&(!call.ids||call.ids.includes(f.id))?clamp((9-time+call.at)/3,0,1):0;
   const goalX=response?clamp(call.x+Math.cos(f.phase)*f.w*.25,min,max):f.goalX;
   const goalY=response?clamp(call.y+Math.sin(f.phase)*42,260,840):f.goalY;
   f.cooldown=Math.max(0,f.cooldown-dt);
   if(f.turnProgress===1){
    // Start before the glass: the yaw arc still travels forward during its first half.
    const reserve=f.cruise*rule.duration*.46+20;
    let wanted=f.direction;
    if(f.direction>0&&f.x>max-reserve)wanted=-1;
    else if(f.direction<0&&f.x<min+reserve)wanted=1;
    else if(response&&Math.abs(goalX-f.x)>95)wanted=goalX>f.x?1:-1;
    else if(!response&&Math.abs(f.goalX-f.x)>100)wanted=f.goalX>f.x?1:-1;
    if(wanted!==f.direction){if(f.pendingDirection!==wanted){f.pendingDirection=wanted;f.pendingFor=0;}f.pendingFor+=dt;}
    else f.pendingFor=0;
    if(f.pendingFor>=.45&&f.cooldown===0){begin(f,wanted);if(!response){f.goalX=wanted>0?max:min;f.leg++;f.goalY=clamp(f.y+Math.sin(f.phase+f.leg*2.3)*90,270,830);}}
   }
   if(f.turnProgress<1){f.turnProgress=Math.min(1,f.turnProgress+dt/rule.duration);const start=f.turnFrom>0?0:PI,end=f.turnTo>0?0:PI;f.yaw=start+(end-start)*smooth(f.turnProgress);if(f.turnProgress===1){f.direction=f.turnTo;f.cooldown=1.5;}}
   else f.yaw=f.direction>0?0:PI;
   f.face=Math.cos(f.yaw);
   const targetSpeed=clamp(f.cruise*(f.turnProgress<1?.72:1),0,rule.maxSpeed);f.speed+=clamp(targetSpeed-f.speed,-rule.acceleration*dt,rule.acceleration*dt);
   // The head's perspective and the horizontal velocity use the SAME yaw; no backward sliding.
   f.vx=Math.cos(f.yaw)*f.speed;
   const vyLimit=f.speed*Math.tan(rule.maxPitch),targetVy=clamp((goalY-f.y)*.04,-vyLimit,vyLimit);f.vy+=clamp(targetVy-f.vy,-2.5*dt,2.5*dt);
   f.x=clamp(f.x+f.vx*dt,min,max);f.y=clamp(f.y+f.vy*dt,240,870);f.pitch=Math.atan2(f.vy,Math.max(1,f.speed))*f.face;
   f.travel+=Math.hypot(f.vx,f.vy)*dt;f.depth=f.baseDepth;
  }
  return fish;
 }
 const api={create,step,attract,bubbleBurst,bubbleAt,pose,viewFrames,rules,frameDelta};if(typeof module==='object'&&module.exports)module.exports=api;else root.AquariumMotion=api;
})(typeof window==='undefined'?globalThis:window);
