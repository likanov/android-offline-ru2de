import { migrate } from '../../src/core/migrations';
import { migrateWordParts } from '../../src/core/migrations/007_word_parts';
import { profilesSchema } from '../../src/core/migrations/001_profiles';
import { wordDetailsSchema } from '../../src/core/migrations/002_word_details';
import { learningSchema } from '../../src/core/migrations/003_learning';
import { topicsSchema } from '../../src/core/migrations/004_topics';
import { grammarSchema, seedGrammarTargets } from '../../src/core/migrations/006_grammar';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { GrammarRepository } from '../../src/features/grammar/grammarRepository';
import { GrammarSessionRepository } from '../../src/features/grammar/grammarSessionRepository';
import { GrammarAnswerService } from '../../src/features/grammar/grammarAnswerService';
import { openTestDb } from '../sqlite';
import type { SqlStore } from '../../src/core/sql';
import '../harness';
async function fixture(db: SqlStore) { await db.exec(profilesSchema + wordDetailsSchema + learningSchema + topicsSchema); await db.exec('ALTER TABLE settings ADD COLUMN reminderEnabled INTEGER NOT NULL DEFAULT 0; ALTER TABLE settings ADD COLUMN reminderHour INTEGER NOT NULL DEFAULT 19; ALTER TABLE settings ADD COLUMN reminderMinute INTEGER NOT NULL DEFAULT 0;'); await db.exec(grammarSchema); await seedGrammarTargets(db); await db.schemaTransaction(migrateWordParts); await db.exec('PRAGMA user_version=7'); const p = await createProfile(db, 'Legacy graph'); const sessions = new GrammarSessionRepository(db); const answers = new GrammarAnswerService(db); const grammar = new GrammarRepository(db); const t = 'sein-cloze:ich' as const; const progress = await grammar.getState(p.id, t); await grammar.write(p.id, { ...progress, state: { ...progress.state, streak: 19 } }); const s = (await sessions.start(p.id, { mode: 'study', lesson: 'sein', targetIds: [t] }, '2026-10-08'))!; const q = (await sessions.next(p.id, s.id, '2026-10-08'))!; if (q.catalogVersion !== 1)
    throw Error('legacy'); await answers.submit(p.id, s.id, q.attemptId, { kind: 'choice', optionId: q.expected.optionId }, '2026-10-08'); await sessions.start(p.id, { mode: 'study', lesson: 'pronouns', targetIds: ['pronoun-cloze:du'] }, '2026-10-08'); const active = (await sessions.resume(p.id))!; await sessions.next(p.id, active.id, '2026-10-08'); }
async function snapshot(db: SqlStore) { const tables = await db.all<{
    name: string;
}>("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"); return Object.fromEntries(await Promise.all(tables.map(async ({ name }) => [name, await db.all(`SELECT * FROM ${name}${name === 'grammar_targets' ? ' WHERE catalogVersion=1' : ''} ORDER BY rowid`)]))); }
test('migration_preserves_legacy_payload_and_ledger', async () => { const { db, close } = openTestDb(); try {
    await fixture(db);
    const before = await snapshot(db);
    const indexes = await db.all("SELECT name,sql FROM sqlite_master WHERE type='index' ORDER BY name");
    await migrate(db);
    expect(await snapshot(db)).toEqual(before);
    expect(await db.all("SELECT name,sql FROM sqlite_master WHERE type='index' ORDER BY name")).toEqual(indexes);
    expect(await db.first('PRAGMA user_version')).toEqual({ user_version: 8 });
    expect(await db.first('SELECT COUNT(*) n FROM grammar_targets WHERE catalogVersion=2')).toEqual({ n: 24 });
    expect(await db.all('PRAGMA foreign_key_check')).toEqual([]);
    await migrate(db);
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
    await expect(migrate(failing)).rejects.toThrow('injected');
    expect(await db.first('PRAGMA user_version')).toEqual({ user_version: 7 });
    expect(await snapshot(db)).toEqual(before);
    expect(await db.all('SELECT name,sql FROM sqlite_master ORDER BY name')).toEqual(schema);
    expect(await db.first('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
}
finally {
    close();
} });
