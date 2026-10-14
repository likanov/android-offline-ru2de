# Lektion 3 release verification — incomplete

Task started 2026-10-13; verification continued after local midnight on 2026-10-14.
The original candidate is superseded by a confirmed database lifecycle fix. The second candidate was superseded by explicit database lifecycle cleanup. A third candidate and fresh Android block/full acceptance are pending. This document does not certify release readiness or authorize physical-phone installation.

## Original immutable candidate (superseded)

- APK: `/Users/anton/Documents/Codex/2026-10-03/j/outputs/lektion3-release/candidate/app-release.apk` (read-only mode 0444).
- SHA256: `f774c27cd8020050b9c2d98d8db4e6631033a4e20365975f17c8774bf777934c`.
- Product/build source: `150211f9ba3ab4ed7498db635f0df0153caa9941`.
- Certificate SHA256: `b61708a517c2ea04e3879f6b5dddae93413ef284152bc6707a6d23fa2ff48ba3`.
- Package: `com.personal.germanvocabulary`; signature V2 verified.
- Existing release inspection passed: embedded JS, 40 exact WAV hashes, `librnllama.so` and `librnllama_jni.so` for arm64-v8a, no INTERNET permission.
- Build command: `VOCABULARY_ABI=arm64-v8a ./scripts/toolchain.sh npm run build:android`.
- Build log: `outputs/lektion3-release/build-150211f-retry.log`; inspection and candidate manifest are in `outputs/lektion3-release/candidate/`.

The initial sandbox attempt stopped before compilation because Gradle could not open its local lock socket. The authorized retry exited 0. Existing release inspection's system Python initially hit Rosetta/xcrun architecture mismatch; using bundled workspace Python on PATH completed inspection. Neither workaround changed product code.

## Host verification

All artifact paths in this document beginning `outputs/` are relative to `/Users/anton/Documents/Codex/2026-10-03/j/`.

| Command | Actual result | Retained log |
| --- | --- | --- |
| `./scripts/toolchain.sh npm test -- --runInBand` | exit 0; 97 suites / 635 tests | `outputs/lektion3-release/host/jest-sql-disposal.log` |
| `./scripts/toolchain.sh npm run test:scripts` | exit 0; 291 tests; no failures/skips | `outputs/lektion3-release/host/scripts-sql-disposal.log` |
| `./scripts/toolchain.sh npm run typecheck` | exit 0 | `outputs/lektion3-release/host/typecheck-sql-disposal.log` |
| `./scripts/toolchain.sh npm run lint` | exit 0; original 13 warnings; no new warnings | `outputs/lektion3-release/host/lint-sql-disposal.log` |

The 13 existing warnings are require-import warnings in `test/integration/regressionFixtures.test.ts`. A temporary import-order warning introduced during review fixes was corrected and the final lint result above verified.

Task 8 initially changed regression tooling, fixtures/tests and documentation only. The confirmed database lifecycle bug described below now requires a product fix and a new immutable candidate. The original candidate bytes remain unchanged; its results will not certify the new candidate. Fix commits: `af2da7f` (fixture counts), `2ac39eb` (explicit grammar entry), `2af8594` (four review fixes and configured AVD ABI), `9438d41` (IME_VISIBLE flag). Whole-branch review and scoped re-reviews approved all findings after the final IME correction.

## Inputs and provenance

Canonical inputs: `outputs/lektion3-release/inputs/`. `input-inventory.json` records copied source paths, sizes and SHA256 values. `input-validation.json` records fresh successful signatures, package/hash/provenance checks for Task5/schema5/schema6/schema8, plus GGUF3/manifest/size/SHA256 checks for the model.

Schema8 is the trusted APK from commit `7828274b5f971281401a87683e72fe14cb6a2b29`, hash `8792cce02680a77aa51942e058ba96638b1c5ab10e16c99d0b2b7bf97763f946`, with the same certificate as the candidate. The copied schema5 manifest adds an equivalent `schema5.apk` filename alias; it does not change the archived APK, source commit or signature. The public generated Lektion3 fixture was regenerated to add article-error and independent keyboard profiles. No private user backup was read or used.

