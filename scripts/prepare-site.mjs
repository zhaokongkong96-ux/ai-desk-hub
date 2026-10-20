import {mkdir,copyFile,rm,readFile} from 'node:fs/promises';
import vm from 'node:vm';
const files=['index.html','manifest.webmanifest','projects-seed.json','sw.js','icon-192.png','icon-512.png','.nojekyll'];
const html=await readFile('index.html','utf8');
for(const match of html.matchAll(/<script>([\s\S]*?)<\/script>/g))new vm.Script(match[1]);
new vm.Script(await readFile('sw.js','utf8'));
const manifest=JSON.parse(await readFile('manifest.webmanifest','utf8'));
if(manifest.scope!=='./'||manifest.start_url!=='./index.html')throw Error('Expected project-relative PWA URLs');
const seed=JSON.parse(await readFile('projects-seed.json','utf8'));
if(!Array.isArray(seed.projects)||!seed.projects.length)throw Error('Missing seed projects');
for(const p of seed.projects)if(!p.id||!p.name||!p.repo_url.startsWith('https://github.com/'))throw Error('Invalid seed project');
for(const size of [192,512]){const png=await readFile(`icon-${size}.png`);if(png.readUInt32BE(16)!==size||png.readUInt32BE(20)!==size)throw Error('Incorrect icon dimensions');}
await rm('_site',{recursive:true,force:true});await mkdir('_site');
for(const file of files)await copyFile(file,`_site/${file}`);
console.log(`Validated JavaScript, manifest, ${seed.projects.length} projects, PNG sizes; staged ${files.length} public files.`);
