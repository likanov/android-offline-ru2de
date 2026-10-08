import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { Buffer } from 'node:buffer';
import { verifyRelease } from '../../scripts/verify-release.mjs';
import { packageRelease } from '../../scripts/package-release.mjs';
import { REQUIRED_SCENARIOS } from '../../scripts/regression-report.mjs';
const root = resolve(import.meta.dirname, '../..');
const digest = value => createHash('sha256').update(value).digest('hex');
const certificate = 'b61708a517c2ea04e3879f6b5dddae93413ef284152bc6707a6d23fa2ff48ba3';
function put(dir, path, data) { mkdirSync(join(dir, path, '..'), { recursive: true }); writeFileSync(join(dir, path), typeof data === 'string' || Buffer.isBuffer(data) ? data : JSON.stringify(data)); }
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'vocabulary-release-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const apk = 'synthetic unit-test APK; never device evidence', model = Buffer.alloc(24); model.write('GGUF'); model.writeUInt32LE(3, 4);
  const modelManifest = { ...JSON.parse(readFileSync(join(root, 'docs/model-manifest.json'))), bytes: model.length, sha256: digest(model) };
  put(dir, 'app-release.apk', apk); put(dir, 'model/' + modelManifest.fileName, model); put(dir, 'model/model-manifest.json', modelManifest);
  cpSync(join(root, 'assets/audio'), join(dir, 'audio'), { recursive: true });
  cpSync(join(root, 'docs/licenses'), join(dir, 'licenses'), { recursive: true });
  for (const name of ['install-android.md', 'device-acceptance.md', 'third-party-notices.md', 'release-report.md']) put(dir, name, 'Synthetic documentation for verifier unit tests only.');
  put(dir, 'regression/device.log', 'Synthetic device log without runtime failures');
  put(dir, 'regression/previous.apk', 'synthetic previous APK');
  put(dir, 'regression/provenance.json', { commit: '19b2e0c1cf36eda73159aff9bb2d94b757d24144', sha256: digest('synthetic previous APK'), sourceMapVerified: true });
  put(dir, 'regression/generation.png', 'synthetic screenshot'); put(dir, 'regression/generation.xml', '<hierarchy/>');
  put(dir,'regression/schema6-provenance.json',{schemaVersion:6,sha256:digest('synthetic previous APK'),package:'com.personal.germanvocabulary',certificateSha256:certificate,commit:'d'.repeat(40),sourceMapVerified:true});
  const report = {
    schema6Upgrade:{apk:'regression/previous.apk',apkSha256:digest('synthetic previous APK'),package:'com.personal.germanvocabulary',certificateSha256:certificate,finalCertificateSha256:certificate,provenancePath:'regression/schema6-provenance.json',beforeEvidence:'regression/device.log',afterEvidence:'regression/device.log',stateValidation:{ok:true}},
    status: 'passed', exitCode: 0, blockers: [], commit: 'a'.repeat(40),
    apk: { path: 'app-release.apk', sha256: digest(apk) }, model: { path: 'model/' + modelManifest.fileName, sha256: modelManifest.sha256, manifestPath: 'model/model-manifest.json', manifest: modelManifest },
    scenarios: REQUIRED_SCENARIOS.map(id => { put(dir, `regression/${id}.xml`, `<testsuite><testcase name="${id}"/></testsuite>`); return { id, status: 'passed', junit: `regression/${id}.xml`,apkSha256:digest(apk),stateEvidence:'regression/device.log',stateValidation:{ok:true} }; }),
    generations: ['association', 'example', 'text', 'rule'].map(mode => ({ mode, runtime: 'llama.rn', modelSha256: modelManifest.sha256, text: 'Synthetic generated text.', screenshot: 'regression/generation.png', hierarchy: 'regression/generation.xml' })),
    network: { wifi: false, mobile: false }, crashCount: 0, anrCount: 0, logcat: 'regression/device.log',
    deviceLogs: [{ phase: 'primary', path: 'regression/device.log', crashCount: 0, anrCount: 0 }, { phase: 'upgrade', path: 'regression/device.log', crashCount: 0, anrCount: 0 }],
    observations: { audioAudible: true, languageQuality: 'reviewed', languageNotes: 'Synthetic unit-test observation.', tts: 'absent-tested' },
    upgrade: { previousCommit: '19b2e0c1cf36eda73159aff9bb2d94b757d24144', apk: 'regression/previous.apk', apkSha256: digest('synthetic previous APK'), provenancePath: 'regression/provenance.json' },
    restoration: { status: 'passed', failures: [] },
  };
  const acceptance = { status: 'passed', blockers: [], apkSha256: digest(apk), modelSha256: modelManifest.sha256, device: { physical: true, manufacturer: 'Google', model: 'Pixel 9 Pro XL', androidVersion: '16' }, checkedAt: '2026-10-04T00:00:00Z', metrics: ['association', 'example', 'text', 'rule'].map(mode => ({ mode, firstTokenMs: 100, totalMs: 1000, tokens: 10, peakRssBytes: 1000000, evidence: 'regression/device.log' })), criteria: Array.from({ length: 14 }, (_, i) => ({ id: i + 1, status: 'passed', actual: 'Synthetic assertion.', evidence: 'regression/device.log' })) };
  const manifest = { schemaVersion: 1, sourceCommit: 'a'.repeat(40), builtFromCommit: 'a'.repeat(40), applicationId: 'com.personal.germanvocabulary', certificateSha256: certificate, apk: 'app-release.apk', modelManifest: 'model/model-manifest.json', audioManifest: 'audio/manifest.json', regressionReport: 'regression/report.json', deviceAcceptance: 'device-acceptance.json', files: {} };
  const host = { status: 'passed', commit: 'a'.repeat(40), checkedAt: '2026-10-04T00:00:00Z', commands: [
    ['./scripts/toolchain.sh npm run typecheck', 'verification/typecheck.log'],
    ['./scripts/toolchain.sh npm run lint', 'verification/lint.log'],
    ['./scripts/toolchain.sh npm test -- --runInBand', 'verification/jest.log'],
    ['./scripts/toolchain.sh npm run test:sql', 'verification/sql.log'],
    ['./scripts/toolchain.sh npm run test:scripts', 'verification/scripts.log'],
  ].map(([command, log]) => { put(dir, log, 'Synthetic successful host command: ' + command); return { command, exitCode: 0, log }; }) };
  const audio = JSON.parse(readFileSync(join(dir, 'audio/manifest.json')));
  // Native Android tools are the external boundary; these tests exercise real filesystem/hash/report validation.
  const inspection = { certificateSha256: certificate, applicationId: manifest.applicationId, versionName: '0.1.0', versionCode: '1', abi: ['arm64-v8a'], signedV2: true, permissions: [], jsBundle: true, audioSha256: audio.recordings.map(row => row.sha256) };
  function save() {
    put(dir, 'regression/report.json', report); put(dir, 'device-acceptance.json', acceptance); put(dir, 'verification/report.json', host);
    const walk = path => readdirSync(path, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(join(path, entry.name)) : [join(path, entry.name)]);
    manifest.files = Object.fromEntries(walk(dir).filter(path => !path.endsWith('/release-manifest.json')).map(path => [path.slice(dir.length + 1), { bytes: readFileSync(path).length, sha256: digest(readFileSync(path)) }]));
    put(dir, 'release-manifest.json', manifest);
  }
  save();
  return { dir, report, acceptance, host, manifest, inspection, save, options: { expectedModel: modelManifest, inspectApk: () => inspection } };
}
function rejects(f, code) { const result = verifyRelease(f.dir, f.options); assert.equal(result.ok, false); assert.ok(result.errors.some(error => error.includes(code)), JSON.stringify(result)); }

