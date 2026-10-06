# Task 3 report

Status: DONE

Implementation commit: `c93d22a` (`feat: score grammar answers atomically`)

Implemented `GrammarAnswerService.submit` with active-profile and ownership checks, accepted-attempt deduplication, saved session/question/target/dependency/review-snapshot validation, committed stale-question cancellation, and one atomic scoring transaction. Accepted answers advance grammar progress and variant counters exactly once, persist immutable attempts and one-time mastery rewards, update shared profile XP and daily activity, and save question/session feedback without changing `word_progress`. The grammar test harness now exposes `grammarAnswers`.

TDD and verification evidence:

- RED: all 9 new integration tests failed at the intended missing-service seam (`grammarAnswers` was undefined).
- GREEN: `grammarAnswers.test.ts` passes 9/9 tests.
- Required regression command with `learningRules.test.ts` and `answers.test.ts` passes 56/56 tests in 3 suites.
- Full Jest run passes 318/318 tests in 53 suites.
- `npm run typecheck` passes.
- `npm run lint -- --quiet` passes.

Interface ruling: Task 2 interfaces matched the Task 3 brief. For `inactive_profile_rejected`, the smallest ruling is that a submission profile must equal `app_settings.activeProfileId`; this follows the design's explicit active-profile validation requirement and prevents a delayed screen from scoring after a profile switch.

Concerns: none. Existing unrelated dirty-tree changes were preserved and excluded from the implementation commit.
