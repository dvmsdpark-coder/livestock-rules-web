import {eligible} from './search.js';
const $=id=>document.getElementById(id),el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const labels={definition:'정의 원문',article:'조문 원문',procedure:'절차 원문',zone:'방역지역 근거',annex:'별표·별지',related:'관련 원문'};
let manifest,worker,requestId=0;
const asOf=$('asOf');asOf.value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const filters=()=>({asOf:asOf.value,disease:$('disease').value,type:$('docType').value});
function pdfLink(doc,page){return new URL(doc.pdf,document.baseURI).href+(page?'#page='+page:'');}
function link(text,url){const a=el('a','',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function library(){if(!manifest)return;const root=$('documents');root.replaceChildren();const docs=manifest.documents.filter(d=>eligible(d,filters()));$('libraryCount').textContent=docs.length+'종';for(const d of docs){const c=el('article','document'),info=el('div');info.append(el('h3','',d.title),el('p','meta',`${d.type} · ${d.disease} · ${d.version} · 기준일 ${d.from} · ${d.pages}쪽`));if(d.date_note)info.append(el('p','date-note',d.date_note));c.append(info,link('PDF 원문 ↗',pdfLink(d)));root.append(c);}if(!docs.length)root.append(el('p','meta','선택 조건에 해당하는 게시 자료가 없습니다.'));}
function render(result){
 $('mode').textContent=labels[result.mode];$('message').textContent=result.message;const root=$('results');root.replaceChildren();
 if(!result.results.length){root.append(el('p','meta','질병·문서 종류·적용 기준일을 확인해주세요.'));return;}
 result.results.forEach((r,i)=>{const card=el('article','evidence');card.append(el('h3','',`E${i+1} · ${r.title}`),el('p','meta',`${r.docType} · ${r.disease} · ${r.version}\nPDF ${r.page}쪽 · ${r.match} · ${r.heading||'페이지 발췌'}`));
  if(r.scenario)card.append(el('p','scenario',r.scenario));
  if(r.dateNote)card.append(el('p','date-note',r.dateNote));
  if(['form','table'].includes(r.kind)){card.append(el('p','scenario',`${r.kind==='form'?'별지 서식':'별표 자료'}${r.deleted?' · 삭제된 항목':''} · 표·그림의 배치는 PDF 원문에서 확인하세요.`));}
  const body=el('p','excerpt',r.display||r.text);
  if(r.continued||['form','table'].includes(r.kind)){const details=el('details','continuation');details.append(el('summary','',r.continued?`PDF ${r.page}쪽 · 이어지는 원문 펼치기`:'추출 문자 펼치기'),body);card.append(details);}else card.append(body);
  if(r.display&&r.display!==r.text){const d=el('details','original');d.append(el('summary','','추출 원문 · 줄바꿈 비교'),el('pre','',r.text));card.append(d);}
  const actions=el('div','actions');actions.append(link(`PDF ${r.page}쪽 원문 ↗`,pdfLink(r,r.page)));const copy=el('button','','근거 복사');copy.type='button';copy.onclick=async()=>{try{await navigator.clipboard.writeText(`${r.title} / ${r.version} / ${r.heading} / PDF ${r.page}쪽\n${r.text}\n${pdfLink(r,r.page)}`);copy.textContent='복사했습니다';}catch{copy.textContent='복사 권한을 확인하세요';}};actions.append(copy);card.append(actions);root.append(card);
 });
}
function perform(){
 const question=$('question').value.trim();if(!manifest||!question)return;
 if(!/^\d{4}-\d{2}-\d{2}$/u.test(asOf.value)){$('message').textContent='유효한 기준일을 선택해주세요.';return;}
 $('submit').disabled=true;document.querySelector('.results-panel').setAttribute('aria-busy','true');$('message').textContent='선택한 문서의 검색 색인을 확인하고 있습니다. 처음에는 잠시 걸릴 수 있습니다.';$('results').replaceChildren();worker.postMessage({id:++requestId,manifest,question,filters:filters()});
}
$('searchForm').addEventListener('submit',e=>{e.preventDefault();perform();});
for(const button of document.querySelectorAll('[data-question]'))button.onclick=()=>{$('question').value=button.dataset.question;perform();};
for(const id of ['disease','docType','asOf'])$(id).addEventListener('change',()=>{requestId++;$('submit').disabled=!manifest;document.querySelector('.results-panel').setAttribute('aria-busy','false');library();$('message').textContent='검색 조건이 바뀌었습니다. 다시 검색해주세요.';$('results').replaceChildren();});
try{const response=await fetch(new URL('../data/manifest.json',import.meta.url));if(!response.ok)throw Error();manifest=await response.json();if(manifest.schema!==1)throw Error();worker=new Worker(new URL('./worker.js',import.meta.url),{type:'module'});worker.onmessage=({data})=>{if(data.id!==requestId)return;$('submit').disabled=false;document.querySelector('.results-panel').setAttribute('aria-busy','false');if(data.error){$('message').textContent=data.error;return;}render(data.result);};worker.onerror=()=>{$('submit').disabled=false;document.querySelector('.results-panel').setAttribute('aria-busy','false');$('message').textContent='검색을 시작하지 못했습니다. 페이지를 새로고침해주세요.';};$('snapshot').textContent=`게시 자료 ${manifest.documents.length}종 · 자료 묶음 ${manifest.generated_at.slice(0,10)} 갱신`;$('submit').disabled=false;library();}
catch{$('snapshot').textContent='게시 자료를 불러오지 못했습니다. 연결 상태를 확인한 뒤 새로고침해주세요.';}