test('verify_release_rejects_missing_assets: missing GGUF returns CLI exit 2 and MODEL_MISSING', t => {
  const dir = mkdtempSync(join(tmpdir(), 'vocabulary-incomplete-')); t.after(() => rmSync(dir, { recursive: true, force: true }));
  const result = spawnSync(process.execPath, ['scripts/verify-release.mjs', dir], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 2); assert.match(result.stderr, /MODEL_MISSING/);
});
test('accepts complete synthetic evidence with current APK/model hashes', t => { const f = fixture(t); assert.deepEqual(verifyRelease(f.dir, f.options), { ok: true, errors: [] }); });
for (const [path, code] of [['model/Qwen3-1.7B-Q4_K_M.gguf', 'MODEL_MISSING'], ['audio/manifest.json', 'AUDIO_MANIFEST_MISSING'], ['audio/seed-17.wav', 'AUDIO_MISSING:seed-17'], ['install-android.md', 'INSTRUCTION_MISSING'], ['regression/report.json', 'REGRESSION_MISSING']]) {
  test('rejects missing ' + path, t => { const f = fixture(t); rmSync(join(f.dir, path)); rejects(f, code); });
}
for (const [name, mutate, code] of [
  ['old APK report', f => { f.report.apk.sha256 = '0'.repeat(64); }, 'REGRESSION_APK_SHA256_MISMATCH'],
  ['old model report', f => { f.report.model.sha256 = '0'.repeat(64); }, 'REGRESSION_MODEL_SHA256_MISMATCH'],
  ['not-verified report', f => { f.report.status = 'not-verified'; }, 'RUN_NOT_COMPLETE'],
  ['nonzero report', f => { f.report.exitCode = 2; }, 'REGRESSION_EXIT_NONZERO'],
  ['missing mandatory detailed ID', f => { f.report.scenarios = f.report.scenarios.filter(row => row.id !== 'assistant.four-real-modes'); }, 'SCENARIO_MISSING_OR_DUPLICATE:assistant.four-real-modes'],
  ['duplicate ID', f => { f.report.scenarios.push(f.report.scenarios[0]); }, 'SCENARIO_MISSING_OR_DUPLICATE:first-launch'],
  ['failed JUnit', f => { put(f.dir, 'regression/first-launch.xml', '<testsuite><testcase name="first-launch"><failure/></testcase></testsuite>'); }, 'JUNIT_NOT_PASSED:first-launch'],
  ['missing artifact', f => { f.report.generations[0].hierarchy = 'regression/absent.xml'; }, 'REAL_GENERATION_MISSING:association'],
  ['external report path', f => { f.report.logcat = '/tmp/external.log'; }, 'EVIDENCE_PATH_OUTSIDE_BUNDLE'],
  ['report blockers', f => { f.report.blockers.push('PHASE_INCOMPLETE'); }, 'REGRESSION_BLOCKERS'],
  ['restoration failed', f => { f.report.restoration.status = 'failed'; }, 'RESTORATION_NOT_PASSED'],
  ['Pixel pending', f => { f.acceptance.criteria[13].status = 'not-verified'; }, 'PIXEL_CRITERION_NOT_PASSED:14'],
  ['Pixel different APK', f => { f.acceptance.apkSha256 = '0'.repeat(64); }, 'PIXEL_APK_SHA256_MISMATCH'],
  ['emulator acceptance', f => { f.acceptance.device.physical = false; }, 'PIXEL_PHYSICAL_DEVICE_REQUIRED'],
]) test('rejects ' + name, t => { const f = fixture(t); mutate(f); f.save(); rejects(f, code); });
test('rejects tampered bytes even if report still claims success', t => { const f = fixture(t); put(f.dir, 'audio/seed-01.wav', 'tampered'); rejects(f, 'FILE_SHA256_MISMATCH:audio/seed-01.wav'); });
test('rejects unexpected signing identity', t => { const f = fixture(t); f.inspection.certificateSha256 = '0'.repeat(64); rejects(f, 'APK_CERTIFICATE_MISMATCH'); });
test('rejects APK with INTERNET permission', t => { const f = fixture(t); f.inspection.permissions.push('android.permission.INTERNET'); rejects(f, 'APK_HAS_INTERNET'); });
test('rejects APK missing embedded WAV', t => { const f = fixture(t); f.inspection.audioSha256.pop(); rejects(f, 'APK_AUDIO_MISMATCH'); });
test('internal inspection errors propagate to CLI-equivalent caller', t => { const f = fixture(t); assert.throws(() => verifyRelease(f.dir, { ...f.options, inspectApk: () => { throw Error('TOOL_UNAVAILABLE'); } }), /TOOL_UNAVAILABLE/); });
test('package keeps failed regression evidence and returns invalid candidate status', t => {
  const f = fixture(t); f.report.status = 'failed'; f.report.exitCode = 1; f.save();
  const output = join(f.dir, 'candidate');
  const result = packageRelease({ output, apk: join(f.dir, 'app-release.apk'), modelDir: join(f.dir, 'model'), report: join(f.dir, 'regression/report.json'), audioDir: join(f.dir, 'audio'), docsDir: f.dir, verificationDir: join(f.dir, 'verification'), acceptance: join(f.dir, 'device-acceptance.json'), sourceCommit: 'a'.repeat(40), ...f.options });
  assert.equal(result.ok, false); assert.ok(result.errors.includes('RUN_NOT_COMPLETE'));
  assert.equal(JSON.parse(readFileSync(join(output, 'regression/report.json'))).status, 'failed');
  assert.equal(JSON.parse(readFileSync(join(output, 'release-manifest.json'))).status, 'blocked');
});

