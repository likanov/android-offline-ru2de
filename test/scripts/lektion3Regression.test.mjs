import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import * as reports from '../../scripts/regression-report.mjs';
import * as runner from '../../scripts/emulator-regression.mjs';
import {runRetainedUpgrade} from '../../scripts/regression-upgrade.mjs';
import {maestroOutcome} from '../../scripts/regression-evidence.mjs';
import {verifyScenarioState} from '../../scripts/regression-state.mjs';
const required={
 'grammar-rules':['ten-answer-mastery','nine-error-reset','schema8-ten-upgrade','legacy-backup-conversion','backup4-roundtrip','word-threshold-twenty','profiles-reviews'],
 'grammar-lektion3':['three-lessons','article-choice-typing','plural-correct-error','invariant-exact-set','empty-dictionary','keyboard-small-large','reference-help-return','force-stop-reboot','profile-isolation','backup4-roundtrip']};
test('new blocks require every named check and state artifact, APK hash and non-skipped JUnit',()=>{
 const dir=mkdtempSync(tmpdir()+'/l3-contract-');
 try{const file=(name,text)=>{const path=dir+'/'+name;writeFileSync(path,text);return path;};const apk=file('apk','apk'),model=file('model','model'),state=file('state','{}');
 for(const [block,checks]of Object.entries(required)){
  assert.deepEqual(reports.matrixRowForBlock(block).checks.map(c=>c.id),checks.map(c=>block+'.'+c));
  const scenarios=[block,...checks.map(c=>block+'.'+c)].map(id=>({id,status:'passed',apkSha256:reports.sha256File(apk),junit:file(id+'.xml',`<testsuite><testcase name="${id}"/></testsuite>`),stateEvidence:state,stateValidation:{ok:true}}));
  const report={status:'passed',runMode:{type:'block',block},apk:{path:apk,sha256:reports.sha256File(apk)},model:{path:model,sha256:reports.sha256File(model)},scenarios};
  // grammar-rules additionally requires complete schema8 retained-upgrade evidence.
  if(block==='grammar-lektion3')assert.equal(reports.validateBlockRegressionReport(report,block).ok,true);
  for(const mutate of [r=>r.scenarios.shift(),r=>r.scenarios.pop(),r=>r.scenarios[1].apkSha256='f'.repeat(64),r=>delete r.scenarios[1].stateEvidence]){const bad=structuredClone(report);mutate(bad);assert.equal(reports.validateBlockRegressionReport(bad,block).ok,false);}
  writeFileSync(scenarios[1].junit,`<testcase name="${scenarios[1].id}"><skipped/></testcase>`);assert.equal(reports.validateBlockRegressionReport(report,block).ok,false);
 }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('standalone new blocks require only their own fixtures and baselines while full requires all',()=>{
 assert.deepEqual(runner.requiredRegressionInputs('grammar-lektion3'),['lektion3-fixture']);
 assert.deepEqual(runner.requiredRegressionInputs('grammar-rules'),['grammar-rules-fixture','schema8-apk']);
 for(const key of ['fixture','grammar-fixture','lektion2-fixture','grammar-rules-fixture','lektion3-fixture','schema8-apk','previous-apk','grammar-previous-apk','schema6-apk','dictionary-fixture','dictionary-large-fixture'])assert.ok(runner.requiredRegressionInputs().includes(key),key);
});
test('zero-exit skipped JUnit is not a passed Maestro run',()=>assert.notEqual(maestroOutcome(0,'<testcase><skipped/></testcase>').status,'passed'));
test('schema8 replacement exports before/after/relaunch and imports the historical fixture before upgrade',async()=>{
 const events=[];const result=await runRetainedUpgrade({schema:8,previousApk:'schema8',finalApk:'latest10',install:async(p,r)=>events.push(['install',p,r]),launch:async()=>events.push(['launch']),flow:async id=>events.push(['flow',id]),capture:async id=>{events.push(['capture',id]);return id;}});
 assert.deepEqual(events,[['install','schema8',false],['flow','schema8-grammar-before'],['capture','schema8-before'],['install','latest10',true],['launch'],['capture','schema8-after'],['launch'],['capture','schema8-repeat']]);assert.equal(result.repeat,'schema8-repeat');
});
test('incomplete upgrade and stale backup expected answers cannot pass',()=>{
 assert.equal(typeof reports.validateSchema8Upgrade,'function');assert.equal(reports.validateSchema8Upgrade({}).ok,false);
 const empty={version:4,profiles:[{profile:{id:'p',name:'L3 — noun-article',xp:0},attempts:[],grammar:{catalogVersions:[1,2,3],rulesVersion:2,rulesTransitions:[],attempts:[],progress:[],sessions:[],questions:[],rewards:[]}}]};
 assert.equal(verifyScenarioState('grammar-rules.schema8-ten-upgrade',empty,{before:empty}).ok,false);
 assert.equal(verifyScenarioState('grammar-lektion3.article-choice-typing',empty,{before:empty}).ok,false);
});

test('schema8 report rereads transition/checkpoint evidence and rejects incomplete or altered upgrade',async()=>{
 const {syntheticSchema8Evidence}=await import('./lektion3RegressionFixtures.mjs');
 const {readFileSync}=await import('node:fs');const dir=mkdtempSync(tmpdir()+'/schema8-report-');
 try{
  const file=(name,text)=>{const path=dir+'/'+name;writeFileSync(path,text);return path;};const apk=file('new.apk','new apk');
  const block='grammar-rules';const scenarios=reports.scenarioIdsForBlock(block).map(id=>({id,status:'passed',apkSha256:reports.sha256File(apk),junit:file(id+'.xml',`<testcase name="${id}"/>`),stateEvidence:file(id+'.json','{}'),stateValidation:{ok:true}}));
  const schema8Upgrade=syntheticSchema8Evidence(dir,reports.sha256File(apk),scenarios);
  const report={status:'passed',runMode:{type:'block',block},apk:{path:apk,sha256:reports.sha256File(apk)},scenarios,schema8Upgrade};
  assert.deepEqual(reports.validateBlockRegressionReport(report,block),{ok:true,errors:[]});
  for(const mutate of [r=>delete r.schema8Upgrade.repeatEvidence,r=>delete r.schema8Upgrade.beforeEvidence,r=>r.schema8Upgrade.apkSha256='f'.repeat(64),r=>r.schema8Upgrade.finalCertificateSha256='f'.repeat(64)]){const bad=structuredClone(report);mutate(bad);assert.equal(reports.validateBlockRegressionReport(bad,block).ok,false);}
  const after=JSON.parse(readFileSync(schema8Upgrade.afterEvidence,'utf8'));
  for(const mutate of [b=>b.profiles[0].grammar.rulesTransitions[2].xpDelta=0,b=>b.profiles[0].grammar.progress[2].attemptCount++,b=>b.profiles[0].dailyActivity.at(-1).correct++,b=>b.profiles[0].grammar.rulesTransitions.pop()]){const bad=structuredClone(after);mutate(bad);writeFileSync(schema8Upgrade.afterEvidence,JSON.stringify(bad));assert.equal(reports.validateBlockRegressionReport(report,block).ok,false);}
  writeFileSync(schema8Upgrade.afterEvidence,JSON.stringify(after));const repeat=structuredClone(after);repeat.profiles[0].profile.xp+=50;writeFileSync(schema8Upgrade.repeatEvidence,JSON.stringify(repeat));assert.equal(reports.validateBlockRegressionReport(report,block).ok,false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('saved answer environment uses the exported option IDs and tokens independent of display order',()=>{
 const b={profiles:[{profile:{name:'L3 — noun-article'},grammar:{sessions:[{status:'active',currentQuestion:{responseMode:'choice',expected:{optionId:'das'},options:[{id:'die'},{id:'das'},{id:'der'}]}}]}},{profile:{name:'L3 — noun-plural'},grammar:{sessions:[{status:'active',currentQuestion:{responseMode:'typed',expected:{phrases:['die Bücher']}}}]}}]};
 const env=runner.savedGrammarAnswers(b);assert.equal(env.OPTION_L3_NOUN_ARTICLE,'das');assert.equal(env.ANSWER_L3_NOUN_PLURAL,'die Bücher');
 b.profiles[0].grammar.sessions[0].currentQuestion.options.reverse();assert.equal(runner.savedGrammarAnswers(b).OPTION_L3_NOUN_ARTICLE,'das');
});
