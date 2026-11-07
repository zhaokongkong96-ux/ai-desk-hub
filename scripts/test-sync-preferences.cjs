const test=require('node:test'),assert=require('node:assert/strict'),P=require('../sync-preferences'),C=require('../sync-core'),E=require('../sync-engine');
function store(initial={}){const data=new Map(Object.entries(initial).map(([k,v])=>[k,JSON.stringify(v)]));return {getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),read:k=>JSON.parse(data.get(k)||'null')};}
test('portable settings round-trip; sessions, permissions, coordinates, files and runtime state stay local',()=>{
 const a=store({'ai-desk-hub-companion-v1':{theme:'nature',idle:5,netease:'',reminders:true,reminded:['private-local']},'ai-desk-hub-return-v04':{quiet:true,privacyHidden:true,homeAt:100,logs:['local']},'ai-desk-hub-feishu-session':{token:'never-export'},'ai-desk-hub-push-device':{token:'also-private'}}),rows=P.project(a),wire=JSON.stringify(rows),b=store({'ai-desk-hub-return-v04':{privacyHidden:false,logs:['keep']}});
 assert.ok(!/private-local|never-export|also-private|privacyHidden|homeAt|logs/.test(wire));C.validate(rows);P.apply(C.materialize(rows,{tasks:[],notes:[]}).preferences,b);
 assert.equal(b.read('ai-desk-hub-companion-v1').theme,'nature');assert.equal(b.read('ai-desk-hub-return-v04').quiet,true);assert.equal(b.read('ai-desk-hub-return-v04').privacyHidden,false);assert.deepEqual(b.read('ai-desk-hub-return-v04').logs,['keep']);
 assert.throws(()=>C.validate({'preference/feishu.token':{value:'secret'}}));assert.throws(()=>C.validate({'preference/companion.theme':{value:'<script>'}}));assert.throws(()=>C.validate({'preference/feishu.service':{value:'https://example.com/?token=secret'}}));assert.throws(()=>C.validate({'preference/companion.idle':{value:5,token:'secret'}}));
});
test('independent setting edits merge, favorites combine and removal propagates as a tombstone',()=>{
 const base=P.project(store()),a={...base,'preference/companion.idle':{value:5},'preference/radar:a/b':{value:true}},b={...base,'preference/return.quiet':{value:true},'preference/radar:c/d':{value:true}},merged=C.merge(base,a,b);
 assert.equal(merged.conflicts.length,0);C.validate(merged.rows);const s=store();P.apply(merged.rows,s);assert.deepEqual(s.read('ai-desk-hub-radar-saved-v1'),['a/b','c/d']);
 const current={...merged.rows};delete current['preference/radar:a/b'];const removed=C.merge(merged.rows,C.localRows(merged.rows,current),merged.rows);P.apply(removed.rows,s);assert.deepEqual(s.read('ai-desk-hub-radar-saved-v1'),['c/d']);
});
test('joining adopts established settings, merges local records, and later settings conflicts remain explicit',async()=>{
 let remote=P.project(store({'ai-desk-hub-companion-v1':{theme:'nature',idle:5}})),local={...P.project(store()),'task/local':{id:'local',text:'synthetic'}},meta={connection:{},base:{},adoptPreferences:true},revision=1,status;
 const engine=E.create({loadMeta:()=>meta,snapshot:()=>C.copy(local),canApply:()=>true,status:k=>status=k,conflicts:()=>{},crypto:{decrypt:async r=>r,encrypt:async r=>r},request:async(_,method,path,body)=>method==='GET'?{payload:remote,revision}:(remote=body.payload,{revision:++revision}),apply:(rows,m)=>{local=rows;meta=m;}});
 assert.equal(await engine.sync(),true);assert.equal(local['preference/companion.theme'].value,'nature');assert.equal(local['preference/companion.idle'].value,5);assert.ok(local['task/local']);assert.equal(meta.adoptPreferences,false);
 local=C.copy(local);remote=C.copy(remote);local['preference/companion.idle']={value:2};remote['preference/companion.idle']={value:15};revision++;
 assert.equal(await engine.sync(),false);assert.equal(status,'conflict');
});
test('malformed local state fails closed; unknown setting tombstones cannot enter the journal',()=>{
 const s=store();s.setItem('ai-desk-hub-companion-v1','{');assert.throws(()=>P.project(s));assert.throws(()=>C.validate({'preference/feishu.token':null}));
 const clean=store();assert.throws(()=>P.apply({'preference/companion.theme':{value:'nature'},'preference/feishu.token':{value:'secret'}},clean));assert.equal(clean.getItem('ai-desk-hub-companion-v1'),null);
});
test('already-paired older devices adopt existing shared preferences during upgrade without re-pairing',async()=>{
 let meta={connection:{},base:{'task/a':{id:'a',text:'old'}}},remote={...meta.base,...P.project(store({'ai-desk-hub-companion-v1':{theme:'nature',idle:15}}))},local={...meta.base,...P.project(store())},status;
 const engine=E.create({loadMeta:()=>meta,snapshot:()=>C.copy(local),canApply:()=>true,status:k=>status=k,conflicts:()=>{},crypto:{decrypt:async r=>r,encrypt:async r=>r},request:async(_,method,path,body)=>method==='GET'?{payload:remote,revision:1}:(remote=body.payload,{revision:2}),apply:(rows,m)=>{local=rows;meta=m;}});
 assert.equal(await engine.sync(),true);assert.equal(status,'synced');assert.equal(local['preference/companion.idle'].value,15);assert.equal(local['task/a'].text,'old');
});
test('preference storage failure keeps apply recoverable by replaying the same batch',()=>{
 const s=store(),rows=P.project(store({'ai-desk-hub-companion-v1':{theme:'nature',idle:5}})),original=s.setItem;let fail=true;
 s.setItem=(k,v)=>{if(k==='ai-desk-hub-attention-v1'&&fail){fail=false;throw Error('quota');}original(k,v);};assert.throws(()=>P.apply(rows,s));P.apply(rows,s);assert.equal(C.canonical(P.project(s)),C.canonical(rows));
});
