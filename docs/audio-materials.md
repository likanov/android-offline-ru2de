# Offline pronunciation materials

The 40 bundled WAV files were generated locally with Piper 1.3.0 and
`de_DE-thorsten-medium`. Nouns include the definite article; adjectives contain
only the adjective. `assets/audio/manifest.json` records exact texts, model and
configuration SHA-256, the generator version, and each WAV SHA-256.

The [Piper project](https://github.com/OHF-Voice/piper1-gpl) is GPL-3.0.
It is a development tool and is not bundled in the Android app. The
[voice model card](https://huggingface.co/rhasspy/piper-voices/blob/main/de/de_DE/thorsten/medium/MODEL_CARD)
identifies the German Thorsten dataset as CC0 and the sample rate as 22,050 Hz.
Model files and the Python virtual environment belong in `work/`, outside Git.
The generated pronunciation WAVs and manifest are committed app assets.

To regenerate with a downloaded model and its adjacent `.onnx.json` configuration:

```sh
python3 -m venv ../../work/audio-venv
../../work/audio-venv/bin/pip install -r scripts/requirements-audio.txt
../../work/audio-venv/bin/python scripts/prepare-audio.py --model ../../work/audio-model/de_DE-thorsten-medium.onnx
```

A recording is selected by exact playback text (`displayGerman(word)` for cards
and listening), so edits to German, gender, or part of speech cannot play an
obsolete seed recording. If a matching local WAV cannot resolve or play, the
service tries offline TTS unless playback was cancelled. Text without an exact
recording also requires an installed German Android voice: `installed` is true,
`requiresNetwork` is false, and the language matches `de`, `de-…`, or `de_…`.
Kotlin independently rechecks the voice at playback, rejects failed `setVoice`,
and never speaks through a default voice fallback. No cloud TTS or remote asset
fallback is used. Missing speech data produces a visible unavailable state; an
affected listening question is cancelled without an answer or penalty and the
rotation chooses another kind.

Cards and listening questions expose replay and stop controls. Screen cleanup,
profile changes, question changes and leaving listening stop both players.
Pending asset/voice resolution is invalidated by the service's stop generation.

## Correct-answer audio on results

Dictionary and grammar results automatically read the correct German answer
after either a correct or an incorrect answer. The source is the persisted
question snapshot, so a later dictionary edit or the learner's submitted answer
cannot change the text being read.

| Result kind | German playback text |
| --- | --- |
| Dictionary German → Russian | German question prompt, including its noun article |
| Dictionary Russian → German, typing and listening | First canonical German `expected[0]`, without alternative aliases, including the noun article where present |
| Definite / indefinite article | Correct article followed by the question's noun prompt |
| Custom phrase or number | Correct German snapshot text |
| Pronouns / sein | Correct `feedback.sentenceDe` |
| Lektion 2 | Full correct `feedback.sentenceDe`, including sentence completion |
| Lektion 3 article / plural | Full correct `feedback.sentenceDe` |
| Lektion 3 invariant plural | Singular/plural pairs for exactly the correct noun IDs in feedback order; distractors are omitted |

Playback requires matching result/attempt IDs and question/profile IDs, a
visible training screen, and an active app. It auto-plays once per result
identity during a mounted screen's lifetime, including a restored saved result.
Rerenders, returning from reference/explanation, and returning from the
background do not automatically repeat that result. Manual repeat remains
available, and explicit stop cancels both WAV and speech playback. A newly
mounted screen may auto-play its restored result once again.

Continue, a changed question or profile, unmount, hiding the grammar screen for
reference/explanation, and app backgrounding invalidate pending playback and
stop both players. Continue and help controls remain usable while a voice or
asset is resolving; playback does not set the training busy state or retain the
answer lock. An unavailable result voice displays the non-blocking message
`Офлайн-озвучка недоступна.` Cancellation is silent. Result audio failure never
cancels a listening question, advances training, or rolls back the saved answer.
Auto-play, repeat, stop, and failure write no attempts, XP, streak, due dates or
mastery progress; dictionary mastery stays 20 and grammar mastery stays 10.

Automated tests validate all 40 WAVs, manifest text, hashes, voice filtering,
recording priority, cancellation, and penalty-free listening fallback. These
checks cannot certify German acoustic pronunciation; listening review of all 40
clips is still required before final release. The headless Android probe verifies
native playback and availability, but it does not constitute human listening.
Host result-audio tests also cover snapshot text selection, offline fallback,
once-per-result playback, restored results, cancellation races, available
Continue/help controls, and unchanged passive progress. See the
[result-audio acceptance checklist](regression-matrix.md#result-audio-acceptance)
for the separate APK-bound Android and human listening requirements.

Native probe (development only; rebuild normally for the actual product):

```sh
./scripts/toolchain.sh sh -c 'cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --init-script ../test/android/audio-validation.gradle'
```

Run the installed probe in airplane mode and inspect `NATIVE_AUDIO_RESULT` in
ReactNativeJS logs. It checks all bundled local URIs, replays `der Stuhl`, checks
custom offline voice availability, and rejects an unknown voice. A device with
an installed offline German voice is required to validate successful custom TTS.
