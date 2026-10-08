# Offline Android emulator regression

Application ID: `com.personal.germanvocabulary`. Display name: «Немецкий словарь».
The runtime is the same signed release APK intended for delivery, with embedded
JS, reference content, 40 local WAVs, real Expo SQLite and llama.rn. It has no
INTERNET permission. GGUF and its manifest are supplied through local files.

## Current status

The suite contains executable flows for all 54 detailed checks. Each check has
its own JUnit ID; learning, review, transfer, persistence and migration assertions
also inspect a BackupV1 exported through the normal system file picker. The
runner captures real assistant text from the UI hierarchy, evaluates retained
logcat from both devices, and can return 0 only after full report validation.
Checked-in implementation status is **implemented, device verification pending**;
only a completed run and actual audio/language observations establish a pass.
Maestro 2.11.0 is prepared under the task's local `work/toolchains/maestro/`.

The question-screen UX block is covered by host tests and the
`validateQuestionUiEvidence` contract in `scripts/regression-report.mjs`. It
requires five scenario manifests (`question-ui.word-typing`,
`question-ui.grammar-typing`, `question-ui.practice-typing`,
`question-ui.error-help-return`, and `question-ui.large-font-background`) with
closed-keyboard, open-keyboard, and after-submit captures bound to the current
APK hash. The block remains **not-verified** until a real fixed IME capture
shows the input and submit button above the keyboard; host evidence alone does
not certify an Android run. See [question-screen-ux-verification.md](question-screen-ux-verification.md).

## Toolchain and isolated AVD

Use the installed SDK through `./scripts/toolchain.sh`. `prepare-avd.sh` detects
the host ABI, uses the existing API36 Google APIs image, and creates only
`GermanVocabulary_API36` under `../../work/android-regression/avd/`. On this
macOS arm64 host the image is `system-images;android-36;google_apis;arm64-v8a`.
It never changes user AVDs or `GermanVocabulary_Task1_API36`.

```sh
./scripts/toolchain.sh npm run prepare:android:emulator
# Optional visible cold start without wiping an existing regression DB:
./scripts/toolchain.sh ./scripts/prepare-avd.sh --launch
```

Configuration: 8192 MiB RAM, 12 GiB data, 1080×1920, 480 dpi, enabled sound.
Runner launches visibly with `-no-snapshot`, no `-no-window` or `-no-audio`,
and uses port5580. It wipes only a clean phase's dedicated AVD. Cold launch,
force-stop, reboot and reinstall phases preserve the checked database.
Preflight checks host RAM, free storage including two GGUF copies, tool
versions, input hashes and the isolated AVD configuration. On a different
architecture prepare the matching image explicitly before running.

