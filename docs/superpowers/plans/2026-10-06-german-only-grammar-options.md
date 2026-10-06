# German-only grammar options Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove Russian translations from grammar answer buttons without making identical German forms ambiguous or losing saved learning progress.

**Architecture:** Derive four distinct German answer choices from the existing grammar catalog and sentence position. Keep semantic option IDs for progress. Validate both the new choice set and the exact legacy set so immutable question snapshots and backup v2 remain compatible; render legacy snapshots using the current German-only choices.

**Tech Stack:** React Native, TypeScript, SQLite, Jest, React Native Testing Library.

**Spec:** User-approved in-chat design (6 October 2026): German-only buttons, Russian context and feedback, four visually distinct choices, correct `sie/Sie` handling, compatibility with saved lessons. This replaces the translated-choice requirement in `docs/superpowers/specs/2026-10-06-personal-pronouns-design.md`, section 5.

## Global Constraints

- Four distinct visible options for every multiple-choice question.
- At sentence start, capitalize pronouns; internally preserve `sie` versus formal `Sie`.
- No Russian text in answer buttons or their accessibility labels.
- Russian context, reference and post-answer feedback remain available.
- Preserve all 18 target IDs, catalog version 1, profile XP, series, review dates and backup v2.
- Legacy attempts retain their original answer meaning; compatibility must not weaken rejection of tampered question payloads.
- Work in the existing isolated feature worktree; do not merge or update the physical phone as part of this request.

## Review Focus

- Existing unanswered `sie` snapshot: both the correct answer and a newly displayed distractor must be accepted for grading without cancelling the session.
- Identical initial `Sie` forms: a single visible choice must map to the contextual target.
- Internal `sie/Sie`: case distinction must remain visible and significant.
- Historical wrong semantic `sie` answer: backup restore must retain its incorrect result and XP.
- Forged legacy labels or option IDs: validation must still reject altered payloads.

### Task 1: German-only choices with snapshot compatibility

**Files:**
- Create: `src/features/grammar/grammarChoiceOptions.ts`.
- Modify: `src/features/grammar/grammarQuestionFactory.ts`, `src/features/grammar/GrammarQuestionView.tsx`, `src/features/transfer/grammarBackupValidation.ts`.
- Test: `test/unit/grammarQuestionFactory.test.ts`, `test/unit/grammarAnswer.test.ts`, `test/ui/grammarTraining.test.tsx`, `test/integration/grammarBackup.test.ts`.
- Create test fixture: `test/fixtures/legacyGrammarQuestion.ts`.

**Interfaces:**
- Consumes: `GrammarQuestion`, catalog pronouns/targets and existing answer services.
- Produces: `grammarChoiceOptions(question: Pick<GrammarQuestion, 'attemptId' | 'targetId' | 'position'>): GrammarOption[]` and `legacyGrammarChoiceOptions(question: Pick<GrammarQuestion, 'attemptId' | 'targetId'>): GrammarOption[]`.
- The factory stores current choices; the view derives current choices even for legacy snapshots. Answer validation allows displayed choices and exact historical options after validating the snapshot.

- [x] **Step 1: Write failing tests.** Assert all 18 targets and three templates have four unique German labels; the correct label matches the expected token; internal ordinary and formal `sie` remain distinct. Render a legacy `sie_plural` question and require four unique German-only answer buttons, including accessibility labels. Exercise correct and wrong clicks through real SQLite services and preserve Russian feedback. Pin historical right/wrong results, legacy backup round-trip, continuation after restore, and rejection of modified legacy labels.
- [x] **Step 2: Run the tests and confirm failure.** Run `./scripts/toolchain.sh npm test -- --runInBand --runTestsByPath test/unit/grammarQuestionFactory.test.ts test/unit/grammarAnswer.test.ts test/ui/grammarTraining.test.tsx test/integration/grammarBackup.test.ts`. Expected: failures on translated labels, duplicate choices or a newly displayed legacy distractor.
- [x] **Step 3: Implement the choice helper and compatibility.** Retain the correct semantic ID, deduplicate by German spelling after position-dependent capitalization, fill to four alternatives from the catalog, then use deterministic attempt shuffling. Keep the legacy generation algorithm for strict validation and history replay. Use the helper in factory and view; delegate backup snapshot checks to the strict compatible validator.
- [x] **Step 4: Verify.** Repeat the targeted command; then run `./scripts/toolchain.sh npm test -- --runInBand`, `./scripts/toolchain.sh npm run typecheck`, and `./scripts/toolchain.sh npm run lint`. Expected: all tests pass, exit code 0 for typecheck/lint. Build the signed offline Android APK with `VOCABULARY_ABI=arm64-v8a ./scripts/toolchain.sh npm run build:android`; expected `BUILD SUCCESSFUL` and signature verification.
- [ ] **Step 5: Review and commit.** Review this task's diff for all five Review Focus cases. Commit the tested change and document observed results below.

## Execution results

TDD: targeted tests failed first (10 failures caused by translated labels and unsupported new distractors), then all 30 targeted tests passed. Full Jest regression: 61 suites / 354 tests passed. Typecheck and lint passed. Signed arm64 Android build passed; release has no INTERNET permission and includes all 40 audio files. APK SHA-256: `04e5624b5e195549f105d57cfc8c463b39a8dff9539b8ba900a8dc69f5cff61c`. Independent code review pending.
