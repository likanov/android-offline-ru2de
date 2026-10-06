import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createRegressionBackup, createGrammarRegressionBackup } from '../../scripts/create-regression-fixtures';
import { validateBackup, validateBackupV1 } from '../../src/features/transfer/backupValidation';
import { BackupService } from '../../src/features/transfer/backupService';
import { createWordHarness } from '../harness';
test('regression_backup_is_valid_and_has_one_mastery_reward_from_real_answers', async () => {
  const backup = await createRegressionBackup('2026-10-03');
  expect(() => validateBackup(backup)).not.toThrow();
  expect(backup.profiles.length).toBeGreaterThanOrEqual(2);
  const learned = backup.profiles.find(p => p.profile.name === 'Регрессия — изучено')!;
  expect(learned.profile.xp).toBe(250);
  expect(learned.attempts).toHaveLength(20);
  expect(learned.profile.xp).toBe(learned.attempts.reduce((sum,a)=>sum+a.xpDelta,0));
  expect(learned.rewards).toHaveLength(1);
  expect(learned.rewards[0].amount).toBe(50);
  expect(learned.progress.find(p=>p.wordId===learned.rewards[0].wordId)).toMatchObject({streak:20,learned:1,bonusAwarded:1,dueDate:'2026-10-04'});
  const h = await createWordHarness();
  try {
    const service = new BackupService(h.db);
    const restored = await service.restore(service.preview(JSON.stringify(backup)));
    expect(restored.profileIds).toHaveLength(backup.profiles.length);
    const data = await service.exportAll();
    expect(() => validateBackup(data)).not.toThrow();
    expect(data.profiles.reduce((n,p)=>n+p.profile.xp,0)).toBe(backup.profiles.reduce((n,p)=>n+p.profile.xp,0));
  } finally { h.close(); }
});
// CLI generation uses this SQL project so the host UUID adapter is the same as
// every integration test. No native app code or app SQLite is modified.
test('write_requested_regression_fixture', async () => {
  if (!process.env.REGRESSION_FIXTURE_OUTPUT) return;
  const backup = await createRegressionBackup(process.env.REGRESSION_FIXTURE_DAY ?? '2026-10-03');
  await mkdir(dirname(process.env.REGRESSION_FIXTURE_OUTPUT),{recursive:true});
  await writeFile(process.env.REGRESSION_FIXTURE_OUTPUT,JSON.stringify(backup,null,2)+'\n');
});
test('ui_regression_fixtures_include_audio_seed_topic_and_previously_rewarded_reset',async()=>{
  const backup=await createRegressionBackup('2026-10-03');
  const ui=backup.profiles.find(p=>p.profile.name==='Регрессия — 20 UI');
  expect(ui).toBeTruthy();
  const target=ui!.words.find(w=>w.de==='Stuhl')!;
  const topic=ui!.topics.find(t=>t.name==='20 UI')!;
  expect(ui!.wordTopics.filter(t=>t.topicId===topic.id).map(t=>t.wordId)).toEqual([target.id]);
  expect(ui!.attempts).toHaveLength(0);
  const relearn=backup.profiles.find(p=>p.profile.name==='Регрессия — переучивание')!;
  expect(relearn.rewards).toHaveLength(1);
  expect(relearn.progress.find(r=>r.wordId===relearn.rewards[0].wordId)).toMatchObject({streak:19,learned:0,bonusAwarded:1});
});

test('grammar_regression_fixture_is_v2_and_has_all_targets_real_attempts_and_resume_sessions', async () => {
  const backup = await createGrammarRegressionBackup('2026-10-06');
  expect(backup.version).toBe(2);
  expect(() => validateBackup(backup)).not.toThrow();
  const targetIds = new Set(backup.profiles.flatMap(profile => profile.grammar.progress.map(row => row.targetId)));
  expect(targetIds.size).toBe(18);
  expect(backup.profiles.some(profile => profile.grammar.attempts.filter(attempt => !attempt.result.right).length >= 19)).toBe(true);
  expect(backup.profiles.some(profile => profile.grammar.sessions.filter(session => session.status !== 'cancelled').length >= 1)).toBe(true);
  expect(backup.profiles.some(profile => profile.grammar.sessions.some(session => session.currentQuestion && session.result === null))).toBe(true);
});

test('legacy_regression_fixture_remains_v1_and_readable_by_legacy_validator', async () => {
  const backup = await createRegressionBackup('2026-10-06');
  expect(backup.version).toBe(1);
  expect(() => validateBackupV1(backup)).not.toThrow();
  expect((backup.profiles as Array<{grammar?: unknown}>).every(profile => !('grammar' in profile))).toBe(true);
});

test('write_requested_grammar_fixture', async () => {
  if (!process.env.GRAMMAR_FIXTURE_OUTPUT) return;
  const backup = await createGrammarRegressionBackup(process.env.REGRESSION_FIXTURE_DAY ?? '2026-10-06');
  await mkdir(dirname(process.env.GRAMMAR_FIXTURE_OUTPUT), { recursive: true });
  await writeFile(process.env.GRAMMAR_FIXTURE_OUTPUT, JSON.stringify(backup, null, 2) + '\n');
});
