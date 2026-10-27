// Resolve citation scope before making links. An unavailable external act must
// never fall back to a coincidentally numbered article in the current document.
const flat=s=>s.replace(/[\s「」『』·ㆍ]/gu,'');
const number='제\\s*\\d+\\s*조(?:\\s*의\\s*\\d+)?';
const suffix='(?:\\s*제\\s*(\\d+)\\s*항)?(?:\\s*제\\s*(\\d+)\\s*호)?';
const documentPattern=/「[^」]{1,120}」(?:\s*시행(?:령|규칙))?|『[^』]{1,120}』(?:\s*시행(?:령|규칙))?|가축전염병\s*예방법(?:\s*시행(?:령|규칙))?|(?:같은\s*법|(?<![가-힣A-Za-z0-9])이\s*법)(?:\s*시행(?:령|규칙))?|같은\s*(?:영|규칙)|(?<![가-힣A-Za-z0-9])(?:이\s*(?:영|규칙|요령|고시|지침)|시행규칙|시행령|법|영|규칙)(?=\s*(?:\([^\n)]{0,100}\)\s*)?(?:제\s*\d+\s*조|같은\s*조))/gu;
const articlePattern=new RegExp('('+number+')'+suffix+'|(?:같은\\s*조|(?<![가-힣A-Za-z0-9])동\\s*조)'+suffix+'|(?:같은\\s*항|(?<![가-힣A-Za-z0-9])동\\s*항)(?:\\s*제\\s*(\\d+)\\s*호)?|제\\s*(\\d{1,3})\\s*항(?:\\s*제\\s*(\\d{1,3})\\s*호)?|제\\s*(\\d{1,3})\\s*호','gu');
const adjacent=s=>/^(?:\s|\([^)]{0,100}\))*$/u.test(s);
const continuation=s=>{const rest=s.replace(/\([^)]{0,80}\)/gu,'').replace(/본문|단서|전단|후단/gu,'').replace(/[\s,，ㆍ·~～–—\-]/gu,'');return /^(?:(?:및|또는|부터|까지|내지|에서|와|과))*$/u.test(rest);};

