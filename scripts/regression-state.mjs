// Read only exported BackupV1 data produced by the normal Android save screen.
// This module never opens or mutates the application's SQLite database.
export function verifyScenarioState(id,backup,{before,today,fixtureDay,restoreCheckpoint}={}) {
 const errors=[];const check=(ok,label)=>{if(!ok)errors.push(label);};
 const part=name=>backup?.profiles?.find(p=>p.profile.name===name);
 const old=name=>before?.profiles?.find(p=>p.profile.name===name);
 const state=(p,de)=>p?.progress?.find(r=>r.wordId===p.words.find(w=>w.de===de)?.id);
 const sum=p=>p?.attempts?.reduce((n,a)=>n+a.xpDelta,0);
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
 if(id==='progress.calendar-streak-skills'){const p=part('Регрессия — 20 UI');check(p?.dailyActivity.some(d=>d.day===fixtureDay&&d.correct===20&&d.xp===250),'CALENDAR_TOTAL');check(new Set(p?.skillHistory.map(h=>h.skill)).size===4,'FOUR_SKILLS');}
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
 if(id.startsWith('upgrade.')){const p=part('Миграция UI');check(p?.words.some(w=>w.de==='Upgradeprobe'),'UPGRADE_CUSTOM_WORD_LOST');check(p?.profile.xp===1250&&p.rewards.length===5&&p.attempts.length===100,'UPGRADE_EARNED_HISTORY');if(id==='upgrade.topic-migration')check(p?.topics.length>=6&&p.wordTopics.length>0,'TOPIC_MIGRATION_MISSING');if(before?.profiles?.length){const b=old('Миграция UI');check(p?.profile.xp===b?.profile.xp&&same(p?.attempts,b?.attempts)&&same(p?.rewards,b?.rewards),'UPGRADE_DUPLICATE_REWARD');}}
 if(id==='resilience.picker-double-answer'){const p=part('Регрессия — трудное'),b=old('Регрессия — трудное');check(p?.attempts.length===b?.attempts.length+1&&p?.profile.xp===b?.profile.xp+10,'DOUBLE_ANSWER_REWARDED');}
 return {ok:errors.length===0,errors};
}

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
 function pair(oldId,newId){
  if(typeof newId!=='string'||!newId||oldIds.has(newId)||ids.has(newId))errors.push('REGENERATED_ID_INVALID');
  else ids.set(newId,oldId);
 }
 pair(source.profile.id,restored.profile.id);
 for(const [collection,key]of definitions){
  const original=source[collection]??[],copy=restored[collection]??[];
  for(let i=0;i<Math.min(original.length,copy.length);i++)pair(original[i][key],copy[i][key]);
 }
 const references=new Set(['id','profileId','wordId','topicId','aidId','sessionId','attemptId']);
 function normalize(value,key=''){
  if(typeof value==='string'&&references.has(key))return ids.get(value)??'UNMAPPED_REFERENCE:'+value;
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
