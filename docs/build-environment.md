# Task 1 build environment

Verified on macOS arm64, 3 October 2026. This is the profiles scaffold, not a complete application or an installable release.

| Component | Version / location |
| --- | --- |
| Node for project commands | 22.13.1, `../../work/toolchains/node-runtime/node_modules/node/bin/node` |
| System Node / npm | 22.5.1 / 10.8.2; unchanged |
| JDK used by Gradle | 17.0.10 arm64, `/Library/Java/JavaVirtualMachines/jdk-17.jdk/Contents/Home` |
| System default Java | 25.0.3; unchanged |
| Expo | 56.0.23 |
| SDK 56 native template | expo-template-bare-minimum 56.0.37 |
| React / React Native | 19.2.3 / 0.85.3 |
| expo-sqlite / expo-crypto | 56.0.6 / 56.0.5 |
| Jest / jest-expo | 29.7.0 / 56.0.5 |
| TypeScript | 5.9.3 |
| Android applicationId | com.personal.germanvocabulary |
| Architecture | New Architecture / Hermes |
| Gradle wrapper | 9.3.1 |
| Android Gradle Plugin | 8.12.0 (React Native version catalog) |
| compileSdk / targetSdk / minSdk | 36 / 36 / 24 |
| Android build-tools | 36.0.0 |
| NDK | 27.1.12297006 |
| CMake | 3.30.5 (React Native), 3.22.1 (expo-sqlite) |
| Kotlin / KSP | 2.1.20 / 2.1.20-2.0.1 |
| Android command-line tools | 22.0, official ARM build15859902 |
| Platform tools / emulator | 37.0.1 / 37.2.12 |
| Runtime validation | API36 Google APIs ARM64 revision7, isolated Pixel9ProXL AVD |

All npm resolutions are captured in package-lock.json. `expo install --check` confirms the installed SDK 56 dependency map, including React Native 0.85.3. The SDK 56 template is passed explicitly because the CLI's current default template belongs to SDK 57.

Run commands through `./scripts/toolchain.sh`, for example:

```sh
./scripts/toolchain.sh npm test -- --runInBand
./scripts/toolchain.sh npm run test:sql -- --runTestsByPath test/integration/profiles.test.ts
./scripts/toolchain.sh npm run typecheck
./scripts/toolchain.sh npm run lint
./scripts/toolchain.sh npm run prebuild:android -- --no-install
./scripts/toolchain.sh sh -c 'cd android && ./gradlew assembleDebug'
```

The script prefers project-local Node, JDK 17 and Android SDK beneath `../../work/toolchains/`, uses the existing JDK 17 when a local JDK is absent, and keeps Gradle downloads, Android user settings and AVDs there. It does not modify system runtimes, shell configuration or user AVDs. Expo telemetry is disabled for development commands so the CLI does not need to create a user-home settings directory.

## SQLite connection requirement

WAL and `PRAGMA foreign_keys=ON` are enabled on the main connection. All operations go through one queue; an exclusive transaction runs queries only through its provided connection. Callers must use the supplied `tx` inside a transaction, never the outer store.

Expo's exclusive transaction opens a fresh connection and executes BEGIN before the callback. SQLite cannot enable foreign keys inside an already open transaction. Therefore the native SQLite plugin is compiled with `-DSQLITE_DEFAULT_FOREIGN_KEYS=1`; the adapter also checks enforcement on every transaction and refuses to write if it is disabled. Use a native development or release build. Expo Go does not include this app's custom SQLite compile flag and is not a supported validation target.

## Verification

The real Node SQLite integration tests and React Native UI tests pass (10 tests); typecheck, lint and Android Hermes bundle export pass. Node emits its upstream experimental SQLite warning; no React act or lint warnings remain.

Android prebuild and `assembleDebug -PreactNativeArchitectures=arm64-v8a` pass after installing the project-local SDK. The debug APK was installed in the isolated Pixel9ProXL emulator; Anton and Maria were created through its real UI. An embedded product release build was used to remove the Metro development-server dependency for offline checks. With Wi-Fi/mobile data disabled and adb reverse removed, selecting Anton, waiting for the visible saved state, then force-stopping and reopening retained Anton and both profile names.

A separate test-only native entry verified the same actual Expo SQLite database: Anton40/Maria40 words, exclusive-transaction foreign_keys=1, DEFAULT_FOREIGN_KEYS in native compile options, and a cross-profile progress INSERT rejected with FOREIGN KEY constraint failed. This closes Task1's native validation gap; it does not replace the full application's later release regression or physical Pixel checks.

The native probe is `test/android/profilesSmoke.tsx`, selected only by its Gradle init script. Its fixture is a dedicated app database with exactly two profiles named Anton/Maria and active Anton, created through the product UI. To build it without changing the product entry:

```sh
./scripts/toolchain.sh sh -c 'cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a --init-script ../test/android/native-validation.gradle'
```

Install that test APK into the isolated emulator, launch it offline and inspect `adb logcat -d -s ReactNativeJS` for NATIVE_PROFILES_RESULT. Expected status is PASS. A normal `assembleRelease` without the init script restores the actual product entry. Test APKs are development evidence, not the final app deliverable.

The initial dependency installation reports 54 audit findings (7 moderate, 47 high) in the resolved npm graph. No forced major upgrades were applied to the fixed Expo SDK baseline. Review the dependency audit before a production release.
