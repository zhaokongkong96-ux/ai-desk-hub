"""Short extractive editorial recut: locked photos and attributed source footage."""
from pathlib import Path
import concurrent.futures
import hashlib
import json
import math
import shutil
import wave
from PIL import Image,ImageOps,ImageChops,ImageStat
from store import DATA
from casefilm import run,align,write_captions,ass_time

W,H,FPS=1920,1080,30


def shot(folder,s,assets):
    a=assets[s['asset_id']];p=folder/f"shot-{s['index']:03}.mp4"
    frames=s['frames']
    if a['kind']=='video':
        args=['-ss',str(s['source_start']),'-i',a['path']]
        vf='scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30,scale=out_range=tv,format=yuv420p'
    else:
        # One immutable composition per shot, no zoompan or animated transform.
        still=folder/f"still-{s['index']:03}.jpg"
        with Image.open(a['path']) as im:
            ImageOps.fit(im.convert('RGB'),(W,H),Image.Resampling.LANCZOS,centering=(.5,.5)).save(still,quality=97)
        args=['-loop','1','-framerate','30','-i',str(still)]
        vf='scale=in_range=pc:out_range=tv,format=yuv420p,setsar=1'
    run([*args,'-an','-vf',vf,'-frames:v',frames,'-c:v','libx264','-preset','fast','-crf','18',
         '-threads','2','-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',p])
    return dict(s,path=str(p),source=a['page'],source_asset=a.get('url'),credit=a['credit'],
                kind=a['kind'],source_sha256=a['sha256'],extra_camera_motion=False,speed=1,label=a.get('label',''))


def refine_cues(cues):
    # Keep names and short continuations intact instead of flashing word fragments.
    result=[]
    for c in cues:
        c=dict(c)
        if result and (c['text'].startswith('Architects ') or c['text'] in {'的雕塑','义的事物'}):
            result[-1]['text']+=(' ' if c['text'].startswith('Architects ') else '')+c['text']
            result[-1]['end']=c['end']
        else:result.append(c)
    return result


