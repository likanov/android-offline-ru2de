# Release candidate report — 4 October 2026

**Delivery remains blocked.** Host verification and APK inspection are recorded
below. The full Android regression report is failed, and physical Pixel 9 Pro XL
acceptance is not performed. `package:release` and `verify:release` must return 2
for this candidate; no completed Android or Pixel result is inferred from unit
tests, source review, build success or artifact existence.

| Artifact | Actual identity |
| --- | --- |
| Source base before Task 15 | `ce27a2a4d3ff699554becf6348934bf53e99fdd2` |
| Product/report recorded commit | `6f4e6562b7fbb318a32ca904d63d2ec3184ab82f` |
| Release package source commit | Written by `git rev-parse HEAD` into `release-manifest.json` during packaging; Task 15 commit is recorded in its external implementation report |
| APK | `app-release.apk`, `com.personal.germanvocabulary`, version `0.1.0`, code `1`, ARM64 |
| APK SHA-256 | `571183851a118a5359db7af5c63eb7eed1ff77c3f0e65fc806d1c684e0b1ad71` |
| Certificate SHA-256 | `b61708a517c2ea04e3879f6b5dddae93413ef284152bc6707a6d23fa2ff48ba3` |
| Signature | apksigner 36.0.0: v2 passed, one RSA4096 signer; no INTERNET permission |
| Embedded local assets | Hermes JS bundle and exact 40 WAV contents matched against audio manifest |
| GGUF | Qwen3-1.7B-Q4_K_M, GGUFv3, 1,282,438,944 bytes |
| GGUF SHA-256 | `72309900a0aab765e1963ee9ff73aaf5e8c8a754e92c0099d5d55dfca9490f15` |
| Full Android report | `regression/report.json`, source run `fix1-final`, failed, exit1, same APK/model hashes |
| Report failure | `SCENARIO_FAILED:first-launch.clean-40-words`; other mandatory IDs remain unverified |
| Physical Pixel | Only emulator-5554 observed by adb; all 14 criteria and model measurements unverified |

Actual SDK/runtime versions: Node22.13.1, JDK17.0.10, Android build-tools36.0.0,
Expo56.0.23, RN0.85.3, React19.2.3, llama.rn0.12.9. Direct component and license
versions are in `third-party-notices.md`. Dependency resolutions are in the
source project's package-lock.json. Product, dependencies, audio, GGUF and
native build settings were not changed in Task15; no new APK was created.

The complete failed report and original artifacts are retained under
`regression/`. `source-report.json` preserves the original host report; the
verification copy uses paths inside the bundle so the evidence can move to
another directory. Hashes bind those artifacts and files in
`release-manifest.json`. `apk-inspection.json` records actual commands and their
outputs. `device-acceptance.json` contains explicit pending Pixel results.
Host checks passed on the Task15 source tree: typecheck and lint exit0; full Jest
41 suites/248 tests; SQL12 suites/74 tests; release verifier41 tests, and the
complete scripts suite86 tests. Actual command logs and source commit receipt
are retained in `verification/` when the candidate is assembled.
The detailed TDD/host-verification report is the Task15 implementation report
outside this Git checkout under the enclosing task's `work/sdd/` directory.

The persistent release key remains outside Git and the bundle at
`../../work/release-signing/release.keystore`, alias `vocabulary`. Its password
file is `../../work/release-signing/signing.env`; never include either file in
installer archives. The build script uses `umask 077` and reuses these files.
Keep a separate encrypted offline backup of that directory for future updates;
no backup operation is claimed here. Override its location only with
`VOCABULARY_SIGNING_DIR` pointing to the same preserved key. Match the public
certificate digest above before installing an update.

The verifier is fail-closed: every group/check ID from e2e/matrix.json must pass,
JUnit must match IDs without failures/skips, actual model generations and logs
must exist, radios must be offline, the old APK must have its Task5 provenance,
and real audio/language/TTS observations must be complete. APK/model hashes must
match the delivered files. Pixel results require the target physical model,
14 unique passing criteria, measured speed/memory for all four modes and retained
artifacts. Source-only fixture tests use synthetic evidence and an injected
native-tool boundary; they are never accepted as device observations.

Next release gates: reproduce/fix the actual device failures via TDD if needed,
repeat full regression on the resulting signed APK, collect audio/language
observations and physical Pixel results, then package into a fresh directory.
Do not edit a failed report to mark it passed. A generated blocked candidate is
retained for inspection, and the command exits2. An existing output directory is
preserved and rejected; choose `--output` for a new candidate. No ZIP, public
hosting or store publication is performed by this task.
