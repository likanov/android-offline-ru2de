import {readFileSync} from 'node:fs';
const CSV_IMPORT_CONTRACT=JSON.parse(readFileSync(new URL('../e2e/fixtures/extended-vocabulary-import-contract.json',import.meta.url),'utf8'));
// Read only exported BackupV1 data produced by the normal Android save screen.
// This module never opens or mutates the application's SQLite database.
export function verifyScenarioState(id,backup,{before,today,fixtureDay,restoreCheckpoint}={}) {
 const errors=[];const check=(ok,label)=>{if(!ok)errors.push(label);};
 const part=name=>backup?.profiles?.find(p=>p.profile.name===name);
 const old=name=>before?.profiles?.find(p=>p.profile.name===name);
 const state=(p,de)=>p?.progress?.find(r=>r.wordId===p.words.find(w=>w.de===de)?.id);
 const sum=p=>(p?.attempts??[]).reduce((n,a)=>n+a.xpDelta,0)+(p?.grammar?.attempts??[]).reduce((n,a)=>n+a.result.xpDelta,0);
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 const conserved=(p,b)=>p&&b&&p.profile.xp===b.profile.xp&&same(p.attempts,b.attempts)&&same(p.rewards,b.rewards)&&same(p.progress,b.progress);
 const add=(day,n)=>{if(!/^\d{4}-\d{2}-\d{2}$/.test(day??''))return null;const d=new Date(day+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+n);return d.toISOString().slice(0,10);};
 for(const p of backup?.profiles??[])check(p.profile.xp===sum(p),'XP_ATTEMPT_SUM:'+p.profile.name);
 if(!backup?.profiles?.length)check(false,'EXPORTED_BACKUP_EMPTY');
 if(id==='first-launch.clean-40-words')check(part('Регрессия UI')?.words.length===40,'CLEAN_SEED_COUNT');
 if(id==='profiles.profile-create-rename')check(part('Второй переименован')?.words.length===40&&!part('Второй UI'),'PROFILE_RENAME');
 if(id==='profiles.profile-isolation'){check(part('Регрессия UI')?.settings.dailyGoal===1,'OWN_GOAL');check(part('Второй переименован')?.settings.dailyGoal===20,'OTHER_GOAL');}
 if(id==='dictionary.noun-adjective-edit'){const p=part('Регрессия UI');check(p?.words.some(w=>w.de==='Prüfschrank'&&w.ru==='проверенный шкаф'&&w.gender==='m'),'NOUN_EDIT');check(p?.words.some(w=>w.de==='hübsch'&&w.pos==='adjective'&&w.gender===null),'ADJECTIVE_CREATE');}
 if(id==='dictionary.search-nfc-nfd')check(part('Регрессия UI')?.words.filter(w=>w.de.normalize('NFC')==='Prüfschrank').length===1,'NFC_DUPLICATE');
 if(id==='dictionary.lexical-reset'){const s=state(part('Регрессия — продолжение'),'Prüfstuhl');check(s?.streak===0&&s.learned===0,'LEXICAL_RESET');}
 if(id==='dictionary.cosmetic-preserve'){const p=part('Регрессия — изучено');check(conserved(p,old(p?.profile.name)),'COSMETIC_PROGRESS_CHANGED');check(p?.words.some(w=>w.note==='Сохранённая серия'),'COSMETIC_NOTE');}
 if(id==='learning.six-modes'){const p=part('Регрессия — 20 UI');const kinds=new Set(p?.questions.filter(q=>q.status==='answered').map(q=>q.payload.kind));for(const k of ['ru-de','de-ru','typing','definite-article','indefinite-article','listening'])check(kinds.has(k),'MODE_MISSING:'+k);}
 if(id==='learning.hidden-unique-choices'){for(const q of part('Регрессия — 20 UI')?.questions??[])check(new Set(q.payload.options.map(s=>s.normalize('NFC').trim().toLowerCase())).size===q.payload.options.length,'DUPLICATE_CHOICES');}
 if(id==='learning.umlauts-eszett'){const p=part('Unicode UI');check(p?.words.some(w=>w.de==='äöüß'),'UNICODE_WORD');check(p?.questions.some(q=>q.payload.kind==='typing'&&q.status==='answered'),'UNICODE_TYPED_ANSWER');check(p?.profile.xp===30,'UNICODE_XP');}
 if(id==='learning.twenty-ui-answers'){const p=part('Регрессия — 20 UI');check(p?.attempts.length===20&&p.attempts.every(a=>a.right===1),'TWENTY_REAL_UI_ATTEMPTS');check(p?.profile.xp===250&&p.rewards.length===1&&p.rewards[0].amount===50,'ONE_MASTERY_BONUS');check(state(p,'Stuhl')?.dueDate===add(fixtureDay,1),'TOMORROW_REVIEW');}
 if(id==='learning.nineteen-error'){const p=part('Регрессия — серия 19');check(state(p,'Prüfstuhl')?.streak===0&&p?.profile.xp===190&&p.attempts.at(-1)?.right===0,'ERROR_19_RESET');}
 if(id==='learning.bonus-once'){const p=part('Регрессия — переучивание');check(p?.profile.xp===450&&p?.rewards.length===1&&p.attempts.at(-1)?.xpDelta===10,'RELEARNING_SECOND_BONUS');}
 if(id==='reviews.all-intervals')for(let s=0;s<6;s++){const p=part('Регрессия — повторение '+s);check(state(p,'Prüfstuhl')?.dueDate===add(today,[3,7,14,30,60,60][s]),'REVIEW_INTERVAL:'+s);}
 if(id==='reviews.early-overdue')check(conserved(part('Регрессия — 20 UI'),old('Регрессия — 20 UI')),'EARLY_ANSWER_MUTATED');
 if(id==='reviews.learned-error'){const p=part('Регрессия — изучено'),s=state(p,'Prüfstuhl');check(s?.learned===1&&s.streak===20&&s.dueDate===add(today,1)&&p?.profile.xp===250,'LEARNED_ERROR_STATE');}
 if(id==='reviews.difficult-recovery')check(state(part('Регрессия — трудное'),'Prüfstuhl')?.difficult===0,'DIFFICULT_NOT_RECOVERED');
 if(id==='progress.xp-levels')check(part('Регрессия — 490 XP')?.profile.xp===500,'LEVEL_500');
 if(id==='progress.goal-bounds')check(part('Регрессия UI')?.settings.dailyGoal===200,'GOAL_200');
 if(id==='progress.calendar-streak-skills'){const p=part('Регрессия — изучено');check(p?.dailyActivity.some(d=>d.day===fixtureDay&&d.correct===20&&d.xp===250),'CALENDAR_TOTAL');check(['translation','writing','article'].every(skill=>p?.skillHistory.some(h=>h.skill===skill)),'RECORDED_SKILLS');}
 if(id==='progress.no-passive-xp'||id==='audio.wav-listening'){for(const p of backup.profiles)check(!old(p.profile.name)||conserved(p,old(p.profile.name)),'PASSIVE_XP:'+p.profile.name);}
 if(id==='transfer.csv-picker-escaping'){const p=part('Регрессия UI');check(p?.words.some(w=>w.de==='Prüfstuhl'&&w.note.includes('"внутри"')&&w.note.includes('\n')),'CSV_ESCAPED_NOTE');check(p?.words.some(w=>w.de==='regressionsschön')&&p?.topics.some(t=>t.name==='Регрессия'),'CSV_TOPIC_UNICODE');}
 if(id==='transfer.csv-preview-cancel-profile'||id==='transfer.invalid-interrupted')check(same(backup.profiles,before?.profiles),'TRANSFER_CANCEL_MUTATED');
 if(id==='transfer.json-roundtrip'){
  const restoredBackup=restoreCheckpoint??backup;
  check(!!restoreCheckpoint,'RESTORE_ANSWER_EVIDENCE_MISSING');
  check(!!before?.profiles?.length,'RESTORE_SOURCE_MISSING');
  check(restoredBackup.profiles.length===before?.profiles?.length*2,'RESTORE_NEW_PROFILES');
  for(const p of before?.profiles??[]){
   check(stable(partFrom(restoredBackup,p.profile.name))===stable(p),'RESTORE_ORIGINAL_CHANGED:'+p.profile.name);
   const restored=partFrom(restoredBackup,p.profile.name+' восстановлено 2');
   for(const error of restorationErrors(p,restored))check(false,'RESTORE_FIDELITY:'+p.profile.name+':'+error);
  }
  if(restoreCheckpoint){
   check(backup.profiles.length===restoreCheckpoint.profiles.length,'RESTORE_AFTER_PROFILE_COUNT');
   const targetName='Регрессия — продолжение восстановлено 2';
   for(const p of restoreCheckpoint.profiles){
    const after=partFrom(backup,p.profile.name);
    if(p.profile.name!==targetName)check(stable(after)===stable(p),'RESTORE_REPLAY_CHANGED:'+p.profile.name);
   }
   const target=part(targetName),baseline=partFrom(restoreCheckpoint,targetName);
   check(!!target&&!!baseline,'RESTORE_ANSWER_PROFILE_MISSING');
   if(target&&baseline){
    const additions=target.attempts.filter(a=>!baseline.attempts.some(b=>b.attemptId===a.attemptId));
    check(target.attempts.length===baseline.attempts.length+1&&additions.length===1,'RESTORE_DOUBLE_ANSWER_ATTEMPTS');
    check(target.profile.xp===baseline.profile.xp+10&&additions[0]?.xpDelta===10&&additions[0]?.right===1,'RESTORE_DOUBLE_ANSWER_XP');
    check(stable(target.rewards)===stable(baseline.rewards),'RESTORE_DOUBLE_ANSWER_REWARD');
    check(stable(target.attempts.filter(a=>baseline.attempts.some(b=>b.attemptId===a.attemptId)))===stable(baseline.attempts),'RESTORE_OLD_ATTEMPTS_CHANGED');
    for(const key of ['words','settings','topics','wordTopics','aids','aidWords'])check(stable(target[key])===stable(baseline[key]),'RESTORE_ANSWER_CHANGED:'+key);
    const answer=additions[0],question=target.questions.find(q=>q.attemptId===answer?.attemptId),session=target.sessions.find(s=>s.id===answer?.sessionId);
    check(question?.status==='answered'&&question?.wordId===answer?.wordId&&question?.sessionId===answer?.sessionId&&session?.currentQuestion?.attemptId===answer?.attemptId&&stable(session?.result)===stable(answer?.result),'RESTORE_DOUBLE_ANSWER_PAYLOAD');
   }
  }
 }
 if(id==='assistant.helper-save-edit')check(part('Регрессия UI')?.aids.some(a=>JSON.parse(a.content).text.includes('Проверено')),'HELPER_EDIT_NOT_SAVED');
 if(id==='assistant.helper-cancel-background')check(same(part('Регрессия UI')?.aids,old('Регрессия UI')?.aids),'LATE_HELPER_SAVED');
 if(id==='assistant.helper-profile-dependency'){check(part('Регрессия UI')?.aids.filter(a=>!a.stale).length===0,'STALE_HELPER_VISIBLE');check(part('Второй переименован')?.aids.length===old('Второй переименован')?.aids.length,'CROSS_PROFILE_HELPER');}
 if(id.startsWith('persistence-')){const p=part('Регрессия — 20 UI'),b=old('Регрессия — 20 UI');check(p?.profile.xp>=250&&p.rewards.length===1&&state(p,'Stuhl')?.streak===20,'PERSISTENCE_NONZERO_STATE');check(conserved(p,b)&&same(p?.sessions,b?.sessions),'PERSISTENCE_CHANGED');}
 if(id.startsWith('upgrade.')){const p=part('Миграция UI');check(p?.words.some(w=>w.de==='Upgradeprobe'),'UPGRADE_CUSTOM_WORD_LOST');check(p?.profile.xp===250&&p.rewards.length===1&&p.attempts.length===20,'UPGRADE_EARNED_HISTORY');if(id==='upgrade.topic-migration')check(p?.topics.length>=6&&p.wordTopics.length>0,'TOPIC_MIGRATION_MISSING');if(before?.profiles?.length){const b=old('Миграция UI');check(p?.profile.xp===b?.profile.xp&&same(p?.attempts,b?.attempts)&&same(p?.rewards,b?.rewards),'UPGRADE_DUPLICATE_REWARD');}}
 if(id==='resilience.picker-double-answer'){const p=part('Регрессия — трудное'),b=old('Регрессия — трудное');check(p?.attempts.length===b?.attempts.length+1&&p?.profile.xp===b?.profile.xp+10,'DOUBLE_ANSWER_REWARDED');}
 if(id.startsWith('grammar-lektion2.')){for(const p of backup?.profiles??[])if(p.grammar)checkGrammarState(id,p,check);}
 else if(id.startsWith('grammar-'))checkGrammarState(id,(backup?.profiles??[]).find(p=>p?.grammar),check);
 if(id.startsWith('extended-vocabulary.')){
  const p=part('A1 — словарь'),b=old('A1 — словарь');check(!!p,'A1_VOCABULARY_MISSING');
  if(id.endsWith('nine-type-editor'))for(const pos of ['noun','adjective','number','verb','pronoun','adverb','preposition','conjunction','phrase'])check(p?.words.some(w=>w.de==='R1'+pos&&w.pos===pos),'EDITOR_PART:'+pos);
  if(id.endsWith('both-csv-duplicates-topics')){
   check(b?.words.length===CSV_IMPORT_CONTRACT.initialWords,'CSV_INITIAL_WORD_COUNT');
   check(p?.words.length===CSV_IMPORT_CONTRACT.finalWords,'CSV_WORD_COUNT');
   check(!!p&&!!b&&p.profile.xp===b.profile.xp&&same(p.attempts,b.attempts)&&same(p.rewards,b.rewards),'CSV_LEARNING_LEDGER_CHANGED');
   const expectedTopics=new Set((b?.topics??[]).map(t=>t.name));
   const expectedLinks=new Set((b?.wordTopics??[]).map(t=>t.wordId+':'+t.topicId));
   for(const previous of b?.words??[]){
    check(same(p?.words.find(w=>w.id===previous.id),previous),'CSV_EXISTING_WORD_CHANGED:'+previous.de);
    check(same(p?.progress.find(r=>r.wordId===previous.id),b.progress.find(r=>r.wordId===previous.id)),'CSV_DUPLICATE_PROGRESS_CHANGED:'+previous.de);
   }
   for(const pack of CSV_IMPORT_CONTRACT.packs)for(const row of pack.rows){
    const matches=p?.words.filter(w=>['de','ru','pos','gender'].every(key=>w[key]===row[key]))??[];
    check(matches.length===1,'CSV_PACK_WORD_MISSING_OR_DUPLICATE:'+pack.file+':'+row.de);
    expectedTopics.add(row.topic);
    const topics=p?.topics.filter(t=>t.name===row.topic)??[];
    check(topics.length===1,'CSV_PACK_TOPIC_MISSING_OR_DUPLICATE:'+row.topic);
    if(matches.length===1&&topics.length===1)expectedLinks.add(matches[0].id+':'+topics[0].id);
   }
   check(p?.topics.length===expectedTopics.size&&p.topics.every(t=>expectedTopics.has(t.name)),'CSV_TOPIC_SET_CHANGED');
   const actualLinks=new Set((p?.wordTopics??[]).map(t=>t.wordId+':'+t.topicId));
   check(p?.wordTopics.length===expectedLinks.size&&actualLinks.size===expectedLinks.size&&[...expectedLinks].every(link=>actualLinks.has(link)),'CSV_TOPIC_MEMBERSHIP_INCOMPLETE');
   for(const previous of b?.topics??[])check(same(p?.topics.find(t=>t.id===previous.id),previous),'CSV_EXISTING_TOPIC_CHANGED');

  }
  if(id.endsWith('search-sie-numbers'))check(conserved(p,b),'SEARCH_CHANGED_PROGRESS');
  if(id.endsWith('typed-number')){const added=p?.attempts.filter(a=>!b?.attempts.some(x=>x.attemptId===a.attemptId))??[];check(added.length===1&&added[0].right===1&&added[0].xpDelta===10,'NUMBER_TYPED_ATTEMPT');check(p?.questions.some(q=>q.attemptId===added[0]?.attemptId&&q.payload.kind==='typing'),'NUMBER_TYPED_QUESTION');}
  if(id.endsWith('backup3-roundtrip')){
   check(backup.version===3&&before?.version===3,'V3_EXPORT_REQUIRED');check(backup.profiles.length===before?.profiles.length*2,'V3_RESTORE_COUNT');
   const beforeIds=new Set((before?.profiles??[]).map(p=>p.profile.id));
   const names=new Set((before?.profiles??[]).map(p=>p.profile.name));
   const additions=backup.profiles.filter(p=>!beforeIds.has(p.profile.id));
   check(additions.length===before?.profiles.length,'V3_NEW_PROFILE_COUNT');
   for(const source of before?.profiles??[]){
    check(stable(backup.profiles.find(p=>p.profile.id===source.profile.id))===stable(source),'V3_ORIGINAL_CHANGED');
    let name=source.profile.name,n=2;while(names.has(name))name=source.profile.name+' восстановлено '+n++;
    names.add(name);
    const candidates=additions.filter(p=>p.profile.name===name);check(candidates.length===1,'V3_RESTORE_NAME:'+name);
    for(const error of restorationErrors(source,candidates[0]))check(false,'V3_RESTORE:'+source.profile.name+':'+error);
   }
  }
 }
 if(id.startsWith('grammar-lektion2.')){
  check(backup.version===3,'LEKTION2_V3_REQUIRED');
  check((backup.profiles??[]).every(p=>same(p.grammar?.catalogVersions,[1,2])),'LEKTION2_BOTH_CATALOGS_REQUIRED');
  if(['force-stop','reboot'].some(suffix=>id.endsWith(suffix)))check(part('A1 — пустой')?.grammar.sessions.some(s=>s.status==='active'&&!s.result&&s.currentQuestion?.presentation==='sentence'),'PENDING_SENTENCE_REQUIRED');
  const additions=name=>{const p=part(name),b=old(name);return p?.grammar.attempts.filter(a=>!b?.grammar.attempts.some(x=>x.result.attemptId===a.result.attemptId))??[];};
  if(id.endsWith('five-lessons'))for(const lesson of ['professions-pronoun','professions-sein','demonstrative-statement','yesno-transform','yesno-translation']){const added=additions('A1 — '+lesson);check(added.length===1&&added[0].result.right===true&&added[0].targetId.startsWith(lesson+':'),'LESSON_REAL_ANSWER:'+lesson);}
  if(id.endsWith('sentence-correct-error')){const added=additions('A1 — yesno-transform');check(added.length===1&&added[0].result.right===false&&added[0].result.xpDelta===0,'SENTENCE_ERROR_ATTEMPT');}
  if(id.endsWith('sie-context')){const added=additions('A1 — Sie');check(added.length===1&&added[0].targetId==='yesno-translation:sie_formal'&&added[0].result.right,'SIE_CONTEXT_ATTEMPT');}
  if(id.endsWith('empty-dictionary')){const p=part('A1 — пустой');check(p?.words.length===0,'EMPTY_DICTIONARY_REQUIRED');check(additions(p?.profile.name).some(a=>a.result.right),'EMPTY_FALLBACK_ANSWER');}
  if(['force-stop','reboot','reference-helper'].some(suffix=>id.endsWith(suffix)))for(const error of compareBackupGraphs(before,backup).errors)check(false,error);
  if(id.endsWith('schema6-eight-upgrade'))for(const error of compareBackupGraphs(before,backup,{upgrade:true}).errors)check(false,error);
 }
 return {ok:errors.length===0,errors};
}

