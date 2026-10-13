import {createSchema8GrammarFixture, exportSchema8GrammarFixture} from '../test/fixtures/grammarSchema8';
import { randomUUID } from 'expo-crypto';
import { notifyProfileChanged } from '../src/app/refreshBus';
import { applyGrammarAnswer } from '../src/features/grammar/grammarLearningRules';
import { grammarResponseMode, makeGrammarQuestion, checkGrammarAnswer } from '../src/features/grammar/grammarQuestionFactory';
import type { SqlExecutor, SqlStore } from '../src/core/sql';
import type { DayKey, Word, LearningState } from '../src/features/learning/learningTypes';
import { openTestDb } from '../test/sqlite';
import { migrate } from '../src/core/migrations';
import { addDays } from '../src/core/calendar';
import { createProfile } from '../src/features/profiles/profileRepository';
import { WordRepository } from '../src/features/dictionary/wordRepository';
import { TopicRepository } from '../src/features/topics/topicRepository';
import { SessionRepository } from '../src/features/learning/sessionRepository';
import { AnswerService } from '../src/features/learning/answerService';
import { BackupService } from '../src/features/transfer/backupService';
import { validateBackupV4, validateBackupV1, validateBackupV2, validateBackup } from '../src/features/transfer/backupValidation';


import { allGrammarTargets, getGrammarTarget, getGrammarVariantCount, grammarTargets } from '../src/features/grammar/grammarCatalog';
import type { GrammarProgress, GrammarSelection, GrammarSession, GrammarTargetId, GrammarAttemptResult, GrammarQuestion, GrammarSubmission } from '../src/features/grammar/grammarTypes';
import type { BackupV1, BackupV2, BackupV3, BackupV4 } from '../src/features/transfer/backupTypes';
async function migrateFrozenSchema8(db: SqlStore, day: DayKey) {
 await createSchema8GrammarFixture(db,day);
 await db.exec('PRAGMA foreign_keys=OFF');
 try { for (const {name} of await db.all<{name:string}>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT IN ('grammar_targets','app_settings')")) await db.exec(`DELETE FROM ${name}`);await db.run('UPDATE app_settings SET activeProfileId=NULL'); }
 finally {await db.exec('PRAGMA foreign_keys=ON');}
}
// Host-only generator. It is never imported by the Android application.
// Every learning state comes from persisted real questions and AnswerService.
async function createRegressionWordBackup(today: DayKey): Promise<BackupV4> {
  addDays(today, 0);
  const { db, close } = openTestDb();
  try {
    await migrate(db);
    const words = new WordRepository(db), sessions = new SessionRepository(db);
    const answers = new AnswerService(db), topics = new TopicRepository(db);
    async function profile(name: string) {
      const p = await createProfile(db, name);
      const word = await words.create(p.id, {de:'Prüfstuhl',ru:'контрольный стул',pos:'noun',gender:'m',note:'ä ö ü ß — заметка'});
      const topic = await topics.create(p.id, 'Регрессия');
      await topics.setWordTopics(p.id, word.id, [topic.id]);
      return {p,word};
    }
    async function respond(profileId: string, wordId: string, count: number, day: DayKey, right = true, mode: 'study'|'review' = 'study') {
      const session = await sessions.start(profileId, {mode,wordIds:[wordId]}, day);
      for (let i=0;i<count;i++) {
        const q = await sessions.next(profileId,session.id,day);
        if (!q) throw Error('Fixture training queue ended early');
        await answers.submit(profileId,session.id,q.attemptId,right ? q.expected[0] : 'заведомо неверно',day);
      }
    }
    const ui=await createProfile(db,'Регрессия — 20 UI');
    const seed=(await words.list(ui.id)).find(w=>w.de==='Stuhl')!;
    const uiTopic=await topics.create(ui.id,'20 UI');
    await topics.setWordTopics(ui.id,seed.id,[uiTopic.id]);
    const relearn=await profile('Регрессия — переучивание');
    await respond(relearn.p.id,relearn.word.id,20,today);
    await words.update(relearn.p.id,relearn.word.id,{...relearn.word,ru:'переучиваемый стул'});
    await respond(relearn.p.id,relearn.word.id,19,today);
    const mastered = await profile('Регрессия — изучено');
    await respond(mastered.p.id,mastered.word.id,20,today);
    const nineteen = await profile('Регрессия — серия 19');
    await respond(nineteen.p.id,nineteen.word.id,19,today);
    const difficult = await profile('Регрессия — трудное');
    await respond(difficult.p.id,difficult.word.id,3,today,false);
    const level = await profile('Регрессия — 490 XP');
    const targets = [level.word, ...(await words.list(level.p.id)).filter(w=>w.id!==level.word.id).slice(0,2)];
    const levelTopic=await topics.create(level.p.id,'Level UI');
    await topics.setWordTopics(level.p.id,targets[2].id,[levelTopic.id]);
    for (const [i,w] of targets.entries()) await respond(level.p.id,w.id,i===2 ? 11 : 19,today);
    for (let stage=0;stage<=5;stage++) {
      const item = await profile(`Регрессия — повторение ${stage}`);
      let day = addDays(today,-300);
      await respond(item.p.id,item.word.id,20,day);
      day = addDays(day,1);
      for (let step=0;step<stage;step++) {
        await respond(item.p.id,item.word.id,1,day,true,'review');
        day = addDays(day,[3,7,14,30,60][step]);
      }
    }
    const active = await profile('Регрессия — продолжение');
    await respond(active.p.id,active.word.id,1,today);
    const s = (await sessions.resume(active.p.id))!;
    await sessions.next(active.p.id,s.id,today);
    return validateBackupV4(await new BackupService(db).exportAll());
  } finally { close(); }
}

/** The legacy runner deliberately receives a v1 file. Keep grammar out of it
 * so the old APK can prove that its import path remains readable. */
export async function createRegressionBackup(today: DayKey): Promise<BackupV1> {
  const current = await createRegressionWordBackup(today);
  const v1 = { ...current, version: 1 as const, profiles: current.profiles.map(({ grammar: _grammar, ...profile }) => profile) };
  return validateBackupV1(v1);
}

function grammarAnswer(question: GrammarQuestion, right: boolean): GrammarSubmission { if(question.catalogVersion===3) throw new Error('Expected pre-Lektion3 question');
  if(question.catalogVersion===2 && question.presentation==='sentence') return {kind:'typed',text:question.expected.sentences[0]};
  if (!right) return question.responseMode === 'choice' ? { kind: 'choice', optionId: question.options.find(option => option.id !== question.expected.optionId)!.id } : { kind: 'typed', text: 'falsch' };
  return question.responseMode === 'choice' ? { kind: 'choice', optionId: question.expected.optionId } : { kind: 'typed', text: question.expected.token };
}

/** Host-only historical rules1 fixture. Every grammar row is created by the repositories and
 * answer service; no progress, attempt, XP or backup row is hand-written. */
export async function createGrammarRegressionBackup(today: DayKey): Promise<BackupV2> {
  addDays(today, 0);
  const source = openTestDb();
  try {
    await migrateFrozenSchema8(source.db,today);
    const profile = await createProfile(source.db, 'Грамматика — 18 целей');
    const sessions = new GrammarSessionRepository(source.db), answers = new GrammarAnswerService(source.db);
    async function respond(profileId: string, targetId: typeof grammarTargets[number]['id'], count: number, day: DayKey, right = true, mode: 'study'|'review' = 'study') {
      const session = (await sessions.start(profileId, { mode, lesson: 'mixed', targetIds: [targetId] }, day))!;
      for (let index = 0; index < count; index++) {
        const question = (await sessions.next(profileId, session.id, day))!;
        await answers.submit(profileId, session.id, question.attemptId, grammarAnswer(question, right), day);
      }
    }
    for (const target of grammarTargets) await respond(profile.id, target.id, 1, today);

    const errors = await createProfile(source.db, 'Грамматика — ошибка 19');
    await respond(errors.id, 'pronoun-cloze:ich', 19, today, false);

    const reviews = await createProfile(source.db, 'Грамматика — повторение');
    await respond(reviews.id, 'sein-cloze:sie_formal', 20, addDays(today, -1));
    await respond(reviews.id, 'sein-cloze:sie_formal', 1, today, true, 'review');
    // Leave an unanswered question in a second session to verify resume data.
    const resumable = (await sessions.start(reviews.id, { mode: 'study', lesson: 'mixed', targetIds: ['pronoun-cloze:du'] }, today))!;
    await sessions.next(reviews.id, resumable.id, today);

    const exported = await exportSchema8GrammarFixture(source.db);
    return validateBackupV2({...exported,version:2,profiles:exported.profiles.map(({grammar:{catalogVersions:_versions,...grammar},...p})=>({...p,grammar:{...grammar,catalogVersion:1}}))});
  } finally { source.close(); }
}

/** Catalog 2 regression data is always generated with production repositories,
 * frozen schema8 transactions and its historical V3 serializer. */
export async function createLektion2RegressionBackup(today: DayKey): Promise<BackupV3> {
 const source=openTestDb();
 try {
  await migrateFrozenSchema8(source.db,today);
  const words=new WordRepository(source.db), topics=new TopicRepository(source.db);
  const gs=new GrammarSessionRepository(source.db),ga=new GrammarAnswerService(source.db);
  async function respond(profileId:string,targetId:import('../src/features/grammar/grammarTypes').GrammarTargetId,count:number,day:DayKey,mode:'study'|'review'='study') {
   const lesson=targetId.startsWith('sein-cloze:')?'sein':targetId.split(':')[0] as import('../src/features/grammar/grammarTypes').GrammarLesson;
   const session=(await gs.start(profileId,{mode,lesson,targetIds:[targetId]},day))!;
   for(let n=0;n<count;n++){const q=(await gs.next(profileId,session.id,day))!;await ga.submit(profileId,session.id,q.attemptId,grammarAnswer(q,true),day);}
  }
  const vocabulary=await createProfile(source.db,'A1 — словарь');
  const duplicate=(await words.list(vocabulary.id)).find(w=>w.de==='Stuhl')!;
  const ws=new SessionRepository(source.db),wa=new AnswerService(source.db);
  const session=await ws.start(vocabulary.id,{mode:'study',wordIds:[duplicate.id]},today);
  for(let n=0;n<20;n++){const q=(await ws.next(vocabulary.id,session.id,today))!;await wa.submit(vocabulary.id,session.id,q.attemptId,q.expected[0],today);}
  await words.create(vocabulary.id,{de:'Sie',ru:'Вы (вежливо)',pos:'pronoun',gender:null});
  const number=await words.create(vocabulary.id,{de:'zweiundzwanzig',ru:'22',pos:'number',gender:null});
  const topic=await topics.create(vocabulary.id,'A1 число');await topics.setWordTopics(vocabulary.id,number.id,[topic.id]);
  const numberSession=await ws.start(vocabulary.id,{mode:'study',wordIds:[number.id]},today);
  // Third mode is typed. Preserve the production session at that question.
  for(let n=0;n<2;n++){const q=(await ws.next(vocabulary.id,numberSession.id,today))!;await wa.submit(vocabulary.id,numberSession.id,q.attemptId,q.expected[0],today);}
  await ws.next(vocabulary.id,numberSession.id,today);
  const history=await createProfile(source.db,'A1 — история');
  await respond(history.id,'sein-cloze:ich',20,addDays(today,-10));
  await respond(history.id,'sein-cloze:ich',1,addDays(today,-9),'review');
  await respond(history.id,'sein-cloze:ich',1,addDays(today,-6),'review');
  await respond(history.id,'yesno-transform:pronoun',19,today);
  for(const lesson of ['professions-pronoun','professions-sein','demonstrative-statement','yesno-transform','yesno-translation'] as const){
   const p=await createProfile(source.db,'A1 — '+lesson);
   const s=(await gs.start(p.id,{mode:'study',lesson},today))!;await gs.next(p.id,s.id,today);
  }
  const formal=await createProfile(source.db,'A1 — Sie');
  for(const person of ['du','er','ihr','sie_plural','noun'] as const)await respond(formal.id,`yesno-translation:${person}`,1,today);
  const formalSession=(await gs.start(formal.id,{mode:'study',lesson:'yesno-translation'},today))!;await gs.next(formal.id,formalSession.id,today);
  await createProfile(source.db,'A1 — пустой исходный');
  // The public backup import supports empty dictionaries; create the empty profile
  // through that production service (there is intentionally no word-delete API).
  const emptyId=(await createProfile(source.db,'A1 — пустой')).id;
  await source.db.run('DELETE FROM word_topics WHERE profileId=?',[emptyId]);
  await source.db.run('DELETE FROM word_progress WHERE profileId=?',[emptyId]);
  await source.db.run('DELETE FROM words WHERE profileId=?',[emptyId]);
  const s=(await gs.start(emptyId,{mode:'study',lesson:'yesno-translation'},today))!;await gs.next(emptyId,s.id,today);
  return validateBackup(await exportSchema8GrammarFixture(source.db)) as BackupV3;
 }finally{source.close();}
}

// Frozen host-only schema8 grammar runtime from commit 7828274.
// It writes historical rules1 transactions, never calls the live grammar service.

class GrammarRepositoryError extends Error {
  constructor(public readonly code: 'NOT_FOUND'|'WRONG_PROFILE'|'VALIDATION', message: string) {
    super(message);
    this.name = 'GrammarRepositoryError';
  }
}

function emptyState(): LearningState {
  return {streak:0,mastered:false,masteryBonusGranted:false,reviewStage:0,dueDay:null,difficult:false,totalErrors:0,recoveryErrors:0,recoveryCorrect:0};
}

type ProgressRow = {
  targetId: GrammarTargetId;
  streak: number;
  mastered: number;
  masteryBonusGranted: number;
  reviewStage: number;
  dueDay: string|null;
  difficult: number;
  totalErrors: number;
  recoveryErrors: number;
  recoveryCorrect: number;
  attemptCount: number;
  variantIndex: number;
};

async function requireProfileAndTarget(tx: SqlExecutor, profileId: string, targetId: GrammarTargetId): Promise<void> {
  if (!await tx.first('SELECT id FROM profiles WHERE id=?', [profileId]))
    throw new GrammarRepositoryError('WRONG_PROFILE', 'Профиль не найден');
  const target=allGrammarTargets.find(item=>item.id===targetId);
  if (!target || !await tx.first('SELECT id FROM grammar_targets WHERE id=? AND catalogVersion=?', [targetId, target.catalogVersion]))
    throw new GrammarRepositoryError('NOT_FOUND', 'Грамматическая цель не найдена');
}

async function readGrammarProgress(tx: SqlExecutor, profileId: string, targetId: GrammarTargetId): Promise<GrammarProgress> {
  await requireProfileAndTarget(tx, profileId, targetId);
  const row = await tx.first<ProgressRow>('SELECT * FROM grammar_progress WHERE profileId=? AND targetId=?', [profileId,targetId]);
  if (!row) return {targetId,state:emptyState(),attemptCount:0,variantIndex:0};
  return {targetId:row.targetId,state:{streak:row.streak,mastered:!!row.mastered,masteryBonusGranted:!!row.masteryBonusGranted,reviewStage:row.reviewStage,dueDay:row.dueDay,difficult:!!row.difficult,totalErrors:row.totalErrors,recoveryErrors:row.recoveryErrors,recoveryCorrect:row.recoveryCorrect},attemptCount:row.attemptCount,variantIndex:row.variantIndex};
}

async function writeGrammarProgress(tx: SqlExecutor, profileId: string, progress: GrammarProgress): Promise<void> {
  await requireProfileAndTarget(tx, profileId, progress.targetId);
  if (!Number.isInteger(progress.variantIndex) || progress.variantIndex<0 || progress.variantIndex>=getGrammarVariantCount(progress.targetId)) throw new GrammarRepositoryError('VALIDATION', 'Некорректный вариант');
  const s = progress.state;
  await tx.run(`INSERT INTO grammar_progress(profileId,targetId,catalogVersion,streak,mastered,masteryBonusGranted,reviewStage,dueDay,difficult,totalErrors,recoveryErrors,recoveryCorrect,attemptCount,variantIndex)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(profileId,targetId) DO UPDATE SET catalogVersion=excluded.catalogVersion,streak=excluded.streak,mastered=excluded.mastered,masteryBonusGranted=excluded.masteryBonusGranted,reviewStage=excluded.reviewStage,dueDay=excluded.dueDay,difficult=excluded.difficult,totalErrors=excluded.totalErrors,recoveryErrors=excluded.recoveryErrors,recoveryCorrect=excluded.recoveryCorrect,attemptCount=excluded.attemptCount,variantIndex=excluded.variantIndex`,
  [profileId,progress.targetId,getGrammarTarget(progress.targetId).catalogVersion,s.streak,s.mastered?1:0,s.masteryBonusGranted?1:0,s.reviewStage,s.dueDay,s.difficult?1:0,s.totalErrors,s.recoveryErrors,s.recoveryCorrect,progress.attemptCount,progress.variantIndex]);
}


class GrammarSessionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'GrammarSessionError';
  }
}

