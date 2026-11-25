"""Source-photo editorial film; continuous speech with provider word timing.

This recipe is opt-in, private and source-bound. It never substitutes a stock
object for a user's personal item, and never presents photo motion as footage.
"""
import array
import concurrent.futures
import hashlib
import html
import json
import math
import re
import shutil
import subprocess
import wave
from pathlib import Path
from PIL import Image
import imageio_ffmpeg
from store import DATA

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
W, H, FPS = 1080, 1350, 30


def run(args, timeout=900):
    r = subprocess.run([FFMPEG, '-nostdin', '-y', '-hide_banner', '-loglevel', 'error', *map(str,args)],
                       capture_output=True, text=True, timeout=timeout)
    if r.returncode:
        raise RuntimeError('FFmpeg: '+r.stderr[-1500:])
    return r


def normalize(s):
    return ''.join(c.lower() for c in html.unescape(s) if c.isalnum())


def ass_time(t):
    n = round(t * 100)
    h, n = divmod(n, 360000)
    m, n = divmod(n, 6000)
    s, cs = divmod(n,100)
    return f'{h}:{m:02}:{s:02}.{cs:02}'


def srt_time(t):
    n = round(t*1000)
    h,n=divmod(n,3600000);m,n=divmod(n,60000);s,ms=divmod(n,1000)
    return f'{h:02}:{m:02}:{s:02},{ms:03}'


def align(plan, events):
    words=[]
    for event in events:
        chars=normalize(event['text'])
        if not chars:
            continue
        begin=event['offset']/10_000_000
        duration=event['duration']/10_000_000
        words.extend({'char':char,'start':begin+duration*i/len(chars),
                      'end':begin+duration*(i+1)/len(chars)} for i,char in enumerate(chars))
    expected=''.join(normalize(s['narration']) for s in plan['script'])
    if expected!=''.join(w['char'] for w in words):
        raise ValueError('配音边界与确认稿不一致，停止合成')
    captions=[];beats=[];cursor=0
    for scene in plan['script']:
        scene_start=words[cursor]['start']
        phrases=[]
        for phrase in re.split(r'[，。？！；：,!?;\n]+', scene['narration']):
            phrase=phrase.strip(' “”—、')
            if not normalize(phrase):continue
            # Keep the spoken transcript complete. Short lines fit the image.
            while len(phrase)>18:
                split=phrase.rfind(' ',0,18)
                if split<8:split=17
                phrases.append(phrase[:split].strip());phrase=phrase[split:].strip()
            if phrase:phrases.append(phrase)
        for phrase in phrases:
            length=len(normalize(phrase))
            first,last=words[cursor],words[cursor+length-1]
            captions.append(dict(text=phrase,start=first['start'],end=last['end']))
            cursor+=length
        beats.append(dict(title=scene['title'],start=scene_start,end=words[cursor-1]['end']))
    assert cursor==len(words)
    # Hold a short phrase into the natural breath, without overlapping the next.
    for i,cue in enumerate(captions):
        if i+1<len(captions):cue['end']=min(captions[i+1]['start'],cue['end']+0.12)
    return captions,beats


