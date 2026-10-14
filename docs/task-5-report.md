# Task 5: offline result audio verification — 2026-10-14

Status: documentation and host regression complete; ARM64 release build and
in-place emulator install verified. Result audio Android acceptance remains
unverified. No existing mandatory Android check ID is marked passed.

## Scope and source

Worktree: `/Users/anton/Documents/Codex/2026-10-03/j/work/worktrees/question-screen-ux`.
Application HEAD: `e526dcde29eee3449ac1edb4e9c6aa0a6c3b3f11` (Tasks 1–4).
The pre-existing uncommitted dictionary keyboard edits in
`src/features/dictionary/DictionaryScreen.tsx` and `test/ui/dictionary.test.tsx`
were present throughout verification and preserved. The untracked implementation
plan was preserved. This task changes documentation only.

Read the Task 5 brief and constraints, result text selection, shared result hook,
audio service/adapters, training screen integration, native voice validation,
and existing build/device workflow. Documentation records German snapshot
selection, exact bundled-text priority, offline fallback and voice filtering,
optional result-local unavailability, repeat/stop, visibility/background
cancellation, once-per-mount restored playback, non-blocking controls, and
unchanged passive progress/mastery thresholds.

## Fresh verification executed by this worker

Each requested command was run independently through the existing toolchain.
The results below were read from this worker's completed command tool output;
they are not inferred from another worker's logs.

| Command | Exit / observed result |
| --- | --- |
| `./scripts/toolchain.sh npm run typecheck` | 0; `tsc --noEmit` |
| `./scripts/toolchain.sh npm run lint` | 0; 0 errors, 13 existing `@typescript-eslint/no-require-imports` warnings in `test/integration/regressionFixtures.test.ts` |
| `./scripts/toolchain.sh npm run test:scripts` | 0; 292 tests passed, 0 failed/cancelled/skipped/todo; 103606.249875ms |
| `./scripts/toolchain.sh npm test -- --runInBand` | 0; 100 suites / 741 tests passed in 3 projects, 0 snapshots; 96.218s |
| `git diff --check` | 0; no whitespace errors after documentation edits |

Lint warning locations: lines 88, 89, 90, 110, 111, 112, 113, 114, 115, 140,
and three at 149. The fixture file has no diff. Node reported the existing
experimental SQLite warning; script tests also reported the typeless-package
ES-module reparsing warning. Neither command failed. Passing host tests do not
prove native speech quality or audibility.

## Android build

1. `./scripts/toolchain.sh npm run build:android` in the normal sandbox failed
   (exit 1) before the build: Gradle `FileLockContentionHandler` could not open a
   socket (`java.net.SocketException: Operation not permitted`).
2. The same existing offline build with approved escalation failed (exit 1) at
   `:llama.rn:configureCMakeRelWithDebInfo[x86_64]`: CMake could not run
   `/usr/bin/python3`. Node's architecture default selected x86_64 under Rosetta.
   This failed attempt produced no accepted candidate.
3. `env VOCABULARY_ABI=arm64-v8a ./scripts/toolchain.sh npm run build:android`
   with approved escalation succeeded (exit 0), using the existing script's ABI
   override for the dedicated emulator. Gradle: `BUILD SUCCESSFUL in 1m 15s`,
   388 actionable tasks (30 executed / 358 up-to-date). The script verified v2
   signing, embedded JS, both llama native libraries, all 40 bundled WAVs, and
   absence of INTERNET permission.

Candidate APK:
`android/app/build/outputs/apk/release/app-release.apk`.
Retained copy:
`/Users/anton/Documents/Codex/2026-10-03/j/work/result-audio-verification/app-release.apk`.
APK SHA-256:
`f985adeb885ced81adc77275e663d18ae9e0042af921b3f4cc9321ee54c857a7`.
Certificate SHA-256:
`b61708a517c2ea04e3879f6b5dddae93413ef284152bc6707a6d23fa2ff48ba3`.
Package `com.personal.germanvocabulary`, versionCode 1, versionName 0.1.0,
minSdk 24, target/compileSdk 36. Gradle reported its existing deprecation/SDK XML
warnings; these did not fail the successful ARM64 build.

## Direct emulator observations and limits