type SessionRow = Omit<GrammarSession,'selection'|'targetIds'|'currentQuestion'|'result'> & {
  selection:string; targetIds:string; currentQuestion:string|null; result:string|null;
};

function decodeSession(row: SessionRow): GrammarSession {
  return {...row,selection:JSON.parse(row.selection),targetIds:JSON.parse(row.targetIds),currentQuestion:row.currentQuestion?JSON.parse(row.currentQuestion):null,result:row.result?JSON.parse(row.result):null};
}

async function ownedSession(tx: SqlExecutor, profileId: string, sessionId: string): Promise<GrammarSession> {
  const row = await tx.first<SessionRow>('SELECT * FROM grammar_sessions WHERE id=?',[sessionId]);
  if (!row) throw new GrammarSessionError('NOT_FOUND','Занятие не найдено');
  if (row.profileId!==profileId) throw new GrammarSessionError('WRONG_PROFILE','Другой профиль');
  return decodeSession(row);
}

function validateSelection(selection: GrammarSelection): void {
  if (!selection || !['study','review'].includes(selection.mode) || !['mixed','pronouns','sein',...allGrammarTargets.filter(t=>t.catalogVersion===2).map(t=>t.kind)].includes(selection.lesson))
    throw new GrammarSessionError('VALIDATION','Неизвестный режим занятия');
  if (selection.targetIds && new Set(selection.targetIds).size!==selection.targetIds.length)
    throw new GrammarSessionError('VALIDATION','Грамматические цели повторяются');
}