const GRAMMAR_TARGETS=new Set(['ich','du','er','sie_feminine','es','wir','ihr','sie_plural','sie_formal']);
function grammarTargetKnown(targetId){const [kind,pronoun]=String(targetId??'').split(':');return ((kind==='pronoun-cloze'||kind==='sein-cloze')&&GRAMMAR_TARGETS.has(pronoun))||(['professions-pronoun','professions-sein'].includes(kind)&&['ich','du','er','wir','ihr','sie_plural','sie_formal'].includes(pronoun))||(kind==='demonstrative-statement'&&['singular','plural'].includes(pronoun))||(kind==='yesno-transform'&&['pronoun','noun'].includes(pronoun))||(kind==='yesno-translation'&&['du','er','ihr','sie_plural','sie_formal','noun'].includes(pronoun));}
function checkGrammarState(id,p,check){
 const g=p?.grammar;
 check(!!g,'GRAMMAR_SECTION_MISSING');
 if(!g)return;
 for(const key of ['progress','sessions','questions','attempts','rewards'])check(Array.isArray(g[key]),'GRAMMAR_'+key.toUpperCase()+'_MISSING');
 const targets=new Set((g.progress??[]).map(row=>row.targetId));
 for(const target of targets)check(grammarTargetKnown(target),'GRAMMAR_UNKNOWN_TARGET:'+target);
 check(targets.size===(g.progress??[]).length,'GRAMMAR_PROGRESS_DUPLICATE');
 const sessions=new Map((g.sessions??[]).map(row=>[row.id,row]));
 const questions=new Map((g.questions??[]).map(row=>[row.question?.attemptId,row]));
 for(const a of g.attempts??[]){
  check(grammarTargetKnown(a.targetId),'GRAMMAR_ATTEMPT_TARGET');
  check(!!sessions.get(a.sessionId),'GRAMMAR_ATTEMPT_SESSION_MISSING');
  check(!!questions.get(a.result?.attemptId),'GRAMMAR_ATTEMPT_QUESTION_MISSING');
  check(a.result?.targetId===a.targetId,'GRAMMAR_ATTEMPT_TARGET_MISMATCH');
  check(a.result?.xpDelta===(a.result?.right?((g.rewards??[]).some(r=>r.attemptId===a.result?.attemptId)?60:10):0),'GRAMMAR_ATTEMPT_XP');
 }
 const wordXp=(p.attempts??[]).reduce((n,a)=>n+(a.xpDelta??0),0),grammarXp=(g.attempts??[]).reduce((n,a)=>n+(a.result?.xpDelta??0),0);
 check(p.profile.xp===wordXp+grammarXp,'GRAMMAR_COMBINED_XP');
 const daily=new Map();for(const a of p.attempts??[])addDaily(daily,a.day,!!a.right,a.xpDelta??0);for(const a of g.attempts??[])addDaily(daily,a.day,!!a.result?.right,a.result?.xpDelta??0);
 check((p.dailyActivity??[]).length===daily.size,'GRAMMAR_DAILY_COUNT');
 for(const row of p.dailyActivity??[]){const expected=daily.get(row.day);if(expected)check(row.correct===expected.correct&&row.errors===expected.errors&&row.xp===expected.xp,'GRAMMAR_DAILY_LEDGER:'+row.day);}
 if(id==='grammar-progress.twenty-ui-answers')check((g.attempts??[]).some(a=>a.result?.state?.streak===20),'GRAMMAR_TWENTY_ANSWERS');
 if(id==='grammar-progress.nineteen-error')check((g.attempts??[]).some(a=>a.result?.right===false),'GRAMMAR_NINETEEN_ERROR');
 if(id==='grammar-progress.bonus-once-double-submit')check((g.rewards??[]).length===new Set((g.rewards??[]).map(r=>r.targetId)).size,'GRAMMAR_BONUS_DUPLICATE');
 if(id==='grammar-progress.reviews-difficult')check((g.progress??[]).some(r=>r.state?.difficult===true||r.state?.reviewStage>0),'GRAMMAR_REVIEW_STATE');
 if(id==='grammar-progress.combined-summary')check((g.attempts??[]).length>0&&p.profile.xp===wordXp+grammarXp,'GRAMMAR_COMBINED_SUMMARY');
}
function addDaily(map,day,right,xp){const current=map.get(day)??{correct:0,errors:0,xp:0};current.correct+=right?1:0;current.errors+=right?0:1;current.xp+=xp;map.set(day,current);}