def write_captions(folder,captions,total,width=W,height=H,opening_credit=None,closing_credit=None):
    styles='''[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1350
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Sub,PingFang SC,46,&H00FFFFFF,&H00FFFFFF,&H00302C28,&H50000000,-1,0,0,0,100,100,0,0,1,2.6,1,2,70,70,100,1
Style: Credit,PingFang SC,21,&H00FFFFFF,&H00FFFFFF,&H00302C28,&H50000000,0,0,0,0,100,100,0,0,1,1.5,0,8,70,70,35,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
'''
    styles=styles.replace('PlayResX: 1080',f'PlayResX: {width}').replace('PlayResY: 1350',f'PlayResY: {height}')
    if width>1500:
        styles=styles.replace('Sub,PingFang SC,46,','Sub,PingFang SC,52,').replace('Credit,PingFang SC,21,','Credit,PingFang SC,22,')
    ass=[];srt=[]
    for i,c in enumerate(captions):
        escaped=c['text'].replace('{','').replace('}','').replace('\\','')
        ass.append(f"Dialogue: 1,{ass_time(c['start'])},{ass_time(c['end'])},Sub,,0,0,0,,{escaped}")
        srt.append(f"{i+1}\n{srt_time(c['start'])} --> {srt_time(c['end'])}\n{c['text']}\n")
    opening_credit=opening_credit or 'V&A · 圣诞树 / 原项目摄影'
    closing_credit=closing_credit or '影像 Courtesy of Burberry · 资料 V&A / Dezeen'
    ass.append(f'Dialogue: 0,0:00:00.00,0:00:05.00,Credit,,0,0,0,,{opening_credit}')
    ass.append(f'Dialogue: 0,{ass_time(total-7)},{ass_time(total)},Credit,,0,0,0,,{closing_credit}')
    (folder/'captions.ass').write_text(styles+'\n'.join(ass),encoding='utf-8')
    (folder/'captions.srt').write_text('\n'.join(srt),encoding='utf-8')
    (folder/'caption-cues.json').write_text(json.dumps(captions,ensure_ascii=False,indent=2))


# Rectangles are normalized square coordinates on the original 4:5 photos.
# All transformed crops preserve proportions. Full tree remains available.
PRESETS={
 'whole':('dezeen-2',(0,0,1,1)),
 'tree-mid':('dezeen-2',(.12,.22,.76,.76)),
 'tree-upper':('dezeen-2',(.16,0,.68,.68)),
 'tree-lower':('dezeen-2',(.05,.30,.90,.70)),
 'detail':('dezeen-3',(0,0,1,1)),
 'detail-upper':('dezeen-3',(.06,0,.72,.72)),
 'detail-center':('dezeen-3',(.25,.18,.70,.70)),
 'detail-lower':('dezeen-3',(.06,.35,.65,.65)),
}
# Meaning-driven ordering, not an unrelated footage rotation.
RECIPES=[
 ['detail-center','detail','whole'],
 ['whole','tree-upper','detail-upper','detail','tree-mid'],
 ['whole','tree-mid','detail','detail-center'],
 ['detail-upper','detail-lower','detail-center','tree-mid'],
 ['detail','detail-upper','detail-center','whole'],
 ['detail-lower','tree-mid','whole'],
 ['tree-upper','detail-upper','detail-lower','tree-lower','whole'],
 ['detail-center','detail-lower','tree-mid','detail'],
 ['detail-upper','tree-mid','tree-upper','whole'],
 ['detail','tree-mid','whole'],
]


DOHA_PRESETS={
 'dusk':('doha-1',(0,0,1,1)),
 'waterfront':('doha-2',(0,0,1,1)),
 'facade':('doha-3',(0,0,1,1)),
 'plaza':('doha-4',(0,0,1,1)),
 'entry':('doha-5',(0,0,1,1)),
 'pattern':('doha-6',(0,0,1,1)),
 'room':('doha-7',(0,0,1,1)),
 'mirrors':('doha-8',(0,0,1,1)),
 'sculpture':('doha-9',(0,0,1,1)),
 'skylight':('doha-7',(.10,0,.80,.72)),
 'stripes':('doha-9',(.16,.10,.66,.74)),
}
DOHA_RECIPES=[
 ['dusk','room','plaza'],
 ['waterfront','entry','room','mirrors','sculpture'],
 ['plaza','pattern','facade','entry','plaza','entry'],
 ['room','pattern','stripes','room'],
 ['stripes','sculpture','mirrors','room'],
 ['room','skylight','mirrors','sculpture'],
 ['pattern','stripes','sculpture','room','mirrors'],
 ['room','mirrors','sculpture'],
 ['dusk','facade','room','sculpture','mirrors'],
 ['entry','room','waterfront','dusk'],
]


