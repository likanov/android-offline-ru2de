# Немецкий словарь

Offline Russian–German vocabulary Android app. Profiles, vocabulary, training,
reviews, XP, audio, local reminders, CSV and JSON transfer are stored locally.
The optional assistant uses a separately supplied local GGUF and manifest.

Run project commands through the pinned local toolchain:

```sh
./scripts/toolchain.sh npm install --offline
./scripts/toolchain.sh npm run typecheck
./scripts/toolchain.sh npm run lint
./scripts/toolchain.sh npm test -- --runInBand
./scripts/toolchain.sh npm run test:sql
./scripts/toolchain.sh npm run test:scripts
./scripts/toolchain.sh npm run build:android
./scripts/toolchain.sh npm run prepare:android:emulator
```

`build:android` signs the release with the persistent private key in
`../../work/release-signing/`. It verifies the APK signature, embedded JS,
40 WAVs, SHA-256 and absence of INTERNET permission. Debug retains INTERNET
for Metro. Native regeneration is `npm run android:prebuild`; rebuild and
verify afterwards. This command was renamed from `prebuild:android` to avoid
npm treating it as an automatic lifecycle hook for `build:android`.

See [Android emulator regression](docs/emulator-regression.md),
[regression matrix](docs/regression-matrix.md), and
[build environment](docs/build-environment.md).

**Task 14 is incomplete.** The runner fails closed when prerequisites,
evidence or observations are missing. All 54 detailed checks have executable
Maestro flows and normal backup assertions; a passing report requires a
completed device run, real model generations, retained logs from both devices
and actual audio/language observations.

Release packaging is implemented; **final delivery is blocked** by the failed
full Android report and pending physical Pixel acceptance. Read
[release report](docs/release-report.md), [local installation](docs/install-android.md),
[Pixel acceptance](docs/device-acceptance.md), and
[third-party notices](docs/third-party-notices.md).

```sh
# Full device run: use the signed release, real local model and original Task5 APK.
./scripts/toolchain.sh npm run test:android:regression -- \
  --apk "$PWD/android/app/build/outputs/apk/release/app-release.apk" \
  --model-dir "$PWD/../../work/model-preparation" \
  --previous-apk "$PWD/../../work/android-regression/upgrade-source/android/app/build/outputs/apk/release/app-release.apk" \
  --fixture "$PWD/../../work/android-regression/fixtures/regression-backup.json" \
  --observations /absolute/path/to/actual-observations.json \
  --report-dir "$PWD/../../work/android-regression/full"

# This existing failed report is packaged honestly as a blocked candidate.
npm run package:release -- \
  --report "$PWD/../../work/android-regression/fix1-final/report.json"
npm run verify:release -- "$PWD/../german-vocabulary-android"
```

Host verification logs can be supplied with `--verification-dir DIR` (default
`../../work/release-verification/`); Pixel artifacts referenced from its JSON are
retained under `pixel/` or alongside the matching regression evidence.

The candidate defaults to `../german-vocabulary-android/`. It contains the APK,
a separate `model/`, all 40 reference WAVs/manifest, installation instructions,
regression report/artifacts, Pixel results and license notices. Hashes are
streamed; GGUF and signing files never enter Git. Existing output directories
are preserved: use `--output /absolute/new/path` to create another candidate.
Package verification returns 2 and writes `status: blocked` while required
evidence is missing or failed. A ready bundle requires verifier exit0 including
actual physical Pixel results; unit fixtures never establish device readiness.

Development uses TDD: write a failing behavior test, observe RED, implement the
minimum change, observe GREEN, refactor and rerun affected checks. For release
gates, `node --test test/scripts/release.test.mjs` covers missing assets, stale
APK/model reports, matrix coverage, signatures, embedded audio, portable evidence,
and pending Pixel acceptance. The packaging command runs those rejection tests
before staging, then verifies the actual candidate. Unit/SQL/scripts suites,
typecheck and lint supplement the full installed Android suite. Repeat native
build and full device regression after product/dependency/asset/model/build
setting changes. Packaging/documentation changes alone do not produce a new APK.
