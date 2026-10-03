import { readFileSync, existsSync, lstatSync, statSync, readdirSync, realpathSync, openSync, readSync, closeSync } from 'node:fs';
import { resolve, join, relative, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Buffer } from 'node:buffer';
import { sha256File, validateRegressionReport } from './regression-report.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
export const EXPECTED_MODEL = JSON.parse(readFileSync(join(root, 'docs/model-manifest.json'), 'utf8'));
export const EXPECTED_CERTIFICATE = 'b61708a517c2ea04e3879f6b5dddae93413ef284152bc6707a6d23fa2ff48ba3';
export const EVIDENCE_KEYS = new Set(['path', 'junit', 'screenshot', 'hierarchy', 'logcat', 'apk', 'provenancePath', 'manifestPath', 'stateEvidence', 'restoreEvidence', 'stdout', 'stderr']);
export function isEvidencePath(key, container) {
  return EVIDENCE_KEYS.has(key) && (!['stdout', 'stderr'].includes(key) || typeof container?.command === 'string');
}
export const DOCUMENTS = ['install-android.md', 'device-acceptance.md', 'third-party-notices.md', 'release-report.md'];
export const REQUIRED_LICENSES = ['Qwen3-1.7B-LICENSE.txt', 'expo-LICENSE.txt', 'expo-asset-LICENSE.txt', 'expo-audio-LICENSE.txt', 'expo-crypto-LICENSE.txt', 'expo-document-picker-LICENSE.txt', 'expo-notifications-LICENSE.txt', 'expo-sqlite-LICENSE.txt', 'llama.cpp-LICENSE.txt', 'llama.rn-LICENSE.txt', 'react-LICENSE.txt', 'react-native-LICENSE.txt', 'thorsten-MODEL_CARD.txt', 'npm-production-inventory.json', 'npm-production-notices.txt'];
const REQUIRED_HOST_COMMANDS = ['./scripts/toolchain.sh npm run typecheck', './scripts/toolchain.sh npm run lint', './scripts/toolchain.sh npm test -- --runInBand', './scripts/toolchain.sh npm run test:sql', './scripts/toolchain.sh npm run test:scripts'];
const hashPattern = /^[a-f0-9]{64}$/;
export const privateFile = path => /(?:^|\/)(?:signing\.env|\.env(?:\..*)?|[^/]+\.(?:keystore|jks|pem|key|p12|pfx))$/i.test(path);
export function listBundleFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw Error('BUNDLE_SYMLINK:' + path);
    if (entry.isDirectory()) return listBundleFiles(path);
    if (!entry.isFile()) throw Error('BUNDLE_SPECIAL_FILE:' + path);
    return [path];
  }).sort();
}
function tool(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (result.error) throw Error('INSPECTION_TOOL_FAILED:' + command + ':' + result.error.message);
  return { command, args, status: result.status, stdout: result.stdout, stderr: result.stderr };
}
export function inspectApk(path) {
  const sdk = process.env.ANDROID_HOME ?? process.env.ANDROID_SDK_ROOT ?? resolve(root, '../../work/toolchains/android-sdk');
  const tools = join(sdk, 'build-tools/36.0.0');
  const signature = tool(join(tools, 'apksigner'), ['verify', '--verbose', '--print-certs', path]);
  const permissions = tool(join(tools, 'aapt'), ['dump', 'permissions', path]);
  const badging = tool(join(tools, 'aapt'), ['dump', 'badging', path]);
  const assets = tool('python3', ['-c', `import sys,zipfile,hashlib,json
with zipfile.ZipFile(sys.argv[1]) as z:
 names=z.namelist()
 print(json.dumps({'jsBundle':'assets/index.android.bundle' in names,'audioSha256':[hashlib.sha256(z.read(n)).hexdigest() for n in names if n.endswith('.wav')]}))`, path]);
  const errors = [];
  if (signature.status !== 0) errors.push('APK_SIGNATURE_INVALID');
  if (permissions.status !== 0 || badging.status !== 0 || assets.status !== 0) errors.push('APK_INSPECTION_INVALID');
  return {
    errors, certificateSha256: /Signer #1 certificate SHA-256 digest: ([a-f0-9]{64})/.exec(signature.stdout)?.[1],
    signedV2: /Verified using v2 scheme.*: true/.test(signature.stdout),
    applicationId: /package: name='([^']+)'/.exec(badging.stdout)?.[1],
    versionCode: /versionCode='([^']+)'/.exec(badging.stdout)?.[1], versionName: /versionName='([^']+)'/.exec(badging.stdout)?.[1],
    abi: /native-code: (.*)/.exec(badging.stdout)?.[1]?.match(/[^' ]+/g) ?? [],
    permissions: [...permissions.stdout.matchAll(/uses-permission: name='([^']+)'/g)].map(row => row[1]),
    ...(assets.status === 0 ? JSON.parse(assets.stdout) : {}), commands: [signature, permissions, badging, assets],
  };
}
export function verifyRelease(bundle, { expectedModel = EXPECTED_MODEL, inspectApk: inspect = inspectApk } = {}) {
  const dir = resolve(bundle), errors = [];
  const require = (condition, reason) => { if (!condition) errors.push(reason); };
  function local(path) {
    if (typeof path !== 'string' || !path || isAbsolute(path) || path.split(/[\\/]/).includes('..') || path.includes('\\')) return null;
    const full = resolve(dir, path);
    if (existsSync(full) && (lstatSync(full).isSymbolicLink() || relative(realpathSync(dir), realpathSync(full)).startsWith('..'))) return null;
    return full;
  }
  const file = (path, allowEmpty = false) => { const full = local(path); return full && existsSync(full) && statSync(full).isFile() && (allowEmpty || statSync(full).size > 0) ? full : null; };
  function json(path, reason) {
    const full = file(path); require(full, reason + '_MISSING');
    if (!full) return null;
    try { return JSON.parse(readFileSync(full, 'utf8')); } catch { errors.push(reason + '_INVALID'); return null; }
  }
  const manifest = json('release-manifest.json', 'RELEASE_MANIFEST');
  const modelPath = 'model/' + expectedModel.fileName;
  require(file(modelPath), 'MODEL_MISSING');
  const modelManifest = json('model/model-manifest.json', 'MODEL_MANIFEST');
  if (modelManifest) {
    require(Object.keys(modelManifest).length === Object.keys(expectedModel).length && Object.entries(expectedModel).every(([key, value]) => modelManifest[key] === value), 'MODEL_MANIFEST_MISMATCH');
    if (file(modelPath)) {
      require(statSync(file(modelPath)).size === expectedModel.bytes && sha256File(file(modelPath)) === expectedModel.sha256, 'MODEL_SHA256_MISMATCH');
      const fd = openSync(file(modelPath), 'r'), header = Buffer.alloc(8);
      try { readSync(fd, header, 0, 8, 0); } finally { closeSync(fd); }
      require(header.toString('ascii', 0, 4) === 'GGUF' && header.readUInt32LE(4) === 3, 'MODEL_GGUF_INVALID');
    }
  }
  for (const path of DOCUMENTS) require(file(path), path === 'install-android.md' ? 'INSTRUCTION_MISSING' : 'DOCUMENT_MISSING:' + path);
  for (const name of REQUIRED_LICENSES) {
    const path = file('licenses/' + name);
    require(path, 'LICENSE_MISSING:' + name);
    if (path) require(sha256File(path) === sha256File(join(root, 'docs/licenses', name)), 'LICENSE_SHA256_MISMATCH:' + name);
  }
  const audio = json('audio/manifest.json', 'AUDIO_MANIFEST');
  const expectedAudio = JSON.parse(readFileSync(join(root, 'assets/audio/manifest.json'), 'utf8'));
  if (audio) {
    require(JSON.stringify(audio) === JSON.stringify(expectedAudio), 'AUDIO_MANIFEST_MISMATCH');
    for (const recording of expectedAudio.recordings) {
      const path = file('audio/' + recording.file);
      require(path, 'AUDIO_MISSING:' + recording.seedKey);
      if (path) require(sha256File(path) === recording.sha256, 'AUDIO_SHA256_MISMATCH:' + recording.seedKey);
    }
  }
  const apk = file('app-release.apk'); require(apk, 'APK_MISSING');
  const apkHash = apk ? sha256File(apk) : null;
  if (apk) {
    const inspection = inspect(apk);
    require(inspection.signedV2 === true, 'APK_V2_SIGNATURE_MISSING');
    errors.push(...(inspection.errors ?? []));
    require(inspection.certificateSha256 === EXPECTED_CERTIFICATE, 'APK_CERTIFICATE_MISMATCH');
    require(inspection.applicationId === 'com.personal.germanvocabulary', 'APK_APPLICATION_ID_MISMATCH');
    require(inspection.abi?.includes('arm64-v8a'), 'APK_PIXEL_ABI_MISSING');
    require(!inspection.permissions?.includes('android.permission.INTERNET'), 'APK_HAS_INTERNET');
    require(inspection.jsBundle === true, 'APK_JS_MISSING');
    require(inspection.audioSha256?.length === 40 && expectedAudio.recordings.every(row => inspection.audioSha256.filter(hash => hash === row.sha256).length === 1), 'APK_AUDIO_MISMATCH');
  }
  if (manifest) {
    require(manifest.schemaVersion === 1 && /^[a-f0-9]{40}$/.test(manifest.sourceCommit ?? ''), 'RELEASE_MANIFEST_INVALID');
    require(manifest.builtFromCommit === manifest.sourceCommit, 'APK_BUILD_COMMIT_MISMATCH');
    require(manifest.applicationId === 'com.personal.germanvocabulary' && manifest.certificateSha256 === EXPECTED_CERTIFICATE, 'RELEASE_IDENTITY_MISMATCH');
    for (const [key, value] of Object.entries({ apk: 'app-release.apk', modelManifest: 'model/model-manifest.json', audioManifest: 'audio/manifest.json', regressionReport: 'regression/report.json', deviceAcceptance: 'device-acceptance.json' })) require(manifest[key] === value, 'RELEASE_PATH_INVALID:' + key);
    const files = manifest.files;
    require(files && typeof files === 'object' && !Array.isArray(files), 'FILE_INVENTORY_MISSING');
    if (files && typeof files === 'object' && !Array.isArray(files)) {
      for (const [path, metadata] of Object.entries(files)) {
        const full = file(path, true);
        require(full, 'FILE_MISSING_OR_UNSAFE:' + path);
        if (full) require(hashPattern.test(metadata?.sha256 ?? '') && sha256File(full) === metadata.sha256 && statSync(full).size === metadata.bytes, 'FILE_SHA256_MISMATCH:' + path);
      }
      if (existsSync(dir)) {
        let paths;
        try { paths = listBundleFiles(dir); } catch (error) { errors.push(error.message); paths = []; }
        for (const path of paths.map(path => relative(dir, path))) {
          require(!privateFile(path), 'PRIVATE_MATERIAL_FORBIDDEN:' + path);
          if (path !== 'release-manifest.json') require(Object.hasOwn(files, path), 'FILE_NOT_IN_INVENTORY:' + path);
        }
      }
    }
  }
  const host = json('verification/report.json', 'HOST_VERIFICATION');
  if (host) {
    require(host.status === 'passed', 'HOST_VERIFICATION_NOT_PASSED');
    require(host.commit === manifest?.sourceCommit, 'HOST_COMMIT_MISMATCH');
    require(typeof host.checkedAt === 'string' && !Number.isNaN(Date.parse(host.checkedAt)), 'HOST_TIMESTAMP_MISSING');
    const commands = Array.isArray(host.commands) ? host.commands : [];
    for (const command of REQUIRED_HOST_COMMANDS) {
      const matching = commands.filter(row => row?.command === command), row = matching[0];
      require(matching.length === 1 && row.exitCode === 0, 'HOST_COMMAND_NOT_PASSED:' + command);
      require(typeof row?.log === 'string' && row.log.startsWith('verification/') && file(row.log) && manifest?.files && Object.hasOwn(manifest.files, row.log), 'HOST_LOG_MISSING:' + command);
    }
  }
  function evidence(value, key, container) {
    if (Array.isArray(value)) return value.map(item => evidence(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, evidence(item, key, value)]));
    if (typeof value === 'string' && isEvidencePath(key, container)) {
      const path = local(value);
      require(path, 'EVIDENCE_PATH_OUTSIDE_BUNDLE:' + key);
      if (path) require(existsSync(path) && statSync(path).isFile() && manifest?.files && Object.hasOwn(manifest.files, value), 'EVIDENCE_MISSING:' + value);
      return path ?? join(dir, '__invalid_evidence_path__');
    }
    return value;
  }
  const report = json('regression/report.json', 'REGRESSION');
  if (report) {
    require(report.commit === manifest?.sourceCommit, 'REGRESSION_COMMIT_MISMATCH');
    require(report.apk?.sha256 === apkHash, 'REGRESSION_APK_SHA256_MISMATCH');
    require(report.model?.sha256 === expectedModel.sha256, 'REGRESSION_MODEL_SHA256_MISMATCH');
    require(report.apk?.path === 'app-release.apk' && report.model?.path === modelPath && report.model?.manifestPath === 'model/model-manifest.json', 'REGRESSION_INPUT_PATH_MISMATCH');
    require(report.exitCode === 0, 'REGRESSION_EXIT_NONZERO');
    require(Array.isArray(report.blockers) && report.blockers.length === 0, 'REGRESSION_BLOCKERS');
    require(report.restoration?.status === 'passed' && report.restoration.failures?.length === 0, 'RESTORATION_NOT_PASSED');
    const arraysValid = ['scenarios', 'generations', 'deviceLogs'].every(key => Array.isArray(report[key]) && report[key].every(row => row && typeof row === 'object' && !Array.isArray(row)));
    require(arraysValid, 'REGRESSION_INVALID');
    if (arraysValid) {
      const validated = validateRegressionReport(evidence(report));
      errors.push(...validated.errors);
    }
  }
  const acceptance = json('device-acceptance.json', 'PIXEL_ACCEPTANCE');
  if (acceptance) {
    require(acceptance.status === 'passed', 'PIXEL_NOT_PASSED');
    require(Array.isArray(acceptance.blockers) && acceptance.blockers.length === 0, 'PIXEL_BLOCKERS');
    require(acceptance.apkSha256 === apkHash, 'PIXEL_APK_SHA256_MISMATCH');
    require(acceptance.modelSha256 === expectedModel.sha256, 'PIXEL_MODEL_SHA256_MISMATCH');
    require(acceptance.device?.physical === true && acceptance.device.manufacturer === 'Google' && acceptance.device.model === 'Pixel 9 Pro XL' && typeof acceptance.device.androidVersion === 'string', 'PIXEL_PHYSICAL_DEVICE_REQUIRED');
    require(typeof acceptance.checkedAt === 'string' && !Number.isNaN(Date.parse(acceptance.checkedAt)), 'PIXEL_TIMESTAMP_MISSING');
    for (const mode of ['association', 'example', 'text', 'rule']) {
      const metrics = Array.isArray(acceptance.metrics) ? acceptance.metrics.filter(row => row?.mode === mode) : [];
      const row = metrics[0];
      require(metrics.length === 1 && ['firstTokenMs', 'totalMs', 'tokens', 'peakRssBytes'].every(key => Number.isFinite(row?.[key]) && row[key] > 0) && row.totalMs >= row.firstTokenMs && file(row.evidence) && manifest?.files && Object.hasOwn(manifest.files, row.evidence), 'PIXEL_METRICS_MISSING:' + mode);
    }
    const rows = Array.isArray(acceptance.criteria) ? acceptance.criteria : [];
    for (let id = 1; id <= 14; id++) {
      const matching = rows.filter(row => row?.id === id), row = matching[0];
      require(matching.length === 1 && row.status === 'passed' && typeof row.actual === 'string' && row.actual.trim(), 'PIXEL_CRITERION_NOT_PASSED:' + id);
      require(row && file(row.evidence) && manifest?.files && Object.hasOwn(manifest.files, row.evidence), 'PIXEL_EVIDENCE_MISSING:' + id);
    }
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}
export function verificationExit(result) { return result.ok ? 0 : 2; }
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const result = verifyRelease(process.argv[2] ?? resolve(root, '../german-vocabulary-android'));
    if (result.ok) console.log('RELEASE_VERIFIED'); else console.error(result.errors.join('\n'));
    process.exitCode = verificationExit(result);
  } catch (error) { console.error('VERIFIER_INTERNAL_ERROR:' + error.message); process.exitCode = 1; }
}
