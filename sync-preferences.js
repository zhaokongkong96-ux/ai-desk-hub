/* Explicit allowlist: sync portable preferences, never sessions, permissions or local files. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DeskSyncPreferences=api;})(typeof window!=='undefined'?window:globalThis,()=>{
'use strict';
const prefix='ai-desk-hub-',bool=v=>typeof v==='boolean',time=v=>typeof v==='string'&&/^([01]\d|2[0-3]):[0-5]\d$/.test(v),text=(v,n)=>typeof v==='string'&&v.length<=n;
const url=v=>{try{const u=new URL(v);return u.protocol==='https:'&&!u.username&&!u.password;}catch{return false;}};
const groups={
 companion:{key:prefix+'companion-v1',fields:{theme:['aquarium',v=>['aquarium','gallery','nature'].includes(v)],idle:[0,v=>[0,2,5,15].includes(v)],netease:['',v=>v===''||(text(v,2048)&&url(v)&&['music.163.com','y.music.163.com'].includes(new URL(v).hostname))],reminders:[false,bool],'wallpapers.gallery':['',v=>text(v,120)],'wallpapers.nature':['',v=>text(v,120)]}},
 attention:{key:prefix+'attention-v1',fields:{auto:[true,bool],start:['08:00',time],end:['23:00',time],cooldown:[120,v=>[30,60,120,240].includes(v)],voice:[false,bool],readContent:[true,bool]}},
 return:{key:prefix+'return-v04',fields:{enabled:[true,bool],quiet:[false,bool],start:['18:00',time],end:['22:00',time],cooldown:[120,v=>[30,60,120,240].includes(v)]}},
 feishu:{key:prefix+'feishu-service',scalar:true,fields:{service:['',v=>v===''||(text(v,2048)&&url(v)&&new URL(v).origin===v)]}}
};
const radarKey=prefix+'radar-saved-v1',topicKey=prefix+'topic-saved-v1';
const keys=new Set([...Object.values(groups).map(g=>g.key),radarKey,topicKey]);
const copy=v=>JSON.parse(JSON.stringify(v));
const get=(obj,path)=>path.split('.').reduce((v,k)=>v?.[k],obj);
function set(obj,path,value){const parts=path.split('.');if(parts.length===2){if(!obj[parts[0]]||typeof obj[parts[0]]!=='object')obj[parts[0]]={};obj[parts[0]][parts[1]]=value;}else obj[path]=value;}
function parse(storage,key,fallback){const raw=storage.getItem(key);if(!raw)return copy(fallback);const value=JSON.parse(raw);return value??copy(fallback);}
function topic(v){return !!v&&typeof v==='object'&&!Array.isArray(v)&&text(v.id,80)&&!!v.id&&text(v.title,240)&&!!v.title.trim()&&text(v.url,2048)&&url(v.url)&&['社会观察','职场成长','科技生活','文化知识'].includes(v.category)&&Number.isFinite(Date.parse(v.publishedAt))&&Object.keys(v).every(k=>['id','title','url','source','feed','category','publishedAt','imageURL','excerpt'].includes(k))&&['source','feed'].every(k=>v[k]===undefined||text(v[k],100))&&(v.excerpt===undefined||text(v.excerpt,100))&&(v.imageURL===undefined||v.imageURL===null||(text(v.imageURL,2048)&&url(v.imageURL)));}
function validate(id,v){
 if(id.startsWith('radar:')){if(!id.slice(6)||id.length>300||(v!==null&&v!==true))throw Error('项目收藏格式无效');return;}
 if(id.startsWith('topic:')){if(!id.slice(6)||id.length>86||(v!==null&&(!topic(v)||v.id!==id.slice(6))))throw Error('选题收藏格式无效');return;}
 const dot=id.indexOf('.'),name=id.slice(0,dot),path=id.slice(dot+1),group=Object.prototype.hasOwnProperty.call(groups,name)?groups[name]:null,field=group&&Object.prototype.hasOwnProperty.call(group.fields,path)?group.fields[path]:null;
 if(!field||(v!==null&&!field[1](v)))throw Error('工作台设置无效');
}
function project(storage){const rows=Object.create(null);for(const [name,g]of Object.entries(groups)){const saved=parse(storage,g.key,g.scalar?'':{});if(g.scalar?typeof saved!=='string':!saved||typeof saved!=='object'||Array.isArray(saved))throw Error('本机工作台设置格式无效');for(const [field,[fallback,valid]]of Object.entries(g.fields)){const v=g.scalar?saved:get(saved,field);rows['preference/'+name+'.'+field]={value:valid(v)?v:fallback};}}
 const radar=parse(storage,radarKey,[]);if(!Array.isArray(radar)||radar.length>2000)throw Error('项目收藏读取失败');for(const id of radar){validate('radar:'+id,true);rows['preference/radar:'+id]={value:true};}
 const topics=parse(storage,topicKey,[]);if(!Array.isArray(topics)||topics.length>100)throw Error('选题收藏读取失败');for(const item of topics){validate('topic:'+item?.id,item);rows['preference/topic:'+item.id]={value:copy(item)};}return rows;
}
function apply(rows,storage){
 // Validate the complete preference batch before writing any key.
 for(const [key,v]of Object.entries(rows)){if(!key.startsWith('preference/'))continue;validate(key.slice(11),v===null?null:v.value);}
 const updates=new Map(),radar=new Set(parse(storage,radarKey,[])),topics=new Map(parse(storage,topicKey,[]).map(v=>[v.id,v]));let hasRadar=false,hasTopics=false;
 for(const [key,row]of Object.entries(rows)){if(!key.startsWith('preference/'))continue;const id=key.slice(11),v=row===null?null:row.value;
  if(id.startsWith('radar:')){hasRadar=true;if(v===null)radar.delete(id.slice(6));else radar.add(id.slice(6));continue;}
  if(id.startsWith('topic:')){hasTopics=true;if(v===null)topics.delete(id.slice(6));else topics.set(id.slice(6),copy(v));continue;}
  const dot=id.indexOf('.'),g=groups[id.slice(0,dot)],field=id.slice(dot+1),value=v===null?g.fields[field][0]:v;
  if(g.scalar)updates.set(g.key,value);else{const saved=updates.get(g.key)||parse(storage,g.key,{});set(saved,field,value);updates.set(g.key,saved);}
 }
 if(radar.size>2000||topics.size>100)throw Error('合并后的收藏数量超出上限，请先整理收藏');
 if(hasRadar)updates.set(radarKey,[...radar]);if(hasTopics)updates.set(topicKey,[...topics.values()]);
 let changed=false;for(const [key,value]of updates){const json=JSON.stringify(value);if(storage.getItem(key)!==json){storage.setItem(key,json);changed=true;}}return changed;
}
return {project,apply,validate,keys};
});
