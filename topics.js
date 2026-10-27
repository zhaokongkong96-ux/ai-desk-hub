/* Public headline discovery + local creator workflow. No model or notification permission. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),categories=['社会观察','职场成长','科技生活','文化知识'],CACHE='ai-desk-hub-topics-feed-v1',SAVED='ai-desk-hub-topic-saved-v1';
  const questions={社会观察:'这件事的成本由谁承担，收益又归谁？',职场成长:'新变化会增加普通人的选择，还是抬高参与门槛？',科技生活:'它解决了什么真实问题，又把什么成本转给用户？',文化知识:'为什么这个话题今天被重新讨论？哪些背景被省略了？'};
  let feed=null,saved=[],filter='全部',busy=false,lastChecked=0,networkError=false;
  const day=value=>{try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}catch{return '';}};
  const stamp=value=>new Date(value).toLocaleString('zh-CN',{timeZone:'Asia/Shanghai',month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit',hour12:false});
  function safeURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:null;}catch{return null;}}
  function cleanItem(i){if(!i||typeof i.id!=='string'||!i.id||typeof i.title!=='string'||!i.title.trim()||!categories.includes(i.category)||!safeURL(i.url)||!Number.isFinite(Date.parse(i.publishedAt)))return null;return {id:i.id.slice(0,80),title:i.title.slice(0,240),url:safeURL(i.url),source:String(i.source||'来源未注明').slice(0,100),feed:String(i.feed||'').slice(0,100),category:i.category,publishedAt:i.publishedAt};}
  function cleanFeed(data){if(!data||data.schemaVersion!==1||!Array.isArray(data.items)||!Number.isFinite(Date.parse(data.generatedAt)))throw Error('invalid feed');return {...data,items:data.items.map(cleanItem).filter(Boolean),sources:Array.isArray(data.sources)?data.sources:[]};}
  try{const old=JSON.parse(localStorage.getItem(CACHE)||'null');if(old)feed=cleanFeed(old);}catch{}
  try{const old=JSON.parse(localStorage.getItem(SAVED)||'[]');if(Array.isArray(old))saved=old.map(cleanItem).filter(Boolean).slice(0,100);}catch{}
  function persistSaved(next){try{localStorage.setItem(SAVED,JSON.stringify(next));saved=next;return true;}catch{$('storageWarning').hidden=false;toast('选题保存失败，请释放浏览器空间后重试');return false;}}
  function visibleBase(){if($('topicsSavedOnly').checked)return saved;const items=(feed?.items||[]).filter(i=>day(i.publishedAt)===day(Date.now())&&Date.parse(i.publishedAt)<=Date.now()+300000),groups=categories.map(c=>items.filter(i=>i.category===c)),result=[];for(let index=0;index<Math.max(0,...groups.map(g=>g.length));index++)for(const group of groups)if(group[index])result.push(group[index]);return result;}
  function angle(item){
    for(const [pattern,prompt] of [
      [/人工智能|\bAI\b/i,'工具变强之后，谁获得时间，谁承担新的学习成本？'],
      [/科普|望远镜|行星|科学/,'这项进展改变了什么常识？把它讲给普通人还缺哪一步？'],
      [/就业|合同工|职场|招聘/,'不同就业方式怎样分配自由、稳定与风险？'],
      [/学校|教育|读书|阅读/,'获取知识越来越容易，理解与判断为什么仍然稀缺？'],
      [/安全|事故|规则/,'安全、便利与个人选择之间，怎样划出合理的边界？'],
      [/文化|博物馆|历史|传统/,'这件事为理解过去与当下，提供了什么新的角度？'],
      [/消费|价格|购买|销售/,'需求、价格与情绪分别怎样影响我们的消费判断？']
    ])if(pattern.test(item.title))return prompt;
    return questions[item.category];
  }
  function makeCard(item){
    const article=document.createElement('article');article.className='topic-card';article.dataset.category=item.category;
    article.innerHTML='<div class="topic-card-meta"><span class="topic-category"></span><span class="topic-source"></span><time></time></div><h3><a target="_blank" rel="noopener noreferrer"></a></h3><div class="topic-angle"><span>观点问题 · 供创作参考</span><p></p></div><details><summary>展开写作提纲</summary><ol></ol><button class="btn btn-light topic-task">加入写作待办</button></details><div class="topic-card-actions"><a class="btn btn-light" target="_blank" rel="noopener noreferrer">阅读报道 ↗</a><button class="btn btn-light topic-save"></button><button class="btn btn-light topic-note">记录观点</button></div>';
    article.querySelector('.topic-category').textContent=item.category;article.querySelector('.topic-source').textContent=item.source;
    const time=article.querySelector('time');time.dateTime=item.publishedAt;time.textContent=stamp(item.publishedAt);
    const title=article.querySelector('h3 a');title.textContent=item.title;title.href=item.url;article.querySelector('.topic-card-actions a').href=item.url;
    article.querySelector('.topic-angle p').textContent=angle(item);
    for(const text of ['事实：原报道能确认什么？还有哪些信息缺失？','解释：'+angle(item),'反例：什么证据会改变我的判断？','落点：它与读者的日常经验有什么联系？']){const li=document.createElement('li');li.textContent=text;article.querySelector('ol').append(li);}
    const save=article.querySelector('.topic-save'),isSaved=saved.some(i=>i.id===item.id);save.textContent=isSaved?'已存选题':'存为选题';save.setAttribute('aria-pressed',String(isSaved));save.setAttribute('aria-label',(isSaved?'取消收藏：':'收藏选题：')+item.title);
    save.addEventListener('click',()=>{if(!isSaved&&saved.length>=100){toast('选题库已满，请先移除部分选题');return;}const next=isSaved?saved.filter(i=>i.id!==item.id):[item,...saved];if(persistSaved(next)){render();toast(isSaved?'已移出选题库':'已存入本机选题库');}});
    article.querySelector('.topic-task').addEventListener('click',()=>{const ok=addTask('写作选题：'+item.title,'内容创作');toast(ok?'已加入工作台待办':'保存失败，待办仅在当前页面，请导出备份');});
    article.querySelector('.topic-note').addEventListener('click',()=>{$('captureType').value='灵感';$('captureInput').value=('关于「'+item.title+'」：').slice(0,200);$('captureInput').focus();toast('在底部写下你的观点，再点“快速记录”保存');});
    return article;
  }
  function render(){
    const base=visibleBase(),term=$('topicsSearch').value.trim().toLowerCase(),list=base.filter(i=>(filter==='全部'||i.category===filter)&&(!term||(i.title+' '+i.source).toLowerCase().includes(term)));
    $('topicsSavedCount').textContent=saved.length;$('topicsListCount').textContent=list.length+' 条';$('topicsListTitle').textContent=$('topicsSavedOnly').checked?'我的选题库':'当日关注';
    document.querySelectorAll('[data-topic-category]').forEach(b=>{b.setAttribute('aria-pressed',String(b.dataset.topicCategory===filter));b.querySelector('small').textContent=b.dataset.topicCategory==='全部'?base.length:base.filter(i=>i.category===b.dataset.topicCategory).length;});
    $('topicsGrid').replaceChildren();if(list.length)list.forEach(i=>$('topicsGrid').append(makeCard(i)));else{const empty=document.createElement('div');empty.className='topic-empty';empty.textContent=$('topicsSavedOnly').checked?'当前筛选下没有收藏。浏览话题后点击“存为选题”。':!feed?(busy?'正在获取新闻线索…':'尚未获取到新闻线索，请检查网络后点“检查更新”。'):'当前筛选下没有当日报道。可切换分类或检查更新；不会用旧闻补齐。';$('topicsGrid').append(empty);}
    const failures=feed?.sources?.filter(s=>!s.ok)||[],isOld=feed&&day(feed.generatedAt)!==day(Date.now());
    if(feed)$('topicsUpdated').dateTime=feed.generatedAt;
    $('topicsUpdated').textContent=feed?'采集于 '+stamp(feed.generatedAt)+'（北京时间）':'尚无采集记录';
    let status=feed?(feed.delivery==='local-live'?'前台每 30 分钟检查更新':'构建时快照 · 公网定时更新尚未启用'):'尚未获取到有效信息源';
    if(networkError||feed?.refreshError)status='更新失败，保留上次快照 · '+status;
    if(isOld)status='历史快照，非今日更新 · '+status;
    if(!navigator.onLine)status='离线浏览上次快照 · '+status;
    if(failures.length)status+=' · '+failures.length+' 个来源暂不可用';
    $('topicsStatus').textContent=status+'。按报道时间展示，属于媒体关注线索，不代表全网热搜排名。';$('topicsStatus').dataset.warning=String(!!(isOld||networkError||feed?.refreshError||failures.length||!navigator.onLine));
    $('topicsSourceList').replaceChildren();for(const s of feed?.sources||[]){const a=document.createElement('a');a.textContent=String(s.name||'信息源').slice(0,100)+(s.ok?'':' · 暂不可用');const url=safeURL(s.url);if(url){a.href=url;a.target='_blank';a.rel='noopener noreferrer';}$('topicsSourceList').append(a);}
  }
  async function refresh(){if(busy)return;busy=true;$('topicsRefresh').disabled=true;$('topicsRefresh').textContent='正在检查…';const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),17000);try{const response=await fetch('./topics-feed.json?v=0.7.1',{cache:'no-store',signal:controller.signal});if(!response.ok)throw Error('HTTP '+response.status);feed=cleanFeed(await response.json());networkError=response.headers.get('X-Desk-Cache')==='offline';lastChecked=Date.now();try{localStorage.setItem(CACHE,JSON.stringify(feed));}catch{}}catch{networkError=true;lastChecked=Date.now();}finally{clearTimeout(timer);busy=false;$('topicsRefresh').disabled=false;$('topicsRefresh').textContent='检查更新 ↻';render();}}
  document.querySelectorAll('[data-topic-category]').forEach(b=>b.addEventListener('click',()=>{filter=b.dataset.topicCategory;render();}));
  $('topicsSearch').addEventListener('input',render);$('topicsSavedOnly').addEventListener('change',render);$('topicsRefresh').addEventListener('click',refresh);
  function enter(){if($('page-topics').classList.contains('active')){render();if(Date.now()-lastChecked>30*60000)refresh();}}
  document.querySelector('[data-page=topics]').addEventListener('click',enter);document.addEventListener('visibilitychange',()=>{if(!document.hidden)enter();});window.addEventListener('online',enter);window.addEventListener('offline',render);
  setInterval(()=>{if(!document.hidden&&$('page-topics').classList.contains('active'))enter();},60000);render();
})();
