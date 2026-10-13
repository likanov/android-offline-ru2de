import type { SqlExecutor } from '../sql';
import type { DayKey, LearningState } from '../../features/learning/learningTypes';
import type { GrammarTargetId } from '../../features/grammar/grammarTypes';
import { createGrammarRulesTransition } from '../../features/grammar/grammarRulesUpgrade';
type LegacyProgressRow = {
    profileId: string;
    targetId: GrammarTargetId;
    streak: number;
    mastered: number;
    masteryBonusGranted: number;
    reviewStage: number;
    dueDay: DayKey | null;
    difficult: number;
    totalErrors: number;
    recoveryErrors: number;
    recoveryCorrect: number;
};
/** Called inside a schemaTransaction: progress, transition ledger and XP commit together. */
export async function migrateGrammarMastery(tx: SqlExecutor, today: DayKey): Promise<void> {
    const columns = await tx.all<{
        name: string;
    }>('PRAGMA table_info(grammar_progress)');
    if (columns.some(column => column.name === 'rulesVersion'))
        return;
    const rows = await tx.all<LegacyProgressRow>('SELECT * FROM grammar_progress ORDER BY rowid');
    const transitions = [];
    for (const row of rows) {
        const stateBefore: LearningState = { streak: row.streak, mastered: !!row.mastered, masteryBonusGranted: !!row.masteryBonusGranted, reviewStage: row.reviewStage, dueDay: row.dueDay, difficult: !!row.difficult, totalErrors: row.totalErrors, recoveryErrors: row.recoveryErrors, recoveryCorrect: row.recoveryCorrect };
        const last = await tx.first<{
            attemptId: string;
        }>('SELECT attemptId FROM grammar_attempts WHERE profileId=? AND targetId=? ORDER BY rowid DESC LIMIT 1', [row.profileId, row.targetId]);
        transitions.push(createGrammarRulesTransition({ profileId: row.profileId, targetId: row.targetId, afterAttemptId: last?.attemptId ?? null, day: today, stateBefore }));
    }
    const original = await tx.first<{
        sql: string;
    }>("SELECT sql FROM sqlite_master WHERE type='table' AND name='grammar_progress'");
    if (!original)
        throw new Error('Missing grammar progress schema');
    const indexes = await tx.all<{
        sql: string;
    }>("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name='grammar_progress' AND sql IS NOT NULL");
    const updated = original.sql
        .replace(/^CREATE TABLE\s+(?:"grammar_progress"|grammar_progress)\s*\(/, 'CREATE TABLE grammar_progress_v9(')
        .replace('streak BETWEEN 0 AND 20', 'streak BETWEEN 0 AND 10')
        .replace('mastered=(streak=20)', 'mastered=(streak=10)')
        .replace('streak INTEGER', 'rulesVersion INTEGER NOT NULL DEFAULT 2 CHECK(rulesVersion=2),\n streak INTEGER');
    await tx.exec(updated);
    // Converted state is inserted below; preserve all non-state counters and catalog versions.
    for (const transition of transitions) {
        const s = transition.stateAfter;
        await tx.run(`INSERT INTO grammar_progress_v9(profileId,targetId,catalogVersion,rulesVersion,streak,mastered,masteryBonusGranted,reviewStage,dueDay,difficult,totalErrors,recoveryErrors,recoveryCorrect,attemptCount,variantIndex)
      SELECT profileId,targetId,catalogVersion,2,?,?,?,?,?,?,?,?,?,attemptCount,variantIndex FROM grammar_progress WHERE profileId=? AND targetId=?`, [s.streak, +s.mastered, +s.masteryBonusGranted, s.reviewStage, s.dueDay, +s.difficult, s.totalErrors, s.recoveryErrors, s.recoveryCorrect, transition.profileId, transition.targetId]);
    }
    await tx.exec('DROP TABLE grammar_progress; ALTER TABLE grammar_progress_v9 RENAME TO grammar_progress;');
    for (const index of indexes)
        await tx.exec(index.sql);
    await tx.exec(`CREATE TABLE grammar_rule_transitions(
    profileId TEXT NOT NULL REFERENCES profiles(id),
    targetId TEXT NOT NULL REFERENCES grammar_targets(id),
    fromRulesVersion INTEGER NOT NULL CHECK(fromRulesVersion=1),
    toRulesVersion INTEGER NOT NULL CHECK(toRulesVersion=2),
    afterAttemptId TEXT,
    day TEXT NOT NULL,
    stateBefore TEXT NOT NULL CHECK(json_valid(stateBefore)),
    stateAfter TEXT NOT NULL CHECK(json_valid(stateAfter)),
    xpDelta INTEGER NOT NULL CHECK(xpDelta IN (0,50)),
    PRIMARY KEY(profileId,targetId,toRulesVersion),
    FOREIGN KEY(profileId,targetId) REFERENCES grammar_progress(profileId,targetId),
    FOREIGN KEY(afterAttemptId,profileId,targetId) REFERENCES grammar_attempts(attemptId,profileId,targetId)
  );`);
    for (const transition of transitions) {
        const { profileId, targetId, stateBefore, stateAfter, xpDelta } = transition;
        await tx.run('INSERT INTO grammar_rule_transitions(profileId,targetId,fromRulesVersion,toRulesVersion,afterAttemptId,day,stateBefore,stateAfter,xpDelta) VALUES (?,?,1,2,?,?,?,?,?)', [profileId, targetId, transition.afterAttemptId, today, JSON.stringify(stateBefore), JSON.stringify(stateAfter), xpDelta]);
        if (xpDelta) {
            await tx.run('UPDATE profiles SET xp=xp+? WHERE id=?', [xpDelta, profileId]);
            await tx.run('INSERT INTO daily_activity(profileId,day,correct,errors,xp) VALUES (?,?,0,0,?) ON CONFLICT(profileId,day) DO UPDATE SET xp=xp+excluded.xp', [profileId, today, xpDelta]);
        }
        if (!stateBefore.mastered && stateAfter.mastered) {
            const pending = await tx.all<{
                attemptId: string;
                sessionId: string;
            }>(`SELECT q.attemptId,q.sessionId FROM grammar_questions q JOIN grammar_sessions s ON s.id=q.sessionId
        WHERE q.profileId=? AND q.targetId=? AND q.status='active' AND s.status='active' AND s.result IS NULL AND json_extract(s.selection,'$.mode')='study'`, [profileId, targetId]);
            for (const question of pending) {
                await tx.run("UPDATE grammar_questions SET status='cancelled' WHERE attemptId=?", [question.attemptId]);
                await tx.run('UPDATE grammar_sessions SET currentQuestion=NULL,result=NULL WHERE id=?', [question.sessionId]);
            }
        }
    }
}
