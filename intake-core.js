/* Conservative Chinese notification extraction. Local rules, not a language model. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.DeskIntakeCore=api;})(typeof window!=='undefined'?window:globalThis,()=>{
 'use strict';
 const pad=n=>String(n).padStart(2,'0');
 const day=now=>new Date(+new Date(now)+8*3600000).toISOString().slice(0,10);
 const plus=(date,n)=>new Date(Date.parse(date+'T00:00:00+08:00')+n*86400000+8*3600000).toISOString().slice(0,10);
 function validDate(y,m,d){const s=y+'-'+pad(m)+'-'+pad(d),v=new Date(s+'T00:00:00+08:00');return Number.isFinite(+v)&&day(v)===s?s:'';}
 const datePattern=/(?:\d{4}[-年/.]\d{1,2}[-月/.]\d{1,2}日?|\d{1,2}月\d{1,2}[日号]|今天|今日|明天|明日|后天|后日|(?:下|本)周[一二三四五六日天])/;
 const prepPattern=/^(?:[-•\d、.\s]*)(?:准备(?:材料)?|需(?:要)?准备|请携带|材料|地点|备注)\s*[:：]/;
 function dateOf(text,reference,warnings){const dates=[];let m;
  const full=/(\d{4})[-年/.](\d{1,2})[-月/.](\d{1,2})日?/g;
  while((m=full.exec(text))){dates.push(validDate(+m[1],+m[2],+m[3]));}
  const without=text.replace(full,'');const short=/(\d{1,2})月(\d{1,2})[日号]/g;
  while((m=short.exec(without))){dates.push(validDate(+reference.slice(0,4),+m[1],+m[2]));warnings.push('未写年份，按参考日期所在年 '+reference.slice(0,4)+' 填入，请核对。');}
  const relative=/今天|今日|明天|明日|后天|后日|(?:下|本)周[一二三四五六日天]/g;
  while((m=relative.exec(text))){const token=m[0].replace('今日','今天').replace('明日','明天').replace('后日','后天');let date;if(['今天','明天','后天'].includes(token))date=plus(reference,['今天','明天','后天'].indexOf(token));else{const current=(new Date(reference+'T12:00:00+08:00').getUTCDay()+6)%7,target='一二三四五六日'.indexOf(token.slice(-1).replace('天','日'));date=plus(reference,-current+target+(token.startsWith('下')?7:0));}dates.push(date);}
  if(dates.includes(''))warnings.push('发现无效日期，请重新填写。');
  const unique=[...new Set(dates)];if(unique.length>1){warnings.push('同一片段有多个不同日期，请拆分或手动确认。');return '';}
  if(!unique.length)warnings.push('日期待确认；“周四”“近期”“周末”等不自动推算。');
  const result=unique.length===1?unique[0]:'';if(result&&result<reference)warnings.push('提取日期早于参考日期，请核对年份与日期。');return result;
 }
 function timeOf(text,warnings){
  if(/UTC|GMT|[美英日韩澳]国时间|纽约时间|伦敦时间|东京时间|美[东西]时间|太平洋时间|夏令时|冬令时/i.test(text)){warnings.push('发现其他时区，请手动换算为北京时间。');return {start:'',end:''};}
  // A range such as 下午3-4点 is normalized only when the end explicitly has 点/时.
  text=text.replace(/(凌晨|早上|上午|中午|下午|晚上)?(\d{1,2})([—–~～至到-])(\d{1,2})(点|时)/g,'$1$2点$3$4$5');
  const regex=/(凌晨|早上|上午|中午|下午|晚上)?\s*(\d{1,2})(?:(?:[:：](\d{2}))|(?:点|时)(半|(?:\d{1,2})(?:分)?)?)/g,found=[],matches=[];let m,lastPeriod='';
  while((m=regex.exec(text))){const period=m[1]||lastPeriod;let h=+m[2],minute=m[3]?+m[3]:m[4]==='半'?30:m[4]?parseInt(m[4],10):0;
   if(m[1])lastPeriod=m[1];const ambiguous=!period&&h>=1&&h<=12&&!m[3];
   if(period==='下午'||period==='晚上'){if(h<12)h+=12;}else if(['凌晨','早上','上午'].includes(period)&&h===12)h=0;else if(period==='中午'&&h<11)h+=12;
   const valid=h>=0&&h<24&&minute>=0&&minute<60&&!ambiguous;if(!valid)warnings.push(ambiguous?'“'+m[0].trim()+'”未注明上午或下午，请确认。':'时间格式无效，请确认。');
   found.push(valid?pad(h)+':'+pad(minute):'');matches.push({index:m.index,end:regex.lastIndex});
  }
  if(found.length>2){warnings.push('出现多个时间，无法确定唯一时段，请手动填写。');return {start:'',end:''};}
  if(found.length===2){const between=text.slice(matches[0].end,matches[1].index);if(/或者|或|还是|以及|及|和|、/.test(between)||!(/[-—–~～至到]/.test(between)||/结束/.test(between))){warnings.push('两个时间未明确为起止范围，请分别确认开始与结束。');return {start:'',end:''};}}
  return {start:found[0]||'',end:found[1]||''};
 }
 function fragments(input){const blocks=[],rows=input.replace(/\r\n?/g,'\n').split('\n');let current=[];
  const push=()=>{if(current.some(s=>s.trim()))blocks.push(current.join('\n').trim());current=[];};
  for(const row of rows){if(!row.trim()){push();continue;}const numbered=/^\s*(?:\d+[.、）)]|[一二三四五六七八九十]+、)\s*/.test(row),hasDate=datePattern.test(row);
   if(!current.length&&prepPattern.test(row)&&blocks.length){blocks[blocks.length-1]+='\n'+row;continue;}
   if(current.length&&!prepPattern.test(row)&&(numbered||(hasDate&&current.some(s=>datePattern.test(s)))))push();current.push(row);
  }push();return blocks;
 }
 function parse(input,now=Date.now()){const reference=day(now);return fragments(input).map((source,index)=>{
   const warnings=[],content=source.split('\n').filter(s=>!prepPattern.test(s)).join('\n'),date=dateOf(content,reference,warnings),times=timeOf(content,warnings);let endDate=date;
   if(/次日|第二天/.test(content)&&date)endDate=plus(date,1);
   let start=date&&times.start?date+'T'+times.start:'',end=endDate&&times.end?endDate+'T'+times.end:'';
   const duration=content.match(/(?:持续|时长|历时|共)\s*(\d+(?:\.\d+)?)\s*(小时|分钟)/);
   if(start&&!end&&duration){const amount=+duration[1]*(duration[2]==='小时'?60:1);if(amount>0&&amount<=1440)end=new Date(Date.parse(start+':00+08:00')+amount*60000+8*3600000).toISOString().slice(0,16);}
   const type=(date||times.start)&&/会议|评审|培训|讲座|活动|讨论|面试|答辩|汇报|开会/.test(source)||!!end?'event':'task';
   if(type==='event'&&!start)warnings.push('开始日期和时间待确认。');if(type==='event'&&!end)warnings.push('未识别结束时间；不会自动补足时长。');if(start&&end&&Date.parse(end+':00+08:00')<=Date.parse(start+':00+08:00'))warnings.push('结束不晚于开始；如跨日，请明确选择结束日期。');
   const rows=source.split('\n'),explicit=source.match(/(?:事项|主题|标题|会议名称)\s*[:：]\s*([^\n]+)/),title=(explicit?explicit[1]:rows.find(s=>!prepPattern.test(s)&&!/^\s*[【[]?(?:会议)?通知[】\]]?[:：]?\s*$/.test(s))||rows[0]).replace(/^\s*(?:\d+[.、）)]|[一二三四五六七八九十]+、)\s*/,'').trim().slice(0,100);
   const materials=rows.filter(s=>/^(?:\s*[-•\d、.]*)?(?:准备(?:材料)?|需(?:要)?准备|请携带|材料)\s*[:：]/.test(s)).map(s=>s.replace(/^.*?[:：]\s*/,'' )).join('\n');
   return {index,source,title,type,start,end,materials,warnings:[...new Set(warnings)],referenceDay:reference};
  });}
 const normalize=s=>String(s||'').normalize('NFKC').replace(/\s+/g,'').toLowerCase();
 function duplicate(draft,items){return items.find(item=>{
  const source=item.extendedProps?.captureSource||item.captureSource;
  if(source&&normalize(source.fragment)===normalize(draft.source)){const relative=/今天|今日|明天|明日|后天|后日|(?:下|本)周/.test(draft.source);if(!relative||!source.referenceDay||source.referenceDay===draft.referenceDay)return true;}
  if(normalize(item.title||item.text)!==normalize(draft.title))return false;
  if(draft.type==='task')return true;
  return Date.parse(item.start)===Date.parse(draft.start+':00+08:00')&&Date.parse(item.end)===Date.parse(draft.end+':00+08:00');
 });}
 function validLocal(value){const m=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value||'');return m&&validDate(+m[1],+m[2],+m[3])&&+m[4]<24&&+m[5]<60;}
 function validate(d){if(!d.title?.trim())return '请填写事项名称。';if(d.type==='event'){if(!d.start||!d.end)return '请确认完整的开始和结束时间。';const start=Date.parse(d.start+':00+08:00'),end=Date.parse(d.end+':00+08:00');if(!validLocal(d.start)||!validLocal(d.end)||!Number.isFinite(start)||!Number.isFinite(end)||end<=start)return '结束时间必须晚于开始时间。';}return '';}
 return {parse,fragments,duplicate,validate,day,normalize};
});