The first sandbox `adb devices -l` failed because the daemon could not install
its smartsocket listener (`Operation not permitted`), with USB interface errors.
An approved escalated check reached the existing `emulator-5580`; only that
emulator was listed, with no physical Pixel. The controller confirmed it was the
already running dedicated `GermanVocabulary_API36` AVD.

`adb -s emulator-5580 install -r .../app-release.apk` returned `Success`; launching
`com.personal.germanvocabulary/.MainActivity` succeeded. No uninstall, clear,
wipe, speech-data removal, fixture/database injection, or learning-counter edit
was performed. One normal incorrect choice was submitted through the existing
product UI on its active test profile `L3 — keyboard-large`.

Observed unchanged emulator settings: Android 16/API36; airplane mode 1; Wi-Fi 0;
physical display 1080×1920 with an existing width override 960×1920; density
480dpi (320dp logical width); font scale 1.5. Mobile radio state was not
independently read, so these observations are not full offline certification.
`tts_default_synth` was `null`; the Google TTS package was installed. Neither fact
establishes availability or absence of installed German offline voice data.
No speech settings or voice data were changed.

This worker retained these direct UI observations:

- `launched.xml` and `focus.xml`: existing profiles screen, active test profile.
- `training.xml` / `hub-again.xml`: product training hub.
- `word-study.xml`: Russian→German question `картина` with displayed choices
  including `die Blume`, `das Buch`, `der Computer`, and `das Bild`.
- `word-wrong.xml`: after selecting the observed `die Blume` choice, the product
  hierarchy showed incorrect feedback, `Ответ: das Bild`, streak 0/20, and new
  repeat/stop controls. Stop and later controls were below the visible viewport;
  this alone does not prove they are reachable by scrolling.

Device state changed unexpectedly between otherwise sequential captures.
`initial.xml` showed Android TTS settings before app launch;
`word-entry.xml` showed Google TTS Options after a dictionary-study tap;
`word-wrong-before-scroll.png` showed the training hub rather than the result;
`word-result-controls.xml` / `.png` also showed the hub after the attempted
content swipe. The screenshot was visually inspected and is not a result
screenshot. This worker did not open TTS settings. The controller could not
identify another registered Task 5 worker and instructed this worker to stop
live emulator interaction; no further interactions followed. The cause remains
unknown, so continuous UI-flow evidence is unreliable and must not be treated
as a product regression diagnosis or an acceptance pass.

## Evidence provenance

This worker wrote direct device artifacts and the retained APK only under
`/Users/anton/Documents/Codex/2026-10-03/j/work/result-audio-verification/`.
`evidence-manifest.json` there binds its file hashes to the candidate APK and
explicitly labels the observations limited/unverified. These are diagnostic
artifacts, not a completed mandatory-regression report.

A separate directory already being written during this task,
`.superpowers/sdd/2026-10-14-result-answer-audio-plan/task-5-evidence/`, contains
host/build/install/TTS logs and UI artifacts not produced by this worker. Its
Jest log has the same totals but a distinct 98.945s run (this worker: 96.218s);
its script log duration is 103186.996333ms (this worker: 103606.249875ms).
The build log records the same candidate hash. Duplicate documentation sections
and an extra results table appeared during this task; they were consolidated
into one coherent section in each document. No author or cause is established.
Those separate artifacts are retained, but their provenance is not certified
and they were not used as the basis of this worker's fresh command pass claims.

## Remaining acceptance work

All result-audio rows in `docs/regression-matrix.md` remain unverified on
Android: audible German correctness in both dictionary directions and article
types, phrases/numbers, pronoun/sein, every Lektion 2/3 form, exact WAV versus
real installed offline TTS, broken-asset fallback, repeat/stop/rapid Continue,
help/profile/background/restored-result cancellation, passive progress exports,
and complete 320dp/large-text control reachability. The actual missing-voice
result-local message branch was not reached. The development native audio probe
was not built/run in this task. Human listening, native audible cancellation,
full mandatory per-ID JUnit/state evidence, and physical Pixel acceptance remain
pending. No unavailable branch is marked passed.

No release gate, mandatory matrix check or historical failed release report was
changed to passed. This task documents the verified local results and retains
the unresolved device limits for the controller/release reviewer.
