import { writeFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { createRegressionBackup, createGrammarRegressionBackup, createLektion2RegressionBackup } from '../../scripts/create-regression-fixtures';
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
  expect((backup.profiles as {grammar?: unknown}[]).every(profile => !('grammar' in profile))).toBe(true);
});

test('write_requested_grammar_fixture', async () => {
  if (!process.env.GRAMMAR_FIXTURE_OUTPUT) return;
  const backup = await createGrammarRegressionBackup(process.env.REGRESSION_FIXTURE_DAY ?? '2026-10-06');
  await mkdir(dirname(process.env.GRAMMAR_FIXTURE_OUTPUT), { recursive: true });
  await writeFile(process.env.GRAMMAR_FIXTURE_OUTPUT, JSON.stringify(backup, null, 2) + '\n');
});

test('catalog2_fixture_uses_production_v3_export_and_retains_mixed_history',async()=>{
 const backup=await createLektion2RegressionBackup(process.env.REGRESSION_FIXTURE_DAY ?? '2026-10-08');
 expect(backup.version).toBe(3);expect(()=>validateBackup(backup)).not.toThrow();
 const all=backup.profiles.flatMap(p=>p.grammar.attempts);
 expect(all.some(a=>a.targetId==='sein-cloze:ich'&&a.result.state.mastered)).toBe(true);
 expect(all.some(a=>a.targetId==='yesno-transform:pronoun'&&a.result.state.streak===19)).toBe(true);
 expect(new Set(all.map(a=>a.day)).size).toBeGreaterThan(2);
 const active=backup.profiles.flatMap(p=>p.grammar.sessions).filter(s=>s.currentQuestion&&!s.result).map(s=>s.currentQuestion!);
 expect(active.some(q=>q.catalogVersion===2&&q.presentation==='cloze')).toBe(true);
 expect(active.some(q=>q.catalogVersion===2&&q.presentation==='sentence')).toBe(true);
 if(process.env.LEKTION2_FIXTURE_OUTPUT){await mkdir(dirname(process.env.LEKTION2_FIXTURE_OUTPUT),{recursive:true});await writeFile(process.env.LEKTION2_FIXTURE_OUTPUT,JSON.stringify(backup,null,2)+'\n');}
});

test('v3_fixture_roundtrip_retains_every_graph_and_state_checker_rejects_missing_reward',async()=>{
 const {spawnSync}=require('node:child_process');
 const {mkdtemp,rm}=require('node:fs/promises');
 const {tmpdir}=require('node:os');
 const dir=await mkdtemp(tmpdir()+'/a1-v3-state-');
 const h=await createWordHarness();
 try{
  const fixture=await createLektion2RegressionBackup('2026-10-08');
  const service=new BackupService(h.db);await service.restore(service.preview(JSON.stringify(fixture)));
  const before=await service.exportAll();await service.restore(service.preview(JSON.stringify(before)));const after=await service.exportAll();
  await writeFile(dir+'/before.json',JSON.stringify(before));await writeFile(dir+'/after.json',JSON.stringify(after));
  const code=`import{readFileSync}from'node:fs';import{verifyScenarioState}from'./scripts/regression-state.mjs';const before=JSON.parse(readFileSync(process.argv[1])),after=JSON.parse(readFileSync(process.argv[2]));const result=verifyScenarioState('extended-vocabulary.backup3-roundtrip',after,{before});if(!result.ok)throw Error(JSON.stringify(result));const reward=after.profiles.find(p=>p.grammar.rewards.length);reward.grammar.rewards.pop();if(verifyScenarioState('extended-vocabulary.backup3-roundtrip',after,{before}).ok)throw Error('accepted lost reward');`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code,dir+'/before.json',dir+'/after.json'],{encoding:'utf8'});
  expect({status:result.status,stderr:result.stderr}).toEqual({status:0,stderr:''});
 }finally{h.close();await rm(dir,{recursive:true,force:true});}
});
