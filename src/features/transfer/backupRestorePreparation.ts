import { createGrammarRulesTransition } from '../grammar/grammarRulesUpgrade';
import type { DayKey } from '../learning/learningTypes';
import type { BackupV3, BackupV4, ProfileBackupV4 } from './backupTypes';
import { validateBackup, validateBackupV4 } from './backupValidation';
/** Validate historical rules first, then upgrade a detached graph on the restore day. */
export function prepareBackupRestore(source: BackupV3 | BackupV4, today: DayKey): BackupV4 {
    const backup = validateBackup(JSON.parse(JSON.stringify(source)));
    if (backup.version === 4)
        return backup;
    const profiles: ProfileBackupV4[] = backup.profiles.map(part => {
        const rulesTransitions = part.grammar.progress.map(progress => createGrammarRulesTransition({
            profileId: part.profile.id,
            targetId: progress.targetId,
            afterAttemptId: part.grammar.attempts.filter(row => row.targetId === progress.targetId).at(-1)?.result.attemptId ?? null,
            day: today,
            stateBefore: progress.state,
        }));
        for (const transition of rulesTransitions) {
            if (transition.stateBefore.mastered || !transition.stateAfter.mastered)
                continue;
            for (const row of part.grammar.questions) {
                const session = part.grammar.sessions.find(session => session.id === row.question.sessionId);
                if (row.question.targetId === transition.targetId && row.status === 'active' && session?.status === 'active' && session.result === null && session.selection.mode === 'study') {
                    row.status = 'cancelled';
                    session.currentQuestion = null;
                    session.result = null;
                }
            }
        }
        const bonus = rulesTransitions.reduce((sum, row) => sum + row.xpDelta, 0);
        const dailyActivity = part.dailyActivity.map(row => ({ ...row }));
        if (bonus) {
            const existing = dailyActivity.find(row => row.day === today);
            if (existing)
                existing.xp += bonus;
            else
                dailyActivity.push({ profileId: part.profile.id, day: today, correct: 0, errors: 0, xp: bonus });
        }
        return { ...part, profile: { ...part.profile, xp: part.profile.xp + bonus }, dailyActivity, grammar: {
                ...part.grammar, rulesVersion: 2, rulesTransitions,
                progress: part.grammar.progress.map((progress, index) => ({ ...progress, state: rulesTransitions[index].stateAfter })),
            } };
    });
    return validateBackupV4({ ...backup, version: 4, profiles });
}
