# Result Answer Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans for inline execution, or superpowers:subagent-driven-development if the user chooses delegated execution. Steps use checkbox syntax. Read the approved requirements below before implementation.

**Goal:** Automatically read the correct German answer when a saved dictionary or grammar result becomes visible, using bundled WAV audio and installed offline German Android TTS.

**Architecture:** Add `AudioService.playText`, pure functions that select German result text from persisted questions, and a shared result-playback hook. Training screens use the hook without awaiting synthesis in answer submission or coupling playback to learning state. Grammar navigation supplies visibility because its training screen stays mounted under reference/explanation pages.

**Tech Stack:** Existing React Native, Expo audio, Android speech bridge in `modules/german-offline`, TypeScript, Jest and SQLite harnesses. No new dependency or database migration.

**Spec:** Approved conversation requirements, 2026-10-14: read the correct answer after both success and error, work without internet, prefer local WAV then offline German TTS, provide repeat playback, and keep results usable if audio is unavailable. The following source-selection and lifecycle rules make these requirements executable against the current code.

## Global Constraints

- Select only voices with `installed && !requiresNetwork && /^de(?:[-_]|$)/i.test(language)`; retain Kotlin's independent voice validation and successful `setVoice` requirement.
- Prefer an exact bundled text match. If its local asset cannot be resolved/played, try offline TTS unless playback has been cancelled. Never fetch a remote voice/asset as fallback.
- Read German only: dictionary `expected` is Russian for `de-ru` and contains only an article for article questions. Do not use `expected[0]` unconditionally.
- Use the persisted question snapshot, not a later edited dictionary entry or the learner's submitted answer, to select playback text.
- A result is eligible only when result/question attempt IDs match, question/profile IDs match, and its screen is visible and the app is active.
- Auto-play once per visible result identity in a mounted screen, including a restored saved result. Rerenders, returning from help, and returning from background do not auto-replay that same result; manual repeat remains available.
- Playback must not set training `busy` or hold the answer lock. A pending TTS promise must not disable Continue, explanation, or reference controls.
- Continue, explicit stop, question/profile changes, unmount, hiding the grammar screen, and app backgrounding invalidate pending playback and stop both players.
- Missing audio shows a non-blocking result-local message `Офлайн-озвучка недоступна.`; it never invokes listening-question cancellation/fallback, advances the question, or rolls back a saved answer. Cancellation is silent.
- No XP/streak/due-date/attempt writes from auto-play, repeat, stop, or audio failure. Dictionary mastery stays 20; all grammar mastery stays 10.
- Preserve existing card/listening audio behavior. Only result playback gains the new lifecycle/UI behavior.

## Review Focus

1. Dictionary directions, articles and aliases require German snapshot text; cover all six kinds in Task 2.
2. Slow speech/asset resolution, repeated taps and stale failures must not delay Continue or restart departed audio; cover Tasks 1–3 with controlled promises.
3. Grammar remains mounted while help is open; stopping only on unmount is insufficient. Cover visibility/navigation in Tasks 2 and 4.
4. Optional TTS absence or an unusable WAV must not invalidate a persisted answer; cover fallback in Task 1 and unchanged result/ledger in Tasks 3–4.
5. Lektion 3 invariant feedback contains both correct and incorrect choices with arrows; speak only the correct answer pairs, with punctuation, in Tasks 2 and 4.

## File Map

- Modify `src/features/audio/audioService.ts`: shared offline text playback and cancellation.
- Create `src/features/audio/resultAudioText.ts`: pure German snapshot selection.
- Create `src/features/audio/useResultAudio.ts`: auto-play, repeat, stop, visibility/background cleanup and local unavailable state.
- Modify `src/features/learning/TrainingScreen.tsx`: dictionary result integration.
- Modify `src/features/grammar/GrammarTrainingScreen.tsx`: grammar result integration and visibility input.
- Modify `src/features/grammar/GrammarQuestionView.tsx`: result audio controls.
- Modify `src/app/navigation.tsx`: pass actual grammar screen visibility.
- Tests: existing `test/unit/audioService.test.ts`, `test/ui/audio.test.tsx`, `test/ui/grammarNavigation.test.tsx`; create `test/unit/resultAudioText.test.ts`, `test/ui/resultAudio.test.tsx`, `test/ui/grammarResultAudio.test.tsx`.
- Update `docs/audio-materials.md` and `docs/regression-matrix.md`: result behavior and retained device acceptance evidence. No unrelated keyboard-fix changes belong in these commits.