export function resolveLegalReferences(text,sourceDoc,corpus,{articleIn,legalUnits},audit=[]){
 const ownArticle=text.match(new RegExp('^\\s*('+number+')\\s*\\(','u'))?.[1];
 const refs=[],documents=[...text.matchAll(documentPattern)],attachments=[...text.matchAll(/별(?:표|지)\s*(?:제\s*)?\d+(?:\s*호\s*의\s*\d+|\s*의\s*\d+\s*호?|\s*호)?\s*(?:서식)?/gu)],events=[...documents.map(m=>({kind:'document',m})),...[...text.matchAll(articlePattern)].filter(m=>![...documents,...attachments].some(d=>m.index>=d.index&&m.index<d.index+d[0].length)).map(m=>({kind:'article',m}))].sort((a,b)=>a.m.index-b.m.index||a.kind.localeCompare(b.kind));
 let named=null,pending=null,last=null;
 const contexts=[{named:null,pending:null,last:null}];let scanned=0,depth=0;
 const byTitle=title=>corpus.filter(e=>flat(e.doc.title)===title);
 const byType=type=>corpus.filter(e=>e.doc.type===type&&e.doc.disease==='공통');
 const scopeFor=raw=>{
  const value=flat(raw),same=value.startsWith('같은'),derived=value.endsWith('시행규칙')?'시행규칙':value.endsWith('시행령')?'시행령':null;
  if(same){
   if(!named)return {entries:[],name:null};
   const base=named.replace(/시행(?:령|규칙)$/u,''),title=derived?base+derived:value==='같은영'?base+'시행령':value==='같은규칙'?base+'시행규칙':base;
   return {entries:byTitle(title),name:title};
  }
  if(['법','이법','영','이영','규칙','이규칙','시행령','시행규칙'].includes(value)){
   const type=['법','이법'].includes(value)?'법률':['영','이영','시행령'].includes(value)?'시행령':'시행규칙',entries=byType(type);
   return {entries,name:entries.length===1?flat(entries[0].doc.title):null};
  }
  if(/^이(?:요령|고시|지침)$/u.test(value))return {entries:corpus.filter(e=>e.doc.id===sourceDoc.id),name:flat(sourceDoc.title)};
  return {entries:byTitle(value),name:value};
 };
 for(const event of events){const {m}=event;
  while(scanned<m.index){const c=text[scanned++];if(c==='('||c==='（'){depth++;contexts[depth]={named:contexts[depth-1].named,pending:null,last:contexts[depth-1].last};}else if((c===')'||c==='）')&&depth){depth--;contexts.length=depth+1;}}
  const context=contexts[depth];({named,pending,last}=context);
  if(event.kind==='document'){
   const scope=scopeFor(m[0]);pending={...scope,start:m.index,end:m.index+m[0].length};
   // Remember unknown names too, so "같은 법" cannot link to the wrong law.
   if(!flat(m[0]).startsWith('같은'))named=scope.name;
   Object.assign(context,{named,pending,last});
   continue;
  }
  const explicit=pending&&pending.end<=m.index&&adjacent(text.slice(pending.end,m.index))?pending:null;
  const gap=last?text.slice(last.end,m.index):'',chain=last&&(continuation(gap)||!/[.!?。]/u.test(gap)&&/(?:과|와|및|또는)\s*$/u.test(gap));
  let scope=explicit||(chain?last.scope:{entries:corpus.filter(e=>e.doc.id===sourceDoc.id),name:flat(sourceDoc.title)});
  let articleNumber,paragraph=null,item=null,relative=false;
  if(m[1]){articleNumber=flat(m[1]);paragraph=m[2]?+m[2]:null;item=m[3]?+m[3]:null;}
  else if(/^(?:같은|동)\s*조/u.test(m[0])){relative=true;scope=explicit||last?.scope;articleNumber=last?.articleNumber;paragraph=m[4]?+m[4]:null;item=m[5]?+m[5]:null;}
  else if(/^(?:같은|동)\s*항/u.test(m[0])){relative=true;scope=explicit||last?.scope;articleNumber=last?.articleNumber;paragraph=last?.paragraph;item=m[6]?+m[6]:null;}
  else {relative=true;if(!chain&&!ownArticle)continue;scope=chain?last.scope:{entries:corpus.filter(e=>e.doc.id===sourceDoc.id),name:flat(sourceDoc.title)};articleNumber=chain?last.articleNumber:flat(ownArticle);paragraph=m[7]?+m[7]:chain?last.paragraph:null;item=m[8]?+m[8]:m[9]?+m[9]:null;}
  const start=explicit?.start??m.index,end=m.index+m[0].length,label=text.slice(start,end);
  pending=null;
  // A displayed article heading establishes no external citation antecedent.
  if(!explicit&&m[1]&&!paragraph&&!item&&text.slice(end).startsWith('(')){last=null;Object.assign(context,{named,pending,last});audit.push({start,end,label,reason:'heading'});continue;}
  const candidates=(scope?.entries||[]).map(entry=>({entry,article:articleNumber&&articleIn(entry,articleNumber)})).filter(x=>x.article);
  let reason=!articleNumber?'no_antecedent':!scope?.entries?.length?'unregistered_document':candidates.length!==1?'article_unavailable':null;
  const units=candidates.length===1?legalUnits(candidates[0].article).units:[],implicitFirst=paragraph===1&&units.length>0&&!units.some(u=>u.paragraph!=null);
  if(!reason&&(paragraph||item)&&!units.some(u=>(!paragraph||u.paragraph===paragraph||implicitFirst)&&(!item||u.item===item)))reason='scope_unavailable';
  const target=candidates.length===1?candidates[0].entry.doc.id:null;
  audit.push({start,end,label,articleNumber,paragraph:implicitFirst?null:paragraph,item,documentId:target,reason:reason||'resolved',relative});
  if(!reason)refs.push({start,end,label,documentId:target,articleNumber,paragraph:implicitFirst?null:paragraph,item});
  last={scope,articleNumber,paragraph,item,end};
  Object.assign(context,{named,pending,last});
 }
 return refs;
}
