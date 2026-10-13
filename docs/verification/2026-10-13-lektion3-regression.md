# Lektion 3 release verification — incomplete

Task started 2026-10-13; verification continued after local midnight on 2026-10-14.
The candidate is built and host-verified. Android block/full acceptance is incomplete. This document does not certify release readiness or authorize physical-phone installation.

## Immutable candidate

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
| `./scripts/toolchain.sh npm test -- --runInBand` | exit 0; 97 suites / 635 tests | `outputs/lektion3-release/host/jest-review.log` |
| `./scripts/toolchain.sh npm run test:scripts` | exit 0; 281 tests; no failures/skips | `outputs/lektion3-release/host/scripts-ime-fix.log` |
| `./scripts/toolchain.sh npm run typecheck` | exit 0 | `outputs/lektion3-release/host/typecheck-review.log` |
| `./scripts/toolchain.sh npm run lint` | exit 0; original 13 warnings; no new warnings | `outputs/lektion3-release/host/lint-ime-fix.log` |

The 13 existing warnings are require-import warnings in `test/integration/regressionFixtures.test.ts`. A temporary import-order warning introduced during review fixes was corrected and the final lint result above verified.

Task 8 adds only regression tooling, fixtures/tests and documentation. Product source and candidate APK bytes remain unchanged. Fix commits: `af2da7f` (fixture counts), `2ac39eb` (explicit grammar entry), `2af8594` (four review fixes and configured AVD ABI), `9438d41` (IME_VISIBLE flag). Whole-branch review and scoped re-reviews approved all findings after the final IME correction.

## Inputs and provenance

Canonical inputs: `outputs/lektion3-release/inputs/`. `input-inventory.json` records copied source paths, sizes and SHA256 values. `input-validation.json` records fresh successful signatures, package/hash/provenance checks for Task5/schema5/schema6/schema8, plus GGUF3/manifest/size/SHA256 checks for the model.

Schema8 is the trusted APK from commit `7828274b5f971281401a87683e72fe14cb6a2b29`, hash `8792cce02680a77aa51942e058ba96638b1c5ab10e16c99d0b2b7bf97763f946`, with the same certificate as the candidate. The copied schema5 manifest adds an equivalent `schema5.apk` filename alias; it does not change the archived APK, source commit or signature. The public generated Lektion3 fixture was regenerated to add article-error and independent keyboard profiles. No private user backup was read or used.

## Actual Android attempts

| Attempt | Overall result | Actual coverage |
| --- | --- | --- |
| `grammar-rules` | failed, exit 1 | Setup import expected 10 profiles despite actual 5; required checks did not run. Fixed hard-coded YAML override. |
| `grammar-rules-r2` | failed, exit 1 | Six main checks and aggregate passed with JUnit/screenshots/public exports; schema8 upgrade did not start because AVD preparation chose x86_64 under Rosetta. |
| `grammar-rules-r3` | in progress | Fresh rerun on the same APK after configured-ABI fix; results pending. |

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

## Remaining evidence and limits

Required schema8 upgrade, Lektion3's ten checks and mandatory 320dp/fontScale 1 and 1.5 real-IME captures, older blocks, full 130-scenario regression, and actual observations remain pending. Preflight and host checks cannot replace these results. GrammarUi validation now requires visible Android IME mask 2, source hierarchies/dumps, input/submit geometry, post-submit feedback, and actual multi-choice option movement. Synthetic host fixtures are never used as Android acceptance evidence.

The full report must pass its validator with every required scenario, no failures/skips, one APK hash, and crash/ANR=0. No merge, push, deployment or physical-phone operation has occurred.
