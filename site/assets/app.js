import {eligible} from './search.js?v=20261025-1';
const $=id=>document.getElementById(id);
const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
const labels={classification:'정의·분류 검색',definition:'용어 정의',ranked:'조문·용어 검색',material:'사료 관련 조치',topic:'살처분 근거',article:'조문 검색',procedure:'절차 검색',zone:'방역지역',annex:'서식·별표',related:'관련 후보'};
let manifest,worker,requestId=0,navId=0,navStack=[],navDate=null,searchedFilters=null;
const asOf=$('asOf');
const koreaDate=value=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));
asOf.value=koreaDate(Date.now());
const filters=()=>({asOf:asOf.value,disease:$('disease').value,type:$('docType').value});
const dialog=$('articleDialog');
function pdfLink(doc,page){return new URL(doc.pdf,document.baseURI).href+(page?'#page='+page:'');}
function link(text,url){const a=el('a','',text);a.href=url;a.target='_blank';a.rel='noopener noreferrer';return a;}
function targetHref(t){const url=new URL(location.href),p=new URLSearchParams({article:t.documentId,number:t.articleNumber,date:t.asOf||navDate||searchedFilters?.asOf||asOf.value});if(t.paragraph)p.set('paragraph',t.paragraph);if(t.item)p.set('item',t.item);url.hash=p.toString();return url.href;}
function articleLink(text,target,cls='citation-link'){
 const a=el('a',cls,text);a.href=targetHref(target);a.onclick=e=>{if(e.ctrlKey||e.metaKey||e.shiftKey||e.altKey||e.button!==0)return;e.preventDefault();openArticle(target);};return a;
}
function linkedText(part){
 const p=el('p','excerpt'),text=part.display||part.text;let cursor=0;
 for(const r of part.references||[]){if(r.start<cursor||r.end>text.length)continue;p.append(document.createTextNode(text.slice(cursor,r.start)),r.kind==='annex'?link(text.slice(r.start,r.end),pdfLink(manifest.documents.find(d=>d.id===r.documentId),r.page)):articleLink(text.slice(r.start,r.end),r));cursor=r.end;}
 p.append(document.createTextNode(text.slice(cursor)));return p;
}
function passages(parts,doc,container,showPages=false){
 for(const p of parts){const row=el('div','passage');if(showPages)row.append(el('span','page-label','PDF '+p.page+'쪽'));row.append(linkedText(p));container.append(row);}
}
function library(){
 if(!manifest)return;const root=$('documents');root.replaceChildren();const docs=manifest.documents.filter(d=>eligible(d,filters()));$('libraryCount').textContent=docs.length+'종';
 for(const d of docs){const c=el('article','document'),info=el('div');info.append(el('h3','',d.title),el('p','meta',`${d.type} · ${d.disease} · ${d.version} · 기준일 ${d.from} · ${d.pages}쪽`));
  if(d.date_note)info.append(el('p','date-note',d.date_note));if(d.search_note)info.append(el('p','date-note',d.search_note));c.append(info,link('PDF 원문 ↗',pdfLink(d)));root.append(c);
 }if(!docs.length)root.append(el('p','meta','선택 조건에 해당하는 게시 자료가 없습니다.'));
}
const diseaseLabel=d=>({'구제역':'구제역(FMD)','고병원성AI':'고병원성 AI(HPAI)','ASF':'아프리카돼지열병(ASF)','공통':'공통'}[d]||d);
function annexPassage(unit,g,container){
 const section=el('section','annex-unit');section.append(el('h4','unit-label',g.annexExcerpt.label+' '+unit.label));
 passages(unit.parts,g.doc,section,true);
 if(unit.images?.length){
  const original=el('details','annex-original-images');original.append(el('summary','','원문 배치로 비교 · 이미지'));
  for(const source of unit.images){const box=el('div','annex-image-scroll'),a=link('',pdfLink(g.doc,source.page)),img=el('img','annex-crop');img.src=new URL(source.path,document.baseURI).href;img.alt=g.annexExcerpt.label+' '+unit.label+' 원문 · PDF '+source.page+'쪽';img.loading='lazy';a.append(img);box.append(a);original.append(el('p','page-label','원문 발췌 · PDF '+source.page+'쪽'),box);}
  section.append(original);
 }
 container.append(section);
}
function annexPreview(g,node){
 const excerpt=g.annexExcerpt,body=el('div','annex-preview-body');
 if(excerpt.choices?.length){const label=el('label','','별표 항목 직접 선택'),select=el('select','annex-selector');label.append(select);select.append(new Option('항목을 선택하세요',''));for(const u of excerpt.choices)select.append(new Option(u.label+' · '+u.parts.map(p=>p.display).join(' ').slice(0,65),u.key));select.value=excerpt.selected[0]?.key||'';select.onchange=()=>{excerpt.selected=excerpt.choices.filter(u=>u.key===select.value);g.locator=excerpt.label+' · '+(excerpt.selected.map(u=>u.label).join(' · ')||'항목 선택');const location=node.querySelector('.location-label');if(location)location.textContent=g.locator;body.replaceChildren();annexPreviewBody(g,body);};node.append(label);}
 node.append(body);annexPreviewBody(g,body);
}
function annexPreviewBody(g,node){
 const excerpt=g.annexExcerpt;if(!excerpt.selected.length){node.append(el('p','layout-notice','질문만으로 별표의 항목을 좁히지 못했습니다. 위 목록에서 항목을 선택하거나 전체 PDF를 확인하세요.'));return;}node.append(el('p','layout-notice','질문과 관련된 별표 항목을 발췌했습니다. 공통 적용 규정과 경감 규정도 함께 확인하세요. 지급액을 계산하거나 확정한 결과는 아닙니다.'));
 const intro=excerpt.selected[0]?.intro||[];if(intro.length){const box=el('div','annex-intro');box.append(el('h4','unit-label','해당 호의 적용 범위'));passages(intro,g.doc,box,true);node.append(box);}
 for(const unit of excerpt.selected)annexPassage(unit,g,node);
 if(excerpt.common.length){const box=el('div','annex-common');box.append(el('h4','unit-label','함께 적용되는 공통 규정'));for(const unit of excerpt.common)annexPassage(unit,g,box);node.append(box);}
 if(excerpt.selected.some(u=>u.root===2)&&excerpt.adjustment.length){const extra=el('details','annex-adjustment');extra.append(el('summary','','별표의 경감 규정 함께 보기'));for(const unit of excerpt.adjustment)annexPassage(unit,g,extra);node.append(extra);}
}
function card(g){
 const node=el('article','evidence'+(g.primary?' is-primary':'')),head=el('div','evidence-top');
 head.append(el('span','type-chip',g.docType),el('span','disease-chip',diseaseLabel(g.disease)),el('span','source-name',g.title));node.append(head);
 const title=el('h3','evidence-title');title.append(g.target?articleLink(g.locator,g.target,'location-link'):el('span','location-label',g.locator));node.append(title);
 const topic=g.heading?.startsWith('정의 · ')?g.heading.replace('정의 · ','')+'의 정의':g.articleTitle;
 if(topic&&topic!==g.locator)node.append(el('p','article-topic',topic));
 if(g.doc.search_note)node.append(el('p','scope-notice',g.doc.search_note));
 if(g.scenario)node.append(el('p','scenario',g.scenario));
 if(g.annexExcerpt){annexPreview(g,node);
 }else if(['form','table','figure'].includes(g.kind)){
  node.append(el('p','layout-notice',(g.kind==='form'?'서식':g.kind==='table'?'별표':'그림·사진')+'의 배치와 작성란은 PDF 원문에서 확인하세요.'));
 }else if(g.focus.length){
  const focused=el('div','focused-source');
  for(const u of g.focus){const section=el('section','focus-unit');if(g.focus.length>1)section.append(el('h4','unit-label',u.label));passages(u.parts,g.doc,section,u.parts.length>1);if(u.note)section.append(el('p','context-note',u.note));focused.append(section);}node.append(focused);
 }else node.append(el('p','scope-notice','질문에 해당하는 항·호를 더 좁히지 못했습니다. 아래에서 전체 원문을 확인하세요.'));
 if(g.needsContext)node.append(el('p','scope-notice','이 항목은 아래의 검사 절차를 함께 적용하도록 정하고 있습니다. 축종별 검사 조건을 전체 원문에서 확인하세요.'));
 const full=el('details','full-context');full.append(el('summary','',g.needsContext?'검사 조건·전체 원문 펼치기':'전체 '+(g.articleNumber?'조문':'원문')+' 펼치기'));
 if(g.focus.length)full.append(el('p','context-note','위에는 질문과 관련된 일부 항목을 발췌했습니다. 조건·예외·다른 항목은 전체 원문에서 함께 확인하세요.'));
 passages(g.fullParts,g.doc,full,true);
 const original=el('details','original');original.append(el('summary','','추출 원문 · 줄바꿈 비교'));for(const p of g.fullParts)original.append(el('pre','',`PDF ${p.page}쪽\n${p.text}`));full.append(original);node.append(full);
 const footer=el('div','evidence-footer'),pages=[...new Set(g.parts.map(p=>p.page))];
 footer.append(link('PDF '+(g.endPage&&g.endPage!==pages[0]?pages[0]+'–'+g.endPage:pages.join('·'))+'쪽 ↗',pdfLink(g.doc,pages[0])));
 if(g.target)footer.append(articleLink('조문·연결 규정',g.target,'text-action'));
 const copy=el('button','text-action','발췌 복사');copy.type='button';copy.onclick=async()=>{
  const parts=g.annexExcerpt?[...g.annexExcerpt.selected.flatMap(u=>[...u.intro,...u.parts]),...g.annexExcerpt.common.flatMap(u=>u.parts)]:g.focus.length?g.focus.flatMap(u=>u.parts):g.parts;
  try{await navigator.clipboard.writeText(`${g.title} / ${g.locator} / ${g.version}\n${parts.map(p=>`[PDF ${p.page}쪽]\n${p.text}`).join('\n')}\n${pdfLink(g.doc,parts[0].page)}`);copy.textContent='복사했습니다';}catch{copy.textContent='복사 권한을 확인하세요';}
 };footer.append(copy);node.append(footer);
 const meta=el('details','source-info');meta.append(el('summary','',g.version+' · 문서 정보'),el('p','meta',`적용 기준일 ${searchedFilters?.asOf||asOf.value} · 문서 기준일 ${g.from}`));if(g.dateNote)meta.append(el('p','date-note',g.dateNote));node.append(meta);
 return node;
}
function sourceOverview(groups,result){
 const box=el('section','source-overview');box.append(el('h3','','문서별 근거 함께 보기'));
 const reporting=['reporting','reporting-method'].includes(result.view?.scope);
 const roles=reporting?{'법률':'신고 의무·신고 기관','시행규칙':'신고방법·신고사항·접수 후 조치','고시':'질병별 신고·초동조치','SOP':'현장 신고·대응 절차'}:{'법률':'법률상 근거','시행령':'시행령의 세부 규정','시행규칙':'시행규칙의 세부 규정','고시':'질병별 방역 기준','SOP':'현장 행동 절차'};
 const seen=new Set(),extra=result.diagnostics?.roleSearch?el('details','role-source-details'):null;let extraCount=0;
 if(extra)extra.append(el('summary','','추가 연결 근거'));
 for(const g of groups){
  const key=g.documentId+'|'+(g.articleNumber||g.scenario||g.heading);if(seen.has(key))continue;seen.add(key);
  const row=el('div','source-overview-row'),label=diseaseLabel(g.disease)+' · '+g.docType+' · '+(g.articleNumber||(g.annexExcerpt?g.locator:g.heading)||'현장 절차');
  row.append(g.target?articleLink(label,g.target,'source-overview-link'):link(label,pdfLink(g.doc,g.annexExcerpt?.selected[0]?.parts[0]?.page||g.page)));
  const scenario=g.docType==='SOP'&&g.scenario?(g.scenario.includes('미접종')?'백신미접종 유형':g.scenario.includes('백신접종')?'백신접종 유형':g.scenario):'';
  row.append(el('span','meta',g.title+' · '+(roles[g.docType]||'관련 원문')+(scenario?' · '+scenario:'')));if(extra&&!g.primary){extra.append(row);extraCount++;}else box.append(row);
 }
 if(extraCount){extra.querySelector('summary').textContent='질병별 고시·SOP 등 추가 연결 '+extraCount+'건';box.append(extra);}
 if(searchedFilters?.type!=='전체')box.append(el('p','context-note','현재 문서 종류 필터 안의 결과입니다. 법령과 SOP를 함께 보려면 문서 종류를 전체로 선택하세요.'));
 box.append(el('p','context-note','같은 기준일에 검색된 근거 목록입니다. 문서 간 인용·버전과 적용 조건은 원문에서 확인하세요.'));
 return box;
}
function render(result){
 $('mode').textContent=labels[result.mode];const root=$('results');root.replaceChildren();
 const groups=result.view?.groups||[];
 if(!groups.length){$('message').textContent=result.message;root.append(el('p','scope-notice','질병·문서 종류·적용 기준일을 확인해주세요.'));return;}
 $('message').textContent=(['topic','material','ranked','classification'].includes(result.mode)||result.diagnostics?.status==='needs_detail')?result.message:result.mode==='related'?'질문에 일치하는 항·호를 특정하지 못했습니다. 관련 원문 후보를 펼쳐 확인하거나 질문을 구체적으로 입력해주세요.':'질문과 연결한 원문 항목을 먼저 표시합니다. 밑줄 친 조문을 누르면 같은 기준일의 연결 규정을 볼 수 있습니다.';
 if(result.mode==='classification'&&result.diagnostics?.alias)root.append(el('p','scope-notice','‘법정전염병’을 이 검색기의 대상인 ‘가축전염병’의 법정 분류로 연결했습니다.'));
 root.append(sourceOverview(groups,result));
 const legalCandidates=result.mode!=='related'&&result.diagnostics?.status!=='needs_detail'?groups.filter(g=>['법률','시행령','시행규칙'].includes(g.docType)&&g.focus.length):[];
 const markedLegal=legalCandidates.filter(g=>g.primary),legal=markedLegal.length?markedLegal:legalCandidates.slice(0,2);
 const primary=groups.filter(g=>g.primary&&!legal.includes(g)),support=groups.filter(g=>!g.primary&&!legal.includes(g));
 if(legal.length){root.append(el('h3','result-section-label','법률·시행령·시행규칙 근거'));for(const g of legal)root.append(card({...g,primary:true}));}
 if(result.diagnostics?.roleSearch)root.append(el('p','scope-notice','담당 주체의 역할·업무 질문으로 검색했습니다. 법령의 권한·업무와 질병별 고시·SOP의 현장 조치를 구분해 확인하세요. 문서별 상세도 차이만으로 규정 충돌을 뜻하지는 않습니다.'));
 if(result.diagnostics?.benefits?.length)root.append(el('p','scope-notice','안정자금·지원금이라는 표현을 원문의 안정비용 관련 용어로 연결했습니다. 생계안정과 소득안정은 구분해 표시하며, 지원 여부와 조건은 각 항의 원문을 확인하세요.'));
 if(result.diagnostics?.terms?.length)root.append(el('p','scope-notice','연결한 검색어: '+result.diagnostics.terms.join(' · ')));
 if(primary.length){const label=el('div','result-section-label');label.append(el('h3','','질문에 연결한 근거'),el('span','',primary.length+'건'));root.append(label);for(const g of primary)root.append(card(g));}
 if(support.length){const related=el('details','supporting-results');if(!primary.length)related.open=true;related.append(el('summary','',`${result.mode==='related'?'관련 원문 후보':'관련 법령·추가 근거'} ${support.length}건 보기`));for(const g of support)related.append(card(g));root.append(related);}
}
function parseTarget(){
 const p=new URLSearchParams(location.hash.slice(1)),id=p.get('article'),number=p.get('number');
 if(!manifest?.documents.some(d=>d.id===id)||!/^제\d+조(?:의\d+)?$/u.test(number||''))return null;
 const t={documentId:id,articleNumber:number};for(const key of ['paragraph','item']){const value=p.get(key);if(value){if(!/^\d{1,3}$/u.test(value)||Number(value)<1)return null;t[key]=Number(value);}}
 const date=p.get('date');if(date&&/^\d{4}-\d{2}-\d{2}$/u.test(date))t.asOf=date;return t;
}
function openArticle(target,push=true){
 if(!manifest)return;
 if(!dialog.open){navDate=target.asOf||searchedFilters?.asOf||asOf.value;navStack=[];dialog.showModal();}
 if(push&&JSON.stringify(navStack.at(-1))!==JSON.stringify(target))navStack.push(target);
 $('articleBack').disabled=navStack.length<2;$('articleHeading').textContent='조문을 불러오고 있습니다.';$('articleBody').replaceChildren();
 history.replaceState(null,'',targetHref({...target,asOf:navDate}));
 worker.postMessage({action:'article',id:++navId,manifest,filters:{...filters(),asOf:navDate},target});
}
function renderArticle(detail){
 const root=$('articleBody');root.replaceChildren();
 if(detail.error){$('articleHeading').textContent='조문 확인';root.append(el('p','scope-notice',detail.error));return;}
 $('articleHeading').textContent=detail.scopeLabel+' · '+detail.title;
 root.append(el('p','dialog-source',`${detail.doc.title} · ${detail.doc.version} · 기준일 ${navDate}`));
 if(detail.scopeMissing)root.append(el('p','scope-notice','지정한 항·호를 고유하게 확인하지 못해 전체 조문을 표시합니다.'));
 if(detail.scope.length){const selected=el('section','selected-clause');selected.append(el('h3','',detail.scopeLabel));passages(detail.scope,detail.doc,selected,true);root.append(selected);}
 const full=el('details','dialog-full');full.open=!detail.scope.length;full.append(el('summary','','전체 조문 보기'));passages(detail.parts,detail.doc,full,true);root.append(full);
 if(detail.target.paragraph||detail.target.item)root.append(articleLink('이 조문 전체의 연결 규정 보기',{...detail.target,paragraph:null,item:null},'text-action'));
 const citations=el('section','citing-documents');citations.append(el('h3','','이 조문을 인용한 등록 규정'),el('p','context-note','인용 관계를 연결한 목록입니다. 위임 범위나 법적 우선순위를 자동 판정한 결과는 아닙니다.'));
 if(!detail.citations.length)citations.append(el('p','meta','등록 자료에서 확인된 인용 조문이 없습니다.'));
 else{const list=el('ul','citation-list');for(const c of detail.citations){const li=el('li');li.append(articleLink(`${c.title} ${c.articleNumber} · ${c.articleTitle}`,c),el('small','',c.label+' 인용'));list.append(li);}citations.append(list);}root.append(citations);
 root.append(link('PDF '+detail.parts[0].page+'쪽 원문 ↗',pdfLink(detail.doc,detail.parts[0].page)));
}
$('articleClose').onclick=()=>dialog.close();$('articleBack').onclick=()=>{if(navStack.length<2)return;navStack.pop();openArticle(navStack.at(-1),false);};
 dialog.addEventListener('close',()=>{navId++;navStack=[];navDate=null;const url=new URL(location.href);if(new URLSearchParams(url.hash.slice(1)).has('article')){url.hash='';history.replaceState(null,'',url.href);}});
