# Android regression matrix

Source of mandatory IDs: `e2e/matrix.json`. Every check below is required; none is silently optional.

Every detailed ID has an executable `e2e/checks/<id>.yaml` flow. Matrix status **implemented-unverified** describes source coverage; a device report must contain successful per-ID JUnit evidence and state assertions before the run can pass. TTS availability chooses the documented branch; it is not an unexplained skip.

| Group ID | Flow / phase | Required expectation | Detailed check IDs |
| --- | --- | --- | --- |
| `first-launch` | `first-launch.yaml` / clean | Clean offline first launch; 40 starter words; profile; model through file picker; every screen | `first-launch.offline-network`<br>`first-launch.clean-40-words`<br>`first-launch.model-picker`<br>`first-launch.all-screens` |
| `profiles` | `profiles.yaml` / main | Create, rename, select; profile-owned words/topics/settings/aids/XP | `profiles.profile-create-rename`<br>`profiles.profile-isolation`<br>`profiles.active-profile` |
| `dictionary` | `dictionary.yaml` / main | Noun/adjective create/edit/search; NFC/NFD duplicates; lexical reset; cosmetic edits preserve progress | `dictionary.noun-adjective-edit`<br>`dictionary.search-nfc-nfd`<br>`dictionary.lexical-reset`<br>`dictionary.cosmetic-preserve` |
| `learning` | `learning.yaml` / main | All six modes; hidden hints; unique choices; umlauts/ß; 20 UI answers; error at 19; no second bonus | `learning.six-modes`<br>`learning.hidden-unique-choices`<br>`learning.umlauts-eszett`<br>`learning.twenty-ui-answers`<br>`learning.nineteen-error`<br>`learning.bonus-once` |
| `reviews` | `reviews.yaml` / main | 1/3/7/14/30/60/60 scheduling; early/late; errors; difficult recovery; timezone/DST | `reviews.all-intervals`<br>`reviews.early-overdue`<br>`reviews.learned-error`<br>`reviews.difficult-recovery`<br>`reviews.timezone-dst` |
| `progress` | `progress.yaml` / main | 10 XP/one 50 reward; 499/500; goal1–200; calendar/streak/skills; no XP from card/audio/help | `progress.xp-levels`<br>`progress.goal-bounds`<br>`progress.calendar-streak-skills`<br>`progress.no-passive-xp` |
| `audio` | `audio.yaml` / main | 40 local WAVs; listening; absent German offline TTS; real offline TTS if installed; audible recording | `audio.wav-listening`<br>`audio.tts-absent`<br>`audio.tts-offline`<br>`audio.audible` |
| `reminders` | `reminders.yaml` / main | Permission allowed/denied; time; profile switch; boot; timezone | `reminders.permission-allow-deny`<br>`reminders.reminder-time`<br>`reminders.reminder-profile`<br>`reminders.reminder-boot-zone` |
| `transfer` | `transfer.yaml` / main | Real picker CSV escaping/errors/duplicates/cancel/profile switch; JSON export/restore; bad/interrupted atomicity | `transfer.csv-picker-escaping`<br>`transfer.csv-preview-cancel-profile`<br>`transfer.json-roundtrip`<br>`transfer.invalid-interrupted` |
| `assistant` | `assistant.yaml` / main | Real llama.rn GGUF four modes; save/edit; cancel/background/profile/dependency; absent/corrupt model | `assistant.four-real-modes`<br>`assistant.helper-save-edit`<br>`assistant.helper-cancel-background`<br>`assistant.helper-profile-dependency`<br>`assistant.model-absent-corrupt`<br>`assistant.sources-articles` |
| `persistence-force-stop` | `persistence-force-stop.yaml` / force-stop | XP/word/streak/active profile/session retained after force-stop | `persistence-force-stop.saved-session-xp` |
| `persistence-reboot` | `persistence-reboot.yaml` / reboot | Same database survives reboot and offline relaunch | `persistence-reboot.saved-session-xp` |
| `upgrade` | `upgrade.yaml` / upgrade | Task5 release candidate from original commit; create data/XP through UI; upgrade to final APK; topic migration; no second reward | `upgrade.original-task5-apk`<br>`upgrade.old-ui-word-xp`<br>`upgrade.topic-migration`<br>`upgrade.resume-no-second-bonus` |
| `resilience` | `resilience.yaml` / main | Keyboard/large font/320dp/background/picker cancel/double answer; no crash/ANR | `resilience.320dp-large-font`<br>`resilience.keyboard-background`<br>`resilience.picker-double-answer`<br>`resilience.crash-anr` |

`persistence-before.yaml` and `upgrade-before.yaml` are setup phases; their passing output does not satisfy a required outcome ID. `config.yaml` lists only the main group flows so reboot/update phases cannot accidentally run against cleared state. Failed or unexecuted checks remain nonzero and not verified.

