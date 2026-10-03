import type {
  DayKey,
  LearningState,
  LearningTransition,
} from "./learningTypes";
import { addDays } from "../../core/calendar";
import { AppError } from "../../core/errors";

const intervals = [1, 3, 7, 14, 30, 60];

function validCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validateState(state: LearningState): void {
  const counts = [
    state.streak,
    state.reviewStage,
    state.totalErrors,
    state.recoveryErrors,
    state.recoveryCorrect,
  ];
  const flags = [state.mastered, state.masteryBonusGranted, state.difficult];
  if (
    counts.some((value) => !validCount(value)) ||
    flags.some((value) => typeof value !== "boolean") ||
    state.streak > 20 ||
    state.reviewStage > 5 ||
    state.recoveryCorrect > 2 ||
    state.totalErrors < state.recoveryErrors ||
    state.mastered !== (state.streak === 20) ||
    (state.mastered && (!state.masteryBonusGranted || state.dueDay === null)) ||
    (!state.mastered && (state.dueDay !== null || state.reviewStage !== 0)) ||
    state.difficult !== state.recoveryErrors >= 3 ||
    (!state.difficult && state.recoveryCorrect !== 0)
  ) {
    throw new AppError("VALIDATION", "Impossible learning state");
  }
  if (state.dueDay !== null) addDays(state.dueDay, 0);
}

export function applyAnswer(
  state: LearningState,
  right: boolean,
  mode: "study" | "review",
  today: DayKey,
): LearningTransition {
  validateState(state);
  addDays(today, 0);
  if (
    typeof right !== "boolean" ||
    (mode !== "study" && mode !== "review") ||
    (mode === "study" && state.mastered) ||
    (mode === "review" &&
      (!state.mastered || state.dueDay === null || today < state.dueDay))
  ) {
    throw new AppError("VALIDATION", "Answer or learning mode is not eligible");
  }
  const next = { ...state };
  let firstMastery = false;
  if (!right) {
    next.totalErrors += 1;
    next.recoveryErrors += 1;
    next.recoveryCorrect = 0;
    next.difficult = next.recoveryErrors >= 3;
  } else if (next.difficult) {
    next.recoveryCorrect += 1;
    if (next.recoveryCorrect === 3) {
      next.difficult = false;
      next.recoveryErrors = 0;
      next.recoveryCorrect = 0;
    }
  }
  if (mode === "study") {
    next.streak = right ? next.streak + 1 : 0;
    if (next.streak === 20) {
      next.mastered = true;
      firstMastery = !next.masteryBonusGranted;
      next.masteryBonusGranted = true;
      next.reviewStage = 0;
      next.dueDay = addDays(today, intervals[0]);
    }
  } else {
    next.reviewStage = right ? Math.min(next.reviewStage + 1, 5) : 0;
    next.dueDay = addDays(today, intervals[next.reviewStage]);
  }
  return {
    state: next,
    xpDelta: right ? 10 + (firstMastery ? 50 : 0) : 0,
    firstMastery,
  };
}

export function levelForXp(xp: number): number {
  if (!validCount(xp))
    throw new AppError("VALIDATION", "XP must be a nonnegative integer");
  return 1 + Math.floor(xp / 500);
}