function inLesson(targetId: GrammarTargetId, lesson: GrammarSelection['lesson']): boolean {
  const target=getGrammarTarget(targetId);
  return lesson==='mixed' ? target.catalogVersion===1 : lesson==='pronouns' ? target.kind==='pronoun-cloze' : lesson==='sein' ? target.kind==='sein-cloze' : target.kind===lesson;
}

function eligible(mode: GrammarSelection['mode'], state: Awaited<ReturnType<typeof readGrammarProgress>>['state'], today: DayKey): boolean {
  return mode==='study' ? !state.mastered : state.mastered && state.dueDay!==null && state.dueDay<=today;
}

async function questionIsFresh(tx: SqlExecutor, question: GrammarQuestion): Promise<boolean> {
  if (question.catalogVersion!==getGrammarTarget(question.targetId).catalogVersion || !await tx.first('SELECT id FROM grammar_targets WHERE id=? AND catalogVersion=?',[question.targetId,question.catalogVersion])) return false;
  for (const dependency of question.dependencies) {
    const word = await tx.first<Word>('SELECT * FROM words WHERE id=? AND profileId=?',[dependency.wordId,question.profileId]);
    if (!word || (word.revision??1)!==dependency.revision || word.de!==dependency.de || word.ru!==dependency.ru || word.gender!==dependency.gender || word.plural!==dependency.plural) return false;
  }
  return true;
}

