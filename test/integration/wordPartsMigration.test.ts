import {migrate} from '../../src/core/migrations';
import {profilesSchema} from '../../src/core/migrations/001_profiles';
import {wordDetailsSchema} from '../../src/core/migrations/002_word_details';
import {learningSchema} from '../../src/core/migrations/003_learning';
import {topicsSchema} from '../../src/core/migrations/004_topics';
import {grammarSchema,seedGrammarTargets} from '../../src/core/migrations/006_grammar';
import {createProfile} from '../../src/features/profiles/profileRepository';
import {openTestDb} from '../sqlite';
import '../harness';
import type {SqlStore} from '../../src/core/sql';
async function fixture(db:SqlStore) {
 await db.exec(profilesSchema+wordDetailsSchema+learningSchema+topicsSchema);
 await db.exec(`ALTER TABLE settings ADD COLUMN reminderEnabled INTEGER NOT NULL DEFAULT 0;
 ALTER TABLE settings ADD COLUMN reminderHour INTEGER NOT NULL DEFAULT 19;
 ALTER TABLE settings ADD COLUMN reminderMinute INTEGER NOT NULL DEFAULT 0;`);
 await db.exec(grammarSchema);await seedGrammarTargets(db);await db.exec('PRAGMA user_version=6');
 for (const id of ['A','B']) {
  const p=await createProfile(db,id);await db.run('UPDATE profiles SET xp=123 WHERE id=?',[p.id]);
  const w=(await db.first<{id:string}>('SELECT id FROM words WHERE profileId=?',[p.id]))!;
  await db.run("INSERT INTO sessions(id,profileId,mode,wordIds,status) VALUES (?,?,'study',?,'active')",[id,p.id,JSON.stringify([w.id])]);
  await db.run("INSERT INTO questions(attemptId,profileId,sessionId,wordId,revision,payload,status) VALUES (?,?,?,?,1,'{}','answered')",[id,p.id,id,w.id]);
  await db.run("INSERT INTO attempts(attemptId,profileId,sessionId,wordId,right,xpDelta,result,day) VALUES (?,?,?,?,1,50,'{}','2026-10-08')",[id,p.id,id,w.id]);
  await db.run('INSERT INTO rewards(profileId,wordId,attemptId,amount) VALUES (?,?,?,50)',[p.id,w.id,id]);
  await db.run("INSERT INTO grammar_sessions(id,profileId,selection,targetIds,status) VALUES (?,?,'{}','[]','active')",[id,p.id]);
 }
}
async function snapshot(db:SqlStore) {
 const tables=await db.all<{name:string}>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
 const rows:Record<string,unknown[]>={};for(const {name} of tables)rows[name]=await db.all(`SELECT * FROM ${name}${name==='grammar_targets'?' WHERE catalogVersion=1':''} ORDER BY rowid`);return rows;
}
test('migration_preserves_v6_graph',async()=>{
 const {db,close}=openTestDb();try {
  await fixture(db);const before=await snapshot(db);await migrate(db);
  expect(await db.first('PRAGMA user_version')).toEqual({user_version:8});
  expect(await snapshot(db)).toEqual(before);expect(await db.all('PRAGMA foreign_key_check')).toEqual([]);
  await migrate(db);expect(await snapshot(db)).toEqual(before);
  const p=(await db.first<{id:string}>('SELECT id FROM profiles'))!;
  await expect(db.run("INSERT INTO words(id,profileId,de,ru,pos) VALUES ('number',?,'eins','один','number')",[p.id])).resolves.toMatchObject({changes:1});
 }finally{close();}
});
test('migration_rejects_incompatible_rows_without_rewriting_them',async()=>{
 const {db,close}=openTestDb();try{await fixture(db);await db.run("UPDATE words SET plural='invalid' WHERE pos='adjective'");const before=await snapshot(db);
 await expect(migrate(db)).rejects.toThrow(/word|слов/i);expect(await snapshot(db)).toEqual(before);expect(await db.first('PRAGMA user_version')).toEqual({user_version:6});expect(await db.first('PRAGMA foreign_keys')).toEqual({foreign_keys:1});
 }finally{close();}
});

test('migration_rolls_back_after_copy_and_rejects_newer_schema',async()=>{
 const {db,close}=openTestDb();try {
  await fixture(db);const before=await snapshot(db);
  const failing:SqlStore={...db,schemaTransaction:work=>db.schemaTransaction(tx=>work({...tx,exec:async sql=>{await tx.exec(sql);if(sql.includes('ALTER TABLE words_v7 RENAME'))throw new Error('failure after copy');}}))};
  await expect(migrate(failing)).rejects.toThrow('failure after copy');
  expect(await snapshot(db)).toEqual(before);expect(await db.first('PRAGMA user_version')).toEqual({user_version:6});expect(await db.first('PRAGMA foreign_keys')).toEqual({foreign_keys:1});
  await db.exec('PRAGMA user_version=9');await expect(migrate(db)).rejects.toThrow('Unsupported');expect(await snapshot(db)).toEqual(before);
 }finally{close();}
});
