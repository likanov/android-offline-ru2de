# Offline Android emulator regression

Application ID: `com.personal.germanvocabulary`. Display name: «Немецкий словарь».
The runtime is the same signed release APK intended for delivery, with embedded
JS, reference content, 40 local WAVs, real Expo SQLite and llama.rn. It has no
INTERNET permission. GGUF and its manifest are supplied through local files.

## Current status

Task 14 is **not complete**. Host unit/SQL tests validate the preflight, report
rejection rules and service-generated backup. Maestro is not installed here.
The checked-in flows are **draft smoke coverage**; detailed assertions in the
matrix, fixture import, four real model generations, calendar/DST control,
reminder delivery/permission branches, 20 UI answers and migration data setup
still require implementation and an actual device run. The runner deliberately
returns 2 for incomplete coverage and does not promote a smoke result to a pass.
No audio audibility or language-quality observation has been made for Task 14.

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
stages and a session with an active question. Data passes `validateBackup`
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
runner does not yet capture generation evidence and cannot return a full pass.

## Persistence and upgrade

`persistence-before.yaml` and `persistence-after.yaml` are separate flows.
Runner performs force-stop, relaunch, then adb reboot and relaunch without
uninstall, clearState or wipe between those boundaries. Full XP/streak/session
assertions remain pending; current draft checks profile retention only.

`npm run build:android:upgrade` creates the original detached worktree, applies
signing/INTERNET build configuration and a checkout-owned Expo entry, verifies
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
verify migration, session continuation and reward idempotency. Draft setup does
not yet create those data and is explicitly incomplete.

System font/time/timezone/display changes apply only to runner's dedicated
serial. The runner snapshots settings and restores them in finally, recording
restoration failures as exit2. Calendar scenarios must verify the accepted
device date, timezone and DST; no host clock changes or direct SQLite edits.
After any product fix, first reproduce it with a failing test, rebuild and rerun
all unit/SQL checks and the full Android regression against the new APK hash.