// Compare every exported value, tolerating only UUID regeneration and the new
// profile name. Array order remains significant for question choices/word pools.
function partFrom(backup,name){return backup?.profiles?.find(p=>p.profile.name===name);}
function stable(value){
 if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
 if(value&&typeof value==='object')return '{'+Object.keys(value).sort().map(key=>JSON.stringify(key)+':'+stable(value[key])).join(',')+'}';
 return JSON.stringify(value);
}
function restorationErrors(source,restored){
 if(!restored)return ['PROFILE_MISSING'];
 const errors=[],ids=new Map(),oldIds=new Set([source.profile.id]);
 const definitions=[['words','id'],['topics','id'],['aids','id'],['sessions','id'],['questions','attemptId']];
 for(const [collection,key]of definitions)for(const row of source[collection]??[])oldIds.add(row[key]);
 for(const row of source.grammar?.sessions??[])oldIds.add(row.id);
 for(const row of source.grammar?.questions??[])oldIds.add(row.question.attemptId);
 function pair(oldId,newId){
  if(typeof newId!=='string'||!newId||oldIds.has(newId)||ids.has(newId))errors.push('REGENERATED_ID_INVALID');
  else ids.set(newId,oldId);
 }
 pair(source.profile.id,restored.profile.id);
 for(const [collection,key]of definitions){
  const original=source[collection]??[],copy=restored[collection]??[];
  for(let i=0;i<Math.min(original.length,copy.length);i++)pair(original[i][key],copy[i][key]);
 }
 for(const [index,row] of (source.grammar?.sessions??[]).entries())pair(row.id,restored.grammar?.sessions?.[index]?.id);
 for(const [index,row] of (source.grammar?.questions??[]).entries())pair(row.question.attemptId,restored.grammar?.questions?.[index]?.question?.attemptId);
 const references=new Set(['id','profileId','wordId','topicId','aidId','sessionId','attemptId']);
 function normalize(value,key=''){
  if(typeof value==='string'&&references.has(key)){if(key==='id'&&['ich','du','er','sie_feminine','es','wir','ihr','sie_plural','sie_formal','bin','bist','ist','sind','seid'].includes(value))return value;return ids.get(value)??'UNMAPPED_REFERENCE:'+value;}
  if(key==='content'&&typeof value==='string'){
   // Legacy opaque helper content is preserved byte-for-byte. Structured aid
   // content must preserve all fields and the embedded word reference.
   try{return normalize(JSON.parse(value));}catch{return value;}
  }
  if(Array.isArray(value))return value.map(v=>normalize(v,key==='wordIds'?'wordId':''));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v,k)]));
  return value;
 }
 function original(value,key=''){
  if(key==='content'&&typeof value==='string'){try{return original(JSON.parse(value));}catch{return value;}}
  if(Array.isArray(value))return value.map(v=>original(v));
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,original(v,k)]));
  return value;
 }
 const copy=normalize(restored);copy.profile.name=source.profile.name;
 for(const key of new Set([...Object.keys(source),...Object.keys(copy)]))if(stable(copy[key])!==stable(original(source[key])))errors.push(key);
 return errors;
}

