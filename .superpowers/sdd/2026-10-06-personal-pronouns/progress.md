# SDD ledger — plan: docs/superpowers/plans/2026-10-06-personal-pronouns.md

## Pre-flight scan

| Shared tasks | Interface/file | Finding | Ruling |
| --- | --- | --- | --- |
| 1 → 2 | GrammarTarget, GrammarQuestion, catalog | Task 2 persists task 1 stable IDs and snapshots. | Use exact types from Task 1; schema stores JSON payloads and catalog version 1. |
| 2 → 3 | GrammarRepository, GrammarSessionRepository | Task 3 needs atomic reads/writes and session question status. | Expose tx helpers and keep submit mutations in one SqlStore.transaction. |
| 3 → 4 | grammar attempts/rewards and combined ledger | Task 4 validates and remaps Task 3 immutable results. | Store result snapshots and stable target IDs; v2 ledger sums both attempt tables. |
| 3/4 → 5 | daily activity, XP, progress | Summary must not double count already-combined totals. | Read profiles/daily_activity as shared totals and aggregate grammar only for grammar section. |
| 2/3 → 6 | services and resume semantics | UI preserves feedback and independently cancels vocabulary/grammar. | Add separate cached grammar services and route-specific resume/next behavior. |
| 3 → 7 | saved grammar attempt/question | Helper uses immutable saved context and shared runtime. | Add grammar-error union and no new runtime instance. |
| 4/6/7 → 8 | UI IDs, v2 fixture, report evidence | Runner needs stable check IDs and state export. | Add four matrix rows, v2 fixture flag, run-bound observations and block validator. |

| Task self-consistency | Finding | Ruling |
| --- | --- | --- |
| 1 | checkGrammarAnswer rejects malformed answers without creating attempts; catalog factory validates before persistence. | Keep validation pure and export error codes from grammarAnswer. |
| 2 | resume and next have different responsibilities. | resume returns current stored question/result; next advances only after feedback. |
| 3 | First mastery XP is +10 + +50, so returned xpDelta is 60 on answer 20 and total is 250. | Preserve applyAnswer semantics and assert both per-attempt and cumulative values. |
| 4 | Existing v1 generator must remain v1 while app export moves to v2. | Keep host fixture generator explicitly v1; add separate grammar v2 generator. |
| 5 | Existing ProgressSummary has four word skills, grammar is separate. | Add grammar property without modifying word Skill union. |
| 6 | Existing route training is vocabulary and direct e2e flows depend on it. | Add training-home and explicit vocabulary helper; leave old upgrade flow intact. |
| 7 | Runtime message element type is GenerationRequest messages element, not a declared RuntimeMessage. | Use GenerationRequest messages in produced signature. |
| 8 | Current runner has no grammar flags and writes report.json in report-dir. | Add flags and keep report path stable; review CLI binds observations to runId/SHA. |
| 9 | Full validator currently requires old upgrade commit and old model/report assumptions. | Extend it for grammar while preserving all legacy requirements; no skipped scenarios. |

Ruling: user explicitly requested implementation and earlier selected multi-process execution, so proceed with subagent-driven implementation and review gates without another confirmation.

Task 1 review finding: SPEC/QUALITY FAIL. The first implementation passed only shallow tests; reviewer found invalid noun articles, malformed sein sentence assembly, Russian/German translation mixups, incomplete question tamper/dependency validation, response-mode mismatch acceptance, whitespace-only input acceptance, and missing alternate sie meanings. Ruling: block Task 2, fix Task 1 with new failing tests and a fresh review; cost if wrong is rework before SQLite depends on invalid question payloads.

Task 1 fix: review failures were reproduced RED, then fixed across 29df2ff, e60f129 and 93dc071. Current scoped grammar tests: 17/17; existing normalize/questionFactory tests: 9/9; typecheck passed. A sign-off review is running while Task 2 resumes; no known template or dependency blocker remains in the current source.

Task 1: complete (commits fa861ed..93dc071, tests: grammar catalog/factory/answer 17/17; normalize/questionFactory 9/9; typecheck → pass; sign-off SPEC/QUALITY PASS).

Task 2 implementation complete in 8cfae7f; report 1ba1d2a. New migration/session suites 6/6, answers 15/15, topics migration 4/4, full Jest 309/309, typecheck and lint passed. Review `.superpowers/sdd/2026-10-06-personal-pronouns/task-2-review.md`: SPEC/QUALITY PASS, no blockers.