class GrammarSessionRepository {
  constructor(private readonly db: SqlStore) {}

  async start(profileId: string, selection: GrammarSelection, today: DayKey): Promise<GrammarSession|null> {
    validateSelection(selection); addDays(today,0);
    return this.db.transaction(async tx => {
      if (!await tx.first('SELECT id FROM profiles WHERE id=?',[profileId])) throw new GrammarSessionError('WRONG_PROFILE','Профиль не найден');
      const requested = selection.targetIds;
      if (requested?.some(id=>!allGrammarTargets.some(target=>target.id===id))) throw new GrammarSessionError('NOT_FOUND','Грамматическая цель не найдена');
      const candidates = allGrammarTargets.filter(target=>inLesson(target.id,selection.lesson) && (!requested || requested.includes(target.id)));
      const progress = await Promise.all(candidates.map(target=>readGrammarProgress(tx,profileId,target.id)));
      const order = new Map(allGrammarTargets.map((target,index)=>[target.id,index]));
      const chosen = progress.filter(item=>eligible(selection.mode,item.state,today)).sort((a,b)=>selection.mode==='study'
        ? a.attemptCount-b.attemptCount || order.get(a.targetId)!-order.get(b.targetId)!
        : a.state.dueDay!.localeCompare(b.state.dueDay!) || order.get(a.targetId)!-order.get(b.targetId)!).slice(0,5);
      if (!chosen.length) return null;
      await tx.run("UPDATE grammar_questions SET status='cancelled' WHERE profileId=? AND status='active'",[profileId]);
      await tx.run("UPDATE grammar_sessions SET status='cancelled' WHERE profileId=? AND status='active'",[profileId]);
      for (const item of chosen) await writeGrammarProgress(tx,profileId,item);
      const id=randomUUID();
      await tx.run("INSERT INTO grammar_sessions(id,profileId,selection,targetIds,cursor,currentQuestion,result,status) VALUES (?,?,?,?,0,NULL,NULL,'active')",[id,profileId,JSON.stringify(selection),JSON.stringify(chosen.map(item=>item.targetId))]);
      return ownedSession(tx,profileId,id);
    });
  }

