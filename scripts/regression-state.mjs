// Read only exported BackupV1 data produced by the normal Android save screen.
// This module never opens or mutates the application's SQLite database.
export function verifyScenarioState(id,backup,{before,today,fixtureDay}={}) {
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
 if(id==='transfer.json-roundtrip'){const count=before?.profiles?.length;check(backup.profiles.length===count*2,'RESTORE_NEW_PROFILES');for(const p of before?.profiles??[]){const restored=backup.profiles.find(r=>r.profile.name===p.profile.name+' восстановлено 2');check(restored?.profile.xp===p.profile.xp,'RESTORE_XP:'+p.profile.name);for(const collection of ['words','progress','skillStats','skillHistory','dailyActivity','aids','aidWords','sessions','questions','attempts','rewards','topics','wordTopics'])check(restored?.[collection]?.length===p[collection]?.length,'RESTORE_LINKS:'+p.profile.name+':'+collection);const learning=part=>part?.progress.map(r=>({...r,profileId:undefined,wordId:part.words.find(w=>w.id===r.wordId)?.de})).sort((a,b)=>a.wordId.localeCompare(b.wordId));check(same(learning(restored),learning(p)),'RESTORE_LEARNING:'+p.profile.name);}}
 if(id==='assistant.helper-save-edit')check(part('Регрессия UI')?.aids.some(a=>JSON.parse(a.content).text.includes('Проверено')),'HELPER_EDIT_NOT_SAVED');
 if(id==='assistant.helper-cancel-background')check(same(part('Регрессия UI')?.aids,old('Регрессия UI')?.aids),'LATE_HELPER_SAVED');
 if(id==='assistant.helper-profile-dependency'){check(part('Регрессия UI')?.aids.filter(a=>!a.stale).length===0,'STALE_HELPER_VISIBLE');check(part('Второй переименован')?.aids.length===old('Второй переименован')?.aids.length,'CROSS_PROFILE_HELPER');}
 if(id.startsWith('persistence-')){const p=part('Регрессия — 20 UI'),b=old('Регрессия — 20 UI');check(p?.profile.xp>=250&&p.rewards.length===1&&state(p,'Stuhl')?.streak===20,'PERSISTENCE_NONZERO_STATE');check(conserved(p,b)&&same(p?.sessions,b?.sessions),'PERSISTENCE_CHANGED');}
 if(id.startsWith('upgrade.')){const p=part('Миграция UI');check(p?.words.some(w=>w.de==='Upgradeprobe'),'UPGRADE_CUSTOM_WORD_LOST');check(p?.profile.xp===1250&&p.rewards.length===5&&p.attempts.length===100,'UPGRADE_EARNED_HISTORY');if(id==='upgrade.topic-migration')check(p?.topics.length>=6&&p.wordTopics.length>0,'TOPIC_MIGRATION_MISSING');if(before?.profiles?.length){const b=old('Миграция UI');check(p?.profile.xp===b?.profile.xp&&same(p?.attempts,b?.attempts)&&same(p?.rewards,b?.rewards),'UPGRADE_DUPLICATE_REWARD');}}
 if(id==='resilience.picker-double-answer'){const p=part('Регрессия — трудное'),b=old('Регрессия — трудное');check(p?.attempts.length===b?.attempts.length+1&&p?.profile.xp===b?.profile.xp+10,'DOUBLE_ANSWER_REWARDED');}
 return {ok:errors.length===0,errors};
}
