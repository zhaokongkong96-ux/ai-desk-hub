/* Presentation wrappers preserve existing elements, IDs and attached listeners. */
(()=>{
 function group(page,selectors,label){
  if(!page)return;const nodes=selectors.map(s=>page.querySelector(s)).filter(Boolean);if(!nodes.length)return;
  const section=document.createElement('section');section.className='content-controls';section.setAttribute('aria-label',label);nodes[0].before(section);section.append(...nodes);
 }
 group(document.getElementById('page-topics'),['#topicsStatus','.topic-filters','.topics-toolbar'],'话题来源、分类与搜索');
 group(document.getElementById('page-radar'),['.radar-sourcebar','.search-row'],'项目来源、方向与筛选');
})();