  async resume(profileId: string): Promise<GrammarSession|null> {
    const row=await this.db.first<SessionRow>("SELECT * FROM grammar_sessions WHERE profileId=? AND status='active'",[profileId]);
    return row?decodeSession(row):null;
  }

  async next(profileId: string, sessionId: string, today: DayKey): Promise<GrammarQuestion|null> {
    addDays(today,0);
    const outcome = await this.db.transaction(async tx => {
      let session=await ownedSession(tx,profileId,sessionId);
      if(session.status!=='active') return {question:null,stale:false};
      if(session.currentQuestion && !session.result) {
        if(await questionIsFresh(tx,session.currentQuestion)) return {question:session.currentQuestion,stale:false};
        await tx.run("UPDATE grammar_questions SET status='cancelled' WHERE attemptId=? AND status='active'",[session.currentQuestion.attemptId]);
        await tx.run('UPDATE grammar_sessions SET currentQuestion=NULL,result=NULL WHERE id=?',[sessionId]);
        return {question:null,stale:true};
      }
      let ids=[...session.targetIds];
      let cursor=session.cursor;
      if(session.currentQuestion && session.result) {
        const answered=session.currentQuestion.targetId;
        const progress=await readGrammarProgress(tx,profileId,answered);
        if(session.selection.mode==='review' || progress.state.mastered) ids=ids.filter(id=>id!==answered);
        cursor=ids.length?cursor%ids.length:0;
        await tx.run('UPDATE grammar_sessions SET targetIds=?,cursor=?,currentQuestion=NULL,result=NULL WHERE id=?',[JSON.stringify(ids),cursor,sessionId]);
      }
      const eligibleIds:GrammarTargetId[]=[];
      for(const id of ids) if(eligible(session.selection.mode,(await readGrammarProgress(tx,profileId,id)).state,today)) eligibleIds.push(id);
      if(eligibleIds.length!==ids.length) {
        ids=eligibleIds; cursor=ids.length?cursor%ids.length:0;
        await tx.run('UPDATE grammar_sessions SET targetIds=?,cursor=? WHERE id=?',[JSON.stringify(ids),cursor,sessionId]);
      }
      if(!ids.length) {
        await tx.run("UPDATE grammar_sessions SET status='completed',currentQuestion=NULL,result=NULL,targetIds='[]',cursor=0 WHERE id=?",[sessionId]);
        return {question:null,stale:false};
      }
      const index=cursor%ids.length;
      const targetId=ids[index];
      const progress=await readGrammarProgress(tx,profileId,targetId);
      const words=await tx.all<Word>('SELECT * FROM words WHERE profileId=? ORDER BY de,id',[profileId]);
      const question=makeGrammarQuestion({attemptId:randomUUID(),sessionId,profileId,targetId,responseMode:grammarResponseMode(progress.attemptCount),variantIndex:progress.variantIndex,words,reviewStage:session.selection.mode==='review'?progress.state.reviewStage:null,dueDay:session.selection.mode==='review'?progress.state.dueDay:null});
      await tx.run("INSERT INTO grammar_questions(attemptId,profileId,sessionId,targetId,catalogVersion,kind,responseMode,payload,status) VALUES (?,?,?,?,?,?,?,?,'active')",[question.attemptId,profileId,sessionId,targetId,question.catalogVersion,question.kind,question.responseMode,JSON.stringify(question)]);
      await tx.run('UPDATE grammar_sessions SET cursor=?,currentQuestion=?,result=NULL WHERE id=?',[(index+1)%ids.length,JSON.stringify(question),sessionId]);
      return {question,stale:false};
    });
    if(outcome.stale) throw new GrammarSessionError('GRAMMAR_QUESTION_STALE','Пример обновлён. Продолжим с новым заданием');
    return outcome.question;
  }

