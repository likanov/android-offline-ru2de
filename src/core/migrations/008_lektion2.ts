import type { SqlExecutor } from '../sql';
import { grammarSchema } from './006_grammar';
import { lektion2Targets } from '../../features/grammar/grammarCatalog';
/** Rebuild only constrained tables; child references and immutable JSON remain intact. */
export async function migrateLektion2(tx: SqlExecutor): Promise<void> {
    const kinds = "'pronoun-cloze','sein-cloze','professions-pronoun','professions-sein','demonstrative-statement','yesno-transform','yesno-translation'";
    const indexes = await tx.all<{
        sql: string;
    }>("SELECT sql FROM sqlite_master WHERE type='index' AND tbl_name IN ('grammar_targets','grammar_progress','grammar_questions') AND sql IS NOT NULL");
    for (const table of ['grammar_targets', 'grammar_progress', 'grammar_questions']) {
        const original = grammarSchema.match(new RegExp(`CREATE TABLE ${table}\\([\\s\\S]*?\\n\\);`))![0];
        const updated = original.replace(`CREATE TABLE ${table}(`, `CREATE TABLE ${table}_v8(`)
            .replaceAll("kind IN ('pronoun-cloze','sein-cloze')", `kind IN (${kinds})`)
            .replaceAll('CHECK(catalogVersion=1)', 'CHECK(catalogVersion IN (1,2))')
            .replace('ordinal BETWEEN 0 AND 17', 'ordinal>=0')
            .replace('variantIndex BETWEEN 0 AND 2', 'variantIndex>=0')
            .replace('pronounId TEXT NOT NULL CHECK(pronounId IN', 'pronounId TEXT CHECK(pronounId IN')
            .replace('UNIQUE(id,catalogVersion)', 'CHECK(pronounId IS NOT NULL OR (catalogVersion=2 AND id IN (\'demonstrative-statement:singular\',\'demonstrative-statement:plural\',\'yesno-transform:pronoun\',\'yesno-transform:noun\',\'yesno-translation:noun\'))),\n UNIQUE(id,catalogVersion)');
        await tx.exec(updated);
        await tx.exec(`INSERT INTO ${table}_v8 SELECT * FROM ${table}; DROP TABLE ${table}; ALTER TABLE ${table}_v8 RENAME TO ${table};`);
    }
    for (const index of indexes)
        await tx.exec(index.sql);
    for (const [index, target] of lektion2Targets.entries())
        await tx.run('INSERT INTO grammar_targets(id,kind,pronounId,labelRu,catalogVersion,ordinal) VALUES (?,?,?,?,?,?)', [target.id, target.kind, target.pronounId, target.labelRu, 2, 18 + index]);
}