def recipe_for(name):
    if name=='doha-richter-2026':
        return dict(width=1920,height=1080,assets_dir='a2-production-assets',
                    presets=DOHA_PRESETS,recipes=DOHA_RECIPES,
                    opening_credit='DOHA PAVILION · GERHARD RICHTER / 落成实拍',
                    closing_credit='Photo Iwan Baan · Courtesy Qatar Museums · Artwork © Gerhard Richter 2026')
    if name=='va-tree-2026':
        return dict(width=W,height=H,assets_dir='a1-production-assets',presets=PRESETS,recipes=RECIPES)
    raise ValueError('未审核的项目镜头配方')


def crop_source(asset,rect,path,width=W,height=H):
    with Image.open(asset['path']) as im:
        im=im.convert('RGB')
        x,y,rw,rh=rect
        # Maximal requested rectangle, then uniform center crop to 4:5.
        left,top=round(x*im.width),round(y*im.height)
        right=min(im.width,round((x+rw)*im.width));bottom=min(im.height,round((y+rh)*im.height))
        cw,ch=right-left,bottom-top
        if cw/ch>width/height:
            trim=(cw-ch*width/height)/2;left+=round(trim);right-=round(trim)
        else:
            trim=(ch-cw*height/width)/2;top+=round(trim);bottom-=round(trim)
        crop=im.crop((left,top,right,bottom))
        crop=crop.resize((round(width*1.5),round(height*1.5)),Image.Resampling.LANCZOS)
        crop.save(path,quality=97)
        return [left,top,right,bottom]


def render_shot(folder,shot,asset,width=W,height=H):
    source=folder/f"crop-{shot['index']:03}.jpg"
    box=crop_source(asset,shot['rect'],source,width,height)
    n=shot['frames'];den=max(1,n-1)
    # Modest camera motion across a real still. No synthesized objects or depth.
    z=f'1.025+0.045*on/{den}' if shot['index']%2==0 else f'1.07-0.045*on/{den}'
    x=f'(iw-iw/zoom)*(0.38+0.24*on/{den})'
    y=f'(ih-ih/zoom)*(0.56-0.12*on/{den})'
    vf=f"zoompan=z='{z}':x='{x}':y='{y}':d={n}:s={width}x{height}:fps={FPS},setsar=1"
    path=folder/f"shot-{shot['index']:03}.mp4"
    run(['-i',source,'-vf',vf,'-frames:v',n,'-an','-c:v','libx264','-preset','veryfast',
         '-crf','18','-threads','2','-pix_fmt','yuv420p',path])
    shot.update(path=str(path),pixel_crop=box,source=asset['page'],asset=asset['url'],
                sha256=asset['sha256'],credit=asset['credit'],kind='source photograph with camera motion')
    return shot


