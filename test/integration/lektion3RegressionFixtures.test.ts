import * as fixtures from '../../scripts/create-lektion3-fixtures';
import {createGrammarRegressionBackup,createLektion2RegressionBackup} from '../../scripts/create-regression-fixtures';
import {validateBackupV4,validateBackup} from '../../src/features/transfer/backupValidation';
import {mkdir,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {openTestDb} from '../sqlite';
import {migrate} from '../../src/core/migrations';
import {createSchema8GrammarFixture,exportSchema8GrammarFixture} from '../fixtures/grammarSchema8';
import {BackupService} from '../../src/features/transfer/backupService';
test('new V4 fixtures contain real ten-rule history and saved catalog3 questions',async()=>{
 expect(typeof fixtures.createGrammarRulesRegressionBackup).toBe('function');
 const rules=await fixtures.createGrammarRulesRegressionBackup('2026-10-13');
 expect(()=>validateBackupV4(rules)).not.toThrow();
 const nine=rules.profiles.find(p=>p.profile.name==='Rules — nine')!;
 expect(rules.profiles.find(p=>p.profile.name==='Rules — review')?.grammar.sessions.find(s=>s.status==='active')?.currentQuestion?.responseMode).toBe('choice');
 expect(nine.grammar.sessions.find(s=>s.status==='active')?.currentQuestion?.responseMode).toBe('typed');
 expect(nine.grammar.progress[0]).toMatchObject({attemptCount:9,state:{streak:9,mastered:false}});
 const schema8=await fixtures.createSchema8RegressionBackup('2026-10-13');
 if(process.env.SCHEMA8_FIXTURE_OUTPUT){await mkdir(dirname(process.env.SCHEMA8_FIXTURE_OUTPUT),{recursive:true});await writeFile(process.env.SCHEMA8_FIXTURE_OUTPUT,JSON.stringify(schema8,null,2)+'\n');}
 const backup=await fixtures.createLektion3RegressionBackup('2026-10-13');expect(()=>validateBackupV4(backup)).not.toThrow();
 expect(backup.profiles.find(p=>p.profile.name==='L3 — article-typing')?.grammar.sessions.find(s=>s.status==='active')?.currentQuestion?.responseMode).toBe('typed');
 for(const lesson of ['noun-article','noun-plural','plural-invariant'])expect(backup.profiles.find(p=>p.profile.name==='L3 — '+lesson)?.grammar.sessions.some(s=>s.currentQuestion?.catalogVersion===3&&!s.result)).toBe(true);
 expect(backup.profiles.find(p=>p.profile.name==='L3 — empty')?.words).toHaveLength(0);
 for(const [path,value]of [[process.env.GRAMMAR_RULES_FIXTURE_OUTPUT,rules],[process.env.LEKTION3_FIXTURE_OUTPUT,backup]] as const){if(path){await mkdir(dirname(path),{recursive:true});await writeFile(path,JSON.stringify(value,null,2)+'\n');}}
});
test('historical V2/V3 preserve twenty-rule history and legacy catalogs',async()=>{
 const v2=await createGrammarRegressionBackup('2026-10-13');expect(v2.version).toBe(2);expect(()=>validateBackup(v2)).not.toThrow();expect(v2.profiles.every(p=>p.grammar.catalogVersion===1&&p.words.every(w=>['noun','adjective'].includes(w.pos)))).toBe(true);
 const v3=await createLektion2RegressionBackup('2026-10-13');expect(v3.version).toBe(3);expect(()=>validateBackup(v3)).not.toThrow();
 const mastered=v3.profiles.find(p=>p.profile.name==='A1 — история')!;expect(mastered.grammar.attempts.filter(a=>a.targetId==='sein-cloze:ich')).toHaveLength(22);expect(mastered.grammar.attempts[19].result.state.streak).toBe(20);
 expect(v3.profiles.every(p=>p.grammar.attempts.every(a=>a.result.rulesVersion===undefined||a.result.rulesVersion===1))).toBe(true);
});


test('schema8 export migration preserves boundaries/history and rejects XP, counters and stale saved expected answers',async()=>{
 const h=openTestDb(),dir=await mkdtemp(tmpdir()+'/l3-migrate-');
 try{
  await createSchema8GrammarFixture(h.db,'2026-10-06');const before=await exportSchema8GrammarFixture(h.db);await migrate(h.db);const service=new BackupService(h.db,()=> '2026-10-13');const after=await service.exportAll();
  const restoredDb=openTestDb();let restored;try{await migrate(restoredDb.db);const target=new BackupService(restoredDb.db,()=> '2026-10-13');await target.restore(target.preview(JSON.stringify(before)));restored=await target.exportAll();}finally{restoredDb.close();}
  await writeFile(dir+'/evidence.json',JSON.stringify({before,after,restored}));
  const code=`import {readFileSync} from 'node:fs';import {compareGrammarRulesUpgrade,compareLegacyGrammarConversion} from './scripts/regression-state.mjs';const {before,after,restored}=JSON.parse(readFileSync(process.argv[1]));const verify=b=>compareGrammarRulesUpgrade(before,b,{requireBoundaries:true});if(!verify(after).ok)throw Error(JSON.stringify(verify(after)));const conversion=compareLegacyGrammarConversion(before,restored,{day:'2026-10-13'});if(!conversion.ok)throw Error(JSON.stringify(conversion));for(const mutation of [b=>b.profiles[0].grammar.rulesTransitions[2].xpDelta=0,b=>b.profiles[0].grammar.progress[2].attemptCount++,b=>b.profiles[0].dailyActivity.at(-1).correct++,b=>b.profiles[0].grammar.rulesTransitions.pop(),b=>b.profiles[0].grammar.questions[0].question.expected.token='stale']){const bad=structuredClone(after);mutation(bad);if(verify(bad).ok)throw Error('accepted corruption');}`;
  const r=spawnSync(process.execPath,['--input-type=module','-e',code,dir+'/evidence.json'],{encoding:'utf8'});expect({status:r.status,stderr:r.stderr}).toEqual({status:0,stderr:''});
 }finally{h.close();await rm(dir,{recursive:true,force:true});}
});