## Actual Android attempts

| Attempt | Overall result | Actual coverage |
| --- | --- | --- |
| `grammar-rules` | failed, exit 1 | Setup import expected 10 profiles despite actual 5; required checks did not run. Fixed hard-coded YAML override. |
| `grammar-rules-r2` | failed, exit 1 | Six main checks and aggregate passed with JUnit/screenshots/public exports; schema8 upgrade did not start because AVD preparation chose x86_64 under Rosetta. |
| `grammar-rules-r3` | passed, exit 0 | All seven checks and aggregate passed; schema8 before/after/repeat exports and upgrade included. Fresh independent validator returned `ok: true`, no errors; crash/ANR=0. |
| `grammar-lektion3` | failed, exit 1 | First check could not tap multi-choice submit below the viewport. Failure screenshot confirmed missing E2E scroll handling; later checks, including keyboard evidence, did not run. |
| `grammar-lektion3-r2` | failed, exit 1 | First five checks completed. Real font1 IME was visible (mask 3), but submit was partly covered and its tap did not submit. Independent validator rejected the incomplete run (32 errors); crash/ANR=0. |
| `grammar-lektion3-r3` | failed, exit 1 | Five preceding checks completed. Font1 real-IME closed/open/after-submit captures and correct submission succeeded. Next multi-before stage failed because Profiles displayed a load error and no profile buttons. Independent validator rejected 29 errors; crash/ANR=0. Font1.5 and multi evidence remain missing. |
| `grammar-lektion3-r4` | failed, exit 1 | Five preceding checks and all font1 capture stages completed. Font1.5 failed at active-profile header visibility after selection; screenshot shows loaded profile cards at a lower scroll position. Independent validator rejected 30 errors; crash/ANR=0. |

The six actual passed main checks in r2 are ten-answer-mastery, nine-error-reset, legacy-backup-conversion, backup4-roundtrip, word-threshold-twenty, and profiles-reviews. Their state evidence does not certify the missing schema8 upgrade or a full block pass. The r2 primary logs recorded crash/ANR=0 and settings restoration passed; upgrade logcat was unavailable because the upgrade emulator did not start. Existing validator reread r2 and rejected it (10 errors), preserving the failed result.

Reports, all commands/stdout/stderr, JUnit, before/after public exports, screenshots and captured logcat are retained in each attempt directory. Failed evidence is never overwritten or represented as passed.

Actual rules command (r2 shown; r3 changes only the report directory):

```sh
LEKTION3_TASK_ROOT=/Users/anton/Documents/Codex/2026-10-03/j
LEKTION3_INPUTS="$LEKTION3_TASK_ROOT/outputs/lektion3-release/inputs"
LEKTION3_APK="$LEKTION3_TASK_ROOT/outputs/lektion3-release/candidate/app-release.apk"
./scripts/toolchain.sh npm run test:android:regression -- \
  --block grammar-rules \
  --sdk-root "$LEKTION3_TASK_ROOT/work/toolchains/android-sdk" \
  --maestro "$LEKTION3_TASK_ROOT/work/toolchains/maestro/maestro/bin/maestro" \
  --apk "$LEKTION3_APK" --avd GermanVocabulary_API36 \
  --model-dir "$LEKTION3_INPUTS/model" \
  --grammar-fixture "$LEKTION3_INPUTS/grammar-backup-v2.json" \
  --grammar-rules-fixture "$LEKTION3_INPUTS/grammar-rules-backup-v4.json" \
  --schema8-apk "$LEKTION3_INPUTS/schema8.apk" \
  --report-dir "$LEKTION3_TASK_ROOT/outputs/lektion3-release/grammar-rules-r2"
```

