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
| CMake | 3.30.5 (React Native default) |
| Kotlin / KSP | 2.1.20 / 2.1.20-2.0.1 |

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

The script prefers project-local Node, JDK 17 and Android SDK beneath `../../work/toolchains/`, uses the existing JDK 17 when a local JDK is absent, and keeps Gradle downloads there. It does not modify system runtimes or shell configuration. Expo telemetry is disabled for development commands so the CLI does not need to create a user-home settings directory.

## SQLite connection requirement

WAL and `PRAGMA foreign_keys=ON` are enabled on the main connection. All operations go through one queue; an exclusive transaction runs queries only through its provided connection. Callers must use the supplied `tx` inside a transaction, never the outer store.

Expo's exclusive transaction opens a fresh connection and executes BEGIN before the callback. SQLite cannot enable foreign keys inside an already open transaction. Therefore the native SQLite plugin is compiled with `-DSQLITE_DEFAULT_FOREIGN_KEYS=1`; the adapter also checks enforcement on every transaction and refuses to write if it is disabled. Use a native development or release build. Expo Go does not include this app's custom SQLite compile flag and is not a supported validation target.

## Verification and outstanding native checks

The real Node SQLite integration tests and React Native UI tests pass (10 tests); typecheck, lint and Android Hermes bundle export pass. Node emits its upstream experimental SQLite warning; no React act or lint warnings remain.

Android prebuild passes and the generated Gradle configuration reports the native versions above. The debug build reaches Gradle configuration but fails with `SDK location not found`. Android SDK, adb and an emulator are absent from this environment. No APK was produced, and profile creation/reopening on Android has not been verified. A real native SQLite/emulator check remains required before describing Task 1 as Android-validated.

The initial dependency installation reports 54 audit findings (7 moderate, 47 high) in the resolved npm graph. No forced major upgrades were applied to the fixed Expo SDK baseline. Review the dependency audit before a production release.
