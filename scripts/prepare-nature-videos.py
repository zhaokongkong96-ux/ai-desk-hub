"""Prepare the two user-supplied clips for inline Safari-compatible playback.
No cuts, speed changes, transitions, watermark removal or fabricated loop frames.
"""
import argparse,hashlib,json,subprocess
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--ffmpeg',required=True);p.add_argument('coast');p.add_argument('beach');args=p.parse_args()
root=Path(__file__).resolve().parents[1];out=root/'assets/ambient';out.mkdir(parents=True,exist_ok=True)
report=[]
for source,name in [(args.coast,'coast-overhead'),(args.beach,'beach-waves')]:
 src=Path(source);dest=out/(name+'.mp4')
 subprocess.run([args.ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(src),'-map','0:v:0','-an','-map_metadata','-1','-map_chapters','-1',
  '-vf','scale=1280:720:force_original_aspect_ratio=decrease,setsar=1','-c:v','libx264','-preset','slow','-crf','24',
  '-maxrate','1700k','-bufsize','3400k','-pix_fmt','yuv420p','-profile:v','high','-level:v','3.1','-g','60','-movflags','+faststart',str(dest)],check=True)
 subprocess.run([args.ffmpeg,'-hide_banner','-loglevel','error','-y','-i',str(dest),'-frames:v','1','-q:v','3',str(out/(name+'.jpg'))],check=True)
 report.append({'sourceFilename':src.name,'sourceSHA256':hashlib.sha256(src.read_bytes()).hexdigest(),'file':str(dest.relative_to(root)),
  'bytes':dest.stat().st_size,'sha256':hashlib.sha256(dest.read_bytes()).hexdigest(),'audio':'removed for silent ambience','contentEdits':False,'loopSeam':'original endpoints; not certified seamless'})
target=root/'artifacts/nature-video-release';target.mkdir(parents=True,exist_ok=True);(target/'video-preparation.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print(json.dumps(report,ensure_ascii=False,indent=2))
