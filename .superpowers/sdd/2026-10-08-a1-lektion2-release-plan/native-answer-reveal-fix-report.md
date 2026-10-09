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

## Native round 2: common coordinate correction

The release from `6cf74e2` created scroll range but failed strict visual acceptance: the submit button was only partially visible above the keyboard. An accessibility assertion on the button did not establish that its label/body were fully visible. The earlier host geometry model used the reported window coordinates for its final visibility assertion and missed the native coordinate-origin difference.

Round 2 evidence directory: `/Users/anton/Documents/Codex/2026-10-03/j/outputs/a1-lektion2-release/r2/diagnostic-reveal2/` (`trace.log`, `open.png`, `open.xml`, `manifest.json`, `source.patch`). With IME open, viewport `measureInWindow` y was -53dp, while native `measure().pageY` was 0dp. Target window y was 119.333dp/height 213.667dp; root pageY was 172.333dp with the same height. Keyboard screenY was 341dp. The physical group bottom was therefore 386dp, although the window callback made it appear to end at 333dp. XML submit bounds were [60,1002][1020,1146]px, with IME top 1023px. No answer was submitted or keyboard manually hidden during this capture.

Local React Native 0.85.3 source explains the difference: `RootViewUtil.getViewportOffset` subtracts `getWindowVisibleDisplayFrame().top` from the native window position. Fabric `DOM.measureInWindow` includes that viewport offset, while `DOM.measure` excludes it. Android keyboard `screenY` is taken from the physical visible-display-frame bottom. This app uses an edge-to-edge root at screen origin, confirmed by root pageY 0 and the native hierarchy.

The minimal round 2 correction measures both viewport and answer via `measure().pageY` on Android, matching keyboard screenY in this app. iOS retains window measurements. Keyboard overlap reservation, layout reconciliation and actual-offset tracking remain. No extra margin or timing delay was introduced; the existing 8dp clearance is unchanged. All temporary diagnostics were removed.

The new Android regression models both measurement origins and asserts the entire physical answer-group bottom against the keyboard edge. With the correct QuestionScreen keyboard listener, reverting to `6cf74e2` gives RED: 386dp > 333dp (other six tests pass). Restoring the correction gives GREEN: all seven focused tests pass. This closes the host model's previous blind spot; it does not replace fresh native visual proof.

Round 2 host verification results are recorded below. A fresh corrected APK, scoped review, and strict prompt/input/full-submit visual proof at default and small/large-font settings remain pending with root/R2.

Round 2 final verification: full Jest **83 suites / 517 tests passed**, log `/private/tmp/reveal2-final-jest.log`; focused reveal **7 passed**; typecheck passed; lint exited 0 with the same 13 existing fixture require-import warnings; `git diff --check` passed. Source contains no temporary trace tags.