Actual Lektion3 R4 command (earlier attempts used the installed Maestro binary and their own report directories):

```sh
./scripts/toolchain.sh npm run test:android:regression -- \
  --block grammar-lektion3 \
  --sdk-root "$LEKTION3_TASK_ROOT/work/toolchains/android-sdk" \
  --maestro "$LEKTION3_TASK_ROOT/outputs/lektion3-release/profile-load-diagnostic/maestro-wrapper.mjs" \
  --apk "$LEKTION3_APK" --avd GermanVocabulary_API36 \
  --model-dir "$LEKTION3_INPUTS/model" \
  --lektion3-fixture "$LEKTION3_INPUTS/lektion3-backup-v4.json" \
  --report-dir "$LEKTION3_TASK_ROOT/outputs/lektion3-release/grammar-lektion3-r4"
```

## Remaining evidence and limits

Lektion3's ten checks and mandatory 320dp/fontScale 1 and 1.5 real-IME captures, older blocks, full 130-scenario regression, and actual observations remain pending. Preflight and host checks cannot replace these results. GrammarUi validation now requires visible Android IME mask 2, source hierarchies/dumps, input/submit geometry, post-submit feedback, and actual multi-choice option movement. Synthetic host fixtures are never used as Android acceptance evidence.

The first real keyboard capture also exposed a geometry parser issue: the full InputMethod window starts at y=156, including transparent space; its native contentTopInsets/visibleTopInsets=915 put the visible keyboard at y=1071. The corrected parser uses this window-relative inset. Original submit bounds y=1038..1182 overlapped the IME and were not accepted. The product already attempts automatic answer-group reveal; the partial overlap is retained as a limitation pending actual scrolling evidence and assessment of automatic visibility. No product source was changed to conceal this result.

Requirement ruling for Task8: a user-like manual scroll while retaining the real IME is acceptable. Acceptance still requires captures proving both input and submit above the visible keyboard and a successful submission; automatic visibility before scrolling is not an explicit plan requirement. If controls remain inaccessible after scrolling or geometry cannot establish this, verification must stop as a product blocker requiring a new candidate APK.

R3 font1 open capture proves input y=303..471 and submit y=699..843 above real keyboard y=1071, with IME_VISIBLE mask 3. The actual submit produced correct-answer feedback and an after-submit capture. This partial success does not satisfy the mandatory two configurations and multi-scroll checks. Retained failed screenshot then shows `Не удалось загрузить профили` and reminder-update error. A non-product diagnostic copied the preserved synthetic DB/WAL/SHM: integrity_check=ok, foreign_key_check=[], schema10, all15 profiles (14 fixture plus first-launch), and keyboard XP10/attempt1 committed. Cold process restart reads profiles normally; resizing alone still reads them. A short same-APK reproduction passed closed/open/after-submit/multi-before, under `outputs/lektion3-release/profile-load-diagnostic/`. This diagnostic is not a full block pass. The underlying rejected listProfiles query cause is not logged by the product; no diagnostic product change has been made.

The full report must pass its validator with every required scenario, no failures/skips, one APK hash, and crash/ANR=0. No merge, push, deployment or physical-phone operation has occurred.

