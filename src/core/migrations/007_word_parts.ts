import type { SqlExecutor } from '../sql';
export async function migrateWordParts(tx: SqlExecutor): Promise<void> {
  const incompatible = await tx.first<{id:string}>(`SELECT id FROM words WHERE
    pos NOT IN ('noun','adjective','number','verb','pronoun','adverb','preposition','conjunction','phrase')
    OR (pos='noun' AND (gender IS NULL OR gender NOT IN ('m','f','n')))
    OR (pos<>'noun' AND (gender IS NOT NULL OR plural IS NOT NULL)) LIMIT 1`);
  if (incompatible) throw new Error(`Cannot migrate incompatible word ${incompatible.id}: check part of speech, gender and plural`);
  await tx.exec(`CREATE TABLE words_v7(
 id TEXT PRIMARY KEY NOT NULL, profileId TEXT NOT NULL REFERENCES profiles(id),
 seedKey TEXT, seedDe TEXT, de TEXT NOT NULL, ru TEXT NOT NULL,
 pos TEXT NOT NULL CHECK(pos IN ('noun','adjective','number','verb','pronoun','adverb','preposition','conjunction','phrase')),
 gender TEXT CHECK(gender IN ('m','f','n')), plural TEXT, exampleDe TEXT, exampleRu TEXT, note TEXT NOT NULL DEFAULT '',
 icon TEXT, revision INTEGER NOT NULL DEFAULT 1, canonicalKey TEXT,
 UNIQUE(profileId,id), UNIQUE(profileId,seedKey),
 CHECK((pos='noun' AND gender IS NOT NULL) OR (pos<>'noun' AND gender IS NULL AND plural IS NULL))
 );
 INSERT INTO words_v7 SELECT * FROM words;
 DROP TABLE words;
 ALTER TABLE words_v7 RENAME TO words;
 CREATE UNIQUE INDEX words_canonical ON words(profileId,canonicalKey);`);
}
