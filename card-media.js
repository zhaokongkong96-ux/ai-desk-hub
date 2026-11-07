/* One full-bleed cover contract for topics, momentum and project cards. */
(()=>{
 'use strict';
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function imageURL(value){try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password?u.href:'';}catch{return '';}}
 function githubPreview(value){try{const u=new URL(value),parts=u.pathname.split('/').filter(Boolean);if(u.protocol==='https:'&&u.hostname==='github.com'&&!u.username&&!u.password&&parts.length===2&&parts.every(p=>/^[\w.-]+$/.test(p)))return 'https://opengraph.githubassets.com/1/'+parts.join('/');}catch{}return '';}
 function markup({url='',title='',category='',source='',kind='topic',featured=false}={}){
  const repo=kind==='repo',src=imageURL(url),type=repo?'repo':'topic';
  // Inline event code is constant. User/feed strings enter only escaped text
  // or the validated URL attribute; failed images reveal the complete cover.
  return `<div class="card-media ${repo?'radar-image':'topic-image'}" data-kind="${type}" data-state="${src?'loading':'empty'}">
   <div class="card-media-fallback${repo?' radar-image-fallback':''}"><small>${esc(source||(repo?'GitHub':'今日关注'))}</small><strong>${esc(repo?title:category||'今日关注')}</strong><span>${repo?'项目封面':'分类封面 · 非报道配图'}</span></div>
   ${src?`<img src="${esc(src)}" alt="${esc(title)}${repo?'的仓库预览':'的报道配图'}" width="1200" height="675" loading="${featured?'eager':'lazy'}" decoding="async" referrerpolicy="no-referrer" onload="this.parentElement.dataset.state='ready'" onerror="this.hidden=true;this.parentElement.dataset.state='unavailable'">`:''}
   ${category?`<span class="card-media-tag${repo?' project-category':''}">${esc(category)}</span>`:''}
   <span class="card-media-caption${repo?' radar-image-caption':''}"><span class="media-real-label">${repo?'仓库预览':'报道配图'}</span><span class="media-fallback-label">${repo?'项目封面':'分类封面'}</span></span>
  </div>`;
 }
 window.DeskCardMedia={imageURL,githubPreview,markup};
})();
