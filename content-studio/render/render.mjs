import {bundle} from '@remotion/bundler';
import {selectComposition,renderMedia} from '@remotion/renderer';
import {readFile,mkdir,copyFile} from 'node:fs/promises';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const dir=dirname(fileURLToPath(import.meta.url));
const props=JSON.parse(await readFile(process.argv[2],'utf8'));
const url=await bundle({entryPoint:join(dir,'index.jsx'),publicDir:null});
for (const [index,scene] of props.scenes.entries()){
 for (const [shotIndex,shot] of scene.shots.entries()){
  const name=`clip-${index}-${shotIndex}.mp4`;
  await copyFile(shot.video,join(url,name));
  shot.video='./'+name;
 }
}
const browserExecutable=process.env.STUDIO_CHROME||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const composition=await selectComposition({browserExecutable,serveUrl:url,id:'StudioFilm',inputProps:props});
await renderMedia({browserExecutable,composition,serveUrl:url,codec:'h264',outputLocation:process.argv[3],
 inputProps:props,concurrency:2,chromiumOptions:{gl:'angle'},overwrite:true});