---

### Task 1: Shared offline text playback

**Interfaces:** `AudioService.playText(text: string): Promise<void>`; `play(word: Word)` delegates to it with `displayGerman(word)`; retain `available(word)` and `stop()` signatures.

- [ ] **Step 1: Add failing tests in `test/unit/audioService.test.ts`.**
  - `play_text_recording_priority`: `der Stuhl` plays matching file and makes zero speech calls.
  - `play_text_offline_voice_filter`: mixed voices include online German, uninstalled German, English and a misleading `den` locale; only installed offline `de-DE` is selected for `Ist das Buch neu?`.
  - `play_text_no_offline_voice`: rejects with `AUDIO_UNAVAILABLE`, with zero `speakOffline` calls.
  - `play_text_broken_recording_falls_back`: asset resolution failure or local player failure tries an installed offline voice; no such voice yields `AUDIO_UNAVAILABLE`.
  - `play_text_stop_during_asset_or_voice_resolution`: resolve a controlled lookup after `stop()`; neither player nor speech starts, and no fallback starts.
  - `play_text_new_request_supersedes_old`: a second request stops/invalidate the first; late failure of the first cannot stop or fail the second.
  - `play_text_empty_is_noop`: whitespace-only text starts no asset/speech playback.
  - Retain existing word availability, offline voice recheck and `AUDIO_CANCELLED` rejection tests.

- [ ] **Step 2: Verify RED.**
  Run `./scripts/toolchain.sh npm test -- --runInBand test/unit/audioService.test.ts`.
  Expected: new tests fail on missing `playText`, not setup/import errors.

- [ ] **Step 3: Implement the interface in `src/features/audio/audioService.ts`.**
  Share generation, stop, recording and voice paths with word playback. Check generation after every async boundary and before fallback. Preserve case, umlauts and punctuation; bundled lookup remains exact. Map genuine playback failure to `AudioUnavailableError`, preserve cancellation, and do not let an old request stop a newer one.

- [ ] **Step 4: Verify GREEN and existing adapter behavior.**
  Run `./scripts/toolchain.sh npm test -- --runInBand test/unit/audioService.test.ts test/unit/audioAdapters.test.ts test/unit/audioAssets.test.ts`.
  Expected: all selected tests pass.

- [ ] **Step 5: Commit only Task 1 files.**
  Commit message: `feat: add offline result text playback`.

### Task 2: German text selection and result playback lifecycle

**Interfaces:**
- `dictionaryResultAudioText(question: Question): string` in `resultAudioText.ts`:
  - `de-ru`: `question.prompt` (German), e.g. `der Stuhl`.
  - `definite-article` / `indefinite-article`: `${question.expected[0]} ${question.prompt}`, e.g. `der Stuhl` / `ein Stuhl`.
  - `ru-de` / `typing` / `listening`: `question.expected[0]`, the canonical German answer. Do not concatenate aliases.
- `grammarResultAudioText(question: GrammarQuestion): string`:
  - Normal questions: `question.feedback.sentenceDe`.
  - `catalogVersion === 3 && kind === 'plural-invariant'`: filter `feedback.items` by `expected.optionIds` in feedback order, then join each pair as `${item.singularDe}. ${item.pluralDe}.` with spaces. No arrows, Russian text, or incorrect choices.
- `ResultAudioRequest = { key: string; text: string }`.
- `useResultAudio(audio: AudioService, request: ResultAudioRequest | null, visible: boolean): { repeat: () => void; stop: () => Promise<void>; unavailable: boolean }` in `useResultAudio.ts`. The caller's key is a tuple serialization of profile ID and attempt ID.

- [ ] **Step 1: Add failing pure-function tests in `test/unit/resultAudioText.test.ts`.**
  Use `buildQuestion` with a noun and assert all six kind mappings above; a `de-ru` expected value of `стул` must still produce `der Stuhl`. Include female indefinite `eine Lampe`, an adjective, a number, a phrase and typing aliases (read the canonical first answer only). Assert Lektion 2 full sentences and Lektion 3 article/plural forms preserve German case/umlauts. For invariant feedback, assert exact expected pair text and exclude wrong choices, arrows and translation.