R4 failure resources: 11GiB free in the 12GiB data partition; app memory dump retained. Live app log confirms multiple React surface restarts in the same process during display/font changes. The source opens the database per AppRoot mount, and the installed expo-sqlite 56.0.6 cached-handle release matches a [reported library issue](https://github.com/expo/expo/issues/48999). This is a hypothesis until the actual rejected query exception is captured; no product workaround has been applied.

A targeted same-APK font1.5 probe selected the profile correctly, then exposed another E2E omission: before scrolling, input bounds were clipped to y=1463..1593 and submit had invalid clipped y=1886..1593 below the viewport. The closed stage now uses the existing downward-scroll helper before checking/capturing the controls. RED/GREEN contracts and the full script suite passed; the complete focused font1.5 keyboard sequence is being verified under `outputs/lektion3-release/profile-load-diagnostic/font15-r2/`. Diagnostic results do not replace a full block pass.

## Confirmed database lifecycle failure and fix

The focused font1.5 probe completed all five keyboard stages, and fresh validation of the combined diagnostic captures returned `ok: true`. These same-hash diagnostic captures are not block acceptance evidence.

After the observed React surface remounts, a non-product probe invoked Android's `am send-trim-memory com.personal.germanvocabulary RUNNING_CRITICAL`, which triggers the existing React native garbage collection hook. Profiles then failed deterministically. The existing create-profile error UI exposed `NativeDatabase.prepareAsync` rejected with `java.lang.NullPointerException`. The retained hierarchy and screenshot are `outputs/lektion3-release/profile-load-diagnostic/gc-probe/db-cause-hierarchy.xml` and `db-cause.png`. The persisted SQLite data remained intact.

The installed expo-sqlite 56.0.6 reuses a native binding by default; an old JavaScript wrapper's Android release hook closes that shared binding after an AppRoot remount. `openAppDb` now requests `useNewConnection: true`, so each mounted store owns a native handle to the same persisted database file. This is a real product fix, with no diagnostic logging changes.

The regression test calls the actual `openAppDb` with a native lifecycle boundary matching the installed SDK and real SQLite storage. It first failed when collection of the old wrapper invalidated the current store (`host/sql-lifecycle-script-red-r2.log`), then passed persisted reads and writes after the ownership fix (`host/sql-lifecycle-script-green.log`). Fresh full host results are recorded above. A new APK and all required Android evidence must be obtained before acceptance; the original rules pass cannot be reused.

## Second immutable candidate (superseded; acceptance aborted)

- Source commit: `529308854427d86cf51c1ca51f1e9da8a7a776f9`.
- APK: `/Users/anton/Documents/Codex/2026-10-03/j/outputs/lektion3-release/candidate-v2/app-release.apk` (0444).
- SHA256: `774da3bdf1cc1c06dcb24fd550e25eec1abff6c7ed1540418dc23bd1ac33bfca`.
- Build: exact arm64 command above, exit 0; `outputs/lektion3-release/build-5293088.log`.
- Existing inspector: errors=[], V2 signature, same expected certificate, correct package, embedded JS, 40 exact WAV hashes, arm64 model libraries, no INTERNET permission. `candidate-v2/inspection.json`, `candidate-manifest.json`, `SHA256SUMS` retained under the output root.
- Canonical input inventory: all 18 files freshly size/hash verified, errors=[]; `input-inventory-validation-v2.json`.

The grammar-rules-v2 run was interrupted with exit 130 immediately after review identified missing owned-connection cleanup. ADB inventory confirmed no emulator remained. This candidate has no accepted Android evidence; its artifacts are preserved. Fresh evidence for the next candidate, older blocks and full regression remain pending. The old rules pass and diagnostic keyboard captures cannot certify this new hash.

## Explicit owned-connection disposal

Scoped review accepted the remount cause and ownership fix but identified missing explicit native close. `openAppDb` now closes on setup failure and returns an owned store with idempotent disposal. Disposal immediately rejects new calls and cancels queued operations; the active operation may finish before native close. The AppRoot startup lifecycle disposes on unmount, migration failure, and initialization completing after unmount. Mounted error handling remains unchanged.

TDD retained `host/sql-disposal-red.log` (six failing contracts before implementation) and `host/sql-disposal-green.log` (six passing contracts). Tests cover persisted-data ownership, setup failure close, active/queued/late work, exactly-once close, ready/opening/migrating/failed startup phases. Fresh full host checks: 97 suites/635 Jest tests, 291 script tests with no failures/skips, typecheck exit 0, lint exit 0 with only the original 13 warnings, diff check exit 0. New candidate build and scoped review remain pending.