test('accepts empty retained stderr in file inventory', t => { const f = fixture(t); put(f.dir, 'regression/stderr.log', ''); f.report.commands = [{ command: 'retained-command', stdout: 'regression/device.log', stderr: 'regression/stderr.log', status: 0 }]; f.save(); assert.equal(verifyRelease(f.dir, f.options).ok, true); });
test('rejects unapproved manifest fields such as model download URLs', t => { const f = fixture(t); const path = 'model/model-manifest.json'; const manifest = JSON.parse(readFileSync(join(f.dir, path))); manifest.downloadUrl = 'https://example.invalid/model'; put(f.dir, path, manifest); f.save(); rejects(f, 'MODEL_MANIFEST_MISMATCH'); });
test('rejects missing v2 signature confirmation', t => { const f = fixture(t); f.inspection.signedV2 = false; rejects(f, 'APK_V2_SIGNATURE_MISSING'); });
test('classifies malformed regression arrays as invalid evidence', t => { const f = fixture(t); f.report.generations = {}; f.report.scenarios = [null]; f.save(); rejects(f, 'REGRESSION_INVALID'); });
test('rejects symlink to model outside bundle', t => { const f = fixture(t); const path = join(f.dir, 'model/Qwen3-1.7B-Q4_K_M.gguf'), external = join(f.dir, 'outside.gguf'); cpSync(path, external); rmSync(path); symlinkSync(external, path); rejects(f, 'MODEL_MISSING'); });
test('packager refuses private material before creating bundle', t => {
  const f = fixture(t); put(f.dir, 'regression/signing.env', 'synthetic secret, never copied'); const output = join(f.dir, 'candidate');
  const result = packageRelease({ output, apk: join(f.dir, 'app-release.apk'), modelDir: join(f.dir, 'model'), report: join(f.dir, 'regression/report.json'), audioDir: join(f.dir, 'audio'), docsDir: f.dir, verificationDir: join(f.dir, 'verification'), acceptance: join(f.dir, 'device-acceptance.json'), sourceCommit: 'a'.repeat(40), ...f.options });
  assert.equal(result.ok, false); assert.match(result.errors.join('\n'), /PRIVATE_MATERIAL_FORBIDDEN/); assert.equal(result.output, undefined);
  assert.equal(spawnSync(process.execPath, ['-e', 'process.exit(require("fs").existsSync(process.argv[1])?1:0)', output]).status, 0);
});
test('CLI missing Android inspection tool returns internal exit 1', t => {
  const f = fixture(t); const result = spawnSync(process.execPath, ['scripts/verify-release.mjs', f.dir], { cwd: root, encoding: 'utf8', env: { ...process.env, ANDROID_HOME: join(f.dir, 'absent-sdk') } });
  assert.equal(result.status, 1); assert.match(result.stderr, /VERIFIER_INTERNAL_ERROR:INSPECTION_TOOL_FAILED/);
});
test('requires exact target Pixel 9 Pro XL', t => { const f = fixture(t); f.acceptance.device.model = 'Pixel 7'; f.save(); rejects(f, 'PIXEL_PHYSICAL_DEVICE_REQUIRED'); });
test('requires measured model speed and memory for every Pixel assistant mode', t => { const f = fixture(t); f.acceptance.metrics = []; f.save(); rejects(f, 'PIXEL_METRICS_MISSING:association'); });
test('full synthetic package remains verifiable after moving to another directory', t => {
  const f = fixture(t), output = join(f.dir, 'candidate');
  const result = packageRelease({ output, apk: join(f.dir, 'app-release.apk'), modelDir: join(f.dir, 'model'), report: join(f.dir, 'regression/report.json'), audioDir: join(f.dir, 'audio'), docsDir: f.dir, verificationDir: join(f.dir, 'verification'), acceptance: join(f.dir, 'device-acceptance.json'), sourceCommit: 'a'.repeat(40), ...f.options });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const moved = mkdtempSync(join(tmpdir(), 'vocabulary-relocated-')); t.after(() => rmSync(moved, { recursive: true, force: true })); cpSync(output, moved, { recursive: true });
  rmSync(output, { recursive: true });
  assert.equal(verifyRelease(moved, f.options).ok, true);
});
test('packages separately recorded Pixel acceptance artifacts with portable paths', t => {
  const f = fixture(t), output = join(f.dir, 'candidate');
  put(f.dir, 'pixel/measured.log', 'Synthetic Pixel artifact.');
  for (const row of [...f.acceptance.criteria, ...f.acceptance.metrics]) row.evidence = 'pixel/measured.log';
  f.save();
  const result = packageRelease({ output, apk: join(f.dir, 'app-release.apk'), modelDir: join(f.dir, 'model'), report: join(f.dir, 'regression/report.json'), audioDir: join(f.dir, 'audio'), docsDir: f.dir, verificationDir: join(f.dir, 'verification'), acceptance: join(f.dir, 'device-acceptance.json'), sourceCommit: 'a'.repeat(40), ...f.options });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(readFileSync(join(output, 'pixel/measured.log'), 'utf8'), 'Synthetic Pixel artifact.');
});
test('packager rejects output nested inside regression source', t => {
  const f = fixture(t), output = join(f.dir, 'regression/candidate');
  const result = packageRelease({ output, apk: join(f.dir, 'app-release.apk'), modelDir: join(f.dir, 'model'), report: join(f.dir, 'regression/report.json'), audioDir: join(f.dir, 'audio'), docsDir: f.dir, verificationDir: join(f.dir, 'verification'), acceptance: join(f.dir, 'device-acceptance.json'), sourceCommit: 'a'.repeat(40), ...f.options });
  assert.equal(result.ok, false); assert.match(result.errors.join('\n'), /OUTPUT_OVERLAPS_INPUT/);
});
test('Pixel artifact cannot overwrite the delivered APK', t => {
  const f = fixture(t), output = join(f.dir, 'candidate');
  f.acceptance.criteria[0].evidence = 'app-release.apk'; f.save();
  const result = packageRelease({ output, apk: join(f.dir, 'app-release.apk'), modelDir: join(f.dir, 'model'), report: join(f.dir, 'regression/report.json'), audioDir: join(f.dir, 'audio'), docsDir: f.dir, verificationDir: join(f.dir, 'verification'), acceptance: join(f.dir, 'device-acceptance.json'), sourceCommit: 'a'.repeat(40), ...f.options });
  assert.equal(result.ok, false); assert.match(result.errors.join('\n'), /PIXEL_ARTIFACT_PATH_INVALID/);
});
test('packages host verification logs and binds them in file inventory', t => {
  const f = fixture(t), output = join(f.dir, 'candidate'); cpSync(join(f.dir, 'verification'), join(f.dir, 'host'), { recursive: true }); put(f.dir, 'host/typecheck.log', 'tsc exited 0');
  const result = packageRelease({ output, apk: join(f.dir, 'app-release.apk'), modelDir: join(f.dir, 'model'), report: join(f.dir, 'regression/report.json'), audioDir: join(f.dir, 'audio'), docsDir: f.dir, verificationDir: join(f.dir, 'host'), acceptance: join(f.dir, 'device-acceptance.json'), sourceCommit: 'a'.repeat(40), ...f.options });
  assert.equal(result.ok, true); assert.equal(readFileSync(join(output, 'verification/typecheck.log'), 'utf8'), 'tsc exited 0');
  assert.equal(JSON.parse(readFileSync(join(output, 'release-manifest.json'))).files['verification/typecheck.log'].sha256, digest('tsc exited 0'));
});
test('keeps inline emulator stdout/stderr separate from command artifact paths', t => {
  const f = fixture(t), output = join(f.dir, 'candidate'); f.report.environment = { emulator: { status: 0, stdout: '', stderr: '' } }; f.save();
  const result = packageRelease({ output, apk: join(f.dir, 'app-release.apk'), modelDir: join(f.dir, 'model'), report: join(f.dir, 'regression/report.json'), audioDir: join(f.dir, 'audio'), docsDir: f.dir, verificationDir: join(f.dir, 'verification'), acceptance: join(f.dir, 'device-acceptance.json'), sourceCommit: 'a'.repeat(40), ...f.options });
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  const saved = JSON.parse(readFileSync(join(output, 'regression/report.json'))); assert.equal(saved.environment.emulator.stdout, ''); assert.equal(saved.environment.emulator.stderr, '');
});