  async cancelQuestion(profileId: string, sessionId: string): Promise<void> {
    await this.db.transaction(async tx=>{
      const session=await ownedSession(tx,profileId,sessionId);
      if(session.currentQuestion && !session.result) {
        await tx.run("UPDATE grammar_questions SET status='cancelled' WHERE attemptId=? AND status='active'",[session.currentQuestion.attemptId]);
        await tx.run('UPDATE grammar_sessions SET currentQuestion=NULL,result=NULL WHERE id=?',[sessionId]);
      }
    });
  }
}
type GrammarAnswerErrorCode =
  | 'WRONG_PROFILE'
  | 'INACTIVE_PROFILE'
  | 'NOT_FOUND'
  | 'GRAMMAR_QUESTION_STALE'
  | 'GRAMMAR_ANSWER_INVALID';

class GrammarAnswerError extends Error {
  constructor(public readonly code: GrammarAnswerErrorCode, message: string) {
    super(message);
    this.name = 'GrammarAnswerError';
  }
}

type AnswerSessionRow = Omit<GrammarSession,'selection'|'targetIds'|'currentQuestion'|'result'> & {
  selection:string;
  targetIds:string;
  currentQuestion:string|null;
  result:string|null;
};

type QuestionRow = {
  attemptId:string;
  profileId:string;
  sessionId:string;
  targetId:string;
  catalogVersion:number;
  kind:string;
  responseMode:string;
  payload:string;
  status:string;
};

