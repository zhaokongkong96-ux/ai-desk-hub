const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const C=require('../workday-core'),S=require('../sync-core');
const draft={decision:'先核实研究证据，再进入方案评审',nextAction:'整理评审问题',source:'测试评审纪要',linksText:'研究计划 | https://example.com/plan\n评审材料 | /Users/test/评审材料.pdf'};
test('project context keeps its timestamp on unchanged save and changes only on confirmed edits',()=>{
 const r=C.projectResume(draft,null,'2026-11-06T08:00:00Z');assert.equal(r.updatedAt,'2026-11-06T08:00:00.000Z');
 assert.deepEqual(C.projectResume(draft,r,'2026-11-07T08:00:00Z'),r);
 assert.equal(C.projectResume({...draft,nextAction:'检查图表'},r,'2026-11-07T08:00:00Z').updatedAt,'2026-11-07T08:00:00.000Z');
 assert.equal(C.projectLinks('https://example.com/plan')[0].label,'example.com');
});
test('continuation entries reject executable schemes, relative URLs, credentials and oversized data',()=>{
 for(const target of ['javascript:alert(1)','data:text/html,test','file:///Users/test/file','//example.com','https://user:password@example.com','https://example.com/\u0000'])assert.throws(()=>C.projectTarget(target));
 assert.throws(()=>C.projectLinks(Array(6).fill('https://example.com').join('\n')));
 assert.throws(()=>C.projectResume({...draft,decision:'a'.repeat(1501)}));
 assert.equal(C.projectTarget('/Users/test/报告 with spaces.pdf').kind,'file');
});
test('old projects remain byte-for-byte unchanged; project context survives sync and simultaneous edits conflict',()=>{
 const old={tasks:[{id:'t',text:'资料',projectId:'p',done:true}],notes:[{text:'旧笔记'}],workday:C.defaultData()};old.workday.projects=[{id:'p',name:'旧项目'}];
 const before=JSON.stringify(old),base=S.project(old,[]);S.validate(base);assert.equal(JSON.stringify(old),before);
 const local=C.copy(old);local.workday.projects[0].resume=C.projectResume(draft);const rows=S.project(local,[]);S.validate(rows);
 assert.deepEqual(S.materialize(rows,old).state.workday.projects,local.workday.projects);assert.deepEqual(S.materialize(rows,old).state.tasks,old.tasks);
 const remote=C.copy(rows);remote['projects/p'].resume.nextAction='另一设备修改';assert.equal(S.merge(base,rows,remote).conflicts[0].key,'projects/p');
 assert.throws(()=>S.validate({'projects/p':{id:'p',name:'异常',resume:{links:[]}}}));
});