// Removing a required notice must fail even after refreshing the bundle's inventory.
const requiredLicenses = ['Qwen3-1.7B-LICENSE.txt', 'expo-LICENSE.txt', 'expo-asset-LICENSE.txt', 'expo-audio-LICENSE.txt', 'expo-crypto-LICENSE.txt', 'expo-document-picker-LICENSE.txt', 'expo-notifications-LICENSE.txt', 'expo-sqlite-LICENSE.txt', 'llama.cpp-LICENSE.txt', 'llama.rn-LICENSE.txt', 'react-LICENSE.txt', 'react-native-LICENSE.txt', 'thorsten-MODEL_CARD.txt', 'npm-production-inventory.json', 'npm-production-notices.txt'];
for (const name of requiredLicenses) test('rejects missing required license payload ' + name, t => {
  const f = fixture(t); rmSync(join(f.dir, 'licenses', name)); f.save(); rejects(f, 'LICENSE_MISSING:' + name);
});
test('rejects absent license directory even when omitted from inventory', t => { const f = fixture(t); rmSync(join(f.dir, 'licenses'), { recursive: true }); f.save(); rejects(f, 'LICENSE_MISSING:Qwen3-1.7B-LICENSE.txt'); });
test('rejects replaced attribution after file inventory is refreshed', t => { const f = fixture(t); put(f.dir, 'licenses/npm-production-notices.txt', 'Incomplete attribution'); f.save(); rejects(f, 'LICENSE_SHA256_MISMATCH:npm-production-notices.txt'); });
for (const name of ['licenses', 'licenses/npm-production-inventory.json']) test('packager refuses missing ' + name, t => {
  const f = fixture(t), output = join(f.dir, 'candidate'); rmSync(join(f.dir, name), { recursive: true }); f.save();
  const result = packageRelease({ output, apk: join(f.dir, 'app-release.apk'), modelDir: join(f.dir, 'model'), report: join(f.dir, 'regression/report.json'), audioDir: join(f.dir, 'audio'), docsDir: f.dir, verificationDir: join(f.dir, 'verification'), acceptance: join(f.dir, 'device-acceptance.json'), sourceCommit: 'a'.repeat(40), ...f.options });
  assert.equal(result.ok, false); assert.match(result.errors.join('\n'), /LICENSE_MISSING:/); assert.equal(result.output, undefined);
});

