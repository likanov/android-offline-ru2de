# Native offline model smoke test

Status: **PASS on the Android emulator**. Physical Pixel 9 Pro XL performance,
thermal behavior, memory pressure and battery use have not been measured.

## Candidate and environment

- Model: locally prepared official Qwen3-1.7B Q4_K_M; provenance and actual manifest
  are in `model-preparation.md` and `model-manifest.json`.
- `llama.rn 0.12.9`, Expo SDK 56, React Native 0.85.3, New Architecture, Hermes.
- Android API 36 Google APIs ARM64 emulator, Pixel 9 Pro XL hardware profile.
- `n_ctx=2048`, `n_gpu_layers=0`, `n_threads=2`, `maxTokens=256`; Jinja enabled and
  thinking disabled through the Qwen template.
- Test-only APK built from the release variant with an embedded native smoke
  entry and a debuggable flag for fixture transfer. The ordinary product APK uses
  the normal entry and release flags. Both APK variants compile successfully.
- Wi-Fi and mobile data disabled, global airplane_mode_on=1, adb reverse removed.
  No Metro server, network model download or network inference was used.

## Results

The native probe installs the actual 1.28 GB local GGUF, then deliberately fails a
second copy with an incorrect checksum and cancels a third during progress.
Both failures preserve the installed path. Native metadata reports architecture
`qwen3` and file type`15`. Actual CPU generation streams 14 tokens and returns:

> Eine Villa in der Stadt. Многоэтажный дом в городе.

An already-aborted next request rejects with `CANCELLED`, with no text callback.
The context is then explicitly released. This receipt verifies native offline
execution and cancellation, not linguistic quality: the final output is a
fragment and its Russian translation changes the meaning of Villa. Earlier
runs returned a complete house sentence and a correct translation. Candidate
quality and prompt adherence still require the planned assistant evaluation. The first verified run recorded copy
2714 ms, load 3463 ms and response 1005 ms. These are single emulator observations,
including this specific short prompt; they are not a Pixel benchmark.

The final runtime run passed at 17:27:59 on 2026-10-03: copy 2490 ms, load 3550 ms and
response 727 ms, with 14 streamed tokens. Metadata, failed-install preservation,
cancelled-install preservation and cancelled-result rejection all passed. No
`.partial` files remained in private model storage. The airplane-mode setting
was 1 and the adb reverse list was empty. Full receipts, build logs and APKs are
kept in the task's `work/` directory, outside Git.

## Reproduce native receipt

Prepare the candidate first. From the app root:

```sh
./scripts/toolchain.sh sh -c 'cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --init-script ../test/android/model-validation.gradle'
./scripts/toolchain.sh adb install -r android/app/build/outputs/apk/release/app-release.apk
./scripts/toolchain.sh adb shell run-as com.personal.germanvocabulary mkdir -p files
./scripts/toolchain.sh adb shell "run-as com.personal.germanvocabulary sh -c 'cat > files/incoming.gguf'" < ../../work/model-preparation/Qwen3-1.7B-Q4_K_M.gguf
./scripts/toolchain.sh adb shell settings put global airplane_mode_on 1
./scripts/toolchain.sh adb shell svc wifi disable
./scripts/toolchain.sh adb shell svc data disable
./scripts/toolchain.sh adb reverse --remove-all
./scripts/toolchain.sh adb logcat -c
./scripts/toolchain.sh adb shell am force-stop com.personal.germanvocabulary
./scripts/toolchain.sh adb shell am start -n com.personal.germanvocabulary/.MainActivity
./scripts/toolchain.sh adb logcat -d -s ReactNativeJS:V AndroidRuntime:E
```

Wait for `MODEL_SMOKE {"status":"PASS",...}`. The probe never replaces App.tsx or
package.json's production entry. Build `assembleRelease` again without the init
script and reinstall that APK when finished. The system-picker product path can
then be tested using Downloads files and the setup screen.

## Automated behavior checks

```sh
./scripts/toolchain.sh npm test -- --runInBand
./scripts/toolchain.sh npm run typecheck
./scripts/toolchain.sh npm run lint
```

The two required behavior files first failed against nonfunctional interface
stubs, then passed after implementation. Extended tests cover in-flight
cancellation, native initialization cancellation, a background/replacement race,
metadata rejection, malformed manifests, SQLite publication failure, one active
generation and idle release. They use real SQLite and real temporary filesystem
operations for installation, with the external native stream/inference boundary
injected. Emulator validation complements those unit tests with actual native
files, hashing, GGUF metadata and generated text.

## Ordinary product system-picker verification

The final ordinary release APK was installed after restoring the product entry
and non-debuggable flags. Existing Anton/Maria profiles and their 40-word counts
were retained. In airplane mode, the setup screen read `model-manifest.json` and
copied the 1.28 GB GGUF from Android Downloads through actual system-provider
`content://` URIs. It completed native metadata verification and loading and
showed **Модель готова. Интернет не требуется.** The screenshot was visually
inspected; evidence is `work/task-2-ready.png` and `work/task-2-ready-ui.xml`.

The first product picker attempt exposed that opening SAF backgrounds the app.
Its pre-selection AbortController incorrectly cancelled a future install. A
failing UI regression reproduced that behavior; tracking now begins after the
picker returns, while actual copy/load cancellation on background remains
active. The corrected ordinary APK passed the full picker sequence above.
