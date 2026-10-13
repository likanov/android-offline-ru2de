import { addDays } from '../../core/calendar';
import { validateLearningState } from '../learning/learningRules';
import type { DayKey, LearningState } from '../learning/learningTypes';
import type { GrammarRulesTransition } from './grammarRuleTypes';
import type { GrammarTargetId } from './grammarTypes';

export function upgradeGrammarState(
  state: LearningState,
  day: DayKey,
): { state: LearningState; xpDelta: 0 | 50 } {
  validateLearningState(state, { requiredCorrect: 20 });
  addDays(day, 0);
  const next = { ...state };
  let xpDelta: 0 | 50 = 0;
  if (state.streak >= 10) {
    next.streak = 10;
    next.mastered = true;
    xpDelta = state.masteryBonusGranted ? 0 : 50;
    next.masteryBonusGranted = true;
    if (!state.mastered) {
      next.reviewStage = 0;
      next.dueDay = addDays(day, 1);
    }
  }
  return { state: next, xpDelta };
}

export function createGrammarRulesTransition(input: {
  profileId: string;
  targetId: GrammarTargetId;
  afterAttemptId: string | null;
  day: DayKey;
  stateBefore: LearningState;
}): GrammarRulesTransition {
  const upgraded = upgradeGrammarState(input.stateBefore, input.day);
  return {
    ...input,
    fromRulesVersion: 1,
    toRulesVersion: 2,
    stateBefore: { ...input.stateBefore },
    stateAfter: upgraded.state,
    xpDelta: upgraded.xpDelta,
  };
}