function decodeAnswerSession(row: AnswerSessionRow): GrammarSession {
  return {
    ...row,
    selection:JSON.parse(row.selection),
    targetIds:JSON.parse(row.targetIds),
    currentQuestion:row.currentQuestion?JSON.parse(row.currentQuestion):null,
    result:row.result?JSON.parse(row.result):null,
  };
}

async function cancelStale(tx: SqlExecutor, sessionId: string, attemptId: string): Promise<void> {
  await tx.run("UPDATE grammar_questions SET status='cancelled' WHERE attemptId=? AND status='active'",[attemptId]);
  await tx.run('UPDATE grammar_sessions SET currentQuestion=NULL,result=NULL WHERE id=?',[sessionId]);
}

async function dependenciesAreFresh(tx: SqlExecutor, question: GrammarQuestion): Promise<boolean> {
  for (const dependency of question.dependencies) {
    const word=await tx.first<Word>('SELECT * FROM words WHERE id=? AND profileId=?',[dependency.wordId,question.profileId]);
    if (!word || dependency.profileId!==question.profileId || (word.revision??1)!==dependency.revision || word.de!==dependency.de || word.ru!==dependency.ru || word.gender!==dependency.gender || word.plural!==dependency.plural)
      return false;
  }
  return true;
}

type TransactionOutcome =
  | {kind:'result';result:GrammarAttemptResult}
  | {kind:'stale'};

class GrammarAnswerService {
  constructor(private readonly db: SqlStore) {}

