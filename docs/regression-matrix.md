# Android regression matrix

Source of mandatory IDs: `e2e/matrix.json`. Every check below is required; none is silently optional.

The current flows are draft smoke coverage. All detailed check IDs remain **not implemented / not verified**. Full regression cannot pass until each has executable assertions and matching JUnit evidence. TTS availability chooses the documented branch; it is not an unexplained skip.

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
| `persistence-force-stop` | `persistence-after.yaml` / force-stop | XP/word/streak/active profile/session retained after force-stop | `persistence-force-stop.saved-session-xp` |
| `persistence-reboot` | `persistence-after.yaml` / reboot | Same database survives reboot and offline relaunch | `persistence-reboot.saved-session-xp` |
| `upgrade` | `upgrade.yaml` / upgrade | Task5 release candidate from original commit; create data/XP through UI; upgrade to final APK; topic migration; no second reward | `upgrade.original-task5-apk`<br>`upgrade.old-ui-word-xp`<br>`upgrade.topic-migration`<br>`upgrade.resume-no-second-bonus` |
| `resilience` | `resilience.yaml` / main | Keyboard/large font/320dp/background/picker cancel/double answer; no crash/ANR | `resilience.320dp-large-font`<br>`resilience.keyboard-background`<br>`resilience.picker-double-answer`<br>`resilience.crash-anr` |

`persistence-before.yaml` and `upgrade-before.yaml` are setup phases; their passing output does not satisfy a required outcome ID. `config.yaml` lists only the main draft flows so reboot/update phases cannot accidentally run against cleared state. Failed or unexecuted checks remain nonzero and not verified.
