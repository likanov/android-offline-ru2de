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