test('rejects missing host verification receipt despite refreshed inventory', t => { const f = fixture(t); f.save(); rmSync(join(f.dir, 'verification/report.json')); delete f.manifest.files['verification/report.json']; put(f.dir, 'release-manifest.json', f.manifest); rejects(f, 'HOST_VERIFICATION_MISSING'); });
for (const [name, mutate, code] of [
  ['stale host receipt commit', f => { f.host.commit = '0'.repeat(40); }, 'HOST_COMMIT_MISMATCH'],
  ['failed host receipt', f => { f.host.status = 'failed'; }, 'HOST_VERIFICATION_NOT_PASSED'],
  ['missing Jest command result', f => { f.host.commands = f.host.commands.filter(row => row.log !== 'verification/jest.log'); }, 'HOST_COMMAND_NOT_PASSED:./scripts/toolchain.sh npm test -- --runInBand'],
  ['failed SQL command result', f => { f.host.commands.find(row => row.log === 'verification/sql.log').exitCode = 1; }, 'HOST_COMMAND_NOT_PASSED:./scripts/toolchain.sh npm run test:sql'],
  ['host log outside bundle', f => { f.host.commands[0].log = '/tmp/host-typecheck.log'; }, 'HOST_LOG_MISSING:./scripts/toolchain.sh npm run typecheck'],
  ['Pixel acceptance blockers', f => { f.acceptance.blockers = ['MEMORY_MEASUREMENT_INCOMPLETE']; }, 'PIXEL_BLOCKERS'],
]) test('rejects ' + name, t => { const f = fixture(t); mutate(f); f.save(); rejects(f, code); });
test('rejects missing host command log after refreshing inventory', t => { const f = fixture(t); rmSync(join(f.dir, 'verification/lint.log')); f.save(); rejects(f, 'HOST_LOG_MISSING:./scripts/toolchain.sh npm run lint'); });

