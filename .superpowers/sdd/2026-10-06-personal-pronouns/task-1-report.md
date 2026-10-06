# Task 1 report

Status: DONE

Implemented the version 1 offline grammar catalog, typed interfaces, deterministic question factory, dependency snapshot handling for the five approved dictionary words, semantic option IDs, response mode selection, question validation, answer checking, and the built in grammar reference.

TDD evidence:

- RED: the required three test files initially failed because the grammar modules did not exist.
- GREEN: the required grammar tests pass: 16 tests in 3 suites after the review fixes.
- Relevant existing tests pass: `normalizeAnswer.test.ts` and `questionFactory.test.ts` (9 tests).
- Combined scoped run: 20 tests passed in 5 suites.
- `npm run typecheck` passes.

Commits: fa861ed (`feat: define offline pronoun and sein questions`), 29df2ff (`fix: harden grammar question validation`), e60f129 (`fix: validate grammar templates and dependencies`).

Review fix evidence: the reviewer-found RED run failed on malformed sentence assembly, missing alternate `sie` meanings, whitespace-only answers, response-mode mismatch, and tampered options/feedback/dependencies. The fix run passed all 16 grammar tests, the 9 existing answer/factory tests, and typecheck; it also verifies profile-scoped dependencies match the rendered noun.
