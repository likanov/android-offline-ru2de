import {existsSync,readFileSync,statSync} from 'node:fs';
const bounds=value=>{const m=/\[(\d+),(\d+)\]\[(\d+),(\d+)\]/.exec(value??'');return m?{left:+m[1],top:+m[2],right:+m[3],bottom:+m[4]}:null;};
export function imeWindowIsVisible(dump){
 // IME_ACTIVE is bit 1; an active service can still have a hidden window.
 // Only IME_VISIBLE (bit 2) establishes the onscreen keyboard for this AVD.
 const value=/(?:^|\s)mImeWindowVis=(0x[\da-f]+|\d+)/im.exec(dump??'')?.[1];
 return value!==undefined&&(Number(value)&2)!==0;
}
export function grammarUiCapture(xml,{step,width,height,density,imeId,imeDump,windowDump=''}){
 const nodes=[...xml.matchAll(/<node\b[^>]*>/g)].map(m=>Object.fromEntries([...m[0].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],a[2]])));
 const byId=id=>bounds(nodes.find(n=>n['resource-id']===id)?.bounds);
 const visible=imeWindowIsVisible(imeDump);
 const imeNodes=nodes.filter(n=>/inputmethod|\.ime(?:\.|$)/i.test(n.package??'')).map(n=>bounds(n.bounds)).filter(b=>b&&b.bottom>b.top);
 const methodWindow=windowDump.split(/(?=Window #\d+ Window\{)/).find(s=>/^Window #\d+ Window\{[^\n]*InputMethod/.test(s.trim()));
 const frame=methodWindow?.match(/(?:mFrame=|frame=)(\[\d+,\d+\]\[\d+,\d+\])/);
 const windowBounds=bounds(frame?.[1]);
 // The IME window may fill the display above the keyboard with transparent space.
 // Android reports content/visible insets relative to that window, not the display.
 const insets=/contentTopInsets=(\d+)\s+visibleTopInsets=(\d+)/.exec(imeDump??'');
 const inset=insets?Math.min(Number(insets[1]),Number(insets[2])):undefined;
 const contentTop=windowBounds&&Number.isFinite(inset)&&inset>=0&&inset<windowBounds.bottom-windowBounds.top?windowBounds.top+inset:undefined;
 const top=contentTop??(imeNodes.length?Math.min(...imeNodes.map(b=>b.top)):windowBounds?.top);
 return {step,viewport:{top:0,bottom:height,width,density},keyboard:{visible,imeId,...(visible?{top}:{})},input:byId('grammar-answer-input'),submit:byId(step==='after-submit'?'grammar-next':'grammar-submit'),result:byId('grammar-result'),options:nodes.filter(n=>n['resource-id']?.startsWith('grammar-multi-option-')).map(n=>({id:n['resource-id'],...bounds(n.bounds)}))};
}
export function validateGrammarUiEvidence(report){
 const errors=[],require=(ok,label)=>{if(!ok)errors.push(label);};
 const artifact=p=>typeof p==='string'&&existsSync(p)&&statSync(p).isFile()&&statSync(p).size>0;
 const item=report?.grammarUi?.['grammar-lektion3.keyboard-small-large'];
 require(item?.apkSha256===report?.apk?.sha256,'GRAMMAR_UI_APK_MISMATCH');
 const configs=item?.configurations??[];require(configs.length===2,'GRAMMAR_UI_CONFIGURATIONS_MISSING');
 const screenshots=new Set(),hierarchies=new Set();
 const validBounds=b=>b&&Number.isFinite(b.top)&&Number.isFinite(b.bottom)&&b.bottom>b.top;
 for(const scale of [1,1.5]){
  const matches=configs.filter(c=>c.fontScale===scale);require(matches.length===1,'GRAMMAR_UI_FONT_MISSING:'+scale);const c=matches[0];if(!c)continue;
  require(c.widthDp===320,'GRAMMAR_UI_WIDTH:'+scale);
  for(const stage of ['keyboard-closed','keyboard-open','after-submit','multi-before','multi-after']){
   const rows=(stage.startsWith('multi')?c.multi:c.typed)??[],matches=rows.filter(r=>r.step===stage);require(matches.length===1,'GRAMMAR_UI_CAPTURE:'+scale+':'+stage);const r=matches[0];if(!r)continue;
   require(artifact(r.screenshot)&&artifact(r.hierarchy)&&artifact(r.imeEvidence),'GRAMMAR_UI_ARTIFACT:'+scale+':'+stage);
   if(artifact(r.hierarchy)&&artifact(r.imeEvidence)){
    try{const source=JSON.parse(readFileSync(r.imeEvidence,'utf8')),observed=grammarUiCapture(readFileSync(r.hierarchy,'utf8'),{...source,step:stage});
     require(source.fontScale===scale&&source.width===r.viewport.width&&source.height===r.viewport.bottom&&source.density===r.viewport.density,'GRAMMAR_UI_DISPLAY_SOURCE:'+scale+':'+stage);
     for(const key of ['input','submit','result'])require((observed[key]?.top??null)===(r[key]?.top??null)&&(observed[key]?.bottom??null)===(r[key]?.bottom??null),'GRAMMAR_UI_GEOMETRY_SOURCE:'+key);
     require(observed.keyboard.visible===r.keyboard.visible&&(stage!=='keyboard-open'||observed.keyboard.top===r.keyboard.top&&observed.keyboard.imeId===r.keyboard.imeId),'GRAMMAR_UI_IME_SOURCE:'+scale+':'+stage);
     require(JSON.stringify(observed.options.map(({id,top,bottom})=>({id,top,bottom})))===JSON.stringify((r.options??[]).map(({id,top,bottom})=>({id,top,bottom}))),'GRAMMAR_UI_OPTIONS_SOURCE:'+scale+':'+stage);
    }catch{require(false,'GRAMMAR_UI_SOURCE_INVALID:'+scale+':'+stage);}
   }
   require(!screenshots.has(r.screenshot)&&!hierarchies.has(r.hierarchy),'GRAMMAR_UI_DUPLICATE_CAPTURE');screenshots.add(r.screenshot);hierarchies.add(r.hierarchy);
   require(validBounds(r.viewport)&&r.viewport.width/(r.viewport.density/160)===320,'GRAMMAR_UI_VIEWPORT:'+scale+':'+stage);
   if(stage==='keyboard-closed'||stage==='keyboard-open')require(validBounds(r.input)&&validBounds(r.submit)&&r.input.top>=r.viewport.top&&r.submit.bottom<=r.viewport.bottom,'GRAMMAR_UI_CONTROLS:'+scale+':'+stage);
   if(stage==='keyboard-closed')require(r.keyboard?.visible===false,'GRAMMAR_UI_CLOSED_IME:'+scale);
   if(stage==='keyboard-open')require(r.keyboard?.visible===true&&typeof r.keyboard.imeId==='string'&&r.keyboard.imeId.includes('/')&&Number.isFinite(r.keyboard.top)&&r.input?.bottom<=r.keyboard.top&&r.submit?.bottom<=r.keyboard.top,'GRAMMAR_UI_IME_OVERLAP:'+scale);
   if(stage==='after-submit')require(validBounds(r.result)&&validBounds(r.submit)&&r.submit.bottom<=r.viewport.bottom&&(r.keyboard?.visible!==true||r.submit.bottom<=r.keyboard.top),'GRAMMAR_UI_SUBMISSION:'+scale);
  }
  const a=c.multi?.find(r=>r.step==='multi-before'),b=c.multi?.find(r=>r.step==='multi-after');
  const first=a?.options?.find(o=>o.id===c.firstOptionId),last=b?.options?.find(o=>o.id===c.lastOptionId),oldLast=a?.options?.find(o=>o.id===c.lastOptionId),nextFirst=b?.options?.find(o=>o.id===c.firstOptionId);
  require(validBounds(first)&&validBounds(last)&&last.top>=b?.viewport.top&&last.bottom<=b?.viewport.bottom&&(!nextFirst||nextFirst.top<first.top||!oldLast||last.top<oldLast.top),'GRAMMAR_UI_MULTI_SCROLL:'+scale);
 }
 return {ok:errors.length===0,errors};
}
