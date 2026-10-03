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

A recording is selected by exact `displayGerman(word)` text, so edits to German,
gender, or part of speech cannot play an obsolete seed recording. Other words
require an installed German Android voice whose `isNetworkConnectionRequired`
is false. Kotlin rechecks the voice at playback, rejects failed `setVoice`, and
never speaks through a default voice fallback. No cloud TTS is used. Missing
speech data produces a visible unavailable state; an affected listening question
is cancelled without an answer or penalty and the rotation chooses another kind.

Cards and listening questions expose replay and stop controls. Screen cleanup,
profile changes, question changes and leaving listening stop both players.
Pending asset/voice resolution is invalidated by the service's stop generation.

Automated tests validate all 40 WAVs, manifest text, hashes, voice filtering,
recording priority, cancellation, and penalty-free listening fallback. These
checks cannot certify German acoustic pronunciation; listening review of all 40
clips is still required before final release. The headless Android probe verifies
native playback and availability, but it does not constitute human listening.

Native probe (development only; rebuild normally for the actual product):

```sh
./scripts/toolchain.sh sh -c 'cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --init-script ../test/android/audio-validation.gradle'
```

Run the installed probe in airplane mode and inspect `NATIVE_AUDIO_RESULT` in
ReactNativeJS logs. It checks all bundled local URIs, replays `der Stuhl`, checks
custom offline voice availability, and rejects an unknown voice. A device with
an installed offline German voice is required to validate successful custom TTS.
