import {openTestDb} from '../test/sqlite';
import {migrate} from '../src/core/migrations';
import {addDays} from '../src/core/calendar';
import {createProfile,setActiveProfile} from '../src/features/profiles/profileRepository';
import {GrammarSessionRepository} from '../src/features/grammar/grammarSessionRepository';
import {GrammarAnswerService} from '../src/features/grammar/grammarAnswerService';
import {BackupService} from '../src/features/transfer/backupService';
import {validateBackupV4} from '../src/features/transfer/backupValidation';
import {createSchema8GrammarFixture,exportSchema8GrammarFixture} from '../test/fixtures/grammarSchema8';
import {SessionRepository} from '../src/features/learning/sessionRepository';
import {AnswerService} from '../src/features/learning/answerService';
import {WordRepository} from '../src/features/dictionary/wordRepository';
import type {DayKey} from '../src/features/learning/learningTypes';
import type {BackupV3,BackupV4} from '../src/features/transfer/backupTypes';
import type {GrammarQuestion,GrammarSubmission,GrammarTargetId,GrammarLesson} from '../src/features/grammar/grammarTypes';

export function regressionGrammarAnswer(q:GrammarQuestion):GrammarSubmission {
 if(q.responseMode==='choice')return {kind:'choice',optionId:q.expected.optionId};
 if(q.responseMode==='multi-choice')return {kind:'multi-choice',optionIds:[...q.expected.optionIds]};
 return {kind:'typed',text:'phrases' in q.expected?q.expected.phrases[0]:'sentences' in q.expected?q.expected.sentences[0]:q.expected.token};
}
export async function createSchema8RegressionBackup(day:DayKey):Promise<BackupV3>{
 const h=openTestDb();try{await createSchema8GrammarFixture(h.db,day);return await exportSchema8GrammarFixture(h.db);}finally{h.close();}
}
async function createCurrentFixture(day:DayKey,lektion3:boolean):Promise<BackupV4>{
 const h=openTestDb();try{
  await migrate(h.db);const sessions=new GrammarSessionRepository(h.db),answers=new GrammarAnswerService(h.db);
  async function seed(name:string,targetId:GrammarTargetId,count:number,lesson:GrammarLesson,at=day,mode:'study'|'review'='study',right=true){
   const p=await createProfile(h.db,name);await respond(p.id,targetId,count,lesson,at,mode,right);return p;
  }
  async function respond(profileId:string,targetId:GrammarTargetId,count:number,lesson:GrammarLesson,at:DayKey,mode:'study'|'review'='study',right=true){
   await setActiveProfile(h.db,profileId);
   const s=(await sessions.start(profileId,{mode,lesson,targetIds:[targetId]},at))!;
   for(let n=0;n<count;n++){const q=(await sessions.next(profileId,s.id,at))!;await answers.submit(profileId,s.id,q.attemptId,right?regressionGrammarAnswer(q):{kind:'typed',text:'falsch'},at);}
   if(mode==='review'||count<10)await sessions.next(profileId,s.id,at);
   // Match public lesson selection so Android resumes this saved question.
   await h.db.run('UPDATE grammar_sessions SET selection=? WHERE id=?',[JSON.stringify({mode,lesson:lesson==='pronouns'||lesson==='sein'?'mixed':lesson}),s.id]);
  }
  if(lektion3){
   for(const [lesson,target]of [['noun-article','noun-article:tisch'],['noun-plural','noun-plural:buch'],['plural-invariant','plural-invariant:recognition']] as const)await seed('L3 — '+lesson,target,0,lesson);
   await seed('L3 — article-typing','noun-article:tisch',3,'noun-article');
   await seed('L3 — keyboard','noun-plural:buch',0,'noun-plural');
   await seed('L3 — plural-error','noun-plural:hand',0,'noun-plural');
   await seed('L3 — invariant-subset','plural-invariant:recognition',0,'plural-invariant');
   await seed('L3 — invariant-superset','plural-invariant:recognition',0,'plural-invariant');
   const empty=await createProfile(h.db,'L3 — empty source'),service=new BackupService(h.db),b=await service.exportAll();
   const p=b.profiles.find(p=>p.profile.id===empty.id)!;
   const restored=await service.restore(service.preview(JSON.stringify({...b,profiles:[{...p,profile:{...p.profile,name:'L3 — empty'},words:[],progress:[],wordTopics:[]}]})));
   await respond(restored.profileIds[0],'noun-plural:buch',0,'noun-plural',day);
   await seed('L3 — isolated','noun-article:zeitung',0,'noun-article');
  }else{
   await seed('Rules — nine','pronoun-cloze:ich',9,'pronouns');
   await seed('Rules — error','pronoun-cloze:ich',9,'pronouns');
   const review=await seed('Rules — review','sein-cloze:ich',10,'sein',addDays(day,-1));
   await respond(review.id,'sein-cloze:ich',0,'sein',day,'review');
   await seed('Rules — isolated','pronoun-cloze:du',0,'pronouns');
   const p=await createProfile(h.db,'Rules — word nineteen'),words=new WordRepository(h.db),ws=new SessionRepository(h.db),wa=new AnswerService(h.db);
   const w=(await words.list(p.id)).find(w=>w.de==='Stuhl')!;const s=await ws.start(p.id,{mode:'study',wordIds:[w.id]},day);
   for(let n=0;n<19;n++){const q=(await ws.next(p.id,s.id,day))!;await wa.submit(p.id,s.id,q.attemptId,q.expected[0],day);}await ws.next(p.id,s.id,day);
  }
  return validateBackupV4(await new BackupService(h.db).exportAll());
 }finally{h.close();}
}
export function createLektion3RegressionBackup(day:DayKey):Promise<BackupV4>{return createCurrentFixture(day,true);}
export function createGrammarRulesRegressionBackup(day:DayKey):Promise<BackupV4>{return createCurrentFixture(day,false);}
