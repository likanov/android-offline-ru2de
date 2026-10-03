import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createRegressionBackup } from '../../scripts/create-regression-fixtures';
import { validateBackup } from '../../src/features/transfer/backupValidation';
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
