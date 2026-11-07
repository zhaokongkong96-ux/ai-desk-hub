const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const context={window:{},URL};vm.runInNewContext(fs.readFileSync('card-media.js','utf8'),context);const M=context.window.DeskCardMedia;
test('card media accepts HTTPS only and never interpolates markup from a headline',()=>{
 for(const value of ['javascript:alert(1)','data:image/svg+xml,test','//example.com/i.jpg','http://example.com/i.jpg','https://name:password@example.com/i.jpg'])assert.equal(M.imageURL(value),'');
 const html=M.markup({url:'https://example.com/p.jpg?a=1&b=2',title:'<script>alert(1)</script>',category:'科技生活'});
 assert.ok(!html.includes('<script>'));assert.match(html,/&lt;script&gt;/);assert.match(html,/referrerpolicy="no-referrer"/);assert.match(html,/loading="lazy"/);assert.match(html,/width="1200" height="675"/);
});
test('repository images are bound to the original repository, never a generic unrelated image',()=>{
 assert.equal(M.githubPreview('https://github.com/example/project'),'https://opengraph.githubassets.com/1/example/project');
 for(const value of ['https://example.com/a/b','https://github.com/a/b/tree/main','https://github.com/a','https://user:pass@github.com/a/b'])assert.equal(M.githubPreview(value),'');
});
test('missing, loading and broken images retain the complete labelled cover',()=>{
 const missing=M.markup({category:'文化知识'});assert.match(missing,/data-state="empty"/);assert.ok(!missing.includes('<img '));assert.match(missing,/非报道配图/);
 const html=M.markup({url:'https://example.com/image.jpg',title:'新闻'}),image={hidden:false,parentElement:{dataset:{state:'loading'}}};
 const load=html.match(/onload="([^"]+)"/)[1],error=html.match(/onerror="([^"]+)"/)[1];
 new Function(load).call(image);assert.equal(image.parentElement.dataset.state,'ready');new Function(error).call(image);assert.ok(image.hidden);assert.equal(image.parentElement.dataset.state,'unavailable');assert.match(html,/card-media-fallback/);
});
test('real project rendering retains title, detail and action controls around one shared image region',()=>{
 const html=fs.readFileSync('index.html','utf8'),start=html.indexOf('function projectCard('),end=html.indexOf('\nfunction renderProjects()',start);
 const ctx={window:{DeskCardMedia:M},radarSaved:new Set(),repoPreview:M.githubPreview,safeRepoUrl:x=>x,esc:x=>String(x),formatDate:x=>x};vm.createContext(ctx);vm.runInContext(html.slice(start,end),ctx);
 const card=ctx.projectCard({id:'test',name:'测试项目',url:'https://github.com/example/project',category:'端侧 AI',summary:'测试简介'});
 assert.equal((card.match(/class="card-media /g)||[]).length,1);assert.match(card,/class="radar-card-body"/);assert.match(card,/测试简介/);assert.match(card,/data-save-project="test"/);assert.match(card,/data-add-project="test"/);assert.match(card,/查看原文/);
});
test('one 16:9 cover contract is loaded before all three renderers and is available offline',()=>{
 const html=fs.readFileSync('index.html','utf8'),css=fs.readFileSync('rondesign-content.css','utf8'),sw=fs.readFileSync('sw.js','utf8');
 assert.ok(html.indexOf('src="./card-media.js')<html.indexOf('function projectCard('));assert.match(sw,/'\.\/card-media\.js'/);
 assert.match(css,/#page-topics \.card-media,#page-radar \.card-media\{[^}]*aspect-ratio:16\/9/);
 assert.match(css,/#page-topics \.card-media>img,#page-radar \.card-media>img\{[^}]*position:absolute[^}]*object-fit:cover[^}]*object-position:50% 50%/);
 assert.ok(!css.includes('object-fit:contain'));
});
