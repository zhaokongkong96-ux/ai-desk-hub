import {mkdir,copyFile,rm,readFile} from 'node:fs/promises';
import vm from 'node:vm';
const files=['hotlist.js','hotlist-feed.json','open-canvas.css','open-canvas.js','assets/theme/quiet-horizon.png','vendor/desk-icons.svg','vendor/bootstrap-icons-LICENSE.md','index.html','manifest.webmanifest','projects-seed.json','sw.js','icon-192.png','icon-512.png','.nojekyll','workspace.css','desk-layout.css','calendar.js','return.js','return.css','radar.css','timeline.css','companion.css','companion.js','wallpapers.js','desk-media.js','desk-media.css','attention.js','attention.css','push-config.json','feishu.js','feishu-config.json','topics.js','topics.css','topics-feed.json','radar-feed.json','THIRD_PARTY_NOTICES.md','vendor/fullcalendar-6.1.19.min.js','vendor/fullcalendar-LICENSE.md'];
const html=await readFile('index.html','utf8');
for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
for(const path of ['hotlist.js','open-canvas.js','sw.js','calendar.js','return.js','companion.js','wallpapers.js','topics.js','attention.js','desk-media.js','feishu.js','vendor/fullcalendar-6.1.19.min.js'])new vm.Script(await readFile(path,'utf8'));
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
const wallpaperIDs=new Set(), wallpaperCounts={gallery:0,nature:0},swSource=await readFile('sw.js','utf8');
for(const w of wallpaperContext.window.DeskWallpapers){
  if(wallpaperIDs.has(w.id)||!['gallery','nature'].includes(w.theme)||!/^\.\/assets\/wallpapers\/[a-z-]+\.jpg$/.test(w.file)||!w.sourceURL.startsWith('https://')||!w.license||!w.artist)throw Error('Invalid wallpaper metadata');
  wallpaperIDs.add(w.id);const image=await readFile(w.file);if(image[0]!==255||image[1]!==216)throw Error('Invalid wallpaper JPEG: '+w.file);
  const size=jpegDimensions(image);if(size.width<=size.height||size.width!==w.width||size.height!==w.height)throw Error('Wallpaper must use its original landscape composition: '+w.file);
  if(!swSource.includes("'"+w.file+"'"))throw Error('Wallpaper missing from offline cache: '+w.file);
  wallpaperCounts[w.theme]++;files.push(w.file.slice(2));
}
if(wallpaperIDs.size!==10||wallpaperCounts.gallery!==5||wallpaperCounts.nature!==5)throw Error('Expected five landscape wallpapers per category');
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
await rm('_site',{recursive:true,force:true});await mkdir('_site');
for(const file of files){const dir=file.includes('/')?file.slice(0,file.lastIndexOf('/')):'';if(dir)await mkdir(`_site/${dir}`,{recursive:true});await copyFile(file,`_site/${file}`);}
console.log(`Validated JavaScript, manifest, ${seed.projects.length} projects, PNG sizes; staged ${files.length} public files.`);
