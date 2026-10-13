import { createProfile } from '../../src/features/profiles/profileRepository';
import { migrate } from '../../src/core/migrations';
import { profilesSchema } from '../../src/core/migrations/001_profiles';
import { wordDetailsSchema } from '../../src/core/migrations/002_word_details';
import { learningSchema } from '../../src/core/migrations/003_learning';
import { topicsSchema } from '../../src/core/migrations/004_topics';
import type { SqlStore } from '../../src/core/sql';
import { createGrammarHarness } from '../harness';
import { openTestDb } from '../sqlite';

async function makeV5(db: SqlStore): Promise<string> {
  await db.transaction(async tx => {
    await tx.exec(profilesSchema);
    await tx.exec(wordDetailsSchema);
    await tx.exec(learningSchema);
    await tx.exec(topicsSchema);
    await tx.exec(`ALTER TABLE settings ADD COLUMN reminderEnabled INTEGER NOT NULL DEFAULT 0 CHECK(reminderEnabled IN (0,1));
      ALTER TABLE settings ADD COLUMN reminderHour INTEGER NOT NULL DEFAULT 19 CHECK(reminderHour BETWEEN 0 AND 23);
      ALTER TABLE settings ADD COLUMN reminderMinute INTEGER NOT NULL DEFAULT 0 CHECK(reminderMinute BETWEEN 0 AND 59);
      PRAGMA user_version=5;`);
  });
  const profile = await createProfile(db, 'До миграции');
  // Include rows from the learning schema so the migration proves that an
  // in-progress vocabulary lesson remains byte-for-byte untouched.
  const word = await db.first<{id:string}>('SELECT id FROM words WHERE profileId=? ORDER BY id LIMIT 1', [profile.id]);
  await db.run("INSERT INTO sessions(id,profileId,mode,wordIds,status) VALUES ('old-session',?, 'study',?,'active')", [profile.id, JSON.stringify([word!.id])]);
  await db.run("INSERT INTO questions(attemptId,profileId,sessionId,wordId,revision,payload,status) VALUES ('old-attempt',?,'old-session',?,1,?,'active')", [profile.id, word!.id, JSON.stringify({old:true})]);
  return profile.id;
}

async function legacyRows(db: SqlStore): Promise<Record<string, unknown[]>> {
  const tables = await db.all<{name:string}>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE 'grammar_%' ORDER BY name");
  return Object.fromEntries(await Promise.all(tables.map(async ({name}) => [name, await db.all(`SELECT * FROM ${name} ORDER BY rowid`)])));
}

test('migrates_v5_to_v6_without_changing_word_data', async () => {
  const opened = openTestDb();
  try {
    await makeV5(opened.db);
    const before = await legacyRows(opened.db);
    await migrate(opened.db);
    expect(await opened.db.first('PRAGMA user_version')).toEqual({user_version: 10});
    expect(await opened.db.first('SELECT count(*) AS n FROM grammar_targets')).toEqual({n: 82});
    expect(await legacyRows(opened.db)).toEqual(before);
    await expect(migrate(opened.db)).resolves.toBeUndefined();
    expect(await opened.db.first('SELECT count(*) AS n FROM grammar_targets')).toEqual({n: 82});
    await opened.db.exec('PRAGMA user_version=11');
    await expect(migrate(opened.db)).rejects.toThrow('Unsupported database version');
  } finally {
    opened.close();
  }
});

test('grammar_foreign_keys_and_one_active_session', async () => {
  const h = await createGrammarHarness();
  try {
    const first = await createProfile(h.db, 'Первый');
    const second = await createProfile(h.db, 'Второй');
    const targetId = 'pronoun-cloze:ich';
    await expect(h.db.run('INSERT INTO grammar_progress(profileId,targetId) VALUES (?,?)', ['missing-profile', targetId])).rejects.toThrow();
    await expect(h.db.run('INSERT INTO grammar_progress(profileId,targetId) VALUES (?,?)', [first.id, 'pronoun-cloze:missing'])).rejects.toThrow();
    const session = await h.grammarSessions.start(second.id, {mode:'study',lesson:'mixed',targetIds:[targetId]}, '2026-10-06');
    expect(session).not.toBeNull();
    await h.db.run('INSERT INTO grammar_progress(profileId,targetId) VALUES (?,?)', [first.id, targetId]);
    await expect(h.db.run(
      "INSERT INTO grammar_questions(attemptId,profileId,sessionId,targetId,catalogVersion,kind,responseMode,payload,status) VALUES ('foreign-question',?,?,?,1,'pronoun-cloze','choice','{}','active')",
      [first.id, session!.id, targetId],
    )).rejects.toThrow();
    await expect(h.db.run(
      "INSERT INTO grammar_sessions(id,profileId,selection,targetIds,cursor,currentQuestion,result,status) VALUES ('second-active',?,?,?,0,NULL,NULL,'active')",
      [second.id, JSON.stringify({mode:'study',lesson:'mixed'}), JSON.stringify([targetId])],
    )).rejects.toThrow();
  } finally {
    h.close();
  }
});
