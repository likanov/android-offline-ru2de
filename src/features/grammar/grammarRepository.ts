import type { SqlExecutor, SqlStore } from '../../core/sql';
import type { LearningState } from '../learning/learningTypes';
import type { GrammarProgress, GrammarTargetId } from './grammarTypes';

export class GrammarRepositoryError extends Error {
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
  if (!await tx.first('SELECT id FROM grammar_targets WHERE id=? AND catalogVersion=1', [targetId]))
    throw new GrammarRepositoryError('NOT_FOUND', 'Грамматическая цель не найдена');
}

export async function readGrammarProgress(tx: SqlExecutor, profileId: string, targetId: GrammarTargetId): Promise<GrammarProgress> {
  await requireProfileAndTarget(tx, profileId, targetId);
  const row = await tx.first<ProgressRow>('SELECT * FROM grammar_progress WHERE profileId=? AND targetId=?', [profileId,targetId]);
  if (!row) return {targetId,state:emptyState(),attemptCount:0,variantIndex:0};
  return {targetId:row.targetId,state:{streak:row.streak,mastered:!!row.mastered,masteryBonusGranted:!!row.masteryBonusGranted,reviewStage:row.reviewStage,dueDay:row.dueDay,difficult:!!row.difficult,totalErrors:row.totalErrors,recoveryErrors:row.recoveryErrors,recoveryCorrect:row.recoveryCorrect},attemptCount:row.attemptCount,variantIndex:row.variantIndex};
}

export async function writeGrammarProgress(tx: SqlExecutor, profileId: string, progress: GrammarProgress): Promise<void> {
  await requireProfileAndTarget(tx, profileId, progress.targetId);
  const s = progress.state;
  await tx.run(`INSERT INTO grammar_progress(profileId,targetId,catalogVersion,streak,mastered,masteryBonusGranted,reviewStage,dueDay,difficult,totalErrors,recoveryErrors,recoveryCorrect,attemptCount,variantIndex)
    VALUES (?,?,1,?,?,?,?,?,?,?,?,?,?,?)
    ON CONFLICT(profileId,targetId) DO UPDATE SET catalogVersion=excluded.catalogVersion,streak=excluded.streak,mastered=excluded.mastered,masteryBonusGranted=excluded.masteryBonusGranted,reviewStage=excluded.reviewStage,dueDay=excluded.dueDay,difficult=excluded.difficult,totalErrors=excluded.totalErrors,recoveryErrors=excluded.recoveryErrors,recoveryCorrect=excluded.recoveryCorrect,attemptCount=excluded.attemptCount,variantIndex=excluded.variantIndex`,
  [profileId,progress.targetId,s.streak,s.mastered?1:0,s.masteryBonusGranted?1:0,s.reviewStage,s.dueDay,s.difficult?1:0,s.totalErrors,s.recoveryErrors,s.recoveryCorrect,progress.attemptCount,progress.variantIndex]);
}

export class GrammarRepository {
  constructor(private readonly db: SqlStore) {}
  getState(profileId: string, targetId: GrammarTargetId): Promise<GrammarProgress> {
    return readGrammarProgress(this.db,profileId,targetId);
  }
  write(profileId: string, progress: GrammarProgress): Promise<void> {
    return this.db.transaction(tx => writeGrammarProgress(tx,profileId,progress));
  }
}
