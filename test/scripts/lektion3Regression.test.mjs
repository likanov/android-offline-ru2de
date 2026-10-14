import {syntheticGrammarUiEvidence} from './grammarUiEvidenceFixtures.mjs';
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync,rmSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import * as reports from '../../scripts/regression-report.mjs';
import * as runner from '../../scripts/emulator-regression.mjs';
import {runRetainedUpgrade} from '../../scripts/regression-upgrade.mjs';
import {maestroOutcome} from '../../scripts/regression-evidence.mjs';
import {verifyScenarioState} from '../../scripts/regression-state.mjs';
const required={
 'grammar-rules':['ten-answer-mastery','nine-error-reset','schema8-ten-upgrade','legacy-backup-conversion','backup4-roundtrip','word-threshold-twenty','profiles-reviews'],
 'grammar-lektion3':['three-lessons','article-choice-typing','plural-correct-error','invariant-exact-set','empty-dictionary','keyboard-small-large','reference-help-return','force-stop-reboot','profile-isolation','backup4-roundtrip']};
test('Lektion3 multi-choice submissions reveal the button below long option lists before tapping',()=>{
 for(const name of ['three-lessons','invariant-exact-set']){
  const commands=JSON.parse(readFileSync('e2e/checks/grammar-lektion3.'+name+'.yaml','utf8').split('---\n')[1]);
  const submissions=commands.map((c,i)=>c.tapOn?.id==='grammar-multi-submit'?i:-1).filter(i=>i>=0);
  assert.ok(submissions.length>0,name);
  for(const i of submissions)assert.deepEqual(commands[i-1],{runFlow:{file:'../helpers/ensure-visible-below.yaml',env:{TARGET_TEXT:'Проверить'}}},name+': submit may be below the viewport after selecting options');
 }
});
test('keyboard-open flow scrolls the controls above the IME after typing without hiding it',()=>{
 const steps=JSON.parse(readFileSync('e2e/checks/grammar-lektion3.keyboard-small-large.yaml','utf8').split('---\n')[1]);
 const commands=steps.find(c=>c.runFlow?.when?.true==="${UI_STAGE === 'keyboard-open'}").runFlow.commands;
 const input=commands.findIndex(c=>c.inputText),scroll=commands.findIndex(c=>c.swipe?.from?.id==='screen-scroll'&&c.swipe.direction==='UP'),capture=commands.findIndex(c=>c.takeScreenshot);
 assert.ok(input>=0&&scroll>input&&capture>scroll,'typing can leave submit partly covered; scroll before open capture');
 assert.equal(commands.some(c=>c.hideKeyboard||c.back),false,'the required capture keeps the real IME visible');
});
test('keyboard-closed flow reveals submit below a large-font prompt before checking both controls',()=>{
 const steps=JSON.parse(readFileSync('e2e/checks/grammar-lektion3.keyboard-small-large.yaml','utf8').split('---\n')[1]);
 const commands=steps.find(c=>c.runFlow?.when?.true==="${UI_STAGE === 'keyboard-closed'}").runFlow.commands;
 const open=commands.findIndex(c=>c.runFlow?.file==='../helpers/open-lektion3-lesson.yaml'),reveal=commands.findIndex(c=>c.runFlow?.file==='../helpers/ensure-visible-below.yaml'&&c.runFlow.env?.TARGET_TEXT==='Проверить'),input=commands.findIndex(c=>c.assertVisible?.id==='grammar-answer-input'),submit=commands.findIndex(c=>c.assertVisible?.id==='grammar-submit');
 assert.ok(open>=0&&reveal>open&&input>reveal&&submit>input,'fontScale1.5 puts submit below the closed-keyboard viewport');
});
test('new blocks require every named check and state artifact, APK hash and non-skipped JUnit',()=>{
 const dir=mkdtempSync(tmpdir()+'/l3-contract-');
 try{const file=(name,text)=>{const path=dir+'/'+name;writeFileSync(path,text);return path;};const apk=file('apk','apk'),model=file('model','model'),state=file('state','{}');
 for(const [block,checks]of Object.entries(required)){
  assert.deepEqual(reports.matrixRowForBlock(block).checks.map(c=>c.id),checks.map(c=>block+'.'+c));
  const scenarios=[block,...checks.map(c=>block+'.'+c)].map(id=>({id,status:'passed',apkSha256:reports.sha256File(apk),junit:file(id+'.xml',`<testsuite><testcase name="${id}"/></testsuite>`),stateEvidence:state,stateValidation:{ok:true}}));
  const report={grammarUi:syntheticGrammarUiEvidence(dir,reports.sha256File(apk)),status:'passed',runMode:{type:'block',block},apk:{path:apk,sha256:reports.sha256File(apk)},model:{path:model,sha256:reports.sha256File(model)},scenarios};
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
test('grammar fixture import uses the exact V2 V3 or V4 profile count without a flow default',()=>{
 const dir=mkdtempSync(tmpdir()+'/grammar-import-count-');
 try{
  for(const [version,count,name]of [[2,10,'grammar-backup-v2.json'],[3,10,'lektion2-backup-v3.json'],[4,5,'grammar-rules-backup-v4.json'],[4,7,'lektion3-backup-v4.json'],[3,2,'grammar-rules-schema8-backup-v3.json']]){
   const path=dir+'/'+name;writeFileSync(path,JSON.stringify({format:'german-vocabulary-backup',version,profiles:Array.from({length:count},(_,i)=>({profile:{id:'p'+i,name:'Profile '+i}}))}));
   assert.deepEqual(runner.grammarFixtureImportEnvironment(path,name,version),{BACKUP_FILE:name,PROFILE_COUNT:String(count)});
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('effective Maestro grammar entry preserves an alternate error profile and due-review start',()=>{
 const header=readFileSync('e2e/helpers/open-grammar-training.yaml','utf8').split('---\n')[0];
 const local=Object.fromEntries([...header.matchAll(/^  (PROFILE|GRAMMAR_START_ID): (.+)$/gm)].map(m=>[m[1],m[2]]));
 for(const requested of [{PROFILE:'Грамматика — ошибка 19',GRAMMAR_START_ID:'training-grammar-start'},{PROFILE:'Грамматика — повторение',GRAMMAR_START_ID:'grammar-review-start'}]){
  // Device commands.json confirms flow defineVariables runs after CLI variables.
  const effective={...runner.regressionFlowEnvironment(requested),...local};
  assert.equal(effective.PROFILE,requested.PROFILE);assert.equal(effective.GRAMMAR_START_ID,requested.GRAMMAR_START_ID);
 }
 assert.equal(runner.regressionFlowEnvironment().PROFILE,'Грамматика — 18 целей');
 assert.equal(runner.regressionFlowEnvironment().GRAMMAR_START_ID,'training-grammar-start');
});
test('every standalone block derives its startup day from its minimal advertised fixture inputs',()=>{
 const dir=mkdtempSync(tmpdir()+'/block-startup-');
 try{
  assert.equal(typeof runner.regressionFixtureDay,'function');
  for(const block of reports.BLOCK_IDS){
   const options={block};for(const key of runner.requiredRegressionInputs(block)){const path=dir+'/'+block+'-'+key;writeFileSync(path,JSON.stringify({profiles:[{profile:{name:'Fixture'},attempts:[{day:'2026-10-13'}]}]}));options[key]=path;}
   assert.equal(runner.regressionFixtureDay(options),'2026-10-13',block);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
test('rules upgrade permits only the required auto-mastery pending study cancellation',async()=>{
 const {syntheticSchema8Evidence}=await import('./lektion3RegressionFixtures.mjs');const {compareGrammarRulesUpgrade}=await import('../../scripts/regression-state.mjs');
 const dir=mkdtempSync(tmpdir()+'/cancel-comparator-');try{
  const e=syntheticSchema8Evidence(dir,'f'.repeat(64),[]);const before=JSON.parse(readFileSync(e.beforeEvidence)),after=JSON.parse(readFileSync(e.afterEvidence));
  const g=before.profiles[0].grammar,h=after.profiles[0].grammar;
  for(const [id,index,mode]of [['auto',2,'study'],['nine',1,'study'],['review',4,'review']]){
   const q={attemptId:id,sessionId:id,targetId:g.progress[index].targetId,expected:{token:'ich'}};
   g.questions.push({status:'active',question:q});g.sessions.push({id,status:'active',selection:{mode},currentQuestion:q,result:null});
  }
  h.questions=structuredClone(g.questions);h.sessions=structuredClone(g.sessions);h.questions[0].status='cancelled';h.sessions[0].currentQuestion=null;
  const check=b=>compareGrammarRulesUpgrade(before,b,{day:'2026-10-13',requireBoundaries:true});assert.deepEqual(check(after),{ok:true,errors:[]});
  for(const mutate of [b=>b.profiles[0].grammar.questions[0].question.expected.token='changed',b=>b.profiles[0].grammar.sessions[1].currentQuestion=null,b=>b.profiles[0].grammar.questions[2].status='cancelled',b=>b.profiles[0].grammar.questions[0].status='active']){const bad=structuredClone(after);mutate(bad);assert.equal(check(bad).ok,false);}
 }finally{rmSync(dir,{recursive:true,force:true});}
});
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

test('V4 roundtrip accepts later restored suffixes and rejects a missing or duplicated new copy',()=>{
 const make=(id,name)=>({profile:{id,name,xp:0},words:[],progress:[],attempts:[],rewards:[],dailyActivity:[],grammar:{catalogVersions:[1,2,3],rulesVersion:2,rulesTransitions:[],progress:[],sessions:[],questions:[],attempts:[],rewards:[]}});
 for(const [suffix,names]of [[3,['Repeat восстановлено 3','Repeat восстановлено 2 восстановлено 2']],[4,['Repeat восстановлено 4','Repeat восстановлено 2 восстановлено 2','Repeat восстановлено 3 восстановлено 2']]]){
  const profiles=[make('original','Repeat'),make('existing2','Repeat восстановлено 2'),...(suffix===4?[make('existing3','Repeat восстановлено 3')]:[])];
  const before={version:4,profiles},after={version:4,profiles:[...structuredClone(profiles),...profiles.map((p,i)=>make('new'+i,names[i]))]};
  for(const id of ['grammar-rules.backup4-roundtrip','grammar-lektion3.backup4-roundtrip']){
   assert.deepEqual(verifyScenarioState(id,after,{before}),{ok:true,errors:[]});
   const missing=structuredClone(after);missing.profiles.pop();assert.equal(verifyScenarioState(id,missing,{before}).ok,false);
   const duplicate=structuredClone(after);duplicate.profiles.at(-1).profile.name=names[0];assert.equal(verifyScenarioState(id,duplicate,{before}).ok,false);
  }
 }
});

test('legacy detailed grammar checks enter their profile/question after export and device preparation',async()=>{
 assert.equal(typeof runner.prepareDetailedGrammarCheck,'function');
 for(const id of ['grammar-core.pronouns-sein-choice','grammar-core.typing-case-context','grammar-core.reference-no-xp','grammar-core.empty-dictionary-fallback','grammar-core.keyboard-320dp','grammar-progress.twenty-ui-answers','grammar-progress.nineteen-error','grammar-progress.bonus-once-double-submit','grammar-persistence.profile-isolation','grammar-persistence.force-stop-reboot','grammar-persistence.word-dependency-edit','grammar-transfer-assistant.no-model-rule','grammar-transfer-assistant.real-model-cancel']){
  const events=[];let screen='elsewhere';const before={profiles:[]};
  const result=await runner.prepareDetailedGrammarCheck({id},{capture:async()=>{events.push('capture');screen='transfer';return before;},prepareDevice:async()=>{events.push('device');screen='transfer';},flow:async(name,file,env)=>{events.push('question');assert.equal(screen,'transfer');assert.equal(file,'helpers/open-grammar-training.yaml');assert.ok(env.PROFILE);screen='grammar';}});
  assert.equal(result,before);assert.deepEqual(events,['capture','device','question']);assert.equal(screen,'grammar',id);
 }
});

test('schema8 rejects another commit sharing the trusted seven-character prefix',()=>{
 const value={apkSha256:reports.SCHEMA8_BASELINE_SHA256,finalSha256:'f'.repeat(64),package:'com.personal.germanvocabulary',certificateSha256:reports.SCHEMA8_BASELINE_CERTIFICATE,finalCertificateSha256:reports.SCHEMA8_BASELINE_CERTIFICATE,provenance:{schemaVersion:8,sourceMapVerified:true,commit:'7828274'+'a'.repeat(33),sha256:reports.SCHEMA8_BASELINE_SHA256,package:'com.personal.germanvocabulary',certificateSha256:reports.SCHEMA8_BASELINE_CERTIFICATE}};
 assert.equal(reports.validateSchema8Upgrade(value).ok,false);
 value.provenance.commit='7828274b5f971281401a87683e72fe14cb6a2b29';assert.equal(reports.validateSchema8Upgrade(value).ok,true);
});


test('reviews-difficult advances to the fixture due day before entering the due review',async()=>{
 const before={profiles:[{profile:{name:'Грамматика — повторение'},grammar:{progress:[{targetId:'sein-cloze:sie_formal',attemptCount:21,state:{mastered:true,dueDay:'2026-10-16',reviewStage:1}}],sessions:[{status:'active',selection:{mode:'study'}}]}}]};
 const events=[];const result=await runner.prepareDetailedGrammarCheck({id:'grammar-progress.reviews-difficult'},{capture:async()=>{events.push('capture');return before;},prepareDevice:async()=>events.push('device'),advanceClock:async day=>events.push('clock:'+day),flow:async(id,file,env)=>{events.push('review');assert.equal(env.PROFILE,'Грамматика — повторение');assert.equal(env.GRAMMAR_START_ID,'grammar-review-start');}});
 assert.equal(result,before);assert.deepEqual(events,['capture','device','clock:2026-10-16','review']);
});

test('Lektion3 reference/help navigation reveals controls below long feedback before tapping',()=>{
 const commands=JSON.parse(readFileSync('e2e/checks/grammar-lektion3.reference-help-return.yaml','utf8').split('---\n')[1]);
 for(const [id,title]of [['grammar-error-open','Объяснить ошибку'],['К тренировке','К тренировке'],['grammar-reference-open','Справочник']]){
  const index=commands.findIndex(c=>c.tapOn?.id===id||c.tapOn===id);assert.ok(index>0,id);
  assert.deepEqual(commands[index-1],{runFlow:{file:'../helpers/ensure-visible-below.yaml',env:{TARGET_TEXT:title}}},id+' can be below the viewport after restored long feedback');
 }
});
