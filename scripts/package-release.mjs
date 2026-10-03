import { readFileSync, writeFileSync, existsSync, mkdirSync, cpSync, copyFileSync, statSync, lstatSync, realpathSync } from 'node:fs';
import { dirname, join, resolve, relative, basename, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { sha256File } from './regression-report.mjs';
import { verifyRelease, verificationExit, inspectApk, EXPECTED_CERTIFICATE, EXPECTED_MODEL, DOCUMENTS, REQUIRED_LICENSES, isEvidencePath, listBundleFiles, privateFile } from './verify-release.mjs';
const root = fileURLToPath(new URL('..', import.meta.url));
class ReleaseInputError extends Error {}
function stageRelease({ output, apk, modelDir, report: reportPath, audioDir = join(root, 'assets/audio'), docsDir = join(root, 'docs'), acceptance = join(docsDir, 'device-acceptance.json'), sourceCommit, verificationDir, expectedModel = EXPECTED_MODEL, inspectApk: inspect = inspectApk }) {
  output = resolve(output);
  if (existsSync(output)) return { ok: false, errors: ['OUTPUT_EXISTS:choose a fresh path or preserve/remove the old candidate explicitly'] };
  for (const [path, code] of [[apk, 'APK_MISSING'], [join(modelDir, expectedModel.fileName), 'MODEL_MISSING'], [join(modelDir, 'model-manifest.json'), 'MODEL_MANIFEST_MISSING'], [reportPath, 'REGRESSION_MISSING']]) if (!existsSync(path)) return { ok: false, errors: [code] };
  const missingLicenses = REQUIRED_LICENSES.filter(name => { const path = join(docsDir, 'licenses', name); return !existsSync(path) || !statSync(path).isFile() || statSync(path).size === 0; });
  if (missingLicenses.length) return { ok: false, errors: missingLicenses.map(name => 'LICENSE_MISSING:' + name) };
  const reportDir = dirname(resolve(reportPath)), original = JSON.parse(readFileSync(reportPath, 'utf8'));
  for (const source of [reportDir, resolve(modelDir), resolve(audioDir), ...(verificationDir ? [resolve(verificationDir)] : [])]) {
    const inside = relative(source, output);
    if (!inside || (!inside.startsWith('..') && !isAbsolute(inside))) return { ok: false, errors: ['OUTPUT_OVERLAPS_INPUT:' + source] };
  }
  let reportFiles;
  try { reportFiles = listBundleFiles(reportDir); } catch (error) { return { ok: false, errors: [error.message] }; }
  for (const path of [apk, join(modelDir, expectedModel.fileName), join(modelDir, 'model-manifest.json'), reportPath]) if (lstatSync(path).isSymbolicLink() || privateFile(realpathSync(path))) return { ok: false, errors: ['UNSAFE_SOURCE_FILE:' + path] };
  for (const dir of [audioDir, join(docsDir, 'licenses'), verificationDir].filter(dir => dir && existsSync(dir))) reportFiles.push(...listBundleFiles(dir));
  const forbidden = reportFiles.find(path => privateFile(path));
  if (forbidden) return { ok: false, errors: ['PRIVATE_MATERIAL_FORBIDDEN:' + basename(forbidden)] };
  mkdirSync(output, { recursive: true });
  const copy = (from, to) => { if (lstatSync(from).isSymbolicLink() || privateFile(realpathSync(from))) throw new ReleaseInputError('UNSAFE_SOURCE_FILE:' + from); mkdirSync(dirname(join(output, to)), { recursive: true }); copyFileSync(from, join(output, to)); };
  copy(apk, 'app-release.apk'); copy(join(modelDir, expectedModel.fileName), 'model/' + expectedModel.fileName); copy(join(modelDir, 'model-manifest.json'), 'model/model-manifest.json');
  cpSync(audioDir, join(output, 'audio'), { recursive: true, dereference: false });
  for (const name of DOCUMENTS) if (existsSync(join(docsDir, name))) copy(join(docsDir, name), name);
  if (existsSync(acceptance)) {
    const data = JSON.parse(readFileSync(acceptance, 'utf8'));
    for (const row of [...(Array.isArray(data.criteria) ? data.criteria : []), ...(Array.isArray(data.metrics) ? data.metrics : [])]) {
      if (typeof row?.evidence !== 'string') continue;
      const source = resolve(dirname(acceptance), row.evidence);
      if (!existsSync(source)) continue; // verifier retains an explicit missing-artifact rejection
      if (lstatSync(source).isSymbolicLink()) return { ok: false, errors: ['BUNDLE_SYMLINK:' + source] };
      if (privateFile(source)) throw new ReleaseInputError('PRIVATE_MATERIAL_FORBIDDEN:' + basename(source));
      const destination = !isAbsolute(row.evidence) && !row.evidence.split(/[\\/]/).includes('..') ? row.evidence : 'pixel/' + sha256File(source).slice(0, 16) + '-' + basename(source);
      if (!destination.startsWith('pixel/') && !(destination.startsWith('regression/') && source === resolve(reportDir, destination.slice('regression/'.length)))) return { ok: false, errors: ['PIXEL_ARTIFACT_PATH_INVALID:' + destination] };
      if (destination.startsWith('pixel/')) copy(source, destination);
      row.evidence = destination;
    }
    writeFileSync(join(output, 'device-acceptance.json'), JSON.stringify(data, null, 2) + '\n');
  }
  cpSync(join(docsDir, 'licenses'), join(output, 'licenses'), { recursive: true, dereference: false });
  if (verificationDir && existsSync(verificationDir)) cpSync(verificationDir, join(output, 'verification'), { recursive: true, dereference: false });
  cpSync(reportDir, join(output, 'regression'), { recursive: true, dereference: false });
  copy(reportPath, 'regression/source-report.json');
  const remap = new Map([[resolve(apk), 'app-release.apk'], [resolve(modelDir, expectedModel.fileName), 'model/' + expectedModel.fileName], [resolve(modelDir, 'model-manifest.json'), 'model/model-manifest.json']]);
  function relocate(value, key, container) {
    if (Array.isArray(value)) return value.map(item => relocate(item));
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, relocate(item, key, value)]));
    if (typeof value === 'string' && isEvidencePath(key, container)) {
      const path = isAbsolute(value) ? resolve(value) : resolve(dirname(reportDir), value);
      if (remap.has(path)) return remap.get(path);
      const inside = relative(reportDir, path);
      if (!inside.startsWith('..') && !isAbsolute(inside)) return 'regression/' + inside;
      // The runner emits absolute artifact paths; relative bundle fixtures already name their destination.
      if (!isAbsolute(value) && existsSync(join(dirname(reportDir), value))) {
        if (value.startsWith('regression/')) return value;
        if (value === 'app-release.apk' || value.startsWith('model/')) return value;
      }
      if (existsSync(path)) {
        if (privateFile(path)) throw new ReleaseInputError('PRIVATE_MATERIAL_FORBIDDEN:' + basename(path));
        const destination = 'regression/external/' + sha256File(path).slice(0, 16) + '-' + basename(path);
        copy(path, destination); remap.set(path, destination); return destination;
      }
      return value;
    }
    return value;
  }
  writeFileSync(join(output, 'regression/report.json'), JSON.stringify(relocate(original), null, 2) + '\n');
  const inspection = inspect(join(output, 'app-release.apk'));
  writeFileSync(join(output, 'apk-inspection.json'), JSON.stringify(inspection, null, 2) + '\n');
  const manifest = {
    schemaVersion: 1, status: 'blocked', sourceCommit, builtFromCommit: original.commit, createdAt: new Date().toISOString(),
    applicationId: 'com.personal.germanvocabulary', certificateSha256: EXPECTED_CERTIFICATE,
    versionName: inspection.versionName, versionCode: inspection.versionCode, abi: inspection.abi,
    apk: 'app-release.apk', modelManifest: 'model/model-manifest.json', audioManifest: 'audio/manifest.json', regressionReport: 'regression/report.json', deviceAcceptance: 'device-acceptance.json',
    files: Object.fromEntries(listBundleFiles(output).map(path => [relative(output, path), { bytes: statSync(path).size, sha256: sha256File(path) }])),
  };
  const manifestPath = join(output, 'release-manifest.json');
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  const result = verifyRelease(output, { expectedModel, inspectApk: () => inspection });
  manifest.status = result.ok ? 'verified' : 'blocked'; manifest.verification = result;
  writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
  return { ...result, output };
}

