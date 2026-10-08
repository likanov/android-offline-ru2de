import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyScenarioState} from '../../scripts/regression-state.mjs';
test('twenty_ui_answers_cannot_pass_with_seeded_xp_or_no_answers',()=>{
 const backup={profiles:[{profile:{name:'Регрессия — 20 UI',xp:250},attempts:[],rewards:[],words:[],progress:[]}]};
 assert.equal(verifyScenarioState('learning.twenty-ui-answers',backup).ok,false);
});
test('persistence_rejects_zero_xp_and_lost_attempts',()=>{
 const before={profiles:[{profile:{name:'Миграция UI',xp:250},attempts:[{attemptId:'a'}],words:[{de:'Stuhl'}],progress:[{streak:20}],rewards:[{amount:50}],sessions:[]}]};
 const after={profiles:[{...before.profiles[0],profile:{name:'Миграция UI',xp:0},attempts:[]}]};
 assert.equal(verifyScenarioState('persistence-force-stop.saved-session-xp',after,{before}).ok,false);
});
test('upgrade_rejects_lost_word_reward_or_missing_topics',()=>{
 const p={profile:{name:'Миграция UI',xp:250},attempts:[{attemptId:'a'}],words:[{de:'Stuhl'}],progress:[{streak:20}],rewards:[{amount:50}],sessions:[],topics:[],wordTopics:[]};
 assert.equal(verifyScenarioState('upgrade.topic-migration',{profiles:[p]},{before:{profiles:[p]}}).ok,false);
});
function masteredUi(){return {profile:{name:'Регрессия — 20 UI',xp:250},words:[{id:'stuhl',de:'Stuhl'}],progress:[{wordId:'stuhl',streak:20,learned:1,dueDate:'2026-10-04'}],attempts:Array.from({length:20},(_,i)=>({attemptId:String(i),right:1,xpDelta:i===19?60:10})),rewards:[{amount:50}],sessions:[{id:'s',currentQuestion:{attemptId:'19'},result:{xpDelta:60}}]};}
test('twenty_real_answers_accept_exact_reward_and_reject_duplicate_bonus',()=>{
 const p=masteredUi(),backup={profiles:[p]};
 assert.deepEqual(verifyScenarioState('learning.twenty-ui-answers',backup,{fixtureDay:'2026-10-03'}),{ok:true,errors:[]});
 assert.equal(verifyScenarioState('learning.twenty-ui-answers',{profiles:[{...p,rewards:[...p.rewards,{amount:50}]}]},{fixtureDay:'2026-10-03'}).ok,false);
});
test('persistence_accepts_nonzero_mastery_and_rejects_changed_saved_session',()=>{
 const p=masteredUi(),before={profiles:[p]},after=structuredClone(before);
 assert.deepEqual(verifyScenarioState('persistence-reboot.saved-session-xp',after,{before}),{ok:true,errors:[]});
 after.profiles[0].sessions[0].currentQuestion.attemptId='different';
 assert.equal(verifyScenarioState('persistence-reboot.saved-session-xp',after,{before}).ok,false);
});
test('json_roundtrip_rejects_lost_aid_word_and_learning_links',()=>{
 const p={profile:{name:'Reg',xp:10},words:[{id:'w',de:'Stuhl'}],attempts:[{xpDelta:10}],rewards:[],aids:[{content:'saved helper'}],aidWords:[{wordId:'w'}],progress:[{wordId:'w',streak:1}],skillStats:[],skillHistory:[],dailyActivity:[],sessions:[],questions:[],topics:[],wordTopics:[]};
 const restored={...p,profile:{name:'Reg восстановлено 2',xp:10},aidWords:[]};
 assert.equal(verifyScenarioState('transfer.json-roundtrip',{profiles:[p,restored]},{before:{profiles:[p]}}).ok,false);
});

test('grammar_state_checks_target_and_joint_ledger',()=>{
 const profileId='p';
 const grammarAttempt={result:{attemptId:'ga',targetId:'pronoun-cloze:ich',right:true,xpDelta:10,state:{streak:1,mastered:false,masteryBonusGranted:false,reviewStage:0,dueDay:null,difficult:false,totalErrors:0,recoveryErrors:0,recoveryCorrect:0},submittedAnswer:{kind:'choice',optionId:'ich'}},profileId,sessionId:'gs',targetId:'pronoun-cloze:ich',day:'2026-10-03'};
 const part={profile:{name:'Грамматика',id:profileId,xp:10},words:[],progress:[],attempts:[],rewards:[],dailyActivity:[{day:'2026-10-03',correct:1,errors:0,xp:10}],grammar:{progress:[{targetId:'pronoun-cloze:ich',state:grammarAttempt.result.state,attemptCount:1,variantIndex:1}],attempts:[grammarAttempt],sessions:[],questions:[] ,rewards:[]}};
 const result=verifyScenarioState('grammar-progress.combined-summary',{profiles:[part]},{fixtureDay:'2026-10-03'});
 assert.equal(result.ok,false,'a grammar attempt without its answered question must not pass');
 assert.ok(result.errors.some(error=>error.includes('GRAMMAR_')));
});

test('v3_state_comparison_checks_both_catalogs',async()=>{
 const module=await import('../../scripts/regression-state.mjs');
 assert.equal(typeof module.compareBackupGraphs,'function');
 const source={version:3,profiles:[{profile:{id:'p',name:'R',xp:0},grammar:{catalogVersions:[1,2],progress:[{targetId:'sein-cloze:ich'},{targetId:'yesno-transform:noun'}],questions:[{question:{catalogVersion:2,presentation:'sentence',expected:{sentences:['Ist das ein Haus?']}}}],rewards:[{targetId:'sein-cloze:ich',amount:50},{targetId:'yesno-transform:noun',amount:50}]}}]};
 assert.equal(module.compareBackupGraphs(source,structuredClone(source)).ok,true);
 for(const mutate of [b=>b.profiles[0].grammar.catalogVersions.pop(),b=>b.profiles[0].grammar.questions[0].question.expected.sentences[0]='bad',b=>b.profiles[0].grammar.rewards.pop()]){const after=structuredClone(source);mutate(after);assert.equal(module.compareBackupGraphs(source,after).ok,false);}
});

test('v3_roundtrip_uses_new_profiles_after_multiple_prior_name_collisions',()=>{
 const make=(id,name)=>({profile:{id,name,xp:0},words:[],attempts:[],rewards:[],progress:[],grammar:{catalogVersions:[1,2],sessions:[],questions:[],attempts:[],progress:[],rewards:[]}});
 for(const count of [1,2]){
  const profiles=[make('p','A1 — словарь'),...Array.from({length:count},(_,i)=>make('old'+i,'A1 — словарь восстановлено '+(i+2)))];
  const before={version:3,profiles};
  const names=['A1 — словарь восстановлено '+(count+2),...profiles.slice(1).map(p=>p.profile.name+' восстановлено 2')];
  const after={version:3,profiles:[...structuredClone(profiles),...profiles.map((p,i)=>make('new'+i,names[i]))]};
  assert.deepEqual(verifyScenarioState('extended-vocabulary.backup3-roundtrip',after,{before}),{ok:true,errors:[]});
  after.profiles.at(-1).grammar.catalogVersions=[1];
  assert.equal(verifyScenarioState('extended-vocabulary.backup3-roundtrip',after,{before}).ok,false);
 }
});
