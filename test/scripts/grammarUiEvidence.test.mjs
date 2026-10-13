import {test} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import * as reports from '../../scripts/regression-report.mjs';import {syntheticGrammarUiEvidence} from './grammarUiEvidenceFixtures.mjs';
test('grammar keyboard report requires both 320dp font configurations, real IME, submission and actual multi-option movement',()=>{
 const root=mkdtempSync(tmpdir()+'/grammar-ui-');try{
  assert.equal(typeof reports.validateGrammarUiEvidence,'function');
  const report={apk:{sha256:'a'.repeat(64)},grammarUi:syntheticGrammarUiEvidence(root,'a'.repeat(64))};assert.deepEqual(reports.validateGrammarUiEvidence(report),{ok:true,errors:[]});
  for(const mutate of [r=>delete r.grammarUi,r=>r.grammarUi['grammar-lektion3.keyboard-small-large'].apkSha256='b'.repeat(64),r=>r.grammarUi['grammar-lektion3.keyboard-small-large'].configurations.pop(),r=>r.grammarUi['grammar-lektion3.keyboard-small-large'].configurations[0].widthDp=360,r=>r.grammarUi['grammar-lektion3.keyboard-small-large'].configurations[0].typed.pop(),r=>r.grammarUi['grammar-lektion3.keyboard-small-large'].configurations[0].typed[1].input.bottom=501,r=>r.grammarUi['grammar-lektion3.keyboard-small-large'].configurations[0].typed[1].keyboard.imeId='',r=>r.grammarUi['grammar-lektion3.keyboard-small-large'].configurations[0].multi[1].options=structuredClone(r.grammarUi['grammar-lektion3.keyboard-small-large'].configurations[0].multi[0].options),r=>r.grammarUi['grammar-lektion3.keyboard-small-large'].configurations[1].typed[2].result=null]){const bad=structuredClone(report);mutate(bad);assert.equal(reports.validateGrammarUiEvidence(bad).ok,false);}
 }finally{rmSync(root,{recursive:true,force:true});}
});

test('active but hidden IME cannot satisfy open keyboard evidence even when bounds are present',async()=>{
 const {grammarUiCapture}=await import('../../scripts/grammar-ui-evidence.mjs');const root=mkdtempSync(tmpdir()+'/hidden-ime-');try{
  const report={apk:{sha256:'a'.repeat(64)},grammarUi:syntheticGrammarUiEvidence(root,'a'.repeat(64))};
  const r=report.grammarUi['grammar-lektion3.keyboard-small-large'].configurations[0].typed[1];
  const {readFileSync,writeFileSync}=await import('node:fs');const xml=readFileSync(r.hierarchy,'utf8');
  const windowDump='Window #0 Window{test InputMethod}:\n mHasSurface=false isOnScreen=false\n mWindowFrames: frame=[0,500][960,800]';
  for(const shown of [false,true]){
   const source={step:'keyboard-open',width:960,height:800,density:480,fontScale:1,imeId:'com.example.inputmethod/.IME',imeDump:'mInputShown='+shown+'\nmImeWindowVis=1',windowDump};
   assert.equal(grammarUiCapture(xml,source).keyboard.visible,false,'IME_ACTIVE is not IME_VISIBLE');
   writeFileSync(r.imeEvidence,JSON.stringify(source));assert.equal(reports.validateGrammarUiEvidence(report).ok,false);
  }
 }finally{rmSync(root,{recursive:true,force:true});}
});