test('packager cannot verify a candidate without the host verification receipt', t => {
  const f = fixture(t), output = join(f.dir, 'candidate');
  const result = packageRelease({ output, apk: join(f.dir, 'app-release.apk'), modelDir: join(f.dir, 'model'), report: join(f.dir, 'regression/report.json'), audioDir: join(f.dir, 'audio'), docsDir: f.dir, acceptance: join(f.dir, 'device-acceptance.json'), sourceCommit: 'a'.repeat(40), ...f.options });
  assert.equal(result.ok, false); assert.ok(result.errors.includes('HOST_VERIFICATION_MISSING'));
  assert.equal(JSON.parse(readFileSync(join(output, 'release-manifest.json'))).status, 'blocked');
});

for (const [name, mutate, code] of [
  ['stale successful regression commit', f => { f.report.commit = 'b'.repeat(40); }, 'REGRESSION_COMMIT_MISMATCH'],
  ['stale APK build commit', f => { f.manifest.builtFromCommit = 'b'.repeat(40); }, 'APK_BUILD_COMMIT_MISMATCH'],
  ['missing APK build commit', f => { delete f.manifest.builtFromCommit; }, 'APK_BUILD_COMMIT_MISMATCH'],
]) test('rejects ' + name + ' despite refreshed inventory', t => {
  const f = fixture(t); mutate(f); f.save(); rejects(f, code);
});
test('fresh host checks cannot certify an older successful APK and regression against changed source', t => {
  const f = fixture(t), output = join(f.dir, 'candidate');
  f.host.commit = 'b'.repeat(40); f.save();
  const result = packageRelease({ output, apk: join(f.dir, 'app-release.apk'), modelDir: join(f.dir, 'model'), report: join(f.dir, 'regression/report.json'), audioDir: join(f.dir, 'audio'), docsDir: f.dir, verificationDir: join(f.dir, 'verification'), acceptance: join(f.dir, 'device-acceptance.json'), sourceCommit: 'b'.repeat(40), ...f.options });
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('REGRESSION_COMMIT_MISMATCH'));
  assert.ok(result.errors.includes('APK_BUILD_COMMIT_MISMATCH'));
  assert.equal(JSON.parse(readFileSync(join(output, 'release-manifest.json'))).status, 'blocked');
});
