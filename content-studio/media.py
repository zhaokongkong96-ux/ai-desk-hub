import asyncio
import json
import os
import subprocess
import wave
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg
from store import DATA, ROOT
from workflow import client

FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()
FONT = os.environ.get("STUDIO_FONT", "/System/Library/Fonts/STHeiti Light.ttc")

def run(args, timeout=240):
    subprocess.run(args, check=True, capture_output=True, timeout=timeout)

def wrap(value, font, width, draw):
    lines, line = [], ""
    for char in value:
        if char == "\n" or draw.textlength(line+char,font=font)>width:
            lines.append(line)
            line = "" if char=="\n" else char
        else:
            line += char
    return lines+[line]

def image(scene, path, category):
    # Editable local editorial graphic. Clearly identified, not a photo or AI output.
    canvas = Image.new("RGB",(1280,720),(225,235,231))
    draw = ImageDraw.Draw(canvas)
    accent = {"A":(68,105,100),"B":(152,112,74),"C":(83,91,130)}[category]
    draw.rounded_rectangle((45,45,1235,675),radius=42,fill=(246,248,240))
    draw.ellipse((1130,575,1200,645),outline=accent,width=3)
    small = ImageFont.truetype(FONT,22)
    heading = ImageFont.truetype(FONT,44)
    body = ImageFont.truetype(FONT,28)
    draw.text((85,80),"AI CONTENT STUDIO · 来源解读草稿",font=small,fill=accent)
    draw.text((85,155),scene["title"],font=heading,fill=(25,49,43))
    content = scene["narration"]
    # Long excerpts remain in the script and subtitles, never overflow the visual.
    lines = wrap(content,body,1030,draw)
    if len(lines)>7:
        lines=lines[:7]
        lines[-1]=lines[-1][:-2]+"…"
    for index,line in enumerate(lines):
        draw.text((85,250+index*43),line,font=body,fill=(45,65,59))
    draw.text((85,625),"本机规则图形 · 事实与观点待人工审核",font=small,fill=accent)
    canvas.save(path)

def speech(value, path):
    provider = os.environ.get("STUDIO_VOICE","macos")
    if provider == "edge":
        import edge_tts
        mp3 = path.with_suffix(".mp3")
        asyncio.run(edge_tts.Communicate(value,"zh-CN-XiaoxiaoNeural").save(str(mp3)))
        run([FFMPEG,"-y","-i",str(mp3),"-ar","24000","-ac","1",str(path)])
    elif provider == "macos":
        aiff = path.with_suffix(".aiff")
        run(["/usr/bin/say","-v","Tingting","-r","205","-o",str(aiff),value])
        run([FFMPEG,"-y","-i",str(aiff),"-ar","24000","-ac","1",str(path)])
    else:
        raise ValueError("配音服务需选 macos 或 edge")
    with wave.open(str(path)) as wav:
        return wav.getnframes()/wav.getframerate()

def generated_image(scene, path, category):
    if os.environ.get("STUDIO_IMAGE_PROVIDER","local") == "local":
        image(scene,path,category)
        return "local-editorial-graphic"
    # Optional paid route stays off until explicitly enabled in the local environment.
    if os.environ.get("STUDIO_ALLOW_PAID") != "true":
        raise ValueError("图片 API 未启用，免费模式请使用 local")
    import base64
    endpoint = os.environ["STUDIO_IMAGE_BASE"].rstrip("/")+"/images/generations"
    with client() as http:
        response = http.post(endpoint,headers={"Authorization":"Bearer "+os.environ["STUDIO_IMAGE_KEY"]},
          json={"model":os.environ["STUDIO_IMAGE_MODEL"],"prompt":scene["image_prompt"],
                "n":1,"size":"1024x1024","response_format":"b64_json"},timeout=120)
        response.raise_for_status()
        path.write_bytes(base64.b64decode(response.json()["data"][0]["b64_json"]))
    return "configured-image-api"

def srt_time(seconds):
    milliseconds=round(seconds*1000)
    hours,remainder=divmod(milliseconds,3600000)
    minutes,remainder=divmod(remainder,60000)
    seconds,milliseconds=divmod(remainder,1000)
    return f"{hours:02}:{minutes:02}:{seconds:02},{milliseconds:03}"

