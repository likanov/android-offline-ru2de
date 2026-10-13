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
 expect(all.some(a=>a.targetId==='yesno-transform:pronoun'&&a.result.state.streak===9)).toBe(true);
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
  // Pre-existing suffix-2 and suffix-3 profiles must never be mistaken for the
  // new copies made by the final restore.
  const initial=await service.exportAll();
  await service.restore(service.preview(JSON.stringify(initial)));
  await service.restore(service.preview(JSON.stringify(initial)));
  const before=await service.exportAll();await service.restore(service.preview(JSON.stringify(before)));const after=await service.exportAll();
  await writeFile(dir+'/before.json',JSON.stringify(before));await writeFile(dir+'/after.json',JSON.stringify(after));
  const code=`import{readFileSync}from'node:fs';import{verifyScenarioState}from'./scripts/regression-state.mjs';const before=JSON.parse(readFileSync(process.argv[1])),after=JSON.parse(readFileSync(process.argv[2]));const result=verifyScenarioState('extended-vocabulary.backup3-roundtrip',after,{before});if(!result.ok)throw Error(JSON.stringify(result));const reward=after.profiles.find(p=>p.grammar.rewards.length);reward.grammar.rewards.pop();if(verifyScenarioState('extended-vocabulary.backup3-roundtrip',after,{before}).ok)throw Error('accepted lost reward');`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code,dir+'/before.json',dir+'/after.json'],{encoding:'utf8'});
  expect({status:result.status,stderr:result.stderr}).toEqual({status:0,stderr:''});
 }finally{h.close();await rm(dir,{recursive:true,force:true});}
});

async function extendedCsvEvidence() {
 const {readFile}=require('node:fs/promises');
 const {CsvImportService}=require('../../src/features/transfer/csvImportService');
 const {WordRepository}=require('../../src/features/dictionary/wordRepository');
 const {setActiveProfile}=require('../../src/features/profiles/profileRepository');
 const {parseCsv,csvRowToWord}=require('../../src/features/transfer/csvParser');
 const {createHash}=require('node:crypto');
 const h=await createWordHarness();
 try{
  const service=new BackupService(h.db);await service.restore(service.preview(JSON.stringify(await createLektion2RegressionBackup('2026-10-09'))));
  const initial=await service.exportAll(),profile=initial.profiles.find(p=>p.profile.name==='A1 — словарь')!;
  await setActiveProfile(h.db,profile.profile.id);
  const words=new WordRepository(h.db);
  for(const pos of ['noun','adjective','number','verb','pronoun','adverb','preposition','conjunction','phrase'])await words.create(profile.profile.id,{de:'R1'+pos,ru:'регрессия '+pos,pos,gender:pos==='noun'?'m':null});
  const before=await service.exportAll(),csv=new CsvImportService(h.db);
  const steps:{file:string;added:number;duplicates:number;invalid:number}[]=[];
  const packs:{file:string;sha256:string;rows:{de:string;ru:string;pos:string;gender:string|null;topic:string}[]}[]=[];
  for(const file of ['a1-300.csv','numbers-0-20.csv','a1-300.csv']){
   const text=await readFile('content/vocabulary/'+file,'utf8');
   if(!packs.some((p:{file:string})=>p.file===file))packs.push({file,sha256:createHash('sha256').update(text).digest('hex'),rows:parseCsv(text).rows.map((r:unknown)=>{const row=csvRowToWord(r);return {de:row.draft.de,ru:row.draft.ru,pos:row.draft.pos,gender:row.draft.gender,topic:row.topicName};})});
   const preview=await csv.preview(profile.profile.id,text);
   const expected={file,added:preview.valid.length,duplicates:preview.duplicates.length,invalid:preview.errors.length};
   expect(await csv.commit(preview)).toEqual({added:expected.added,duplicates:expected.duplicates,invalid:expected.invalid});steps.push(expected);
  }
  const after=await service.exportAll(),result={before,after,contract:{initialWords:before.profiles.find(p=>p.profile.id===profile.profile.id)!.words.length,finalWords:after.profiles.find(p=>p.profile.id===profile.profile.id)!.words.length,steps,packs}};
  await writeFile('/tmp/a1-csv-production-evidence.json',JSON.stringify(result.contract,null,2)+'\n');
  return result;
 }finally{h.close();}
}

test('extended_csv_flow_counts_match_real_fixture_editor_and_production_imports',async()=>{
 const {readFile}=require('node:fs/promises');const {contract}=await extendedCsvEvidence();
 expect(JSON.parse(await readFile('e2e/fixtures/extended-vocabulary-import-contract.json','utf8'))).toEqual(contract);
 expect(contract.packs.map(pack=>pack.rows.length)).toEqual([300,21]);
 const flow=JSON.parse((await readFile('e2e/checks/extended-vocabulary.both-csv-duplicates-topics.yaml','utf8')).split('---\n')[1]);
 const summaries=flow.filter((c:{assertVisible?:string})=>c.assertVisible?.startsWith('Новые:')||c.assertVisible?.startsWith('Добавлено:')).map((c:{assertVisible:string})=>c.assertVisible);
 expect(summaries).toEqual(contract.steps.flatMap(step=>[`Новые: ${step.added} · Дубли: ${step.duplicates} · Ошибки: ${step.invalid}`,`Добавлено: ${step.added} · Дубли: ${step.duplicates} · Ошибки: ${step.invalid}`]));
});

test('extended_csv_state_rejects_partial_numbers_and_missing_topic_even_at_full_word_count',async()=>{
 const {spawnSync}=require('node:child_process');const {mkdtemp,rm}=require('node:fs/promises');const {tmpdir}=require('node:os');
 const {before,after,contract}=await extendedCsvEvidence();const dir=await mkdtemp(tmpdir()+'/a1-csv-state-');
 try{
  await writeFile(dir+'/evidence.json',JSON.stringify({before,after,contract}));
  const code=`import{readFileSync}from'node:fs';import{verifyScenarioState}from'./scripts/regression-state.mjs';const {before,after,contract}=JSON.parse(readFileSync(process.argv[1]));const verify=b=>verifyScenarioState('extended-vocabulary.both-csv-duplicates-topics',b,{before});if(!verify(after).ok)throw Error(JSON.stringify(verify(after)));for(const mutation of ['number','topic','a1']){const copy=structuredClone(after),p=copy.profiles.find(p=>p.profile.name==='A1 — словарь');if(mutation==='topic'){const t=p.topics.find(t=>t.name==='Числа 0–20');p.wordTopics=p.wordTopics.filter(link=>link.topicId!==t.id);}else{const rows=contract.packs[mutation==='number'?1:0].rows,w=p.words.find(w=>w.de===rows[0].de&&w.pos===rows[0].pos);w.de='not-the-imported-word';}if(verify(copy).ok)throw Error('accepted corrupt CSV '+mutation);}`;
  const result=spawnSync(process.execPath,['--input-type=module','-e',code,dir+'/evidence.json'],{encoding:'utf8'});
  expect({status:result.status,stderr:result.stderr}).toEqual({status:0,stderr:''});
 }finally{await rm(dir,{recursive:true,force:true});}
});
