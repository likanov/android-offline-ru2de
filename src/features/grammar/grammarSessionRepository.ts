import { randomUUID } from 'expo-crypto';
import { addDays } from '../../core/calendar';
import type { SqlExecutor, SqlStore } from '../../core/sql';
import { grammarTargets } from './grammarCatalog';
import { grammarResponseMode, makeGrammarQuestion } from './grammarQuestionFactory';
import { readGrammarProgress, writeGrammarProgress } from './grammarRepository';
import type { DayKey, Word } from '../learning/learningTypes';
import type { GrammarQuestion, GrammarSelection, GrammarSession, GrammarTargetId } from './grammarTypes';

export class GrammarSessionError extends Error {
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
  if (!selection || !['study','review'].includes(selection.mode) || !['mixed','pronouns','sein'].includes(selection.lesson))
    throw new GrammarSessionError('VALIDATION','Неизвестный режим занятия');
  if (selection.targetIds && new Set(selection.targetIds).size!==selection.targetIds.length)
    throw new GrammarSessionError('VALIDATION','Грамматические цели повторяются');
}

function inLesson(targetId: GrammarTargetId, lesson: GrammarSelection['lesson']): boolean {
  return lesson==='mixed' || (lesson==='pronouns' && targetId.startsWith('pronoun-cloze:')) || (lesson==='sein' && targetId.startsWith('sein-cloze:'));
}

function eligible(mode: GrammarSelection['mode'], state: Awaited<ReturnType<typeof readGrammarProgress>>['state'], today: DayKey): boolean {
  return mode==='study' ? !state.mastered : state.mastered && state.dueDay!==null && state.dueDay<=today;
}

async function questionIsFresh(tx: SqlExecutor, question: GrammarQuestion): Promise<boolean> {
  if (question.catalogVersion!==1 || !await tx.first('SELECT id FROM grammar_targets WHERE id=? AND catalogVersion=?',[question.targetId,question.catalogVersion])) return false;
  for (const dependency of question.dependencies) {
    const word = await tx.first<Word>('SELECT * FROM words WHERE id=? AND profileId=?',[dependency.wordId,question.profileId]);
    if (!word || (word.revision??1)!==dependency.revision || word.de!==dependency.de || word.ru!==dependency.ru || word.gender!==dependency.gender || word.plural!==dependency.plural) return false;
  }
  return true;
}

export class GrammarSessionRepository {
  constructor(private readonly db: SqlStore) {}

  async start(profileId: string, selection: GrammarSelection, today: DayKey): Promise<GrammarSession|null> {
    validateSelection(selection); addDays(today,0);
    return this.db.transaction(async tx => {
      if (!await tx.first('SELECT id FROM profiles WHERE id=?',[profileId])) throw new GrammarSessionError('WRONG_PROFILE','Профиль не найден');
      const requested = selection.targetIds;
      if (requested?.some(id=>!grammarTargets.some(target=>target.id===id))) throw new GrammarSessionError('NOT_FOUND','Грамматическая цель не найдена');
      const candidates = grammarTargets.filter(target=>inLesson(target.id,selection.lesson) && (!requested || requested.includes(target.id)));
      const progress = await Promise.all(candidates.map(target=>readGrammarProgress(tx,profileId,target.id)));
      const order = new Map(grammarTargets.map((target,index)=>[target.id,index]));
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
