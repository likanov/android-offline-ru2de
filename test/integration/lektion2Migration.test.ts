import { migrateWordParts } from '../../src/core/migrations/007_word_parts';
import { profilesSchema } from '../../src/core/migrations/001_profiles';
import { wordDetailsSchema } from '../../src/core/migrations/002_word_details';
import { learningSchema } from '../../src/core/migrations/003_learning';
import { topicsSchema } from '../../src/core/migrations/004_topics';
import { grammarSchema, seedGrammarTargets } from '../../src/core/migrations/006_grammar';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { randomUUID } from 'node:crypto';
import { makeGrammarQuestion } from '../../src/features/grammar/grammarQuestionFactory';
import { applyGrammarAnswer } from '../../src/features/grammar/grammarLearningRules';
import { migrateLektion2 } from '../../src/core/migrations/008_lektion2';
import { openTestDb } from '../sqlite';
import type { SqlStore } from '../../src/core/sql';
import '../harness';
// A schema7 fixture must never call the live rules2 repositories or answer service.
async function fixture(db: SqlStore) {
  await db.exec(profilesSchema + wordDetailsSchema + learningSchema + topicsSchema);
  await db.exec('ALTER TABLE settings ADD COLUMN reminderEnabled INTEGER NOT NULL DEFAULT 0; ALTER TABLE settings ADD COLUMN reminderHour INTEGER NOT NULL DEFAULT 19; ALTER TABLE settings ADD COLUMN reminderMinute INTEGER NOT NULL DEFAULT 0;');
  await db.exec(grammarSchema); await seedGrammarTargets(db);
  await db.schemaTransaction(migrateWordParts); await db.exec('PRAGMA user_version=7');
  const p=await createProfile(db,'Legacy graph');
  const targetId='sein-cloze:ich' as const, sessionId=randomUUID();
  const before={streak:19,mastered:false,masteryBonusGranted:false,reviewStage:0,dueDay:null,difficult:false,totalErrors:0,recoveryErrors:0,recoveryCorrect:0};
  const q=makeGrammarQuestion({attemptId:randomUUID(),sessionId,profileId:p.id,targetId,responseMode:'choice',variantIndex:0,words:[],reviewStage:null,dueDay:null});
  if(q.catalogVersion!==1) throw new Error('legacy');
  const transition=applyGrammarAnswer(before,true,'study','2026-10-08',1);
  const result={attemptId:q.attemptId,targetId,right:true,xpDelta:transition.xpDelta,state:transition.state,submittedAnswer:{kind:'choice',optionId:q.expected.optionId}};
  await db.run("INSERT INTO grammar_progress(profileId,targetId,streak,mastered,masteryBonusGranted,dueDay,attemptCount,variantIndex) VALUES (?,?,20,1,1,'2026-10-09',20,2)",[p.id,targetId]);
  await db.run("INSERT INTO grammar_sessions(id,profileId,selection,targetIds,currentQuestion,result,status) VALUES (?,?,?,?,?,?,'cancelled')",[sessionId,p.id,JSON.stringify({mode:'study',lesson:'sein',targetIds:[targetId]}),JSON.stringify([targetId]),JSON.stringify(q),JSON.stringify(result)]);
  await db.run("INSERT INTO grammar_questions(attemptId,profileId,sessionId,targetId,catalogVersion,kind,responseMode,payload,status) VALUES (?,?,?,?,1,'sein-cloze','choice',?,'answered')",[q.attemptId,p.id,sessionId,targetId,JSON.stringify(q)]);
  await db.run("INSERT INTO grammar_attempts(attemptId,profileId,sessionId,targetId,right,xpDelta,result,day) VALUES (?,?,?,?,1,60,?,'2026-10-08')",[q.attemptId,p.id,sessionId,targetId,JSON.stringify(result)]);
  await db.run("INSERT INTO grammar_rewards(profileId,targetId,attemptId,amount,day) VALUES (?,?,?,50,'2026-10-08')",[p.id,targetId,q.attemptId]);
  const activeId=randomUUID(),pendingTarget='pronoun-cloze:du' as const;
  const pending=makeGrammarQuestion({attemptId:randomUUID(),sessionId:activeId,profileId:p.id,targetId:pendingTarget,responseMode:'choice',variantIndex:0,words:[],reviewStage:null,dueDay:null});
  await db.run('INSERT INTO grammar_progress(profileId,targetId) VALUES (?,?)',[p.id,pendingTarget]);
  await db.run("INSERT INTO grammar_sessions(id,profileId,selection,targetIds,currentQuestion,status) VALUES (?,?,?,?,?,'active')",[activeId,p.id,JSON.stringify({mode:'study',lesson:'pronouns',targetIds:[pendingTarget]}),JSON.stringify([pendingTarget]),JSON.stringify(pending)]);
  await db.run("INSERT INTO grammar_questions(attemptId,profileId,sessionId,targetId,catalogVersion,kind,responseMode,payload,status) VALUES (?,?,?,?,1,'pronoun-cloze','choice',?,'active')",[pending.attemptId,p.id,activeId,pendingTarget,JSON.stringify(pending)]);
}
// Exercise migration8 itself, independently of later migrations that intentionally alter progress.
async function step8(db:SqlStore) {
  await db.schemaTransaction(async tx=>{
    const version=await tx.first<{user_version:number}>('PRAGMA user_version');
    if(version!.user_version<8) {await migrateLektion2(tx);await tx.exec('PRAGMA user_version=8');}
  });
}
async function snapshot(db: SqlStore) { const tables = await db.all<{
    name: string;
}>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"); return Object.fromEntries(await Promise.all(tables.map(async ({ name }) => [name, await db.all(`SELECT * FROM ${name}${name === 'grammar_targets' ? ' WHERE catalogVersion=1' : ''} ORDER BY rowid`)]))); }
test('migration_preserves_legacy_payload_and_ledger', async () => { const { db, close } = openTestDb(); try {
    await fixture(db);
    const before = await snapshot(db);
    const indexes = await db.all("SELECT name,sql FROM sqlite_master WHERE type='index' ORDER BY name");
    await step8(db);
    expect(await snapshot(db)).toEqual(before);
    expect(await db.all("SELECT name,sql FROM sqlite_master WHERE type='index' ORDER BY name")).toEqual(indexes);
    expect(await db.first('PRAGMA user_version')).toEqual({ user_version: 8 });
    expect(await db.first('SELECT COUNT(*) n FROM grammar_targets WHERE catalogVersion=2')).toEqual({ n: 24 });
    expect(await db.all('PRAGMA foreign_key_check')).toEqual([]);
    await step8(db);
    expect(await snapshot(db)).toEqual(before);
}
finally {
    close();
} });
test('migration8_failure_keeps_version7', async () => { const { db, close } = openTestDb(); try {
    await fixture(db);
    const before = await snapshot(db);
    const schema = await db.all('SELECT name,sql FROM sqlite_master ORDER BY name');
    const failing: SqlStore = { ...db, schemaTransaction: work => db.schemaTransaction(tx => work({ ...tx, exec: async (sql) => { await tx.exec(sql); if (sql.includes('ALTER TABLE grammar_questions_v8 RENAME'))
                throw Error('injected copy failure'); } })) };
    await expect(step8(failing)).rejects.toThrow('injected');
    expect(await db.first('PRAGMA user_version')).toEqual({ user_version: 7 });
    expect(await snapshot(db)).toEqual(before);
    expect(await db.all('SELECT name,sql FROM sqlite_master ORDER BY name')).toEqual(schema);
    expect(await db.first('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
}
finally {
    close();
} });
