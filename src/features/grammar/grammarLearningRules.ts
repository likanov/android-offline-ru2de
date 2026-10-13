import { AppError } from '../../core/errors';
import { applyAnswer } from '../learning/learningRules';
import type { DayKey, LearningState, LearningTransition } from '../learning/learningTypes';
import type { GrammarRulesVersion } from './grammarRuleTypes';

export function applyGrammarAnswer(
  state: LearningState,
  right: boolean,
  mode: 'study' | 'review',
  today: DayKey,
  rulesVersion: GrammarRulesVersion = 2,
): LearningTransition {
  if (rulesVersion !== 1 && rulesVersion !== 2) {
    throw new AppError('VALIDATION', 'Invalid grammar rules version');
  }
  return applyAnswer(state, right, mode, today, {
    requiredCorrect: rulesVersion === 1 ? 20 : 10,
  });
}