- [ ] **Step 2: Add failing hook tests in `test/ui/resultAudio.test.tsx` using a small test host.**
  Assert one `playText` call on eligible result, none before result, none on same-key rerender, and a new call on a new key. Repeat interrupts/restarts the current request; explicit stop does not cause auto-replay. A pending promise must not block host Continue. Test deferred resolution/rejection after stop, request change, profile-key change, unmount, `visible=false`, and `AppState` background: no late restart or unavailable state for an old result. Returning to active/visible does not auto-replay the same key. Unavailable/current failure sets only local `unavailable`; cancellation and stop failure do not throw into navigation. Remove AppState subscription on unmount.

- [ ] **Step 3: Verify RED.**
  Run `./scripts/toolchain.sh npm test -- --runInBand test/unit/resultAudioText.test.ts test/ui/resultAudio.test.tsx`.
  Expected: assertions fail because the new interfaces are absent.

- [ ] **Step 4: Implement pure functions and hook.**
  Use local refs for request identity, generation and last auto-played key. Auto-play from a result effect, so restored results are covered. Fire playback without awaiting it in UI actions; catch all failures. `stop()` invalidates pending work synchronously before waiting on service cleanup and absorbs stop errors. Late handlers cannot write state or stop newer audio. Start no result playback while hidden/backgrounded. Shared service generation is authoritative for native cancellation.

- [ ] **Step 5: Verify GREEN.**
  Repeat Step 3 command; expect all tests pass.

- [ ] **Step 6: Commit only Task 2 files.**
  Commit message: `feat: select German result text and manage playback lifecycle`.

### Task 3: Dictionary result UI integration

**Files:** `src/features/learning/TrainingScreen.tsx`, `test/ui/audio.test.tsx`.
**Consumes:** Task 2 functions/hook. Pass a request only for the current profile and matching saved result/question attempt. Keep existing `audio?: AudioService` injection.
**Produces:** result auto-play plus secondary `Повторить звук` and `Остановить звук` buttons (`training-result-audio-repeat`, `training-result-audio-stop` test IDs), and the local unavailable message. Continue stays usable during synthesis.

- [ ] **Step 1: Add failing UI tests.**
  Cover correct/incorrect saved results, a restored result, `de-ru` German text, full definite/indefinite article phrases, and rerender without duplicate playback. With a controlled pending `playText`, assert Continue is enabled, `audio.stop` is called before requesting the next question, and late settlement does not affect it. Reject with `AUDIO_UNAVAILABLE`: result and Continue stay visible, no listening fallback appears, the same attempt/question remains saved. Repeat/stop must leave attempts, XP and learning state unchanged relative to the snapshot immediately after submit. Profile/unmount and delayed submit settlement must never voice the departed result. Existing listening tests still pass.

- [ ] **Step 2: Verify RED.**
  Run `./scripts/toolchain.sh npm test -- --runInBand test/ui/audio.test.tsx`.
  Expected: new result assertions fail, existing listening behavior remains testable.

- [ ] **Step 3: Integrate the hook and controls in `TrainingScreen`.**
  Render controls only in the result block; disabled state follows saving/navigation `busy`, never speech duration. Do not reuse listening `play()` or its fallback. Invalidate playback before Continue/card/helper/explanation navigation. Guard submit's saved-result application with the existing action epoch/profile lifecycle so an old profile cannot start audio after an async submit. An audio cleanup failure must not prevent navigating or saving results.

- [ ] **Step 4: Verify GREEN.**
  Run `./scripts/toolchain.sh npm test -- --runInBand test/ui/audio.test.tsx test/ui/training.test.tsx`.
  Expected: all selected tests pass.

- [ ] **Step 5: Commit only Task 3 files.**
  Commit message: `feat: read dictionary result answers aloud`.

### Task 4: Grammar result UI and hidden-screen navigation

**Interfaces:**
- Extend `GrammarTrainingScreen` props with `audio?: AudioService` and `visible?: boolean` (default true). Memoize injected audio or `getAudioService({db})`.
- Extend `GrammarQuestionView` with optional `onRepeatAudio?: () => void`, `onStopAudio?: () => void`, `audioUnavailable?: boolean`. Render result controls only when handlers exist, using `grammar-result-audio-repeat` / `grammar-result-audio-stop` test IDs.
- In `navigation.tsx` pass `visible={route.screen === 'grammar-training'}` to the already-mounted grammar screen. Opening reference/explanation must stop audio even though this screen does not unmount.

