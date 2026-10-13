import type { DayKey, LearningState } from '../learning/learningTypes';
import type { GrammarTargetId } from './grammarTypes';

export type GrammarRulesVersion = 1 | 2;
export type GrammarRulesTransition = {
  profileId: string;
  targetId: GrammarTargetId;
  fromRulesVersion: 1;
  toRulesVersion: 2;
  afterAttemptId: string | null;
  day: DayKey;
  stateBefore: LearningState;
  stateAfter: LearningState;
  xpDelta: 0 | 50;
};
