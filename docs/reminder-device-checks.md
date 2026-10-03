# Local reminder verification

Implementation: Expo SDK 56 / expo-notifications 56.0.26; 3 October 2026.

Reminders start off at suggested local time 19:00. SQLite migration 5 stores enabled/hour/minute independently for each profile, preserving daily goals and learning data. Only the selected profile is scheduled. Reconciliation first cancels the app's scheduled notifications and serializes all operations, so repeated calls and profile switching cannot leave multiple reminders. Changing settings, selecting a profile, opening the app, and returning to the foreground reconcile the schedule. The notification is deliberately approximate, not an exact alarm.

Permission is requested by the explicit save action when an enabled reminder lacks permission. Denial preserves the preference and schedules nothing; foreground reconciliation checks permission again without prompting. If Android grants permission in system settings, the next foreground reconciliation restores the reminder. Turning reminders off cancels it.

Only local scheduling APIs are used. No push-token registration or Expo push request exists. Android config disables Firebase Messaging auto-init and Analytics collection and removes exact-alarm permissions. Runtime requires no network connection.

## Native source inspection

The installed Expo library's `NotificationsService.SETUP_ACTIONS` and manifest receive BOOT_COMPLETED and restore persisted notifications via `ExpoSchedulingDelegate.setupScheduledNotifications()`. Its `DailyTrigger.nextTriggerDate()` recalculates local calendar hour/minute for each delivery. Its manifest and setup actions do **not** receive TIME_SET or TIMEZONE_CHANGED. The next alarm is an RTC timestamp, so a timezone change can otherwise leave one delivery at the previous zone's instant.

For that confirmed gap, `ReminderTimeReceiver` receives TIME_SET and TIMEZONE_CHANGED and reuses Expo's persisted request and scheduling delegate. The same notification identifier replaces the existing alarm. The persisted Expo request contains the selected profile ID and local hour/minute; there is no second reminder store or additional boot receiver. SDK 56's shipped notifications AAR is linked through its local Maven publication (source-project builds use the Gradle project fallback).

The config plugin registers the receiver; normal Expo prebuild regenerates it. The receiver does not launch JS, request permission, or use a network service.

Reference: [Expo SDK 56 notifications](https://docs.expo.dev/versions/v56.0.0/sdk/notifications/).

## Automated results

- Service tests exercise real SQLite and a stateful notification boundary: off defaults, P1→off P2→P1, cancellation with no profile, denied permission, permission restored, persisted time, repeated/concurrent reconciliation, disabling, invalid hour/minute.
- React Native settings tests check initial off/19:00, saved 20:30, denied permission explanation, invalid-time rejection preserving the saved preference, and a save racing with a profile switch.
- Full Jest run: 29 suites / 173 tests passed. TypeScript and ESLint passed.
- Expo Android prebuild passed. Controller-escalated `./scripts/toolchain.sh sh -c 'cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a'` passed in 22 seconds. The release includes the compiled time receiver and SDK 56 notifications AAR.

## Release-device checks and limitations

An isolated API36 ARM64 emulator is available (`emulator-5554`). Sandbox adb initially could not start its local server; a controller-authorized unsandboxed device query confirmed the emulator. Physical OEM devices have not been tested.

Actual release emulator checks (API36 ARM64, Wi-Fi/mobile data disabled, adb reverse removed):

- Existing Anton profile and data survived installation/migration. Initial reminder controls showed off and 19:00.
- Enabling prompted the real Android notification permission dialog. Choosing “Don’t allow” retained enabled/19:00 and displayed the permission explanation; `dumpsys alarm` had no app alarm.
- Granting POST_NOTIFICATIONS with adb and returning the app to the foreground created exactly one RTC_WAKEUP alarm, at 2026-10-04 19:00 local Berlin time. Its window was one hour, confirming approximate scheduling without exact-alarm privilege.
- With the app backgrounded, `cmd alarm set-timezone America/New_York` replaced the alarm with 2026-10-03 19:00 New York local time. There remained exactly one app alarm. Europe/Berlin was restored afterward.

- Rebooting the emulator restored exactly one 2026-10-04 19:00 Berlin alarm before the app was reopened (`sys.boot_completed=1`).
- Selecting disabled Maria removed the alarm; selecting Anton restored exactly one. Revoking POST_NOTIFICATIONS and reopening left no alarm while the settings screen still showed enabled/19:00. Permission was restored afterward.

Reproduction and remaining release-device checks:

1. Enable P1 near the next local minute and allow notification permission; inspect that exactly one alarm exists and a notification is delivered while the app is backgrounded. Switch to disabled P2, then back to P1; expect zero then one alarm.
2. Reboot without reopening the app. Check that Expo's boot receiver recreates one alarm and delivery resumes. Android force-stop is different from reboot: force-stopped apps cannot receive boot/time broadcasts until manually launched.
3. Change the emulator timezone (for example Europe/Berlin→America/New_York) while the app stays closed, then check the alarm's local hour/minute. Restore the original timezone afterward. Change system wall time similarly.
4. Check both DST transitions, including a nonexistent or repeated 02:30. Expo delegates to Java Calendar's local-time resolution; no special duplicated-hour guarantee is provided. Normal 19:00 avoids the DST gap.
5. Revoke POST_NOTIFICATIONS in Android settings, reopen the app, and verify no alarm remains while SQLite retains enabled/time. Grant permission, foreground again, and verify one reminder resumes.

Physical-device reboot delivery, OEM battery restrictions, actual notification arrival timing, manual wall-clock changes, and DST edge-hour delivery must not be inferred from unit tests or source inspection. Native findings and any remaining unverified scenarios are listed in the task report.
