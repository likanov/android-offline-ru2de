import { addDays } from '../../core/calendar';
import { applyGrammarAnswer } from '../grammar/grammarLearningRules';
import { upgradeGrammarState } from '../grammar/grammarRulesUpgrade';
import { validateLearningState } from '../learning/learningRules';
import type { LearningState } from '../learning/learningTypes';
import type { GrammarTargetId } from '../grammar/grammarTypes';
import type { GrammarProfileBackupV4 } from './backupTypes';
const emptyState = (): LearningState => ({ streak: 0, mastered: false, masteryBonusGranted: false, reviewStage: 0, dueDay: null, difficult: false, totalErrors: 0, recoveryErrors: 0, recoveryCorrect: 0 });
function invalid(): never { throw new Error('Резервная копия повреждена или имеет неподдерживаемый формат'); }
function sameState(a: LearningState, b: LearningState): boolean {
    return !!a && !!b && (Object.keys(emptyState()) as (keyof LearningState)[]).every(key => a[key] === b[key]);
}
function validDay(day: string): void { try {
    addDays(day, 0);
}
catch {
    invalid();
} }
/** Replay immutable answers, inserting the single rules upgrade at its recorded anchor. */
export function replayGrammarRules(part: GrammarProfileBackupV4): Map<GrammarTargetId, LearningState> {
    if (part.rulesVersion !== 2 || !Array.isArray(part.rulesTransitions))
        invalid();
    const transitions = new Map<GrammarTargetId, GrammarProfileBackupV4['rulesTransitions'][number]>();
    for (const transition of part.rulesTransitions) {
        if (!transition || transitions.has(transition.targetId) || transition.fromRulesVersion !== 1 || transition.toRulesVersion !== 2 || !part.progress.some(row => row.targetId === transition.targetId && row.profileId === transition.profileId))
            invalid();
        validDay(transition.day);
        transitions.set(transition.targetId, transition);
    }
    const states = new Map<GrammarTargetId, LearningState>();
    for (const progress of part.progress) {
        const attempts = part.attempts.filter(row => row.targetId === progress.targetId);
        const transition = transitions.get(progress.targetId);
        let state = emptyState(), version: 1 | 2 = transition ? 1 : (attempts[0]?.result.rulesVersion ?? 2);
        let applied = false;
        const upgrade = () => {
            if (!transition || applied || !sameState(state, transition.stateBefore))
                invalid();
            const expected = upgradeGrammarState(state, transition.day);
            if (expected.xpDelta !== transition.xpDelta || !sameState(expected.state, transition.stateAfter))
                invalid();
            state = expected.state;
            version = 2;
            applied = true;
        };
        if (transition?.afterAttemptId === null)
            upgrade();
        for (const attempt of attempts) {
            validDay(attempt.day);
            if ((attempt.result.rulesVersion ?? 1) !== version || (applied && attempt.day < transition!.day))
                invalid();
            const answer = applyGrammarAnswer(state, attempt.result.right, state.mastered ? 'review' : 'study', attempt.day, version);
            if (!sameState(answer.state, attempt.result.state) || answer.xpDelta !== attempt.result.xpDelta)
                invalid();
            state = answer.state;
            if (transition?.afterAttemptId === attempt.result.attemptId) {
                if (transition.day < attempt.day)
                    invalid();
                upgrade();
            }
        }
        if ((transition && !applied) || (attempts.length && version !== 2) || progress.attemptCount !== attempts.length || !sameState(state, progress.state))
            invalid();
        try {
            validateLearningState(progress.state, { requiredCorrect: 10 });
        }
        catch {
            invalid();
        }
        const rewards = part.rewards.filter(row => row.targetId === progress.targetId);
        const bonusSources = rewards.length + (transition?.xpDelta === 50 ? 1 : 0);
        if (bonusSources > 1 || state.masteryBonusGranted !== (bonusSources === 1))
            invalid();
        for (const reward of rewards) {
            const attempt = attempts.find(row => row.result.attemptId === reward.attemptId);
            if (!attempt || attempt.result.xpDelta !== 60)
                invalid();
        }
        states.set(progress.targetId, state);
    }
    for (const attempt of part.attempts)
        if (!states.has(attempt.targetId))
            invalid();
    return states;
}