export function packageRelease(options) {
  try { return stageRelease(options); }
  catch (error) {
    if (error instanceof ReleaseInputError || error instanceof SyntaxError) return { ok: false, errors: [error instanceof SyntaxError ? 'INPUT_JSON_INVALID:' + error.message : error.message] };
    throw error;
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = {}, args = process.argv.slice(2);
    for (let i = 0; i < args.length; i += 2) {
      if (!['--output', '--apk', '--model-dir', '--report', '--acceptance', '--verification-dir'].includes(args[i]) || !args[i + 1]) throw Error('Usage: package-release.mjs [--output DIR --apk APK --model-dir DIR --report JSON --acceptance JSON --verification-dir DIR]');
      options[args[i].slice(2)] = args[i + 1];
    }
    const git = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
    if (git.status !== 0) throw Error('SOURCE_COMMIT_UNAVAILABLE');
    const result = packageRelease({ output: options.output ?? resolve(root, '../german-vocabulary-android'), apk: options.apk ?? join(root, 'android/app/build/outputs/apk/release/app-release.apk'), modelDir: options['model-dir'] ?? resolve(root, '../../work/model-preparation'), report: options.report ?? resolve(root, '../../work/android-regression/full/report.json'), ...(options.acceptance ? { acceptance: resolve(options.acceptance) } : {}), sourceCommit: git.stdout.trim(), verificationDir: options['verification-dir'] ?? resolve(root, '../../work/release-verification') });
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) console.error('RELEASE_BLOCKED\n' + result.errors.join('\n'));
    process.exitCode = verificationExit(result);
  } catch (error) { console.error('PACKAGER_INTERNAL_ERROR:' + error.message); process.exitCode = 1; }
}
