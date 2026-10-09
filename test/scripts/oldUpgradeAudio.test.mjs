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
   if(c.runFlow?.when?.visible?.id==='nav-more'){if(schema===6)execute(c.runFlow.commands);}
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
