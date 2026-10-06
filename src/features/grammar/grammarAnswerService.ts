import { notifyProfileChanged } from '../../app/refreshBus';
import type { SqlExecutor, SqlStore } from '../../core/sql';
import { applyAnswer } from '../learning/learningRules';
import type { DayKey, Word } from '../learning/learningTypes';
import { checkGrammarAnswer } from './grammarQuestionFactory';
import { readGrammarProgress, writeGrammarProgress } from './grammarRepository';
import type { GrammarAttemptResult, GrammarQuestion, GrammarSession, GrammarSubmission } from './grammarTypes';

export type GrammarAnswerErrorCode =
  | 'WRONG_PROFILE'
  | 'INACTIVE_PROFILE'
  | 'NOT_FOUND'
  | 'GRAMMAR_QUESTION_STALE'
  | 'GRAMMAR_ANSWER_INVALID';

export class GrammarAnswerError extends Error {
  constructor(public readonly code: GrammarAnswerErrorCode, message: string) {
    super(message);
    this.name = 'GrammarAnswerError';
  }
}

type SessionRow = Omit<GrammarSession,'selection'|'targetIds'|'currentQuestion'|'result'> & {
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

function decodeSession(row: SessionRow): GrammarSession {
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

export class GrammarAnswerService {
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

      const rawSession=await tx.first<SessionRow>('SELECT * FROM grammar_sessions WHERE id=?',[sessionId]);
      if (!rawSession) throw new GrammarAnswerError('NOT_FOUND','Занятие не найдено');
      if (rawSession.profileId!==profileId) throw new GrammarAnswerError('WRONG_PROFILE','Другой профиль');
      const session=decodeSession(rawSession);
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
        && !!target;
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

      const transition=applyAnswer(progress.state,right,session.selection.mode,today);
      const nextProgress={
        ...progress,
        state:transition.state,
        attemptCount:progress.attemptCount+1,
        variantIndex:(progress.variantIndex+1)%3,
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