The scripts target installed avdmanager22.0 and Emulator37.2.12. Commands and
options are documented in [Android avdmanager](https://developer.android.com/tools/avdmanager)
and [Emulator command-line reference](https://developer.android.com/studio/run/emulator-commandline).
No automatic SDK download, global shell changes or changes to user AVDs occur.
Maestro must be prepared separately from its official distribution; installed
app scenarios then run with Wi-Fi/mobile data disabled and adb reverse removed.

## Release and input files

```sh
./scripts/toolchain.sh npm run build:android
REGRESSION_FIXTURE_DAY=2026-10-03 \
REGRESSION_FIXTURE_OUTPUT="$PWD/../../work/android-regression/fixtures/regression-backup.json" \
./scripts/toolchain.sh npm run fixtures:android
```

The generator creates real repositories in host SQLite and submits every
attempt through AnswerService. It never edits learning counters or inserts
attempt/reward rows directly. Generated profiles include mastery after20
answers (250XP, one50 reward), streak19, three wrong answers,490XP, six review
stages, a session with an active question, a dedicated seeded Stuhl UI topic and a previously rewarded word reset through normal lexical editing. Data passes `validateBackup`
and restore into new profiles. Import via the normal Android file picker;
never copy a host database into app storage. No test API exists in the APK.

Supply `model-manifest.json` and its exact GGUF filename in `--model-dir`.
Manifest bytes/SHA-256, GGUFv3 header and runtime/quantization are checked.
Do not commit GGUFs, signing keys, generated fixtures or regression output.

## Commands and report contract

```sh
./scripts/toolchain.sh npm run test:android:regression -- \
  --preflight --sdk-root "$PWD/../../work/toolchains/android-sdk" \
  --apk "$PWD/android/app/build/outputs/apk/release/app-release.apk" \
  --model-dir "$PWD/../../work/model-preparation" \
  --avd GermanVocabulary_API36 \
  --report-dir "$PWD/../../work/android-regression/preflight"

./scripts/toolchain.sh npm run test:android:regression -- \
  --apk "$PWD/android/app/build/outputs/apk/release/app-release.apk" \
  --model-dir "$PWD/../../work/model-preparation" \
  --avd GermanVocabulary_API36 \
  --previous-apk /absolute/path/to/original-task5-release.apk \
  --fixture "$PWD/../../work/android-regression/fixtures/regression-backup.json" \
  --observations /absolute/path/to/actual-observations.json \
  --report-dir "$PWD/../../work/android-regression/full"
```

Exit0 is reserved for a completed full run. Exit2 means unavailable environment,
incomplete input/evidence/coverage, or preflight-only (which never runs the app).
Exit1 means a failed scenario or internal error. Every report contains actual
commands and status, stdout/stderr, environment, hashes, source commit, required
IDs and explicit not-verified results. A preflight creates no JUnit/screenshots
and does not claim an Android pass.

Each phase executes `maestro --device emulator-5580 test --format junit
--output <phase.xml> --test-output-dir <artifacts> <flow>` and retains artifacts.
[Maestro report reference](https://docs.maestro.dev/maestro-flows/workspace-management/test-reports-and-artifacts).
The report validator checks every mandatory group/check ID, unique successful
results, real matching JUnit IDs without failures/skips, current file hashes,
real generated nonempty text for four modes with model hash and UI artifacts,
no crash/ANR, offline evidence, previous candidate provenance, audio observation,
language review and TTS condition. It rejects incomplete or stale evidence.

Actual observation JSON fields: `audioAudible` (boolean), `languageQuality`
(`reviewed` only after review), `languageNotes` (specific observations), `tts`
(`absent-tested` or `offline-tested`). A blank template is not evidence. Current
runner captures generation text, hierarchy and screenshots. Missing observations produce exit2 after producing the artifacts for review.

## Persistence and upgrade

`persistence-before.yaml` and `persistence-after.yaml` are separate flows.
Runner performs force-stop, relaunch, then adb reboot and relaunch without
uninstall, clearState or wipe between those boundaries. Backup assertions compare nonzero XP, mastered Stuhl, its 20-answer streak, active profile and the saved answered session against the pre-boundary export.

`npm run build:android:upgrade` creates the original detached worktree, applies
signing/INTERNET build configuration, stable UI selectors and a checkout-owned Expo entry, verifies
the bundle source map contains the Task5 app and no topic migration, writes APK
provenance and uses the
already installed local dependencies (this differs from a fresh install at the
old lockfile and is recorded in provenance). It refuses to replace an existing
checkout at a different commit. Save build output and certificate verification.

Original Task5 commit: `19b2e0c1cf36eda73159aff9bb2d94b757d24144`. Build its source
in a separate checkout under `../../work/`, using the same application ID and
persistent release key. Do not remove migrations from the current source.
A previous APK alone is insufficient provenance; save its commit, certificate
and build log and verify before allowing the upgrade phase. The infrastructure
requires a distinct previous APK and uses a second isolated clean AVD
`GermanVocabulary_API36_Upgrade` to avoid opening a new-schema DB with old code.
Create words and earn XP through UI before `adb install -r FINAL.apk`, then
verify migration, session continuation and reward idempotency. The old-version setup creates a custom Upgradeprobe word and submits 100 real UI answers, earning 1250 XP with five first-mastery rewards. The current version must preserve that data, create topic memberships, resume the answered session and avoid a duplicate reward.

System font/time/timezone/display changes apply only to runner's dedicated
serial. The runner snapshots settings and restores them in finally, recording
restoration failures as exit2. Calendar scenarios must verify the accepted
device date, timezone and DST; no host clock changes or direct SQLite edits.
After any product fix, first reproduce it with a failing test, rebuild and rerun
all unit/SQL checks and the full Android regression against the new APK hash.

The two candidates share local native dependency build directories. Build them
sequentially. Device-state hooks change only the dedicated serial: notification
permissions, TTS package availability, clock/timezone (including both Berlin DST
02:30 occurrences), display width/font and a temporarily missing/corrupt private
GGUF. Every temporary model and system setting is restored in `finally`.
Device logs are saved before reboot and before each AVD shutdown and independently
recomputed during report validation; a primary-device crash cannot be hidden by
a clean upgrade-device log. Previous APK bytes and original Task5 source-map
provenance are also verified again by the standalone validator.

Flows use content-scoped swipes for the fixed navigation layout. Maestro 2.11.0 has native Unicode input handling (verified in the installed AndroidDriver); older versions with ASCII-only Android input are insufficient for Cyrillic profile names and umlaut fixtures. Foreground-return flows use `launchApp: { stopApp: false }`.

Assistant checks run before JSON roundtrip so the exported backup contains an
actual generated, edited aid with dependency links. Roundtrip state assertions
compare every exported field and nested payload with regenerated UUIDs mapped
back to the source graph. The intermediate normal UI export is retained as
`transfer.json-roundtrip-restored.json`: translations, helper text and embedded
word IDs, dependency revisions, settings, questions, sessions, results, history
and memberships must all match. Originals must remain unchanged. The flow resumes
an answered mastery question twice, then double-taps a new answer in the restored
continuation profile and resumes its result again. Final export checks require
exactly one new correct attempt worth 10 XP, unchanged rewards and old attempts,
and no changes to any other original/restored profile. Missing intermediate
preservation or final answer evidence cannot pass.

## Binding regression evidence to a delivery bundle

Task15's [release verifier](../scripts/verify-release.mjs) reuses this matrix's
report validator and compares the report against the packaged APK/model hashes.
It also requires report exit0, no blockers, successful setting restoration,
portable retained evidence, the pinned signing certificate, no INTERNET
permission and exact embedded WAV bytes. A report file alone is insufficient.
All 68 mandatory IDs (14 group IDs and 54 detailed checks) must be unique and
passed with matching nonfailed JUnit artifacts. Physical Pixel9ProXL acceptance
is a separate mandatory gate; all 14 spec criteria and four sets of model speed/
memory measurements are required.

The actual retained `fix1-final` run reports failed/exit1 at
`first-launch.clean-40-words` against APK SHA-256
`571183851a118a5359db7af5c63eb7eed1ff77c3f0e65fc806d1c684e0b1ad71`.
It establishes no full-suite pass. Package that report with `--report` only as
blocked diagnostic evidence. The candidate's `regression/source-report.json`
preserves original host paths; `regression/report.json` relocates artifact paths
and references the delivered files. [Release report](release-report.md) records
identities and limitations; [installation](install-android.md) describes local
transfer and upgrade. Product changes require a new APK and a full new run.

## A1 / Lektion 2 regression (schema 8)

Generate the additional V3 fixture with the SQL integration project. Legacy
`REGRESSION_FIXTURE_OUTPUT` (V1) and `GRAMMAR_FIXTURE_OUTPUT` (V2) stay unchanged.

```sh
LEKTION2_FIXTURE_OUTPUT=/absolute/artifacts/lektion2-backup-v3.json \
REGRESSION_FIXTURE_DAY=2026-10-08 \
npm test -- --runInBand --runTestsByPath test/integration/regressionFixtures.test.ts
```

Add these arguments to the normal runner invocation (all existing APK, model,
AVD, legacy fixture, Task5 and schema5 arguments remain required):

```sh
--lektion2-fixture /absolute/artifacts/lektion2-backup-v3.json \
--schema6-apk /absolute/artifacts/before/installed-schema6.apk
```

Use `--block extended-vocabulary` or `--block grammar-lektion2` for focused
runs. Omit `--block` for a full report. A block report cannot pass the full
validator. Every new scenario records the final APK hash, JUnit result and an
exported JSON state checkpoint; skipped checks and mismatched hashes fail.

The V3 fixture has unique `A1 — …` profiles: dictionary with a mastered Stuhl,
new pronoun and pending typed number; mixed catalog history with old mastery,
new streak 19 and several review dates; five lesson profiles; formal Sie; and an
empty dictionary imported via BackupService. All answers use the production
repositories/services. The two shipped CSVs are copied to Downloads and selected
through DocumentsUI. The V3 roundtrip compares every exported graph value, with
only regenerated UUIDs and the restored profile name normalized.

`--schema6-apk` requires an adjacent `<apk>.provenance.json` with schemaVersion 6,
package, SHA-256, certificateSha256, full source commit and sourceMapVerified.
Preflight independently inspects package and signing certificate and rejects
an identical final APK. Keep the original APK and source-map provenance before
building. Do not fabricate provenance when the source association is unknown.
The provenance record can describe limitations of the retained source map.

The old `--grammar-previous-apk` now executes an actual schema5 upgrade on the
separate upgrade AVD. It requires adjacent `release-manifest.json`, its matching
APK hash/certificate and the source commit's schema5 migration. The original
Task5 upgrade remains separate. The new schema6 phase creates word history and
a grammar answer through UI, exports **before** installation, installs final
with `adb install -r`, exports after and compares all retained learning data.
No phase injects a host database. These upgrades never target a physical phone.

The new flows remain `implemented-unverified` until run on Android. Inspect the
Maestro keyboard-open images: prompt, answer input and submit must all be visible.
The full run still requires the existing audible-audio and generated-language
observations; do not mark them reviewed without inspecting the retained run.
The rule/help check asserts the production local error rule and conserved XP;
it does not count as a real model-generation observation.
