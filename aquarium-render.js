/* Runtime playback of flow-morphed perspective frames; no mesh baking or pixel reads here. */
(()=>{
 'use strict';
 function create(unused,goldA,definitions,small,goldB){
  const gold={width:256,height:192,divisor:180},tiny={width:128,height:96,divisor:82.5};
  const buffers=definitions.map(f=>{const layout=f.small?tiny:gold,c=document.createElement('canvas');c.width=layout.width;c.height=layout.height;return {canvas:c,ctx:c.getContext('2d'),layout};});
  function frame(g,image,index,layout,alpha){g.globalAlpha=alpha;g.drawImage(image,index%8*layout.width,Math.floor(index/8)*layout.height,layout.width,layout.height,0,0,layout.width,layout.height);}
  function source(f,index){return f.small?{image:small,index}:index<65?{image:goldA,index}:{image:goldB,index:index-65};}
  function draw(g,f,quality,time){
   const {canvas,ctx:m,layout}=buffers[f.id],v=AquariumMotion.viewFrames(f);m.clearRect(0,0,layout.width,layout.height);m.globalCompositeOperation='lighter';
   const a=source(f,v.lower);frame(m,a.image,a.index,layout,1-v.blend);
   if(v.blend){const b=source(f,v.upper);frame(m,b.image,b.index,layout,v.blend);}
   g.save();g.translate(f.x,f.y);g.rotate(f.pitch||0);const scale=f.w/layout.divisor;g.scale(scale,scale);g.globalAlpha=f.small?.57+f.baseDepth*.5:.85+f.baseDepth*.14;
   // Continuous fin pulse, independent of the cached perspective frame.
   g.transform(1,Math.sin(time*2.8+f.phase)*.007,0,1,0,0);g.drawImage(canvas,-layout.width/2,-layout.height*.54);g.restore();
  }
  return {draw,frameCount:129};
 }
 window.AquariumRig={create};
})();