State evidence is exported by normal versioned backup UI operations and read only on the host. No app SQLite file or learning counter is edited. Group flows execute after their detailed checks; setup flows alone never satisfy required IDs.

## Release acceptance gate

`npm run package:release` runs the release rejection tests, stages the supplied
APK/model and retained regression evidence, then runs the same release verifier
as `npm run verify:release`. Every group ID plus every detailed check ID in
`e2e/matrix.json` is mandatory. Missing/duplicate/not-passed IDs, stale APK/model
hashes, JUnit failures/skips, absent generations/logs/observations and nonzero
run status block delivery. The report's current hashes must refer to the files
in the bundle. Physical Pixel9ProXL results additionally cover all 14 spec
criteria, real model speed/memory and phone restart/upgrade behavior.

The current actual Android result is failed/exit1
(`first-launch.clean-40-words`), with most rows unverified. Physical Pixel
results are entirely unverified. See [release report](release-report.md) and
[device acceptance](device-acceptance.md); no row becomes passed through a host
unit test or a successful release build.

## A1 / Lektion 2 required blocks

| Block | Required checks | Retained evidence |
| --- | --- | --- |
| extended-vocabulary | nine-type-editor; both-csv-duplicates-topics; search-sie-numbers; typed-number; backup3-roundtrip | Nine saved POS values, both CSV imports, mastered duplicate and topics, exact typed attempt/XP, complete V3 graph after restore |
| grammar-lektion2 | five-lessons; sentence-correct-error; sie-context; reference-helper; force-stop; reboot; empty-dictionary; schema6-eight-upgrade | Real attempts in all five lessons, sentence error with zero XP, formal Sie answer, unchanged help ledger, pending sentence retained after process death/reboot, fallback with zero words, before/after upgrade graph |

Every new check is mandatory in the full report and bound to the final APK
SHA-256. All are initially **implemented-unverified**. UI presence alone cannot
satisfy learning checks: exported attempt deltas and expected outcomes are
required. Keyboard checks assert prompt/input/submit together before capture.
The schema5 and original Task5 checks remain mandatory alongside schema6→10 and schema8→10.

## Grammar rules / Lektion 3 (schema10)

| Block | Exact required checks | Public export evidence |
| --- | --- | --- |
| grammar-rules | ten-answer-mastery; nine-error-reset; schema8-ten-upgrade; legacy-backup-conversion; backup4-roundtrip; word-threshold-twenty; profiles-reviews | Ten grammar answers and one bonus; error after nine resets; boundaries 0/9/10/19/20 retain attempts/questions/rewards; migration XP is only transition bonuses; repeated launch unchanged; V4 restore and dictionary twenty-answer mastery |
| grammar-lektion3 | three-lessons; article-choice-typing; plural-correct-error; invariant-exact-set; empty-dictionary; keyboard-small-large; reference-help-return; force-stop-reboot; profile-isolation; backup4-roundtrip | Real saved-question attempts in all three lessons; typed article/plural and error; exact invariant set accepted with subset/superset rejected; empty-word fallback; standard and 320dp/large-font keyboard captures; help/reference preserves XP; force-stop/reboot preserve pending question; profile and complete V4 graph isolation |

All seven and ten checks are mandatory alongside every existing block. The
retained IDs `grammar-progress.twenty-ui-answers` and
`grammar-lektion2.schema6-eight-upgrade` remain stable for report consumers;
their live grammar expectation is ten and final schema is ten. Historical V1,
V2 and V3 inputs retain twenty-answer word/grammar history; dictionary mastery,
daily goal 20 and lesson source item 20 remain unchanged. Current exports are
V4 with catalog versions 1/2/3 and rulesVersion 2; historical attempts preserve
rulesVersion 1 (or its legacy absence) and original XP.

Android answers come from the immediately exported saved question: stable
option IDs, typed tokens/phrases and exact invariant IDs. Choice positions are
never used as an answer key. V4 restore comparisons normalize UUIDs and restored
names while preserving target/template/noun/option IDs, expected answers and
array order, including rule-transition `afterAttemptId` links.

Task 7 provides host contracts and parser verification. Android release,
old-APK picker-import/upgrade execution, and human keyboard review remain Task 8
work; these rows remain **implemented-unverified** until their real evidence is
collected. No synthetic host fixture is release/device acceptance evidence.

## Result-audio acceptance

Correct-answer audio adds the following acceptance checklist to dictionary and
grammar results. It does not mark any existing mandatory ID in
`e2e/matrix.json` passed or replace its per-ID JUnit/state evidence. Every row
below remains **unverified on Android** until observations are retained against
the tested APK SHA-256. A passing host test or packaged WAV count cannot certify
audibility, pronunciation, real offline TTS, or audible cancellation.

