import {mkdir,copyFile,rm,readFile,rename,readdir} from 'node:fs/promises';
import vm from 'node:vm';
import {execFileSync} from 'node:child_process';
const files=['card-media.js','ambient-clean.css','ambient-clean.js','rondesign-content.css','rondesign-content.js','rondesign.css','rondesign.js','ambient-video.js','ambient-video.css','assets/aquarium/small-morph-v8.png','aquarium-render.js','assets/aquarium/gold-morph-a-v8.png','assets/aquarium/gold-morph-b-v8.png','aquarium-motion.js','assets/aquarium/swim-background-v3.png','aquarium.js','aquarium.css','sync-preferences.js','sync-core.js','sync-crypto.js','sync-engine.js','device-sync.js','device-sync.css','sync-config.json','intake.css','intake-core.js','intake.js','workday.css','workday-core.js','workday.js','hotlist.js','hotlist-feed.json','open-canvas.css','open-canvas.js','assets/theme/quiet-horizon.png','vendor/desk-icons.svg','vendor/bootstrap-icons-LICENSE.md','index.html','manifest.webmanifest','projects-seed.json','sw.js','icon-192.png','icon-512.png','.nojekyll','workspace.css','desk-layout.css','calendar.js','return.js','return.css','radar.css','timeline.css','companion.css','companion.js','wallpapers.js','desk-media.js','desk-media.css','attention.js','attention.css','push-config.json','feishu.js','feishu-config.json','topics.js','topics.css','topics-feed.json','radar-feed.json','THIRD_PARTY_NOTICES.md','vendor/fullcalendar-6.1.19.min.js','vendor/fullcalendar-LICENSE.md'];
const html=await readFile('index.html','utf8');
for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
for(const path of ['card-media.js','ambient-clean.js','rondesign-content.js','rondesign.js','ambient-video.js','aquarium-render.js','aquarium-motion.js','aquarium.js','sync-preferences.js','sync-core.js','sync-crypto.js','sync-engine.js','device-sync.js','intake-core.js','intake.js','workday-core.js','workday.js','hotlist.js','open-canvas.js','sw.js','calendar.js','return.js','companion.js','wallpapers.js','topics.js','attention.js','desk-media.js','feishu.js','vendor/fullcalendar-6.1.19.min.js'])new vm.Script(await readFile(path,'utf8'));
const wallpaperContext={window:{}};
vm.runInNewContext(await readFile('wallpapers.js','utf8'),wallpaperContext);
function jpegDimensions(bytes){
  for(let pos=2;pos+8<bytes.length;){
    if(bytes[pos]!==255)break;
    const marker=bytes[pos+1],length=bytes.readUInt16BE(pos+2);
    if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker))return {width:bytes.readUInt16BE(pos+7),height:bytes.readUInt16BE(pos+5)};
    if(length<2)break;pos+=length+2;
  }
  throw Error('Invalid wallpaper JPEG dimensions');
}
const wallpaperIDs=new Set(), wallpaperCounts={gallery:0,nature:0},swSource=await readFile('sw.js','utf8');let videoCount=0;
for(const w of wallpaperContext.window.DeskWallpapers){
  if(w.kind==='video'){
    if(wallpaperIDs.has(w.id)||w.theme!=='nature'||!/^\.\/assets\/ambient\/[a-z-]+\.mp4$/.test(w.file)||!/^\.\/assets\/ambient\/[a-z-]+\.jpg$/.test(w.poster)||w.width<=w.height||!w.duration||!w.license||!w.loop||!w.muted)throw Error('Invalid ambience video');
    wallpaperIDs.add(w.id);const data=await readFile(w.file);let at=0;const boxes=[];
    while(at+8<=data.length){let size=data.readUInt32BE(at),type=data.toString('ascii',at+4,at+8);if(size===1){if(at+16>data.length)throw Error('Invalid MP4');size=Number(data.readBigUInt64BE(at+8));}if(size===0)size=data.length-at;if(size<8||at+size>data.length)throw Error('Invalid MP4 box');boxes.push(type);at+=size;}
    if(at!==data.length||boxes[0]!=='ftyp'||!boxes.includes('moov')||!boxes.includes('mdat')||boxes.indexOf('moov')>boxes.indexOf('mdat'))throw Error('Video must be fast-start MP4');
    const image=await readFile(w.poster),dimensions=jpegDimensions(image);if(dimensions.width<=dimensions.height)throw Error('Video poster must be landscape');
    if(!swSource.includes("'"+w.poster+"'")||swSource.includes("'"+w.file+"'"))throw Error('Precache poster only, not full video');
    files.push(w.file.slice(2),w.poster.slice(2));videoCount++;continue;
  }
  if(wallpaperIDs.has(w.id)||!['gallery','nature'].includes(w.theme)||!/^\.\/assets\/wallpapers\/[a-z-]+\.jpg$/.test(w.file)||!w.sourceURL.startsWith('https://')||!w.license||!w.artist)throw Error('Invalid wallpaper metadata');
  wallpaperIDs.add(w.id);const image=await readFile(w.file);if(image[0]!==255||image[1]!==216)throw Error('Invalid wallpaper JPEG: '+w.file);
  const size=jpegDimensions(image);if(size.width<=size.height||size.width!==w.width||size.height!==w.height)throw Error('Wallpaper must use its original landscape composition: '+w.file);
  if(!swSource.includes("'"+w.file+"'"))throw Error('Wallpaper missing from offline cache: '+w.file);
  wallpaperCounts[w.theme]++;files.push(w.file.slice(2));
}
if(wallpaperIDs.size!==12||wallpaperCounts.gallery!==5||wallpaperCounts.nature!==5||videoCount!==2)throw Error('Expected ten landscape images plus two nature videos');
const topics=JSON.parse(await readFile('topics-feed.json','utf8'));
if(topics.schemaVersion!==1||!Array.isArray(topics.items)||!Number.isFinite(Date.parse(topics.generatedAt)))throw Error('Invalid topics snapshot');
for(const item of topics.items)if(!item.id||!item.title||!item.url.startsWith('https://')||!Number.isFinite(Date.parse(item.publishedAt)))throw Error('Invalid topic item');
const radar=JSON.parse(await readFile('radar-feed.json','utf8'));
if(radar.schemaVersion!==1||!Number.isFinite(Date.parse(radar.generatedAt))||!Array.isArray(radar.projects)||!radar.projects.length)throw Error('Invalid daily radar snapshot');
for(const p of radar.projects)if(!p.id||!p.name||!/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/?$/.test(p.repo_url))throw Error('Invalid daily project URL');
const hot=JSON.parse(await readFile('hotlist-feed.json','utf8'));
if(hot.schemaVersion!==1||!Array.isArray(hot.items)||!Array.isArray(hot.history))throw Error('Invalid hotlist');
for(const p of hot.items)if(!/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(p.url)||!['今日新上榜','持续热门','重大更新'].includes(p.label))throw Error('Invalid hotlist item');
const manifest=JSON.parse(await readFile('manifest.webmanifest','utf8'));
if(manifest.scope!=='./'||manifest.start_url!=='./index.html')throw Error('Expected project-relative PWA URLs');
const seed=JSON.parse(await readFile('projects-seed.json','utf8'));
if(!Array.isArray(seed.projects)||!seed.projects.length)throw Error('Missing seed projects');
for(const p of seed.projects)if(!p.id||!p.name||!p.repo_url.startsWith('https://github.com/'))throw Error('Invalid seed project');
for(const size of [192,512]){const png=await readFile(`icon-${size}.png`);if(png.readUInt32BE(16)!==size||png.readUInt32BE(20)!==size)throw Error('Incorrect icon dimensions');}
// Keep the live preview readable while rebuilding. Copying into a served MP4
// can expose a truncated file and poison the browser's subsequent range reads.
await mkdir('_site',{recursive:true});
for(const file of files){const dir=file.includes('/')?file.slice(0,file.lastIndexOf('/')):'';if(dir)await mkdir(`_site/${dir}`,{recursive:true});const temp=`_site/${file}.staging-${process.pid}`;await copyFile(file,temp);await rename(temp,`_site/${file}`);}
// Preserve the public allowlist: old assets and stray files must not be served.
const allowed=new Set(files);
async function prune(dir=''){
 for(const entry of await readdir(`_site/${dir}`,{withFileTypes:true})){
  const relative=dir+entry.name;
  if(entry.isDirectory())await prune(relative+'/');
  else if(!allowed.has(relative))await rm(`_site/${relative}`,{force:true});
 }
}
await prune();
console.log(`Validated JavaScript, manifest, ${seed.projects.length} projects, PNG sizes; staged ${files.length} public files.`);
