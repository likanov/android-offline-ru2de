import {
  applyAnswer,
  levelForXp,
} from "../../src/features/learning/learningRules";
import { state } from "../fixtures";
import { AppError } from "../../src/core/errors";

// Catches an off-by-one mastery threshold or missing first-completion reward.
test("twentieth correct answer masters a word and grants bonus once", () => {
  expect(
    applyAnswer(state({ streak: 19 }), true, "study", "2026-10-03"),
  ).toMatchObject({
    xpDelta: 60,
    firstMastery: true,
    state: {
      streak: 20,
      mastered: true,
      masteryBonusGranted: true,
      reviewStage: 0,
      dueDay: "2026-10-04",
    },
  });
});
test("a correct answer before mastery gives ten XP", () => {
  expect(
    applyAnswer(state({ streak: 18 }), true, "study", "2026-10-03"),
  ).toMatchObject({
    xpDelta: 10,
    firstMastery: false,
    state: { streak: 19, mastered: false, dueDay: null },
  });
});
test("a study error resets only this word and never subtracts XP", () => {
  const original = state({ streak: 19 });
  expect(applyAnswer(original, false, "study", "2026-10-03")).toMatchObject({
    xpDelta: 0,
    firstMastery: false,
    state: { streak: 0, totalErrors: 1 },
  });
  expect(original.streak).toBe(19);
});
test("a previously granted mastery bonus is never repeated", () => {
  expect(
    applyAnswer(
      state({ streak: 19, masteryBonusGranted: true }),
      true,
      "study",
      "2026-10-03",
    ),
  ).toMatchObject({ xpDelta: 10, firstMastery: false });
});
const mastered = {
  streak: 20,
  mastered: true,
  masteryBonusGranted: true,
  dueDay: "2026-10-03",
};
// Catches the wrong interval, scheduling from the old due day, or advancing beyond stage five.
test.each([
  [0, "2026-10-03", 1, "2026-10-06"],
  [1, "2026-10-08", 2, "2026-10-15"],
  [2, "2026-10-03", 3, "2026-10-17"],
  [3, "2026-10-03", 4, "2026-11-02"],
  [4, "2026-10-03", 5, "2026-12-02"],
  [5, "2026-10-03", 5, "2026-12-02"],
])(
  "review stage %i schedules from answer day %s",
  (reviewStage, today, nextStage, dueDay) => {
    expect(
      applyAnswer(state({ ...mastered, reviewStage }), true, "review", today),
    ).toMatchObject({
      xpDelta: 10,
      firstMastery: false,
      state: { streak: 20, mastered: true, reviewStage: nextStage, dueDay },
    });
  },
);
test("review error schedules tomorrow while preserving initial mastery", () => {
  expect(
    applyAnswer(
      state({ ...mastered, reviewStage: 4 }),
      false,
      "review",
      "2026-10-03",
    ),
  ).toMatchObject({
    xpDelta: 0,
    state: {
      streak: 20,
      mastered: true,
      masteryBonusGranted: true,
      reviewStage: 0,
      dueDay: "2026-10-04",
    },
  });
});
// Catches resetting nonconsecutive recovery errors on an intervening success.
test("three cumulative errors mark difficult and three consecutive successes recover", () => {
  let current = state();
  for (const right of [false, true, false, true, false])
    current = applyAnswer(current, right, "study", "2026-10-03").state;
  expect(current).toMatchObject({
    difficult: true,
    totalErrors: 3,
    recoveryErrors: 3,
    recoveryCorrect: 0,
  });
  for (const right of [true, true])
    current = applyAnswer(current, right, "study", "2026-10-03").state;
  expect(current.difficult).toBe(true);
  current = applyAnswer(current, true, "study", "2026-10-03").state;
  expect(current).toMatchObject({
    difficult: false,
    totalErrors: 3,
    recoveryErrors: 0,
    recoveryCorrect: 0,
  });
  for (const right of [false, true, false, true, false])
    current = applyAnswer(current, right, "study", "2026-10-03").state;
  expect(current).toMatchObject({
    difficult: true,
    totalErrors: 6,
    recoveryErrors: 3,
  });
});
test("an error interrupts consecutive recovery successes", () => {
  const current = state({
    difficult: true,
    totalErrors: 3,
    recoveryErrors: 3,
    recoveryCorrect: 2,
  });
  expect(
    applyAnswer(current, false, "study", "2026-10-03").state,
  ).toMatchObject({
    difficult: true,
    totalErrors: 4,
    recoveryErrors: 4,
    recoveryCorrect: 0,
  });
});
test.each([
  [state({ ...mastered, dueDay: "2026-10-04" }), "review"],
  [state(), "review"],
  [state(mastered), "study"],
  [state({ streak: 21 }), "study"],
  [state({ ...mastered, streak: 19 }), "review"],
  [state({ reviewStage: 6 }), "study"],
  [state({ totalErrors: -1 }), "study"],
  [state({ difficult: true }), "study"],
  [state({ dueDay: "2026-02-29" }), "study"],
] as const)(
  "rejects impossible state or premature review %#",
  (input, mode) => {
    expect(() => applyAnswer(input, true, mode, "2026-10-03")).toThrow(
      AppError,
    );
    try {
      applyAnswer(input, true, mode, "2026-10-03");
    } catch (error) {
      expect(error).toMatchObject({ code: "VALIDATION" });
    }
  },
);
test.each([
  [0, 1],
  [499, 1],
  [500, 2],
  [999, 2],
  [1000, 3],
])("level at %i XP is %i", (xp, level) => {
  expect(levelForXp(xp)).toBe(level);
});
test.each([-1, NaN, Infinity, 1.5])("rejects invalid XP %s", (xp) => {
  expect(() => levelForXp(xp)).toThrow(AppError);
});
// Catches treating a missing submission as a false answer and charging an error.
test("missing answer is rejected without mutating progress", () => {
  const original = state({ streak: 7 });
  expect(() =>
    applyAnswer(
      original,
      undefined as unknown as boolean,
      "study",
      "2026-10-03",
    ),
  ).toThrow(AppError);
  expect(original).toMatchObject({ streak: 7, totalErrors: 0 });
});

// Catches accidentally changing dictionary learning to the grammar threshold.
test("word_nine_to_ten_stays_unmastered", () => {
  expect(applyAnswer(state({streak:9}),true,"study","2026-10-13")).toMatchObject({state:{streak:10,mastered:false,dueDay:null},xpDelta:10,firstMastery:false});
});