Task 3 implementation complete in c93d22a; report ac9dbf0. RED reproduced missing answer service, then 9 grammar answer tests pass with atomic scoring, mastery bonus, review scheduling, difficult recovery, duplicate-submit idempotency, active-profile and stale-dependency guards. Required suites 56/56, full Jest 318/318, typecheck and lint passed. Review `task-3-review.md`: SPEC/QUALITY PASS, no blockers.

Task 5 implementation complete in d5fdcb5. Four integration scenarios pass alongside existing progress tests (9/9); grammar summary is profile-scoped and separate from word mastery while shared XP/daily activity remain single-counted. Review `task-5-review.md`: PASS; no blockers. Full typecheck awaits Task 4's backup type integration.

Task 4 implementation committed in 3a2122a after RED/GREEN fixes. v2 export/import now preserves grammar progress, sessions, questions, attempts, rewards, remaps profile/session/attempt/dependency links, validates v1 normalization, combined XP/daily ledger, and atomic restore. Focused backup/progress suites pass 32/32; typecheck/lint pass. Independent review pending.

Task 4 hardening committed in 05ddea7 after review feedback. Replay of `applyAnswer` now validates every grammar result state/XP/submitted answer, and global attempt IDs are unique across word/grammar blocks. Added integration tamper tests; backup-focused suites pass 35/35 after the hardening. Re-review pending.

Task 4 re-review `task-4-rereview.md`: SPEC/QUALITY PASS. The reviewer recorded optional future hardening observations for attempt counters, mastery reward amount linkage, and active-question ID uniqueness; no blocker for the current task.

Task 6 implementation committed in 2432a5b plus stale-resume fix ed33c5a. Added compact training hub, grammar choice/typed question flow, persisted feedback/resume, reference screen, cached grammar services, navigation routes, Today/Progress links, and vocabulary entry helper. Focused grammar UI/navigation/today/progress tests pass 16/16; test:scripts 164/164; typecheck and lint pass. UI review pending.

Task 6 review initially found direct `nav-training` calls in current vocabulary E2E flows. Commit 3f69cb9 routes seven current flows through `open-vocabulary-training.yaml`; old-APK upgrade flows remain unchanged. A follow-up UI review found grammar flow blockers; commits d59a64f/0cf848e add `open-grammar-training.yaml`, correct hub IDs, conditional choice/typed handling, and remove answer-leaking test IDs. Grammar UI suites pass 5/5, and the source keeps semantic `grammar-option-<id>` IDs. Android/Маestro has not been run.

Task 7 implementation committed in 6ce097a, with hub-compatible error UI test update in 3b1220f. Added saved grammar error context, local rule display without a model, JSON-safe prompts, shared AssistantService runtime/cancellation, and navigation to `GrammarExplanationScreen`. Grammar explanation and existing assistant/difficult/error suites pass 6/6 and 24/24; typecheck/lint pass. Independent review pending.

Task 7 review: PASS. Independent review report `task-7-review.md` found no functional blockers; 5 suites/30 tests, typecheck, changed-file ESLint, and diff-check passed. Optional follow-up coverage for grammar-specific cancellation/model-failure invariance remains assigned to the final Android regression block.

Task 8 harness implementation committed in 7188593, 386fd3e, c292d20, 2a62edd and 0cf848e. Added four grammar Android blocks with 19 check IDs, separate v1/v2 fixtures, block report validation, run-bound observation review, and grammar-error generation evidence. Script tests pass 171/171; fixture integration tests pass 6/6; generated `work/android-regression/fixtures/regression-backup.json` is v1 and `grammar-backup-v2.json` is v2 with 18 targets. Independent review FAIL: the current flows are still smoke-level and do not yet execute profile isolation, force-stop/reboot, dependency edit, real 5→6 upgrade, transfer roundtrip/atomic rejection, or model cancellation; `--grammar-previous-apk` is not wired into an upgrade phase. No Android emulator/Маestro run was possible because this host has no `adb` or `maestro` executable. Treat Task 8/9 as pending rather than accepted.

Final host verification after the hub transition: full Jest passes 61 suites / 343 tests; typecheck passes; lint passes with zero warnings; `git diff --check` passes. Existing navigation tests were updated to enter vocabulary training through `training-vocabulary-start`.
