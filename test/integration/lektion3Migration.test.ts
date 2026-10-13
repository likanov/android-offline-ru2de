import type { SqlStore } from '../../src/core/sql';
import { openTestDb } from '../sqlite';
import { migrate } from '../../src/core/migrations';
import { migrateGrammarMastery } from '../../src/core/migrations/009_grammar_mastery';
import { createSchema8GrammarFixture } from '../fixtures/grammarSchema8';
const day = '2026-10-13';
async function graph(db: SqlStore) { return Promise.all(['grammar_targets', 'profiles', 'word_progress', 'grammar_progress', 'grammar_sessions', 'grammar_questions', 'grammar_attempts', 'grammar_rewards', 'grammar_rule_transitions', 'daily_activity'].map(async (table) => ({ table, rows: await db.all(`SELECT * FROM ${table}${table === 'grammar_targets' ? ' WHERE catalogVersion<3' : ''} ORDER BY rowid`) }))); }
test('migration9_to10_preserves_old_graph', async () => {
    const h = openTestDb();
    try {
        await createSchema8GrammarFixture(h.db, '2026-10-12');
        await h.db.schemaTransaction(async (tx) => { await migrateGrammarMastery(tx, day); await tx.exec('PRAGMA user_version=9'); });
        const before = await graph(h.db);
        await migrate(h.db, day);
        expect(await h.db.first('PRAGMA user_version')).toEqual({ user_version: 10 });
        expect(await graph(h.db)).toEqual(before);
        expect(await h.db.first('SELECT COUNT(*) n,MIN(ordinal) first,MAX(ordinal) last FROM grammar_targets WHERE catalogVersion=3')).toEqual({ n: 40, first: 42, last: 81 });
        expect(await h.db.all('PRAGMA foreign_key_check')).toEqual([]);
        await migrate(h.db, day);
        expect(await graph(h.db)).toEqual(before);
    }
    finally {
        h.close();
    }
});
test('install_from_scratch_and_8_to_9_to_10', async () => { for (const schema8 of [false, true]) {
    const h = openTestDb();
    try {
        if (schema8)
            await createSchema8GrammarFixture(h.db, '2026-10-12');
        await migrate(h.db, day);
        expect(await h.db.first('PRAGMA user_version')).toEqual({ user_version: 10 });
        expect(await h.db.first('SELECT COUNT(*) n FROM grammar_targets')).toEqual({ n: 82 });
        expect(await h.db.all('PRAGMA foreign_key_check')).toEqual([]);
    }
    finally {
        h.close();
    }
} });
test('migration10_failure_rolls_back_schema_graph_and_foreign_keys', async () => {
    const h = openTestDb();
    try {
        await createSchema8GrammarFixture(h.db, '2026-10-12');
        await h.db.schemaTransaction(async (tx) => { await migrateGrammarMastery(tx, day); await tx.exec('PRAGMA user_version=9'); });
        const before = await graph(h.db);
        const schema = await h.db.all("SELECT type,name,sql FROM sqlite_master ORDER BY name");
        const failing: SqlStore = { ...h.db, schemaTransaction: work => h.db.schemaTransaction(tx => work({ ...tx, run: async (sql, params) => { const result = await tx.run(sql, params); if (sql.startsWith('INSERT INTO grammar_targets') && params?.[0] === 'noun-article:buch')
                    throw new Error('task10 injected'); return result; } })) };
        await expect(migrate(failing, day)).rejects.toThrow('task10 injected');
        expect(await graph(h.db)).toEqual(before);
        expect(await h.db.all("SELECT type,name,sql FROM sqlite_master ORDER BY name")).toEqual(schema);
        expect(await h.db.first('PRAGMA user_version')).toEqual({ user_version: 9 });
        expect(await h.db.first('PRAGMA foreign_keys')).toEqual({ foreign_keys: 1 });
        expect(await h.db.all('PRAGMA foreign_key_check')).toEqual([]);
        await migrate(h.db, day);
        expect(await h.db.first('PRAGMA user_version')).toEqual({ user_version: 10 });
    }
    finally {
        h.close();
    }
});
