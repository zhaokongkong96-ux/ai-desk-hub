/* Own HTML audio can expose state; native apps and cross-origin players cannot. */
(() => {
 const $=id=>document.getElementById(id),audio=$('deskAudio'),frame=$('neteaseFrame');let lyrics=[],generation=0;
 $('deskEmbed').append(frame);$('deskAudioMount').append(audio);
 function local(){return !!audio.getAttribute('src')&&!frame.getAttribute('src');}
 function controls(){const enabled=local();document.querySelector('.media-card').classList.toggle('has-embed',!!frame.getAttribute('src'));document.querySelector('.media-card').classList.toggle('has-local',enabled);$('deskAudioControls').hidden=!enabled;for(const [a,b]of [['deskPrevious','previousAudio'],['deskNext','nextAudio']])$(a).disabled=!enabled||$(b).disabled;}
 function closeSetup(){if($('mediaDialog').open)$('mediaDialog').close();}
 $('deskChooseAudio').onclick=()=>$('audioFiles').click();$('deskPrevious').onclick=()=>$('previousAudio').click();$('deskNext').onclick=()=>$('nextAudio').click();
 $('audioFiles').addEventListener('change',()=>{if(local()){lyrics=[];$('deskLyric').textContent='可导入与当前歌曲同名的 LRC 歌词';controls();closeSetup();}});
 $('neteaseForm').addEventListener('submit',()=>{if(frame.getAttribute('src')){controls();closeSetup();$('mediaStatus').textContent='官方网页播放器已载入 · 请在本卡片内播放；无法读取原生 App 状态或承诺歌词显示。';}});
 $('unloadNetease').addEventListener('click',controls);$('openNeteaseApp').addEventListener('click',()=>{lyrics=[];controls();});
 for(const event of ['play','pause','loadedmetadata','emptied'])audio.addEventListener(event,()=>{if(event==='emptied'){generation++;lyrics=[];$('deskLyricsFile').value='';$('deskLyric').textContent='当前歌曲尚未导入歌词';}controls();});
 audio.addEventListener('timeupdate',()=>{let current=null;for(const line of lyrics){if(line.at>audio.currentTime)break;current=line;}const text=current?.text||'♪';if(lyrics.length&&$('deskLyric').textContent!==text)$('deskLyric').textContent=text;});
 $('deskLyricsFile').onchange=async event=>{const file=event.target.files[0];if(!file)return;const stamp=generation,src=audio.src;if(file.size>512000){$('deskLyric').textContent='歌词文件过大，请使用 500 KB 以内的 LRC 文件';return;}const text=await file.text();if(stamp!==generation||src!==audio.src)return;lyrics=[];for(const row of text.split(/\r?\n/)){const content=row.replace(/\[[^\]]*\]/g,'').trim();for(const m of row.matchAll(/\[(\d{1,3}):(\d{2})(?:\.(\d{1,3}))?\]/g))lyrics.push({at:Number(m[1])*60+Number(m[2])+Number('0.'+(m[3]||'0')),text:content});}lyrics.sort((a,b)=>a.at-b.at);$('deskLyric').textContent=lyrics.length?'歌词已导入，随播放时间显示':text.slice(0,1000)||'歌词文件为空';};
 new MutationObserver(controls).observe(frame,{attributes:true,attributeFilter:['src']});controls();
})();
