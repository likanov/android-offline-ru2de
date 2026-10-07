import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateQuestionUiEvidence } from '../../scripts/regression-report.mjs';

function report(root) {
  const screenshot = join(root, 'capture.png');
  const hierarchy = join(root, 'capture.xml');
  writeFileSync(screenshot, 'png');
  writeFileSync(hierarchy, '<hierarchy/>');
  const scenarios = ['word-typing', 'grammar-typing', 'practice-typing', 'error-help-return', 'large-font-background'];
  const captures = () => [
    { step: 'keyboard-closed', screenshot, hierarchy, viewport: { top: 0, bottom: 800 }, keyboard: { visible: false }, submit: { top: 500, bottom: 560 } },
    { step: 'keyboard-open', screenshot, hierarchy, viewport: { top: 0, bottom: 800 }, keyboard: { visible: true, top: 500 }, input: { top: 250, bottom: 380 }, submit: { top: 400, bottom: 460 } },
    { step: 'after-submit', screenshot, hierarchy, viewport: { top: 0, bottom: 800 }, keyboard: { visible: false }, submit: { top: 400, bottom: 460 } },
  ];
  return { root, report: { apk: { sha256: 'a'.repeat(64) }, questionUi: Object.fromEntries(scenarios.map(id => [`question-ui.${id}`, { apkSha256: 'a'.repeat(64), captures: captures() }])) } };
}

test('question_ui_evidence_accepts_complete_captures', () => {
  const root = mkdtempSync(join(tmpdir(), 'question-ui-evidence-'));
  try { assert.deepEqual(validateQuestionUiEvidence(report(root).report), { ok: true, errors: [] }); } finally { rmSync(root, { recursive: true, force: true }); }
});

test('keyboard_overlap_rejects_question_ui_evidence', () => {
  const root = mkdtempSync(join(tmpdir(), 'question-ui-evidence-'));
  try {
    const fixture = report(root).report;
    fixture.questionUi['question-ui.word-typing'].captures[1].input.bottom = 501;
    const result = validateQuestionUiEvidence(fixture);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('QUESTION_UI_INPUT_OVERLAPS_KEYBOARD:question-ui.word-typing'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('missing_after_submit_capture_is_not_verified', () => {
  const root = mkdtempSync(join(tmpdir(), 'question-ui-evidence-'));
  try {
    const fixture = report(root).report;
    fixture.questionUi['question-ui.practice-typing'].captures = fixture.questionUi['question-ui.practice-typing'].captures.filter(capture => capture.step !== 'after-submit');
    const result = validateQuestionUiEvidence(fixture);
    assert.equal(result.ok, false);
    assert.ok(result.errors.includes('QUESTION_UI_CAPTURE_MISSING:question-ui.practice-typing:after-submit'));
  } finally { rmSync(root, { recursive: true, force: true }); }
});
