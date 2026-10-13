// Synthetic host contracts only; never Android acceptance artifacts.
import {writeFileSync} from 'node:fs';
export function syntheticGrammarUiEvidence(root,apkSha256){
 const file=(name,data)=>{const path=root+'/'+name;writeFileSync(path,data);return path;};
 const configurations=[1,1.5].map(fontScale=>{
  const capture=step=>({step,screenshot:file('grammar-'+fontScale+'-'+step+'.png','synthetic screenshot'),hierarchy:file('grammar-'+fontScale+'-'+step+'.xml','<hierarchy/>'),viewport:{top:0,bottom:800,width:960,density:480},keyboard:{visible:step==='keyboard-open',...(step==='keyboard-open'?{top:500,imeId:'com.example.inputmethod/.IME'}:{})},input:{top:250,bottom:380},submit:{top:400,bottom:460},...(step==='after-submit'?{result:{top:100,bottom:300}}:{})});
  return {widthDp:320,fontScale,typed:['keyboard-closed','keyboard-open','after-submit'].map(capture),multi:['multi-before','multi-after'].map((step,i)=>({...capture(step),options:[{id:'grammar-multi-option-first',top:100-i*50,bottom:160-i*50},{id:'grammar-multi-option-last',top:600-i*50,bottom:660-i*50}]})),firstOptionId:'grammar-multi-option-first',lastOptionId:'grammar-multi-option-last'};
 });
 for(const c of configurations)for(const r of [...c.typed,...c.multi]){
  r.imeEvidence=file('grammar-'+c.fontScale+'-'+r.step+'-ime.json',JSON.stringify({imeId:r.keyboard.imeId??'com.example.inputmethod/.IME',imeDump:'mInputShown='+r.keyboard.visible,fontScale:c.fontScale,width:960,height:800,density:480}));
  const node=(id,b,packageName='com.personal.germanvocabulary')=>`<node resource-id="${id}" package="${packageName}" bounds="[0,${b.top}][960,${b.bottom}]"/>`;
  const xml='<hierarchy>'+node('grammar-answer-input',r.input)+node(r.step==='after-submit'?'grammar-next':'grammar-submit',r.submit)+(r.result?node('grammar-result',r.result):'')+(r.keyboard.visible?node('ime',{top:500,bottom:800},'com.example.inputmethod'):'')+(r.options??[]).map(o=>node(o.id,o)).join('')+'</hierarchy>';writeFileSync(r.hierarchy,xml);
 }
 return {'grammar-lektion3.keyboard-small-large':{apkSha256,configurations}};
}