def produce(job_id,plan,category,progress):
    recipe=recipe_for(plan.get('production_recipe'))
    width,height=recipe['width'],recipe['height']
    presets,recipes=recipe['presets'],recipe['recipes']
    if len(plan['script'])!=len(recipes):
        raise ValueError('分镜数量与已审核配方不一致')
    folder=DATA/job_id;folder.mkdir(exist_ok=False)
    source_dir=DATA/recipe['assets_dir']
    # Use the already synthesized take, and verify exactly what was authorized.
    submitted=(source_dir/'spoken.txt').read_text()
    expected='\n\n'.join(s['narration'] for s in plan['script'])
    if submitted!=expected:raise ValueError('已配音文本与确认稿不符')
    for name in ['voice.mp3','voice-timing.json','voice-provenance.json','spoken.txt']:
        shutil.copy2(source_dir/name,folder/name)
    progress('配音与逐词字幕核对')
    events=json.loads((folder/'voice-timing.json').read_text())
    captions,beats=align(plan,events)
    run(['-i',folder/'voice.mp3','-ar','48000','-ac','1',folder/'voice.wav'])
    with wave.open(str(folder/'voice.wav')) as audio:
        seconds=audio.getnframes()/audio.getframerate()
    total_frames=math.ceil(seconds*FPS);seconds=total_frames/FPS
    write_captions(folder,captions,seconds,width,height,recipe.get('opening_credit'),recipe.get('closing_credit'))
    assets={a['id']:a for a in plan['production_assets']}
    used_assets={aid for aid,rect in presets.values()}
    for aid in used_assets:
        if hashlib.sha256(Path(assets[aid]['path']).read_bytes()).hexdigest()!=assets[aid]['sha256']:
            raise ValueError('原素材已变化')
    shots=[];last=0
    for i,beat in enumerate(beats):
        end=round(beats[i+1]['start']*FPS) if i+1<len(beats) else total_frames
        available=end-last
        names=recipes[i]
        # 4–8 second observation shots; distribute without duplicating footage.
        count=max(1,round(available/FPS/5.4))
        for j in range(count):
            frames=(end-last)//(count-j)
            preset=names[min(len(names)-1,round(j*(len(names)-1)/max(1,count-1)))]
            aid,rect=presets[preset]
            shots.append(dict(index=len(shots),scene=i+1,preset=preset,asset_id=aid,rect=rect,
                              start=last/FPS,frames=frames,seconds=frames/FPS))
            last+=frames
    progress(f'原项目照片运镜 · {len(shots)} 个镜头')
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        rendered=list(pool.map(lambda s:render_shot(folder,s,assets[s['asset_id']],width,height),shots))
    (folder/'timeline.json').write_text(json.dumps({'width':width,'height':height,'fps':FPS,'frames':total_frames,
        'beats':beats,'shots':rendered,'speech_speed':1,'timing':'Provider WordBoundary; characters within a word distributed over that word interval.'},ensure_ascii=False,indent=2))
    (folder/'media-sources.json').write_text(json.dumps(rendered,ensure_ascii=False,indent=2))
    (folder/'plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2))
    concat=folder/'concat.txt'
    concat.write_text('\n'.join("file '"+s['path'].replace("'","'\\''")+"'" for s in rendered))
    progress('高清全屏合成与字幕烧录')
    run(['-f','concat','-safe','0','-i',concat,'-c','copy',folder/'picture.mp4'])
    # A local filter file avoids path quoting and contains no secrets.
    filters=folder/'finish.filter'
    ass=str(folder/'captions.ass').replace('\\','\\\\').replace(':','\\:').replace("'","'\\''")
    filters.write_text("[0:v]scale=in_range=pc:out_range=tv,format=yuv420p,subtitles=filename='"+ass+"'[v];[1:a]apad,atrim=duration="+str(seconds)+",loudnorm=I=-16:TP=-1.5:LRA=9[a]")
    run(['-i',folder/'picture.mp4','-i',folder/'voice.wav',
         '-filter_complex_script',filters,'-map','[v]','-map','[a]',
         '-c:v','libx264','-preset','fast','-crf','18','-threads','4','-pix_fmt','yuv420p',
         '-profile:v','high','-level:v','4.1','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',
         '-c:a','aac','-ar','48000','-ac','2','-b:a','192k','-movflags','+faststart',folder/'video.mp4'])
    progress('完整成片解码与时长检查')
    run(['-i',folder/'video.mp4','-f','null','-'])
    report=dict(script_matches_submitted=True,all_normalized_characters_covered=True,
                captions=len(captions),word_boundaries=len(events),frames=total_frames,
                duration=seconds,width=width,height=height,fps=FPS,complete_decode='passed',
                source_images=len(used_assets),shots=len(shots),speech_speed=1,
                browser_playback='not_tested',ipad_playback='not_tested',
                footage_limit=f'{len(used_assets)} project photographs with camera motion, not continuous project footage.')
    (folder/'verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2))
    return dict(duration=seconds,file=f'{job_id}/video.mp4',image_method='original-project-photography-camera-motion',
        voice_method='Microsoft Edge TTS · zh-CN-XiaoxiaoNeural · natural rate',
        subtitles='Provider WordBoundary aligned, burned in with separate SRT; no duplicate embedded text track; within-word timing estimated',
        status='awaiting_review',plan=f'{job_id}/plan.json',media_sources=f'{job_id}/media-sources.json',
        shots=len(shots),resolution=f'{width}×{height}',source_images=len(used_assets),
        reference_status='Uses project originals; specific Douyin reference playback not verified')
