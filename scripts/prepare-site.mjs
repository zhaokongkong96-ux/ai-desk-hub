import {mkdir,copyFile,rm,readFile} from 'node:fs/promises';
import vm from 'node:vm';
const files=['index.html','manifest.webmanifest','projects-seed.json','sw.js','icon-192.png','icon-512.png','.nojekyll','workspace.css','calendar.js','return.js','return.css','radar.css','timeline.css','companion.css','companion.js','wallpapers.js','THIRD_PARTY_NOTICES.md','vendor/fullcalendar-6.1.19.min.js','vendor/fullcalendar-LICENSE.md'];
const html=await readFile('index.html','utf8');
for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
for(const path of ['sw.js','calendar.js','return.js','companion.js','wallpapers.js','vendor/fullcalendar-6.1.19.min.js'])new vm.Script(await readFile(path,'utf8'));
const wallpaperContext={window:{}};
vm.runInNewContext(await readFile('wallpapers.js','utf8'),wallpaperContext);
const wallpaperIDs=new Set();
for(const w of wallpaperContext.window.DeskWallpapers){
  if(wallpaperIDs.has(w.id)||!['gallery','nature'].includes(w.theme)||!/^\.\/assets\/wallpapers\/[a-z-]+\.jpg$/.test(w.file)||!w.sourceURL.startsWith('https://')||!w.license||!w.artist)throw Error('Invalid wallpaper metadata');
  wallpaperIDs.add(w.id);const image=await readFile(w.file);if(image[0]!==255||image[1]!==216)throw Error('Invalid wallpaper JPEG: '+w.file);files.push(w.file.slice(2));
}
if(wallpaperIDs.size!==6)throw Error('Expected six bundled wallpapers');
const manifest=JSON.parse(await readFile('manifest.webmanifest','utf8'));
if(manifest.scope!=='./'||manifest.start_url!=='./index.html')throw Error('Expected project-relative PWA URLs');
const seed=JSON.parse(await readFile('projects-seed.json','utf8'));
if(!Array.isArray(seed.projects)||!seed.projects.length)throw Error('Missing seed projects');
for(const p of seed.projects)if(!p.id||!p.name||!p.repo_url.startsWith('https://github.com/'))throw Error('Invalid seed project');
for(const size of [192,512]){const png=await readFile(`icon-${size}.png`);if(png.readUInt32BE(16)!==size||png.readUInt32BE(20)!==size)throw Error('Incorrect icon dimensions');}
await rm('_site',{recursive:true,force:true});await mkdir('_site');
for(const file of files){const dir=file.includes('/')?file.slice(0,file.lastIndexOf('/')):'';if(dir)await mkdir(`_site/${dir}`,{recursive:true});await copyFile(file,`_site/${file}`);}
console.log(`Validated JavaScript, manifest, ${seed.projects.length} projects, PNG sizes; staged ${files.length} public files.`);