- [ ] **Step 1: Add failing tests in `test/ui/grammarResultAudio.test.tsx` and `test/ui/grammarNavigation.test.tsx`.**
  With `createGrammarHarness`, cover correct/incorrect pronoun and sein results; Lektion 2 full sentence/question; Lektion 3 article, plural and invariant correct pairs; restored saved result; repeat/stop; unavailable voice with saved result retained; profile change; and Continue while speech is pending. Assert the attempt ledger/XP/state do not change through passive controls. Navigate to reference/explanation: the mounted grammar screen stops and starts no hidden audio; returning preserves the result and does not auto-replay. Rerender and cancelled/stale save must not synthesize duplicate/unsaved results.

- [ ] **Step 2: Verify RED.**
  Run `./scripts/toolchain.sh npm test -- --runInBand test/ui/grammarResultAudio.test.tsx test/ui/grammarNavigation.test.tsx`.
  Expected: new result/visibility assertions fail.

- [ ] **Step 3: Integrate the hook, view controls and navigation visibility.**
  Derive request from matching profile/question/result and use `grammarResultAudioText`. Await safe hook `stop()` before requesting the next question or invoking reference/explanation callbacks. Guard async next/load/submit results with the existing load epoch across profile/visibility transitions; preserve the existing saved grammar session when opening help. Keep audio errors separate from grammar save errors.

- [ ] **Step 4: Verify GREEN and grammar regression.**
  Run `./scripts/toolchain.sh npm test -- --runInBand test/ui/grammarResultAudio.test.tsx test/ui/grammarNavigation.test.tsx test/ui/grammarTraining.test.tsx test/ui/lektion3Training.test.tsx`.
  Expected: all selected tests pass, including ten-answer grammar behavior.

- [ ] **Step 5: Commit only Task 4 files.**
  Commit message: `feat: read grammar results and stop hidden-screen audio`.

### Task 5: Verification and Android acceptance

- [ ] **Step 1: Update `docs/audio-materials.md` and `docs/regression-matrix.md`.**
  Document correct German result sources, offline fallback, optional unavailable state, repeat/stop and lifecycle. Add a result-audio acceptance checklist/evidence section without claiming existing mandatory Android check IDs have passed.

- [ ] **Step 2: Run local regression.**
  Run each command independently:
  - `./scripts/toolchain.sh npm run typecheck` — exit 0.
  - `./scripts/toolchain.sh npm run lint` — zero errors; unchanged existing warnings recorded.
  - `./scripts/toolchain.sh npm run test:scripts` — all pass.
  - `./scripts/toolchain.sh npm test -- --runInBand` — all suites/tests pass.
  - `git diff --check` — no whitespace errors.
  Record fresh totals/output; a passing host test is not device acceptance.

- [ ] **Step 3: Validate a build on Android emulator, then Pixel before release.**
  Use the existing build/deployment workflow and identify APK hash. With internet disabled and installed German offline speech data, listen to correct/incorrect dictionary results in both directions, both article types, custom phrase/number, pronoun/sein, full Lektion 2 sentences and all Lektion 3 forms. Verify exact bundled WAV and TTS for text without a recording. Cover repeat, stop, fast Continue, reference/explanation, switching profiles, background and restored results; confirm actual audible cancellation and unchanged passive XP. Repeat unavailable-voice branch on an emulator without speech data; do not remove the user's phone voice data. Check 320dp/large text so Continue and audio controls remain reachable. Retain observations and APK-bound evidence. If a device/voice is unavailable, mark that branch unverified rather than passed.

- [ ] **Step 4: Commit documentation/evidence changes.**
  Commit message: `docs: record offline result audio validation`.

## Plan Validation — 2026-10-14

Reviewed against `questionFactory.ts`, both training screens, `GrammarQuestionView.tsx`, `navigation.tsx`, `audioService.ts`, `audioAdapters.ts`, the Kotlin offline speech bridge and current test harnesses.

Corrections made: German-only selection for `de-ru`; article plus noun; correct-only invariant pairs; hook for once-per-result playback including resume; independent audio UI state; cancellation/background/profile races; actual grammar visibility while help keeps it mounted; exact test files/prop signatures; broken WAV fallback; and host/device acceptance separated. All five Review Focus items map to explicit tests in Tasks 1–4. Task order is service → selection/lifecycle → dictionary → grammar/navigation → verification.

This is a code-grounded plan review, not implementation or proof of acoustic/device correctness. Application code is unchanged by this validation. The existing dictionary keyboard fix is separate work and must be preserved.
