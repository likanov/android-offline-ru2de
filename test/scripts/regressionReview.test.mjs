import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { reviewRegressionReport } from '../../scripts/review-regression-report.mjs';
import { scenarioIdsForBlock, sha256File } from '../../scripts/regression-report.mjs';

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'grammar-regression-review-'));
  const apk = join(root, 'app.apk'), model = join(root, 'model.gguf'), junit = join(root, 'case.xml'), state = join(root, 'state.json');
  writeFileSync(apk, 'apk'); writeFileSync(model, 'GGUF model'); writeFileSync(junit, '<testsuite><testcase name="grammar-progress.twenty-ui-answers"/></testsuite>'); writeFileSync(state, '{"ok":true}');
  const rows = scenarioIdsForBlock('grammar-progress').map(id => { const path = join(root, `${id}.xml`); writeFileSync(path, `<testsuite><testcase name="${id}"/></testsuite>`); return { id, status: 'passed', apkSha256:sha256File(apk), junit: path, stateEvidence: state, stateValidation: { ok: true } }; });
  return { root, report: { status: 'passed', runId: 'run-1', runMode: { type: 'block', block: 'grammar-progress' }, apk: { path: apk, sha256: sha256File(apk) }, model: { path: model, sha256: sha256File(model) }, scenarios: rows, crashCount: 0, anrCount: 0 }, observations: { runId: 'run-1', apkSha256: sha256File(apk), modelSha256: sha256File(model), audioAudible: true, languageQuality: 'reviewed', languageNotes: 'Checked German prompts.', tts: 'offline-tested', artifacts: [rows[0].junit, state] } };
}

test('observation_review_binds_to_run_shas_and_saves_only_verified_observations', () => {
  const f = fixture();
  try { const result = reviewRegressionReport(f.report, f.observations); assert.equal(result.ok, true); assert.deepEqual(result.report.observations, f.observations); }
  finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('observation_review_rejects_other_run_or_sha', () => {
  const f = fixture();
  try {
    const result = reviewRegressionReport(f.report, { ...f.observations, runId: 'other', apkSha256: '0'.repeat(64) });
    assert.equal(result.ok, false); assert.ok(result.errors.includes('OBSERVATIONS_RUN_ID_MISMATCH')); assert.ok(result.errors.includes('OBSERVATIONS_APK_SHA256_MISMATCH'));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});

test('observation_review_cannot_turn_failed_scenario_into_passed', () => {
  const f = fixture();
  try {
    const report = { ...f.report, status: 'failed', scenarios: f.report.scenarios.map(row => row.id === 'grammar-progress.nineteen-error' ? { ...row, status: 'failed' } : row) };
    const result = reviewRegressionReport(report, f.observations);
    assert.equal(result.ok, false); assert.ok(result.errors.includes('FAILED_SCENARIO_CANNOT_BE_OVERRIDDEN'));
  } finally { rmSync(f.root, { recursive: true, force: true }); }
});