def produce(job_id,plan,category,progress):
    if plan.get('production_recipe')!='doha-reportage-2026':raise ValueError('未审核的素材配方')
    source=DATA/'a2-recut-assets';folder=DATA/job_id;folder.mkdir(exist_ok=False)
    if (source/'spoken.txt').read_text()!='\n\n'.join(x['narration'] for x in plan['script']):
        raise ValueError('剪辑文本与确认快照不一致')
    for n in ['spoken.txt','voice.wav','voice-timing.json','voice-provenance.json','audio-edit-ledger.json']:
        shutil.copy2(source/n,folder/n)
    with wave.open(str(folder/'voice.wav')) as w:duration=w.getnframes()/w.getframerate()
    total=math.ceil(duration*FPS);duration=total/FPS
    cues,beats=align(plan,json.loads((folder/'voice-timing.json').read_text()))
    if len(beats)!=len(plan['edit_shots']):raise ValueError('镜头与口播段落不一致')
    cues=refine_cues(cues)
    write_captions(folder,cues,duration,W,H)
    # Exactly one provenance line per shot; no overlapping opening/closing credits.
    ass=folder/'captions.ass'
    ass.write_text('\n'.join(line for line in ass.read_text().splitlines() if not line.startswith('Dialogue: 0,'))+'\n')
    assets={x['id']:x for x in plan['production_assets']}
    used={x['asset_id'] for group in plan['edit_shots'] for x in group}
    if plan.get('subject_policy')=='doha-pavilion-only':
        if any(assets[aid].get('subject_id')!='doha-richter-pavilion' for aid in used):
            raise ValueError('本片只允许多哈展馆本体素材，禁止相关场馆替代')
    for aid in used:
        if hashlib.sha256(Path(assets[aid]['path']).read_bytes()).hexdigest()!=assets[aid]['sha256']:
            raise ValueError('素材已变化')
    progress('原片精剪与固定构图')
    shots=[];cursor=0
    for i,group in enumerate(plan['edit_shots']):
        end=round(beats[i+1]['start']*FPS) if i+1<len(beats) else total
        weights=sum(s['weight'] for s in group);available=end-cursor
        for k,x in enumerate(group):
            n=(end-cursor) if k==len(group)-1 else round(available*x['weight']/weights)
            a=assets[x['asset_id']];source_start=x.get('source_start',0)
            if a['kind']=='video' and source_start+n/FPS>a['duration']-.05:
                raise ValueError('原片长度不足，禁止循环补足')
            shots.append(dict(index=len(shots),scene=i+1,asset_id=x['asset_id'],source_start=source_start,
                              frames=n,start=cursor/FPS,end=(cursor+n)/FPS));cursor+=n
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as p:
        shots=list(p.map(lambda s:shot(folder,s,assets),shots))
    labels=[]
    for s in shots:
        label=s['label'] or '多哈展馆｜Photo Iwan Baan / Qatar Museums'
        labels.append(f"Dialogue: 0,{ass_time(s['start'])},{ass_time(s['end'])},Credit,,0,0,0,,{label}")
    # Related venue labels stay visible to avoid passing them off as Doha footage.
    with ass.open('a') as f:f.write('\n'+'\n'.join(labels)+'\n')
    concat=folder/'concat.txt';concat.write_text('\n'.join("file '"+s['path'].replace("'","'\\''")+"'" for s in shots))
    run(['-f','concat','-safe','0','-i',concat,'-c','copy',folder/'picture.mp4'])
    (folder/'plan.json').write_text(json.dumps(plan,ensure_ascii=False,indent=2))
    (folder/'timeline.json').write_text(json.dumps(dict(shots=shots,beats=beats,width=W,height=H,fps=FPS,frames=total),ensure_ascii=False,indent=2))
    (folder/'media-sources.json').write_text(json.dumps(shots,ensure_ascii=False,indent=2))
    progress('字幕与配音合成 · 无额外推拉')
    filters=folder/'finish.filter';escaped=str(ass).replace(':','\\:').replace("'","'\\''")
    filters.write_text("[0:v]subtitles=filename='"+escaped+"'[v];[1:a]apad,atrim=duration="+str(duration)+",loudnorm=I=-16:TP=-1.5:LRA=9[a]")
    run(['-i',folder/'picture.mp4','-i',folder/'voice.wav','-filter_complex_script',filters,
         '-map','[v]','-map','[a]','-c:v','libx264','-preset','fast','-crf','18','-threads','4',
         '-pix_fmt','yuv420p','-color_range','tv','-colorspace','bt709','-color_primaries','bt709','-color_trc','bt709',
         '-profile:v','high','-level:v','4.1','-c:a','aac','-ar','48000','-ac','2','-b:a','192k','-movflags','+faststart',folder/'video.mp4'])
    progress('全片解码与固定镜头校验')
    run(['-i',folder/'video.mp4','-f','null','-'])
    static=[]
    for s in shots:
        if s['kind']=='image':
            selected=f"select='eq(n,0)+eq(n,{s['frames']//2})+eq(n,{s['frames']-1})'"
            pattern=folder/f"static-{s['index']:03}-%02d.png"
            run(['-i',s['path'],'-vf',selected+',scale=320:180','-fps_mode','passthrough','-frames:v','3',pattern])
            paths=sorted(folder.glob(f"static-{s['index']:03}-*.png"))
            if len(paths)!=3:raise ValueError('固定镜头采样不足')
            baseline=Image.open(paths[0]).convert('RGB')
            deltas=[sum(ImageStat.Stat(ImageChops.difference(baseline,Image.open(p).convert('RGB'))).mean)/3 for p in paths[1:]]
            if max(deltas)>1.2:raise ValueError('固定照片镜头存在意外运动')
            static.append(dict(shot=s['index'],max_mean_pixel_difference=max(deltas),codec_noise_tolerance=1.2))
    video_frames=sum(s['frames'] for s in shots if s['kind']=='video')
    verification=dict(duration=duration,old_duration=192.4667,width=W,height=H,fps=FPS,frames=total,
        captions=len(cues),shots=len(shots),video_seconds=video_frames/FPS,video_ratio=video_frames/total,
        extra_camera_motion=False,static_shots_verified=static,speech_speed=1,
        script_method='extractive abridgment authorized by user; no newly synthesized speech',
        transcript_coverage='passed',complete_decode='passed',embedded_subtitle_track=False,
        browser_playback='not_tested',ipad_playback='not_tested',source_footage_labels='present on every related-venue clip')
    (folder/'verification.json').write_text(json.dumps(verification,ensure_ascii=False,indent=2))
    return dict(duration=duration,file=f'{job_id}/video.mp4',image_method=('project photographs + attributed original related video' if video_frames else 'verified Doha Pavilion photographs; locked composition'),
        voice_method='original approved voice extractively edited at 1x; no new synthesis',subtitles='burned-in single layer plus separate SRT',
        status='awaiting_review',plan=f'{job_id}/plan.json',media_sources=f'{job_id}/media-sources.json',shots=len(shots),
        resolution=f'{W}×{H}',video_ratio=round(video_frames/total,3),extra_camera_motion=False,
        reference_status='Follows footage-led pacing requirement; exact Douyin reference playback unverified')