// Deliberately a DOM stub, not browser playback/layout evidence. Exercise the
// actual controller's transaction and draft handling with synthetic records.
function setup(){
 const ids=new Map(),store=new Map();let context,failWrites=false;
 class Element{
  constructor(tag='div'){this.tagName=tag.toUpperCase();this.children=[];this.handlers={};this.attrs={};this.value='';this.hidden=false;this.open=false;this.checked=false;this._text='';}
  set textContent(v){this._text=String(v);this.children=[];}get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  append(...nodes){for(const n of nodes){this.children.push(n);n.parentElement=this;}}replaceChildren(...nodes){this.children=[];this.append(...nodes);}add(n){this.append(n);}
  setAttribute(k,v){this.attrs[k]=v;}getAttribute(k){return this.attrs[k]??null;}hasAttribute(k){return k in this.attrs;}
  addEventListener(k,f){(this.handlers[k]??=[]).push(f);}fire(type,bubble=false){for(const f of this.handlers[type]||[])f({type,key:null,preventDefault(){}});if(bubble)this.parentElement?.fire(type,true);}
  scrollIntoView(){}focus(){document.activeElement=this;}select(){this.selected=true;}contains(n){return this===n||this.children.some(c=>c.contains(n));}closest(){return null;}querySelectorAll(){return [];}
  showModal(){this.open=true;}reset(){if(this.id==='projectForm')for(const id of ['projectName','projectDecision','projectNextAction','projectSource','projectLinks','projectSteps'])get(id).value='';}
 }
 const get=id=>{if(!ids.has(id)){const n=new Element();n.id=id;ids.set(id,n);}return ids.get(id);};
 const document={getElementById:get,createElement:t=>new Element(t),hidden:false,activeElement:null,querySelector:()=>null,querySelectorAll:()=>[],addEventListener(){}};
 const window=new Element();window.dispatchEvent=e=>window.fire(e.type);window.DeskDayCore=C;
 for(const id of ['projectName','projectDecision','projectNextAction','projectSource','projectLinks','projectSteps'])get('projectForm').append(get(id));
 const state={tasks:[{id:'t',text:'保留步骤',projectId:'p',category:'项目 · 原项目',done:true}],notes:[{text:'旧笔记'}],workday:C.defaultData()};state.workday.projects=[{id:'p',name:'原项目'}];
 const localStorage={setItem(k,v){if(failWrites)throw Error('quota');store.set(k,v);},getItem:k=>store.get(k)||null};
 context={window,document,state,STORAGE_KEY:'test-only',localStorage,navigator:{},crypto:{randomUUID:()=>String(Math.random())},Event,Option:class extends Element{constructor(t,v){super('option');this.textContent=t;this.value=v;}},renderTasks(){},renderNotes(){},setInterval(){},Map,Date};
 vm.runInNewContext(fs.readFileSync(require.resolve('../workday'),'utf8'),context);
 const all=(root,fn)=>[...(fn(root)?[root]:[]),...root.children.flatMap(c=>all(c,fn))];
 const find=(text,tag='BUTTON')=>all(get('projectList'),e=>e.tagName===tag&&e.textContent===text)[0];
 const fill=(values={})=>{for(const [id,value] of Object.entries(values)){get(id).value=value;get(id).fire('input',true);}};
 const edit=()=>find('编辑项目卡').fire('click');const save=()=>get('projectForm').fire('submit');
 return {get,find,fill,edit,save,all,window,context,store,fail:v=>failWrites=v};
}
test('legacy cards show missing context honestly and viewing does not save or invent a timestamp',()=>{
 const s=setup();assert.match(s.get('projectList').textContent,/尚未记录确认结论/);assert.match(s.get('projectList').textContent,/尚未记录更新时间/);assert.equal(s.store.size,0);assert.equal(s.context.state.workday.projects[0].resume,undefined);
});
test('editing saves context without replacing steps or notes; cancellation leaves stored context intact',()=>{
 const s=setup();s.edit();s.fill({projectName:'研究课题',projectDecision:draft.decision,projectNextAction:draft.nextAction,projectSource:draft.source,projectLinks:draft.linksText});s.save();
 const saved=s.context.state.workday.projects[0];assert.equal(saved.name,'研究课题');assert.equal(saved.resume.links.length,2);assert.equal(s.context.state.tasks[0].done,true);assert.equal(s.context.state.tasks[0].category,'项目 · 研究课题');assert.equal(s.context.state.notes[0].text,'旧笔记');assert.equal(s.context.state.tasks.length,1);
 const a=s.all(s.get('projectList'),n=>n.tagName==='A')[0];assert.equal(a.href,'https://example.com/plan');assert.equal(a.rel,'noopener noreferrer');
 const before=JSON.stringify(saved);s.edit();s.fill({projectDecision:'尚未确认的新输入'});s.get('projectCancel').fire('click');assert.equal(JSON.stringify(s.context.state.workday.projects[0]),before);
});
test('draft survives background renders, invalid entry and failed writes; retry saves exactly once',()=>{
 const s=setup();s.edit();s.fill({projectDecision:'未保存草稿',projectLinks:'javascript:alert(1)'});s.window.dispatchEvent(new Event('desk-data-change'));assert.equal(s.get('projectDecision').value,'未保存草稿');s.save();assert.match(s.get('workdayFeedback').textContent,/仅支持/);assert.equal(s.context.state.workday.projects[0].resume,undefined);
 s.fill({projectLinks:draft.linksText});s.fail(true);s.save();assert.match(s.get('workdayFeedback').textContent,/保存失败/);assert.equal(s.get('projectDecision').value,'未保存草稿');assert.equal(s.context.state.workday.projects[0].resume,undefined);
 s.fail(false);s.save();assert.equal(s.context.state.workday.projects.length,1);assert.equal(s.context.state.workday.projects[0].resume.decision,'未保存草稿');assert.equal(s.get('projectDecision').value,'');
});
test('progress edits keep context time; local file copy has a manual fallback',async()=>{
 const s=setup();s.edit();s.fill({projectDecision:draft.decision,projectLinks:draft.linksText});s.save();const stamp=s.context.state.workday.projects[0].resume.updatedAt;
 const checkbox=s.all(s.get('projectList'),n=>n.tagName==='INPUT'&&n.type==='checkbox')[0];checkbox.checked=false;checkbox.fire('change');assert.equal(s.context.state.tasks[0].done,false);assert.equal(s.context.state.workday.projects[0].resume.updatedAt,stamp);
 s.find('复制路径').fire('click');const field=s.all(s.get('projectList'),n=>n.tagName==='INPUT'&&n.readOnly)[0];assert.equal(field.hidden,false);assert.equal(field.value,'/Users/test/评审材料.pdf');assert.equal(field.selected,true);
});
test('new project may have context without steps; editing another card does not discard a dirty draft',()=>{
 const s=setup();s.fill({projectName:'新项目',projectNextAction:'核对来源'});s.edit();assert.match(s.get('workdayFeedback').textContent,/先保存或取消/);assert.equal(s.get('projectName').value,'新项目');s.save();assert.equal(s.context.state.workday.projects.length,2);assert.equal(s.context.state.tasks.length,1);assert.equal(s.context.state.workday.projects[1].resume.nextAction,'核对来源');
});