def produce(job_id, plan, category, progress):
    if plan.get("production_recipe") == "doha-reportage-2026":
        from reportage import produce as produce_reportage
        return produce_reportage(job_id, plan, category, progress)
    if plan.get("production_recipe") in {"va-tree-2026", "doha-richter-2026"}:
        from casefilm import produce as produce_casefilm
        return produce_casefilm(job_id, plan, category, progress)
    import re
    from footage import select
    folder = DATA / job_id
    folder.mkdir()
    scenes, captions, ledger, cursor = [], [], [], 0.0
    keywords = [("14 天", "月球上的漫长黑夜"), ("20 千瓦", "LR-1 规划供电能力"),
                ("2030 年", "发射就绪目标"), ("", "")]
    for index, scene in enumerate(plan["storyboard"]):
        progress("素材选取与配音 "+str(index+1))
        audio=folder/f"scene-{index}.wav"
        speech_seconds=speech(scene["narration"],audio)
        frames=max(30,round((speech_seconds+0.35)*30))
        selected=select(plan,index)
        shots=[]
        # Each shot lasts at most about four seconds, with sources kept visible.
        shot_count=max(len(selected),int(frames/30/4+0.5))
        consumed=0
        for j in range(shot_count):
            asset=selected[j%len(selected)]
            shot_frames=(frames-consumed)//(shot_count-j)
            consumed+=shot_frames
            clip=folder/f"clip-{index}-{j}.mp4"
            duration=shot_frames/30
            if asset["kind"]=="video":
                command=[FFMPEG,"-y","-ss",str(asset["start"]+(j//len(selected))*2),"-i",asset["path"]]
            else:
                command=[FFMPEG,"-y","-loop","1","-i",asset["path"]]
            run(command+["-t",str(duration),"-an","-vf",
                asset.get("crop","")+"scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,setsar=1,fps=30",
                "-c:v","libx264","-preset","fast","-crf","19","-pix_fmt","yuv420p",str(clip)])
            shots.append(dict(video=str(clip),frames=shot_frames,label=asset["label"]))
            ledger.append(dict(scene=index+1,shot=j+1,source=asset["source"],
                               source_start=asset.get("start",0)+(j//len(selected))*2,
                               seconds=duration,sha256=__import__("hashlib").sha256(Path(asset["path"]).read_bytes()).hexdigest()))
        phrases=[v.strip() for v in re.split(r"[，。？！；：,!?;]+",scene["narration"]) if v.strip()]
        chunks=[v[k:k+20] for v in phrases for k in range(0,len(v),20)]
        total=sum(len(v) for v in chunks)
        spoken=0
        scene_captions=[]
        for chunk in chunks:
            begin=speech_seconds*spoken/total
            spoken+=len(chunk)
            end=speech_seconds*spoken/total
            scene_captions.append(dict(text=chunk,start=round(begin*30),end=round(end*30)))
            captions.append(f"{len(captions)+1}\n{srt_time(cursor+begin)} --> {srt_time(cursor+end)}\n{chunk}\n")
        key,subtitle=keywords[index%len(keywords)] if "nuclear-reactor-for-the-moon" in str(plan.get("sources",[])) else ("",scene["title"])
        if index == len(plan["storyboard"]) - 1:
            key = ""
        scenes.append(dict(shots=shots,audio=str(audio),frames=frames,captions=scene_captions,
                           keyword=key,heading=subtitle))
        cursor+=frames/30
    (folder/"captions.srt").write_text("\n".join(captions),encoding="utf-8")
    props={"scenes":scenes,"totalFrames":sum(s["frames"] for s in scenes)}
    (folder/"props.json").write_text(json.dumps(props,ensure_ascii=False))
    (folder/"plan.json").write_text(json.dumps(plan,ensure_ascii=False,indent=2))
    (folder/"media-sources.json").write_text(json.dumps(ledger,ensure_ascii=False,indent=2))
    progress("1080p 全屏素材剪辑")
    run(["node",str(ROOT/"render/render.mjs"),str(folder/"props.json"),str(folder/"silent.mp4")],timeout=1200)
    progress("配音响度与字幕合成")
    inputs=[]
    for scene in scenes:
        inputs.extend(["-i",scene["audio"]])
    filters=[]
    for i,scene in enumerate(scenes):
        filters.append(f"[{i}:a]apad,atrim=duration={scene['frames']/30},asetpts=PTS-STARTPTS[a{i}]")
    filters.append("".join(f"[a{i}]" for i in range(len(scenes)))+
                   f"concat=n={len(scenes)}:v=0:a=1,loudnorm=I=-16:TP=-1.5:LRA=9[out]")
    run([FFMPEG,"-y",*inputs,"-filter_complex",";".join(filters),"-map","[out]",str(folder/"narration.wav")])
    run([FFMPEG,"-y","-i",str(folder/"silent.mp4"),"-i",str(folder/"narration.wav"),
         "-i",str(folder/"captions.srt"),"-map","0:v","-map","1:a","-map","2",
         "-c:v","libx264","-preset","medium","-crf","18","-pix_fmt","yuv420p",
         "-vf","scale=out_range=tv","-color_range","tv","-colorspace","bt709",
         "-color_primaries","bt709","-color_trc","bt709","-profile:v","high","-level:v","4.1",
         "-c:a","aac","-ar","48000","-ac","2","-b:a","192k","-c:s","mov_text","-metadata:s:s:0","language=zho",
         "-movflags","+faststart",str(folder/"video.mp4")])
    progress("完整视频解码验证")
    run([FFMPEG,"-v","error","-i",str(folder/"video.mp4"),"-f","null","-"])
    return {"duration":cursor,"file":f"{job_id}/video.mp4","image_method":"source-led-fullscreen-footage",
            "voice_method":os.environ.get("STUDIO_VOICE","macos"),
            "subtitles":"burned-in phrase captions plus selectable track; timing approximate",
            "status":"awaiting_review","plan":f"{job_id}/plan.json",
            "media_sources":f"{job_id}/media-sources.json","shots":len(ledger),
            "resolution":"1920x1080","reference_status":"specific Douyin video blocked by platform cookie requirement"}
