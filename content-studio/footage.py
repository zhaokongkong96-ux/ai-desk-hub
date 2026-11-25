"""Source-led visual selection. Sources and excerpts are persisted with each render."""
import hashlib
import ipaddress
import json
import socket
from pathlib import Path
from urllib.parse import urlparse
from bs4 import BeautifulSoup
from store import DATA
from workflow import client

LIBRARY=DATA/"footage-library"
RECIPES=[
 [("nasa-moon-earth.mp4",1,"NASA SVS · 科学可视化"),("nasa-moon-base.mp4",16,"NASA · 月球环境概念画面")],
 [("nasa-lunar-power.mp4",52,"NASA · 2014 年历史研发资料"),("nasa-moon-base.mp4",42,"NASA · 月球基地概念演示")],
 [("nasa-moon-base.mp4",5,"NASA · 相关发射资料"),("nasa-moon-base.mp4",32,"NASA · 探测任务概念演示")],
 [("nasa-moon-base.mp4",45,"NASA · 月球基地概念演示"),("nasa-moon-earth.mp4",22,"NASA SVS · 科学可视化")]
]
SOURCES={
 "nasa-moon-earth.mp4":{"page":"https://svs.gsfc.nasa.gov/5039/",
   "credit":"NASA Scientific Visualization Studio; Blue Marble: Reto Stockli (NASA/GSFC)",
   "kind":"scientific visualization","year":2022},
 "nasa-moon-base.mp4":{"page":"https://images.nasa.gov/details/Moon_Base_Trailer-4K",
   "credit":"NASA","kind":"related concept trailer","year":2026},
 "nasa-lunar-power.mp4":{"page":"https://science.nasa.gov/eclips/videos/lunar-power-plant/",
   "credit":"NASA eClips","kind":"historical research footage","year":2014}
}

def source_media(plan):
    url=(plan.get("sources") or [{}])[0].get("url")
    if not url:
        raise ValueError("缺少原始来源，无法选取素材")
    def validate(value):
        p=urlparse(value)
        if p.scheme!="https" or not p.hostname or p.username:
            raise ValueError("素材需为公开 HTTPS 地址")
        addresses=socket.getaddrinfo(p.hostname,443,type=socket.SOCK_STREAM)
        if any(not ipaddress.ip_address(a[4][0]).is_global for a in addresses):
            raise ValueError("素材地址不能指向私有网络")
    validate(url)
    with client() as http:
        response=http.get(url,follow_redirects=False)
        response.raise_for_status()
        soup=BeautifulSoup(response.content[:2_000_000],"html.parser")
        from urllib.parse import urljoin
        video_tag=soup.find("video",src=True) or soup.find("source",src=lambda value: value and ".mp4" in value)
        if video_tag:
            video_url=urljoin(url,video_tag["src"])
            validate(video_url)
            LIBRARY.mkdir(exist_ok=True)
            path=LIBRARY/(hashlib.sha256(video_url.encode()).hexdigest()[:24]+".mp4")
            temporary=path.with_suffix(".download")
            try:
                with http.stream("GET",video_url,follow_redirects=False) as video:
                    video.raise_for_status()
                    if not video.headers.get("content-type","").startswith("video/"):
                        raise ValueError("来源返回的内容并非视频")
                    size=0
                    with temporary.open("wb") as output:
                        for block in video.iter_bytes():
                            size+=len(block)
                            if size>200_000_000:
                                raise ValueError("原始视频过大，请手动挑选片段")
                            output.write(block)
                temporary.replace(path)
            finally:
                temporary.unlink(missing_ok=True)
            return dict(path=str(path),kind="video",start=0,label="原始来源视频",
                        source={"page":url,"asset":video_url,"credit":urlparse(url).hostname,"kind":"source video"})
        tag=soup.find("meta",property="og:image") or soup.find("meta",attrs={"name":"twitter:image"})
        if not tag or not tag.get("content"):
            raise ValueError("来源缺少可用图片，请先补充相关素材")
        from urllib.parse import urljoin
        image_url=urljoin(url,tag["content"])
        validate(image_url)
        image=http.get(image_url,follow_redirects=False)
        image.raise_for_status()
        if not image.headers.get("content-type","").startswith("image/") or len(image.content)>20_000_000:
            raise ValueError("来源图片格式或大小不适合制作")
        LIBRARY.mkdir(exist_ok=True)
        path=LIBRARY/(hashlib.sha256(image_url.encode()).hexdigest()[:24]+".jpg")
        from PIL import Image
        from io import BytesIO
        decoded=Image.open(BytesIO(image.content)).convert("RGB")
        if min(decoded.size)<400:
            raise ValueError("来源图片分辨率不足")
        decoded.save(path,quality=95)
        return dict(path=str(path),kind="image",label="原始来源图片",
                    source={"page":url,"asset":image_url,"credit":urlparse(url).hostname,"kind":"source image"})

def select(plan,index):
    sources=plan.get("sources") or []
    title=plan.get("title","").lower()
    # The curated lunar set is only used for this verified topic, never arbitrary news.
    lunar=any("nuclear-reactor-for-the-moon" in s.get("url","") for s in sources)
    if lunar:
        result=[]
        for name,start,label in RECIPES[index%len(RECIPES)]:
            path=LIBRARY/name
            if not path.is_file():
                raise ValueError("缺少审核过的素材 "+name)
            result.append(dict(path=str(path),kind="video",start=start,label=label,source=SOURCES[name],
                               crop="crop=1920:800:0:140," if name=="nasa-moon-base.mp4" else ""))
        return result
    return [source_media(plan)]
