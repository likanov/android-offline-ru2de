import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync('e2e/helpers/answer-label.js','utf8');
const yaml=readFileSync('e2e/upgrade-before.yaml','utf8');
const commands=JSON.parse(yaml.split('---\n')[1]);
function fixture(){return JSON.parse(yaml.match(/^env: (.+)$/m)?.[1]??'{}');}
function answer(prompt,env){const context={maestro:{copiedText:prompt},output:{},...env};runInNewContext(source,context);return context.output.answer;}
test('catalog_answer_uses_the_same_fixture_as_public_word_creation_and_rejects_other_words',()=>{
 const env={...fixture(),CATALOG_BASELINE:'true'};
 assert.equal(env.UPGRADE_WORD_DE,'Upgradeprobe');
 for(const prompt of [env.UPGRADE_WORD_DE,env.UPGRADE_WORD_RU,'der Upgradeprobe','Прослушайте слово'])assert.equal(answer(prompt,env).german,'der Upgradeprobe');
 assert.throws(()=>answer('das Haus',env),/selected fixture word/);
 assert.equal(answer('das Haus',{CATALOG_BASELINE:'false'}).german,'das Haus');
 assert.throws(()=>answer('Прослушайте слово',{CATALOG_BASELINE:'false'}),/Unexpected real question/);
 assert.ok(commands.some(c=>c.inputText==='${UPGRADE_WORD_DE}'));
 assert.ok(commands.some(c=>c.inputText==='${UPGRADE_WORD_RU}'));
 assert.ok(commands.some(c=>c.tapOn==='${UPGRADE_ARTICLE} — мужской род'));
});
test('catalog_public_topic_route_is_single_word_before_twenty_answers',()=>{
 for(const schema of [5,6]){
  let created=false,selected=false,one=false,eligible=false,started=false,answers=0,menu=false,topicVisits=0;
  function execute(rows){for(const c of rows){
   if(c.runFlow?.file==='helpers/old-open-topics.yaml')execute(JSON.parse(readFileSync('e2e/helpers/old-open-topics.yaml','utf8').split('---\n')[1]));
   else if(c.runFlow?.file==='old-open-navigation.yaml')execute(JSON.parse(readFileSync('e2e/helpers/old-open-navigation.yaml','utf8').split('---\n')[1].replaceAll('${OLD_NAV_ID}',c.runFlow.env.OLD_NAV_ID).replaceAll('${OLD_NAV_TEXT}',c.runFlow.env.OLD_NAV_TEXT)));
   else if(c.runFlow?.when?.visible?.id==='nav-more'){if(schema===6)execute(c.runFlow.commands);}
   else if(c.tapOn?.id==='nav-more'){assert.equal(schema,6);menu=true;}
   else if(c.tapOn==='Наборы'){assert.ok(schema===5||menu,'schema6 topic requires overflow navigation');menu=false;topicVisits++;}
   else if(c.runFlow?.when?.true){if(c.runFlow.when.true.includes("=== 'true'"))execute(c.runFlow.commands);}
   else if(c.tapOn==='Создать набор')created=true;
   else if(c.tapOn==='${UPGRADE_TOPIC}'){assert.ok(created);selected=true;}
   else if(c.assertVisible==='Слов в наборе: 1'){assert.ok(selected);one=true;}
   else if(c.assertVisible==='Доступно для изучения: 1')eligible=true;
   else if(c.tapOn==='Изучать набор'){assert.ok(one&&eligible);started=true;}
   else if(c.repeat?.times===19)for(let i=0;i<19;i++)execute(c.repeat.commands);
   else if(c.runFlow?.file==='helpers/old-answer.yaml'){assert.ok(started,'schema'+schema+': controlled topic must start before answers');answers++;}
  }}
  execute(commands);assert.equal(answers,20);assert.ok(started);assert.equal(topicVisits,2);
 }
});
test('old_audio_branch_verifies_listening_prompt_then_types_and_submits_normal_answer',()=>{
 const rows=JSON.parse(readFileSync('e2e/helpers/old-answer.yaml','utf8').split('---\n')[1]);
 const branch=rows.find(c=>c.runFlow?.when?.visible?.id==='training-prompt-listening')?.runFlow.commands;
 assert.ok(branch,'listening needs a real typed answer branch');
 const input=branch.findIndex(c=>c.inputText==='${output.answer.german}');
 assert.ok(branch.slice(0,input).some(c=>c.assertVisible?.id==='training-prompt-listening'&&c.assertVisible.text==='Прослушайте слово'));
 assert.ok(branch.slice(input+1).some(c=>c.tapOn==='Проверить'));
 assert.equal(rows.at(-1).assertVisible,'Верно!.*');
});
test('both_old_topics_visits_share_one_compatibility_navigation_helper',()=>{
 const visits=[];
 function visit(rows){for(const c of rows){
  if(c.runFlow?.file==='helpers/old-open-topics.yaml')visits.push(c);
  assert.notEqual(c.runFlow?.when?.visible?.id,'nav-more','version-sensitive Topics routing belongs in the shared helper');
  if(c.runFlow?.commands)visit(c.runFlow.commands);
 }}
 visit(commands);assert.equal(visits.length,2);
});
test('effective_Maestro_env_selects_catalog_for_retained_schemas_and_legacy_for_Task5',async()=>{
 const {regressionFlowEnvironment}=await import('../../scripts/emulator-regression.mjs');
 const conditions=commands.filter(c=>c.runFlow?.when?.true).map(c=>c.runFlow.when.true.slice(2,-1));
 assert.equal(conditions.length,4);
 for(const baseline of ['schema5','schema6','Task5']){
  const cli=baseline==='Task5'?{}:{CATALOG_BASELINE:'true'};
  // Retained commands.json proves flow env defineVariables runs after CLI values.
  const effective={...(regressionFlowEnvironment?regressionFlowEnvironment(cli):cli),...fixture()};
  const selected=conditions.map(code=>runInNewContext(code,effective));
  assert.deepEqual(selected,baseline==='Task5'?[false,false,false,true]:[true,true,true,false],baseline);
  assert.equal(effective.CATALOG_BASELINE,baseline==='Task5'?'false':'true');
 }
 assert.ok(regressionFlowEnvironment,'runner must explicitly supply the Task5 default');
});
test('post_mastery_profiles_navigation_supports_old_direct_and_overflow_layouts',()=>{
 const start=commands.findIndex(c=>c.assertVisible==='Серия: 20/20');
 const end=commands.findIndex((c,i)=>i>start&&c.repeat?.while?.notVisible==='.*250 XP.*');
 for(const schema of ['Task5',5,6]){
  let menu=false,profiles=false;
  function execute(rows,base='e2e',env={}){for(const raw of rows){
   const c=JSON.parse(JSON.stringify(raw).replace(/\$\{([^}]+)\}/g,(match,key)=>env[key]??match));
   if(c.runFlow?.file){const file=base+'/'+c.runFlow.file;execute(JSON.parse(readFileSync(file,'utf8').split('---\n')[1]),file.slice(0,file.lastIndexOf('/')),{...env,...c.runFlow.env});}
   else if(c.runFlow?.when?.visible?.id==='nav-more'){if(schema===6)execute(c.runFlow.commands,base,env);}
   else if(c.tapOn?.id==='nav-more')menu=true;
   else if(c.tapOn?.id==='nav-profiles'||c.tapOn==='Профили'){assert.ok(schema!==6||menu,'Profiles is inside schema6 overflow');profiles=true;}
   else if(c.repeat){} // reveal loops do not change which navigation surface owns Profiles
   else if(c.assertVisible){}
   else assert.fail('unexpected post-mastery command '+JSON.stringify(c));
  }}
  execute(commands.slice(start+1,end));assert.ok(profiles);
 }
});
test('return_to_training_resumes_retained_feedback_from_home_or_direct_route',()=>{
 const start=commands.findLastIndex(c=>c.tapOn?.id==='nav-training');assert.ok(start>0);
 for(const schema of ['Task5',5,6]){
  let screen=schema===6?'home':'feedback',starts=0,feedback=false;
  const retained={currentQuestion:{wordId:'Upgradeprobe'},result:{right:true,streak:20}};
  function execute(rows){for(const c of rows){
   if(c.runFlow?.when?.visible==='Изучать слова'){if(screen==='home')execute(c.runFlow.commands);}
   else if(c.tapOn==='Изучать слова'){assert.equal(screen,'home');assert.ok(retained.currentQuestion&&retained.result);screen='feedback';starts++;}
   else if(c.repeat){} // seeking cannot turn training home into retained feedback
   else if(c.assertVisible==='Верно!.*'){assert.equal(screen,'feedback','home is not retained answer feedback');feedback=true;}
   else if(c.runFlow?.when?.true){if(schema!== 'Task5')execute(c.runFlow.commands);}
   else if(c.assertVisible==='Серия: 20/20')assert.equal(retained.result.streak,20);
   else assert.fail('unexpected resume command '+JSON.stringify(c));
  }}
  execute(commands.slice(start+1));assert.ok(feedback);assert.equal(starts,schema===6?1:0);
 }
});
