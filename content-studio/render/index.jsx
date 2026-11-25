import React from 'react';
import {AbsoluteFill,Composition,Sequence,OffthreadVideo,registerRoot,useCurrentFrame,interpolate} from 'remotion';
const Film=({scenes})=>{
 let start=0;
 return <AbsoluteFill style={{background:'#05090e',fontFamily:'PingFang SC, Heiti SC, sans-serif'}}>
 {scenes.map((scene,index)=>{
  const from=start;start+=scene.frames;
  return <Sequence key={index} from={from} durationInFrames={scene.frames}><Scene scene={scene}/></Sequence>;
 })}
 </AbsoluteFill>;
};
const Scene=({scene})=>{
 const frame=useCurrentFrame();
 let start=0;
 const caption=scene.captions.find(c=>frame>=c.start&&frame<c.end);
 const opacity=interpolate(frame,[8,20,85,105],[0,1,1,0],{extrapolateLeft:'clamp',extrapolateRight:'clamp'});
 return <AbsoluteFill>
 {scene.shots.map((shot,i)=>{
  const from=start;start+=shot.frames;
  return <Sequence key={i} from={from} durationInFrames={shot.frames}>
   <OffthreadVideo src={shot.video} muted style={{width:'100%',height:'100%',objectFit:'cover'}}/>
   <div style={{position:'absolute',top:38,right:48,color:'#fff',fontSize:20,
      textShadow:'0 2px 8px #000',opacity:0.85}}>{shot.label}</div>
  </Sequence>;
 })}
 <AbsoluteFill style={{background:'linear-gradient(0deg,rgba(0,0,0,.65),transparent 32%,transparent 75%,rgba(0,0,0,.15))'}}/>
 {scene.keyword&&<div style={{position:'absolute',top:120,left:100,opacity,
   textShadow:'0 4px 25px rgba(0,0,0,.9)',color:'white'}}>
   <div style={{fontSize:110,fontWeight:800,letterSpacing:-3}}>{scene.keyword}</div>
   <div style={{fontSize:30,fontWeight:500,marginTop:8}}>{scene.heading}</div>
 </div>}
 {caption&&<div style={{position:'absolute',left:90,right:90,bottom:80,textAlign:'center',
  color:'white',fontSize:48,fontWeight:650,lineHeight:1.45,
  textShadow:'0 3px 8px #000, 0 0 3px #000',WebkitTextStroke:'0.4px rgba(0,0,0,.65)'}}>{caption.text}</div>}
 </AbsoluteFill>;
};
const Root=()=> <Composition id="StudioFilm" component={Film} width={1920} height={1080}
 fps={30} durationInFrames={300} defaultProps={{scenes:[]}}
 calculateMetadata={({props})=>({durationInFrames:props.totalFrames})}/>;
registerRoot(Root);
