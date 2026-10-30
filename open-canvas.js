/* Presentation only: all calendar, media, storage and integration logic stays intact. */
(()=>{
 const icon=name=>{const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.classList.add('desk-icon');svg.setAttribute('aria-hidden','true');svg.setAttribute('viewBox','0 0 16 16');const use=document.createElementNS(svg.namespaceURI,'use');use.setAttribute('href','./vendor/desk-icons.svg#'+name);svg.append(use);return svg;};
 const settings=document.getElementById('deskSettings');
 const tools=document.createElement('div');tools.className='desk-connection-tools';
 for(const node of [document.getElementById('calendarConnectionStatus')?.closest('.status-pill'),document.getElementById('attentionHealth'),document.getElementById('exportBtn'),document.getElementById('appVersion')])if(node)tools.append(node);
 settings?.querySelector('.dialog-head')?.after(tools);
 const ambient=document.getElementById('openAmbient');ambient?.prepend(icon('display'));
 const gear=document.getElementById('openDeskSettings');if(gear)gear.replaceChildren(icon('gear'));
 const art=document.querySelector('.media-art');if(art)art.replaceChildren(icon('music-note-beamed'));
 const plus=document.querySelector('.capture-icon');if(plus)plus.replaceChildren(icon('plus-lg'));
 const save=document.getElementById('captureSave');if(save){save.setAttribute('aria-label','保存快速记录');save.title='保存快速记录';save.replaceChildren(icon('arrow-up'));}
 const notes=document.getElementById('noteList');
 const noteIcons=()=>notes?.querySelectorAll('.note-kind').forEach(node=>{if(node.querySelector('svg'))return;node.title=node.textContent;node.setAttribute('aria-label',node.textContent);node.replaceChildren(icon('file-earmark-text'));});
 if(notes)new MutationObserver(noteIcons).observe(notes,{childList:true});noteIcons();
 const weather=document.getElementById('weatherChip');const weatherIcon=()=>{if(weather&&!weather.querySelector('svg'))weather.prepend(icon('geo-alt-fill'));};if(weather)new MutationObserver(weatherIcon).observe(weather,{childList:true});weatherIcon();
 document.querySelector('.calendar-panel .panel-title').textContent='今日日程';
 const update=()=>{const active=document.querySelector('main.page.active');document.body.dataset.view=active?.id.replace('page-','')||'today';};
 document.querySelectorAll('main.page').forEach(page=>new MutationObserver(update).observe(page,{attributes:true,attributeFilter:['class']}));update();
})();
