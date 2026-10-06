import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateBlockRegressionReport, validateRegressionReport } from './regression-report.mjs';

const artifact = path => typeof path === 'string' && existsSync(path) && statSync(path).isFile() && statSync(path).size > 0;

export function reviewRegressionReport(report, observations) {
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  require(report && typeof report.runId === 'string' && report.runId.length > 0, 'RUN_ID_MISSING');
  require(observations?.runId === report?.runId, 'OBSERVATIONS_RUN_ID_MISMATCH');
  require(observations?.apkSha256 === report?.apk?.sha256, 'OBSERVATIONS_APK_SHA256_MISMATCH');
  require(observations?.modelSha256 === report?.model?.sha256, 'OBSERVATIONS_MODEL_SHA256_MISMATCH');
  require(typeof observations?.audioAudible === 'boolean', 'AUDIO_OBSERVATION_MISSING');
  require(observations?.languageQuality === 'reviewed' && typeof observations?.languageNotes === 'string' && observations.languageNotes.trim().length > 0, 'LANGUAGE_OBSERVATION_MISSING');
  require(['absent-tested', 'offline-tested'].includes(observations?.tts), 'TTS_NOT_VERIFIED');
  require(Array.isArray(observations?.artifacts) && observations.artifacts.length > 0 && observations.artifacts.every(artifact), 'OBSERVATION_ARTIFACTS_MISSING');
  const merged = { ...report, observations };
  if (report?.status === 'failed' || report?.scenarios?.some(row => row.status === 'failed')) errors.push('FAILED_SCENARIO_CANNOT_BE_OVERRIDDEN');
  const validation = report?.runMode?.type === 'block'
    ? validateBlockRegressionReport(merged, report.runMode.block)
    : validateRegressionReport(merged);
  errors.push(...validation.errors);
  return { ok: errors.length === 0, errors, report: merged };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2), value = key => { const i = args.indexOf(key); return i >= 0 ? args[i + 1] : null; };
    const reportPath = value('--report'), observationsPath = value('--observations');
    if (!reportPath || !observationsPath) throw new Error('ARGUMENT_VALUE_MISSING:report_or_observations');
    const report = JSON.parse(readFileSync(reportPath, 'utf8'));
    const observations = JSON.parse(readFileSync(observationsPath, 'utf8'));
    const result = reviewRegressionReport(report, observations);
    if (result.ok) writeFileSync(reportPath, JSON.stringify(result.report, null, 2) + '\n');
    console.log(JSON.stringify({ ok: result.ok, errors: result.errors, report: reportPath }, null, 2));
    process.exitCode = result.ok ? 0 : 1;
  } catch (error) { console.error(String(error.message ?? error)); process.exitCode = 2; }
}