Run with internet disabled and installed German offline speech data on the
dedicated emulator, then on the physical Pixel before release. Keep screenshots,
logs, public before/after exports and human listening observations with the APK
hash, device/API level, voice identity, offline state and scenario outcome.

| Acceptance scenario | Required observation / evidence |
| --- | --- |
| Dictionary correct and incorrect answers | Both directions read only the correct German snapshot; German → Russian never reads the Russian translation, and an incorrect submission is never spoken |
| Article and custom dictionary answers | Definite and indefinite articles read article plus noun; custom phrase and number read their correct German text |
| Pronouns / sein and Lektion 2 | Correct and incorrect results read the complete correct German feedback sentence across all Lektion 2 forms |
| Every Lektion 3 form | Article and plural results read the correct sentence; invariant results read only the exact correct singular/plural pairs in feedback order |
| WAV and offline TTS | An exact bundled text plays its WAV; text without a recording plays a real installed German offline voice; local recording failure uses offline TTS if available |
| Auto-play, repeat and stop | One auto-play per visible result identity, including restored results; rerenders do not repeat it; manual repeat works and stop audibly cancels WAV and TTS |
| Fast Continue and async cancellation | Continue is reachable during pending playback and stops sound; late asset/voice resolution cannot start stale speech or show a stale unavailable message |
| Reference / explanation, profile and background | Hiding grammar for help, profile/question changes, unmount and backgrounding cancel sound; returning to the same mounted result does not auto-replay; repeat works after returning |
| Passive progress | Public exported attempts, XP, streak, due dates and mastery are unchanged by auto-play, repeat, stop and failure; dictionary threshold is 20 and grammar threshold is 10 |
| Missing German offline voice | On an emulator without German speech data, an unrecorded answer shows `Офлайн-озвучка недоступна.` and Continue/help remain usable; the saved answer remains intact; cancellation is silent |
| 320dp and large text | Correct/incorrect feedback, repeat/stop, Continue, reference and explanation controls remain reachable without obstruction |

Do not remove speech data from the user's phone to test the unavailable branch.
If either the device or a real installed offline German voice is absent, mark
that branch **unverified**, record the limitation, and keep the release gate
pending. The development native probe is useful evidence about local player
availability; it is not the product APK or human result-audio acceptance.

### Verification evidence — 2026-10-14

Verification ran against application commit
`e526dcde29eee3449ac1edb4e9c6aa0a6c3b3f11` with the existing uncommitted dictionary
keyboard changes preserved. Documentation changes do not change app behavior.

| Command | Fresh result |
| --- | --- |
| `./scripts/toolchain.sh npm run typecheck` | Exit 0 |
| `./scripts/toolchain.sh npm run lint` | Exit 0; 0 errors, 13 existing `no-require-imports` warnings in `test/integration/regressionFixtures.test.ts` |
| `./scripts/toolchain.sh npm run test:scripts` | Exit 0; 292 passed, 0 failed/cancelled/skipped/todo |
| `./scripts/toolchain.sh npm test -- --runInBand` | Exit 0; 100 suites, 741 tests passed; 0 snapshots |
| `git diff --check` | Exit 0 |
| `env VOCABULARY_ABI=arm64-v8a ./scripts/toolchain.sh npm run build:android` | Exit 0 after approved sandbox escalation; 388 Gradle tasks (30 executed, 358 up-to-date), v2 signature verified, embedded JS and 40 WAVs, no INTERNET permission |

The normal sandbox build could not open Gradle's file-lock socket. The first
escalated build chose x86_64 from Rosetta Node and failed CMake Python detection;
the existing build workflow's explicit ABI override produced the ARM64 candidate.
Candidate APK SHA-256:
`f985adeb885ced81adc77275e663d18ae9e0042af921b3f4cc9321ee54c857a7`.
Its signing certificate SHA-256 is
`b61708a517c2ea04e3879f6b5dddae93413ef284152bc6707a6d23fa2ff48ba3`.

`adb install -r` succeeded on the existing dedicated `emulator-5580` (Android
16/API36), preserving app data. Observed pre-existing settings were airplane
mode 1, Wi-Fi 0, 960px width / 480dpi (320dp), font scale 1.5. Product launch
succeeded. This is build/install evidence only. Real offline German voice
availability, the scenario checklist, human acoustic/cancellation review and
physical Pixel acceptance remain **unverified**. No existing mandatory matrix
ID or historical release rejection status is changed by these host/build checks.

A bounded product UI smoke captured an incorrect dictionary result for
`картина`, with `Ответ: das Bild`, repeat and stop controls in the hierarchy.
Subsequent captures unexpectedly showed other screens, so the run cannot
establish a continuous result interaction, control reachability or a device
acceptance pass. See [Task 5 evidence and limitations](task-5-report.md).