  async submit(profileId: string, sessionId: string, attemptId: string, answer: GrammarSubmission, today: DayKey): Promise<GrammarAttemptResult> {
    const outcome=await this.db.transaction<TransactionOutcome>(async tx=>{
      const profile=await tx.first<{id:string}>('SELECT id FROM profiles WHERE id=?',[profileId]);
      if (!profile) throw new GrammarAnswerError('WRONG_PROFILE','Профиль не найден');
      const active=await tx.first<{activeProfileId:string|null}>('SELECT activeProfileId FROM app_settings WHERE id=1');
      if (active?.activeProfileId!==profileId) throw new GrammarAnswerError('INACTIVE_PROFILE','Профиль больше не активен');

      const accepted=await tx.first<{profileId:string;sessionId:string;result:string}>('SELECT profileId,sessionId,result FROM grammar_attempts WHERE attemptId=?',[attemptId]);
      if (accepted) {
        if (accepted.profileId!==profileId) throw new GrammarAnswerError('WRONG_PROFILE','Другой профиль');
        if (accepted.sessionId!==sessionId) throw new GrammarAnswerError('GRAMMAR_QUESTION_STALE','Другое занятие');
        return {kind:'result',result:JSON.parse(accepted.result)};
      }

      const rawSession=await tx.first<AnswerSessionRow>('SELECT * FROM grammar_sessions WHERE id=?',[sessionId]);
      if (!rawSession) throw new GrammarAnswerError('NOT_FOUND','Занятие не найдено');
      if (rawSession.profileId!==profileId) throw new GrammarAnswerError('WRONG_PROFILE','Другой профиль');
      const session=decodeAnswerSession(rawSession);
      const question=session.currentQuestion;
      if (session.status!=='active' || session.result || !question || question.attemptId!==attemptId) return {kind:'stale'};

      const questionRow=await tx.first<QuestionRow>('SELECT * FROM grammar_questions WHERE attemptId=?',[attemptId]);
      const target=await tx.first<{id:string}>('SELECT id FROM grammar_targets WHERE id=? AND catalogVersion=?',[question.targetId,question.catalogVersion]);
      const questionMatches=questionRow?.status==='active'
        && questionRow.profileId===profileId
        && questionRow.sessionId===sessionId
        && questionRow.targetId===question.targetId
        && questionRow.catalogVersion===question.catalogVersion
        && questionRow.kind===question.kind
        && questionRow.responseMode===question.responseMode
        && questionRow.payload===JSON.stringify(question)
        && question.profileId===profileId
        && question.sessionId===sessionId
        && session.targetIds.includes(question.targetId)
        && !!target && question.catalogVersion===getGrammarTarget(question.targetId).catalogVersion;
      if (!questionMatches || !await dependenciesAreFresh(tx,question)) {
        await cancelStale(tx,sessionId,attemptId);
        return {kind:'stale'};
      }

      const progress=await readGrammarProgress(tx,profileId,question.targetId);
      const reviewSnapshot=session.selection.mode==='review'
        ? progress.state.mastered && progress.state.dueDay!==null && progress.state.dueDay<=today && question.reviewStage===progress.state.reviewStage && question.dueDay===progress.state.dueDay
        : !progress.state.mastered && question.reviewStage===null && question.dueDay===null;
      if (!reviewSnapshot) {
        await cancelStale(tx,sessionId,attemptId);
        return {kind:'stale'};
      }

      let right: boolean;
      try {
        right=checkGrammarAnswer(question,answer);
      } catch (error) {
        if (error instanceof Error && error.message==='GRAMMAR_ANSWER_INVALID')
          throw new GrammarAnswerError('GRAMMAR_ANSWER_INVALID','Некорректный ответ');
        await cancelStale(tx,sessionId,attemptId);
        return {kind:'stale'};
      }

      const transition=applyGrammarAnswer(progress.state,right,session.selection.mode,today,1);
      const nextProgress={
        ...progress,
        state:transition.state,
        attemptCount:progress.attemptCount+1,
        variantIndex:(progress.variantIndex+1)%getGrammarVariantCount(question.targetId),
      };
      const result:GrammarAttemptResult={
        attemptId,
        targetId:question.targetId,
        right,
        xpDelta:transition.xpDelta,
        state:transition.state,
        submittedAnswer:answer,
      };

      await writeGrammarProgress(tx,profileId,nextProgress);
      await tx.run('UPDATE profiles SET xp=xp+? WHERE id=?',[result.xpDelta,profileId]);
      await tx.run('INSERT INTO grammar_attempts(attemptId,profileId,sessionId,targetId,right,xpDelta,result,day) VALUES (?,?,?,?,?,?,?,?)',[attemptId,profileId,sessionId,question.targetId,+right,result.xpDelta,JSON.stringify(result),today]);
      if (transition.firstMastery)
        await tx.run('INSERT INTO grammar_rewards(profileId,targetId,attemptId,amount,day) VALUES (?,?,?,50,?)',[profileId,question.targetId,attemptId,today]);
      await tx.run('INSERT INTO daily_activity(profileId,day,correct,errors,xp) VALUES (?,?,?,?,?) ON CONFLICT(profileId,day) DO UPDATE SET correct=correct+excluded.correct,errors=errors+excluded.errors,xp=xp+excluded.xp',[profileId,today,+right,+!right,result.xpDelta]);
      await tx.run("UPDATE grammar_questions SET status='answered' WHERE attemptId=?",[attemptId]);
      await tx.run('UPDATE grammar_sessions SET result=? WHERE id=?',[JSON.stringify(result),sessionId]);
      return {kind:'result',result};
    });

    if (outcome.kind==='stale') throw new GrammarAnswerError('GRAMMAR_QUESTION_STALE','Задание устарело');
    notifyProfileChanged(profileId);
    return outcome.result;
  }
}