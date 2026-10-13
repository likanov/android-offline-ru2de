import type { SqlExecutor } from '../sql';
import { lektion3Targets } from '../../features/grammar/lektion3Content';
/** Run inside a schemaTransaction; preserve existing constraints, children, and snapshots. */
export async function migrateLektion3(tx: SqlExecutor): Promise<void> {
    const indexes = await tx.all<{
        sql: string;
    }>("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name IN ('grammar_targets','grammar_progress','grammar_questions') AND sql IS NOT NULL");
    for (const table of ['grammar_targets', 'grammar_progress', 'grammar_questions']) {
        const row = await tx.first<{
            sql: string;
        }>("SELECT sql FROM sqlite_master WHERE type='table' AND name=?", [table]);
        if (!row)
            throw new Error('Missing grammar schema');
        const schema = row.sql.replace(new RegExp(`^CREATE TABLE\\s+(?:"${table}"|${table})\\s*\\(`), `CREATE TABLE ${table}_v10(`)
            .replaceAll('catalogVersion IN (1,2)', 'catalogVersion IN (1,2,3)')
            .replaceAll("'yesno-translation'))", "'yesno-translation','noun-article','noun-plural','plural-invariant'))")
            .replace("responseMode IN ('choice','typed')", "responseMode IN ('choice','typed','multi-choice')")
            .replace('CHECK(pronounId IS NOT NULL OR (catalogVersion=2', 'CHECK(pronounId IS NOT NULL OR catalogVersion=3 OR (catalogVersion=2');
        await tx.exec(schema);
        await tx.exec(`INSERT INTO ${table}_v10 SELECT * FROM ${table}; DROP TABLE ${table}; ALTER TABLE ${table}_v10 RENAME TO ${table};`);
    }
    for (const index of indexes)
        await tx.exec(index.sql);
    for (const [index, target] of lektion3Targets.entries())
        await tx.run('INSERT INTO grammar_targets(id,kind,pronounId,labelRu,catalogVersion,ordinal) VALUES (?,?,?,?,3,?)', [target.id, target.kind, null, target.labelRu, 42 + index]);
}