// Strict same-ID graph comparison for force-stop/reboot and in-place upgrades.
// Legacy upgrades may archive adjective plural; all learning rows stay exact.
export function compareBackupGraphs(before,after,{upgrade=false}={}) {
 const errors=[];
 if(!before?.profiles?.length||before.profiles.length!==after?.profiles?.length)return {ok:false,errors:['GRAPH_PROFILE_COUNT']};
 for(const source of before.profiles){
  const target=after.profiles.find(p=>p.profile.id===source.profile.id);
  if(!target){errors.push('GRAPH_PROFILE_MISSING:'+source.profile.id);continue;}
  const expected=structuredClone(source),actual=structuredClone(target);
  if(upgrade&&[1,2].includes(before.version))for(const word of expected.words??[]){
   if(word.pos==='adjective'&&word.gender===null&&typeof word.plural==='string'){
    word.note+='\n[Legacy adjective plural: '+JSON.stringify(word.plural)+']';word.plural=null;
   }
  }
  if(upgrade&&!expected.grammar)expected.grammar={catalogVersions:[1,2],progress:[],sessions:[],questions:[],attempts:[],rewards:[]};
  if(upgrade&&expected.grammar?.catalogVersion===1){delete expected.grammar.catalogVersion;expected.grammar.catalogVersions=[1,2];}
  if(stable(expected)!==stable(actual))errors.push('GRAPH_CHANGED:'+source.profile.name);
 }
 return {ok:errors.length===0,errors};
}
