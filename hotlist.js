/* Daily momentum snapshot, with explicit age and collection failures. */
(() => {
  'use strict';
  const status=document.getElementById('hotlistStatus'),grid=document.getElementById('hotlistGrid'),button=document.getElementById('hotlistRefresh');
  const KEY='ai-desk-hub-hotlist-v1';let feed=null,busy=false,failed=false,last=0;
  const day=v=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(v));
  const stamp=v=>new Date(v).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});
  const validURL=v=>{try{const u=new URL(v);return u.protocol==='https:'&&u.hostname==='github.com'&&!u.username&&!u.password?u.href:null;}catch{return null;}};
  function clean(data){if(data?.schemaVersion!==1||!Array.isArray(data.items)||(data.generatedAt&&!Number.isFinite(Date.parse(data.generatedAt))))throw Error('Invalid snapshot');return {...data,items:data.items.filter(p=>p&&validURL(p.url)&&typeof p.name==='string'&&['今日新上榜','持续热门','重大更新'].includes(p.label))};}
  function node(tag,text,parent){const n=document.createElement(tag);n.textContent=text;parent.append(n);return n;}
  function link(text,url,parent){if(!validURL(url))return;const a=node('a',text,parent);a.href=url;a.target='_blank';a.rel='noopener noreferrer';}
  function render(){
    const old=feed?.generatedAt&&day(feed.generatedAt)!==day(Date.now()),error=failed||feed?.refreshError||!navigator.onLine;
    status.textContent=(error?'采集失败 / 网络不可用，保留原快照。':'')+(old?'历史快照，非今日热点。':'')+(feed?.generatedAt?'采集于 '+stamp(feed.generatedAt)+'（北京时间）。':'尚无成功采集记录。')+(feed?.attemptedAt&&feed?.refreshError?'最近尝试 '+stamp(feed.attemptedAt)+'。':'')+(feed?.partial?'部分来源采集失败，数据不完整。':'')+'计划每日 08:17 采集，可能延迟；检查更新只读取已发布数据。';
    status.dataset.warning=String(!!(old||error||feed?.partial));grid.replaceChildren();
    if(!feed?.items.length)node('p',busy?'正在读取热榜…':'暂无可验证的热榜项目；不会用累计 Star 高的旧项目补齐。',grid);
    for(const p of feed?.items||[]){
      const card=node('article','',grid);card.className='hotlist-card';node('span',(old||error?'上次标注：':'')+p.label,card).className='meta-chip';
      const title=node('h3','',card);link(p.name,p.url,title);node('p',p.description,card);
      const evidence=node('div','',card);evidence.className='hotlist-evidence';
      if(p.growth)link(p.growth.source+'：+'+p.growth.count+' Star / '+p.growth.hours+' 小时',p.growth.url,evidence);else node('span','Star 增长：基线积累中，未推算',evidence);
      if(Number.isFinite(p.activeThreads))link('近 7 天更新且有评论的 Issue / PR：'+p.activeThreads+' 个',p.discussionURL,evidence);else node('span','讨论数据：采集不可用',evidence);
      if(p.label==='重大更新'&&p.release)link('主版本发布：'+p.release.tag,p.release.url,evidence);
      node('small','近 7 天已展示 '+p.shownDays7+' 天 · 累计 '+p.stars+' Star（不参与排名）',card);link('原仓库 ↗',p.url,card);
    }
  }
  async function refresh(){if(busy)return;busy=true;button.disabled=true;render();const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);try{const r=await fetch('./hotlist-feed.json?v=0.11.1',{cache:'no-store',signal:controller.signal});if(!r.ok)throw Error();feed=clean(await r.json());failed=r.headers.get('X-Desk-Cache')==='offline';try{localStorage.setItem(KEY,JSON.stringify(feed));}catch{}}catch{failed=true;}finally{busy=false;last=Date.now();clearTimeout(timer);button.disabled=false;render();}}
  try{const cached=JSON.parse(localStorage.getItem(KEY)||'null');if(cached)feed=clean(cached);}catch{}
  button.addEventListener('click',refresh);document.querySelector('[data-page=radar]').addEventListener('click',()=>{render();if(Date.now()-last>30*60000)refresh();});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();if(document.getElementById('page-radar').classList.contains('active'))refresh();}});
  window.addEventListener('online',refresh);window.addEventListener('offline',render);
  setInterval(()=>{if(!document.hidden&&document.getElementById('page-radar').classList.contains('active')){render();if(Date.now()-last>30*60000)refresh();}},60000);refresh();
})();
