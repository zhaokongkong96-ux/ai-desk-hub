/* Presence only: no identity, image, sensor history, or storage. */
(() => {
 class DeskPresenceGate {
  constructor({hold=3000,leave=15000,cooldown=300000}={}){this.hold=hold;this.leave=leave;this.cooldown=cooldown;this.reset();this.lastGreeting=-Infinity;}
  reset(){this.faceSince=null;this.emptySince=null;this.lastFrame=null;this.samples=0;this.occupied=false;}
  accept(now){this.occupied=true;this.lastGreeting=now;}
  update(count,now){
   if(this.lastFrame!==null&&now-this.lastFrame>5000){this.faceSince=null;this.samples=0;this.emptySince=null;}this.lastFrame=now;
   if(count===0){this.faceSince=null;this.samples=0;this.emptySince??=now;if(now-this.emptySince>=this.leave)this.occupied=false;return {phase:this.occupied?'leaving':'empty'};}
   this.emptySince=null;
   if(count!==1){this.faceSince=null;this.samples=0;return {phase:'multiple'};}
   if(this.occupied)return {phase:'present'};
   this.faceSince??=now;this.samples++;
   if(now-this.faceSince<this.hold||this.samples<3)return {phase:'settling'};
   if(now-this.lastGreeting<this.cooldown)return {phase:'cooldown',remaining:Math.ceil((this.cooldown-now+this.lastGreeting)/1000)};
   return {phase:'arrival'};
  }
 }
 window.DeskPresenceGate=DeskPresenceGate;
})();
