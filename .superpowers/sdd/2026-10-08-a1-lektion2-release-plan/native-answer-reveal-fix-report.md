# Native typed-answer reveal correction

## Evidence and root cause

R2 diagnostic release trace: `/Users/anton/Documents/Codex/2026-10-03/j/outputs/a1-lektion2-release/r2/diagnostic-answer-trace/correct-trace.log`.

On Android at 360dp/fontScale1.0, keyboard top was 341dp. The ScrollView retained its 640dp height under the IME; content was 556.33dp, so the native scroll range was zero. The measured answer group was y 137.67 / height 213.67, extending below the keyboard. Repeated reveal requests asked for 18.33dp movement, but there was no native scroll event or movement. The old code nevertheless advanced its offset on every request, accumulating 293.33dp in JS. The viewport's measured window y was -53dp, while onLayout reported relative y 0: the old calculation also mixed coordinate spaces.

R2 corrected the earlier manual-swipe interpretation: that swipe dismissed the IME; it did not prove submission was reachable while the IME stayed open.

## Correction

QuestionScreen measures the native ScrollView viewport and answer group in window coordinates. It reserves the viewport area covered by the keyboard as content bottom padding, creating a native scroll range even when the original content is shorter than the full viewport. It reconciles visibility when viewport/content layouts commit, so an early clamped request is retried after padding reaches native layout. Scroll offset comes exclusively from native onScroll events. Keyboard dismissal removes the additional padding. Answer text, selection, question and submission logic are untouched.

No sleeps, test relaxation, answer logging or permanent diagnostic logging. The temporary ProfilesScreen catch trace was removed; that file has no diff. The transient profile-load error was not reproduced in this capture and receives no speculative fix.

## RED/GREEN evidence

Three new regressions failed before the correction:

- Delayed native content commit: no follow-up reveal request.
- Window origin 100dp: requested 158dp instead of 58dp.
- Real native geometry with scroll clamping: answer group bottom 351.34dp remained below the 333dp safe keyboard edge.

All 6 focused reveal tests pass after the correction, including the three existing visible-answer/unmount/resize tests. The native geometry test models actual clamping against content height minus viewport height and verifies the group fits after the layout commit.

Typecheck passes. Full lint exits 0 with 13 existing no-require-imports warnings confined to `test/integration/regressionFixtures.test.ts`; changed files introduce no warnings. Full Jest passes: 83 suites, 516 tests (final log `/private/tmp/native-answer-reveal-jest-final.log`). `git diff --check` passes.

## Acceptance boundary

This is a source correction with host evidence, not completed native acceptance. Root/R2 must review and build a fresh release APK from the correction, then verify prompt/input/submit together with the IME open for typed vocabulary and grammar, including 320dp and enlarged font. The diagnostic APK predates this correction and is not release proof.
