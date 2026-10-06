import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateDictionaryUxEvidence } from '../../scripts/regression-report.mjs';

function evidence(root, apkSha256 = 'a'.repeat(64)) {
  const file = name => { const path = join(root, name); writeFileSync(path, 'artifact'); return path; };
  const capture = step => ({ step, screenshot: file(`${step}.png`), hierarchy: file(`${step}.xml`) });
  return {
    apk: { sha256: apkSha256 },
    dictionaryUx: {
      'dictionary.viewport-keyboard': { apkSha256, captures: [capture('keyboard-closed'), capture('keyboard-open')], observations: { twoRowsVisible: true, addVisible: true, resultTappable: true } },
      'dictionary.context-return': { apkSha256, captures: [capture('context')], observations: { contextPreserved: true, profilesIsolated: true } },
      'dictionary.search-variants': { apkSha256, captures: [capture('variants')], observations: { searchVariants: true } },
      'dictionary.empty-status-accessibility': { apkSha256, captures: [capture('empty')], observations: { emptyStatesReviewed: true, talkBackReviewed: true, selectedAnnounced: true } },
      'dictionary.large-font': { apkSha256, captures: [capture('large-font')], observations: { labelsReadable: true, actionsReachable: true } },
      'dictionary.large-profile': { apkSha256, captures: [capture('large-profile')], observations: { wordCount: 10000, samplesMs: Array.from({ length: 20 }, (_, index) => 99 + index), p95Ms: 118 } },
    },
  };
}

test('dictionary_ux_evidence_accepts_reviewed_captures_bound_to_current_apk', () => {
  const root = mkdtempSync(join(tmpdir(), 'dictionary-ux-evidence-'));
  assert.deepEqual(validateDictionaryUxEvidence(evidence(root)), { ok: true, errors: [] });
});

test('dictionary_ux_evidence_rejects_missing_observations_and_stale_apk', () => {
  const root = mkdtempSync(join(tmpdir(), 'dictionary-ux-evidence-'));
  const report = evidence(root);
  report.dictionaryUx['dictionary.viewport-keyboard'].observations.resultTappable = false;
  report.dictionaryUx['dictionary.large-profile'].apkSha256 = 'b'.repeat(64);
  const result = validateDictionaryUxEvidence(report);
  assert.equal(result.ok, false);
  assert.ok(result.errors.includes('DICTIONARY_VIEWPORT_OBSERVATION_MISSING'));
  assert.ok(result.errors.includes('DICTIONARY_APK_SHA256_MISMATCH:dictionary.large-profile'));
});