window.addEventListener('hashchange',()=>{const target=parseTarget();if(target)openArticle(target);});
function perform(){
 const question=$('question').value.trim();if(!manifest||!question)return;
 if(!/^\d{4}-\d{2}-\d{2}$/u.test(asOf.value)){$('message').textContent='유효한 기준일을 선택해주세요.';return;}
 searchedFilters=filters();$('submit').disabled=true;document.querySelector('.results-panel').setAttribute('aria-busy','true');$('message').textContent='질문과 연결된 원문 항목을 찾고 있습니다.';$('results').replaceChildren();worker.postMessage({id:++requestId,manifest,question,filters:searchedFilters});
}
$('searchForm').addEventListener('submit',e=>{e.preventDefault();perform();});
for(const button of document.querySelectorAll('[data-question]'))button.onclick=()=>{$('question').value=button.dataset.question;perform();};
for(const id of ['disease','docType','asOf'])$(id).addEventListener('change',()=>{requestId++;if(dialog.open)dialog.close();$('submit').disabled=!manifest;document.querySelector('.results-panel').setAttribute('aria-busy','false');library();updateExamples();$('message').textContent='검색 조건이 바뀌었습니다. 다시 검색해주세요.';$('results').replaceChildren();});
function updateExamples(){const name={ASF:'아프리카돼지열병',고병원성AI:'고병원성 조류인플루엔자'}[$('disease').value]||'구제역';for(const b of document.querySelectorAll('[data-question]')){b.dataset.baseQuestion??=b.dataset.question;b.dataset.question=b.dataset.baseQuestion.replace(/^구제역/u,name);}}
try{
 const response=await fetch(new URL('../data/manifest.json?v=20261025-1',import.meta.url));if(!response.ok)throw Error();manifest=await response.json();if(manifest.schema!==1)throw Error();
 worker=new Worker(new URL('./worker.js?v=20261025-1',import.meta.url),{type:'module'});
 worker.onmessage=({data})=>{
  if(data.action==='article'){if(data.id!==navId||!dialog.open)return;renderArticle(data.error?{error:data.error}:data.detail);return;}
  if(data.id!==requestId)return;$('submit').disabled=false;document.querySelector('.results-panel').setAttribute('aria-busy','false');if(data.error){$('message').textContent=data.error;return;}render(data.result);
 };
 worker.onerror=()=>{$('submit').disabled=false;document.querySelector('.results-panel').setAttribute('aria-busy','false');$('message').textContent='검색을 시작하지 못했습니다. 페이지를 새로고침해주세요.';};
 $('snapshot').textContent=`게시 자료 ${manifest.documents.length}종 · ${koreaDate(manifest.generated_at)} 갱신`;$('submit').disabled=false;library();const target=parseTarget();if(target)openArticle(target);
}catch{$('snapshot').textContent='게시 자료를 불러오지 못했습니다. 연결 상태를 확인한 뒤 새로고침해주세요.';}
