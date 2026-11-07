const test=require('node:test'),assert=require('node:assert/strict'),C=require('../intake-core');const now=new Date('2026-10-30T23:50:00+08:00');
test('explicit and relative Beijing dates, week boundaries, explicit materials',()=>{const [d]=C.parse('明天下午3-4点举行评审\n准备材料：方案与评审表',now);assert.equal(d.start,'2026-10-31T15:00');assert.equal(d.end,'2026-10-31T16:00');assert.equal(d.materials,'方案与评审表');assert.equal(C.parse('下周四上午10点开会',now)[0].start,'2026-11-05T10:00');assert.equal(C.parse('明日下午14:00至15:00汇报',now)[0].start,'2026-10-31T14:00')});
test('missing time, ambiguous date and invalid date never become an invented duration',()=>{for(const text of ['周四下午3点开会','2026年2月30日下午2点至3点会议']){assert.equal(C.parse(text,now)[0].start,'');}const d=C.parse('下周四上午10点开会',now)[0];assert.equal(d.end,'');assert.ok(C.validate(d));assert.equal(C.parse('明天3点会议',now)[0].start,'');assert.equal(C.parse('明天25:00到26:00开会',now)[0].start,'')});
test('explicit duration and overnight only when stated',()=>{const d=C.parse('明天14:00项目评审，持续90分钟',now)[0];assert.equal(d.end,'2026-10-31T15:30');const n=C.parse('2026年10月31日23:00至次日01:00会议',now)[0];assert.equal(n.end,'2026-11-01T01:00');assert.equal(C.validate(n),'');assert.ok(C.validate({...n,end:'2026-10-31T01:00'}))});
test('batch fragments preserve materials and do not merge distinct dated items',()=>{const items=C.parse('1. 明天14:00至15:00评审\n\n准备：演示稿\n2. 下周一10:00至11:00讨论\n\n请整理资料',now);assert.equal(items.length,3);assert.equal(items[0].materials,'演示稿');assert.equal(items[2].type,'task');assert.equal(items[1].start,'2026-11-02T10:00')});
test('multiple conflicting dates and more than two times are left for review',()=>{const d=C.parse('明天或后天14:00至15:00评审',now)[0];assert.equal(d.start,'');assert.equal(C.parse('明天10:00、14:00和16:00会议',now)[0].start,'')});
test('dedup matches confirmed provenance and existing semantic dates, not unrelated events',()=>{const d=C.parse('明天14:00至15:00评审',now)[0];assert.ok(C.duplicate(d,[{id:'a',title:'已修改名称',extendedProps:{captureSource:{fragment:d.source}}}]));assert.ok(C.duplicate(d,[{title:d.title,start:'2026-10-31T06:00:00Z',end:'2026-10-31T07:00:00Z'}]));assert.equal(C.duplicate(d,[{title:d.title,start:'2026-11-01T06:00:00Z',end:'2026-11-01T07:00:00Z'}]),undefined)});

test('alternative times, foreign timezone and impossible edited dates remain unconfirmed',()=>{for(const text of ['明天10:00或14:00会议','明天上午10点和11点会议','明天纽约时间14:00至15:00会议']){assert.equal(C.parse(text,now)[0].start,'');}assert.ok(C.validate({type:'event',title:'评审',start:'2026-02-30T10:00',end:'2026-03-02T11:00'}));});

test('same relative notice on a later reference day is a new dated event',()=>{const old=C.parse('明天14:00至15:00评审',now)[0],next=C.parse('明天14:00至15:00评审',new Date('2026-10-31T12:00:00+08:00'))[0];const existing={title:old.title,start:old.start+':00+08:00',end:old.end+':00+08:00',extendedProps:{captureSource:{fragment:old.source,referenceDay:old.referenceDay}}};assert.equal(C.duplicate(next,[existing]),undefined);assert.ok(C.duplicate(old,[existing]));});

test('daily Chinese clock wording gives a clean title and the next Beijing start',()=>{
  const text='安排每天晚上八点半学习英语。';
  const [draft]=C.parse(text,'2026-11-07T18:00:00+08:00');
  assert.equal(draft.title,'学习英语');assert.equal(draft.start,'2026-11-07T20:30');assert.equal(draft.repeat,'daily');assert.equal(draft.type,'event');assert.equal(draft.end,'');
  assert.equal(C.parse(text,'2026-11-07T21:00:00+08:00')[0].start,'2026-11-08T20:30');
  assert.equal(C.parse('每天八点学习英语','2026-11-07T18:00:00+08:00')[0].start,'');
  assert.equal(C.parse('明天晚上八点三十分开会',now)[0].start,'2026-10-31T20:30');
});
test('daily batch handles midnight and rejects invalid counts without duplicating an existing slot',()=>{
  const draft={...C.parse('每天晚上十一点半学习英语',now)[0],days:7};
  draft.end=C.shiftTime(draft.start,60);assert.equal(C.validate(draft),'');
  const dates=C.occurrences(draft);assert.equal(dates.length,7);assert.equal(dates[6].start,'2026-11-06T23:30');assert.equal(dates[6].end,'2026-11-07T00:30');
  const existing={title:draft.title,start:'2026-10-31T15:30:00Z',end:'2026-10-31T16:00:00Z'};
  assert.ok(C.duplicate(dates[0],[existing]));assert.equal(C.duplicate(dates[1],[existing]),undefined);
  assert.ok(C.validate({...draft,days:366}));assert.ok(C.validate({...draft,days:2.5}));
});
test('year-long plans separate a daily end clock from the final occurrence date',()=>{
  const draft={title:'学习英语',type:'event',repeat:'daily',days:365,start:'2026-11-07T20:30',end:C.dailyEnd('2026-11-07T20:30','21:00')};
  assert.equal(C.validate(draft),'');
  const slots=C.occurrences(draft);
  assert.equal(slots.length,365);assert.equal(slots[364].end,'2027-11-06T21:00');
  assert.equal(C.dailyEnd('2026-11-07T23:30','00:15'),'2026-11-08T00:15');
  assert.equal(C.dailyEnd('2026-11-07T20:30','25:00'),'');
  assert.match(C.validate({...draft,days:366}),/2–365/);
  assert.match(C.validate({...draft,end:'2026-12-31T21:00'}),/每次活动/);
});
