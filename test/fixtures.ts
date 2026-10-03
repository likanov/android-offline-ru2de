import type { LearningState } from "../src/features/learning/learningTypes";

export const profileNames = ["Антон", "Мария"];

export function state(overrides: Partial<LearningState> = {}): LearningState {
  return {
    streak: 0,
    mastered: false,
    masteryBonusGranted: false,
    reviewStage: 0,
    dueDay: null,
    difficult: false,
    totalErrors: 0,
    recoveryErrors: 0,
    recoveryCorrect: 0,
    ...overrides,
  };
}
