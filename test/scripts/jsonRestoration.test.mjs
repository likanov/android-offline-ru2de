import {test} from 'node:test';
import assert from 'node:assert/strict';
import {verifyScenarioState} from '../../scripts/regression-state.mjs';
// Hand-built backup graph: arbitrary regenerated IDs must preserve all values
// and links, including references nested in persisted JSON payloads.
function profile() {
 const q={attemptId:'a',profileId:'p',wordId:'w',revision:1,kind:'ru-de',prompt:'контрольный стул',options:['der Prüfstuhl','der Tisch'],expected:['der Prüfstuhl'],markerVisible:true,reviewStage:null,dueDay:null};
 const state={streak:1,mastered:false,masteryBonusGranted:false,reviewStage:0,dueDay:null,difficult:false,totalErrors:0,recoveryErrors:0,recoveryCorrect:0};
 const result={attemptId:'a',right:true,xpDelta:10,state};
 return {profile:{id:'p',name:'Регрессия — продолжение',xp:10,createdAt:'2026-10-03T12:00:00Z'},settings:{profileId:'p',dailyGoal:20},words:[{id:'w',profileId:'p',de:'Prüfstuhl',ru:'контрольный стул',revision:1,note:'Заметка'},{id:'w2',profileId:'p',de:'Tisch',ru:'стол',revision:1,note:''}],topics:[{id:'t',profileId:'p',name:'Регрессия'}],wordTopics:[{profileId:'p',wordId:'w',topicId:'t'}],progress:[{profileId:'p',wordId:'w',streak:1,learned:0,bonusAwarded:0}],skillStats:[{profileId:'p',wordId:'w',skill:'translation',correct:1,errors:0,revision:1}],skillHistory:[{attemptId:'a',profileId:'p',wordId:'w',revision:1,skill:'translation',right:1,day:'2026-10-03'}],dailyActivity:[{profileId:'p',day:'2026-10-03',correct:1,errors:0,xp:10}],aids:[{id:'h',profileId:'p',stale:0,content:JSON.stringify({wordId:'w',revision:1,text:'Проверено: стул',sources:['Словарь']})}],aidWords:[{aidId:'h',profileId:'p',wordId:'w',revision:1}],sessions:[{id:'s',profileId:'p',mode:'study',wordIds:['w'],cursor:0,kindIndex:1,currentQuestion:q,result,status:'active'}],questions:[{attemptId:'a',profileId:'p',sessionId:'s',wordId:'w',revision:1,payload:{...q,nextKindIndex:1},status:'answered'}],attempts:[{attemptId:'a',profileId:'p',sessionId:'s',wordId:'w',right:1,xpDelta:10,result,day:'2026-10-03'}],rewards:[]};
}
function restored(p) {
 // Explicit test IDs; no production comparison helper builds the expectation.
 const ids={p:'new-p',w:'new-w',w2:'new-w2',t:'new-t',h:'new-h',s:'new-s',a:'new-a'};
 const r=JSON.parse(JSON.stringify(p).replace(/"(p|w2?|t|h|s|a)"/g,(_m,id)=>JSON.stringify(ids[id])));
 r.profile.name+=' восстановлено 2';
 const content=JSON.parse(r.aids[0].content);content.wordId='new-w';r.aids[0].content=JSON.stringify(content);
 return r;
}
function evidence() {
 const p=profile(),r=restored(p),before={profiles:[p]},restoreCheckpoint={profiles:[p,r]},after=structuredClone(restoreCheckpoint),target=after.profiles[1];
 const q={...target.sessions[0].currentQuestion,attemptId:'new-next',kind:'de-ru',prompt:'Prüfstuhl',options:['контрольный стул','стол'],expected:['контрольный стул']};
 const result={attemptId:'new-next',right:true,xpDelta:10,state:{...target.attempts[0].result.state,streak:2}};
 target.profile.xp=20;target.progress[0].streak=2;
 target.questions.push({attemptId:'new-next',profileId:'new-p',sessionId:'new-s',wordId:'new-w',revision:1,payload:{...q,nextKindIndex:2},status:'answered'});
 target.attempts.push({attemptId:'new-next',profileId:'new-p',sessionId:'new-s',wordId:'new-w',right:1,xpDelta:10,result,day:'2026-10-03'});
 target.sessions[0].currentQuestion=q;target.sessions[0].result=result;target.sessions[0].kindIndex=2;
 target.skillStats[0].correct=2;target.skillHistory.push({attemptId:'new-next',profileId:'new-p',wordId:'new-w',revision:1,skill:'translation',right:1,day:'2026-10-03'});target.dailyActivity[0].correct=2;target.dailyActivity[0].xp=20;
 return {before,restoreCheckpoint,after};
}
const mutations=[
 ['word translation',p=>p.words[0].ru='испорчено'],
 ['assistant content',p=>{const c=JSON.parse(p.aids[0].content);c.text='испорчено';p.aids[0].content=JSON.stringify(c);}],
 ['assistant nested word',p=>{const c=JSON.parse(p.aids[0].content);c.wordId='new-w2';p.aids[0].content=JSON.stringify(c);}],
 ['assistant dependency',p=>p.aidWords[0].wordId='new-w2'],
 ['session current question',p=>p.sessions[0].currentQuestion.prompt='испорчено'],
 ['session word order',p=>p.sessions[0].wordIds=['new-w2']],
 ['question payload',p=>p.questions[0].payload.expected=['испорчено']],
 ['question rotation',p=>p.questions[0].payload.nextKindIndex=99],
 ['attempt result',p=>p.attempts[0].result.state.streak=99],
 ['topic dependency',p=>p.wordTopics[0].wordId='new-w2'],
 ['settings',p=>p.settings.dailyGoal=200],
];
for(const [label,mutate] of mutations)test('json_restore_rejects_corrupted_'+label,()=>{
 const e=evidence();mutate(e.restoreCheckpoint.profiles[1]);
 const result=verifyScenarioState('transfer.json-roundtrip',e.restoreCheckpoint,e);
 assert.ok(result.errors.some(s=>s.startsWith('RESTORE_FIDELITY:')),JSON.stringify(result));
});
test('json_restore_accepts_regenerated_ids_and_exactly_one_double_tapped_answer',()=>{
 const e=evidence();assert.deepEqual(verifyScenarioState('transfer.json-roundtrip',e.after,e),{ok:true,errors:[]});
});
test('json_restore_requires_checkpoint_for_preservation_before_answering',()=>{
 const e=evidence();assert.equal(verifyScenarioState('transfer.json-roundtrip',e.after,{before:e.before}).ok,false);
});
for(const [label,mutate] of [
 ['no UI answer',e=>e.after=structuredClone(e.restoreCheckpoint)],
 ['duplicate XP',e=>{const p=e.after.profiles[1];p.profile.xp+=10;p.attempts.at(-1).xpDelta+=10;}],
 ['duplicate attempt',e=>{const p=e.after.profiles[1];p.attempts.push({...p.attempts.at(-1),attemptId:'duplicate'});p.profile.xp+=10;}],
 ['second mastery reward',e=>e.after.profiles[1].rewards.push({wordId:'new-w',attemptId:'new-next',amount:50})],
 ['mutated saved helper after answer',e=>e.after.profiles[1].aids[0].content='corrupted'],
 ['original profile changed',e=>e.after.profiles[0].words[0].ru='corrupted'],
])test('json_restore_rejects_'+label,()=>{const e=evidence();mutate(e);assert.equal(verifyScenarioState('transfer.json-roundtrip',e.after,e).ok,false);});
