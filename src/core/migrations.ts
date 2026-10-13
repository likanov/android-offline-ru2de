import { localDay } from './calendar';
import type { DayKey } from '../features/learning/learningTypes';
import { migrateGrammarMastery } from './migrations/009_grammar_mastery';
import { migrateLektion2 } from './migrations/008_lektion2';
import { migrateWordParts } from './migrations/007_word_parts';
import { topicsSchema, seedProfileTopics } from './migrations/004_topics';
import type { SqlStore } from "./sql";
import { profilesSchema } from "./migrations/001_profiles";
import { wordDetailsSchema } from "./migrations/002_word_details";
import { wordKey } from "../features/dictionary/wordValidation";
import type { Word } from "../features/learning/learningTypes";
import { starterWords } from "../data/starterWords";
import { learningSchema } from "./migrations/003_learning";
import { grammarSchema, seedGrammarTargets } from './migrations/006_grammar';
export async function migrate(db: SqlStore, today: DayKey = localDay(new Date())): Promise<void> {
  const current = await db.first<{user_version:number}>("PRAGMA user_version");
  if ((current?.user_version ?? 0) > 9) throw new Error("Unsupported database version");
  await db.transaction(async (tx) => {
    const version = await tx.first<{ user_version: number }>(
      "PRAGMA user_version",
    );
    if ((version?.user_version ?? 0) > 9)
      throw new Error("Unsupported database version");
    if ((version?.user_version ?? 0) < 1) {
      await tx.exec(profilesSchema);
      await tx.exec("PRAGMA user_version=1;");
    }
    if ((version?.user_version ?? 0) < 2) {
      await tx.exec(wordDetailsSchema);
      for (const word of await tx.all<Word & {seedKey:string|null}>("SELECT * FROM words")) {
        const seed=starterWords.find(s=>s.seedKey===word.seedKey);
        await tx.run("UPDATE words SET canonicalKey=?,plural=COALESCE(plural,?),exampleDe=COALESCE(exampleDe,?),exampleRu=COALESCE(exampleRu,?),note=CASE WHEN note='' THEN ? ELSE note END WHERE id=?",[wordKey(word),seed?.plural??null,seed?.exampleDe??null,seed?.exampleRu??null,seed?.note??'',word.id]);
      }
      await tx.exec("PRAGMA user_version=2;");
    }
    if ((version?.user_version ?? 0) < 3) {
      await tx.exec(learningSchema);
      await tx.exec("PRAGMA user_version=3;");
    }
    if ((version?.user_version ?? 0) < 4) {
      await tx.exec(topicsSchema);
      for (const profile of await tx.all<{id:string}>('SELECT id FROM profiles')) await seedProfileTopics(tx,profile.id);
      await tx.exec('PRAGMA user_version=4;');
    }
    if ((version?.user_version ?? 0) < 5) {
      await tx.exec(`ALTER TABLE settings ADD COLUMN reminderEnabled INTEGER NOT NULL DEFAULT 0 CHECK(reminderEnabled IN (0,1));
        ALTER TABLE settings ADD COLUMN reminderHour INTEGER NOT NULL DEFAULT 19 CHECK(reminderHour BETWEEN 0 AND 23);
        ALTER TABLE settings ADD COLUMN reminderMinute INTEGER NOT NULL DEFAULT 0 CHECK(reminderMinute BETWEEN 0 AND 59);
        PRAGMA user_version=5;`);
    }
    if ((version?.user_version ?? 0) < 6) {
      await tx.exec(grammarSchema);
      await seedGrammarTargets(tx);
      await tx.exec('PRAGMA user_version=6;');
    }
  });
  await db.schemaTransaction(async tx => {
    const version = await tx.first<{user_version:number}>("PRAGMA user_version");
    if ((version?.user_version ?? 0) > 9) throw new Error("Unsupported database version");
    if ((version?.user_version ?? 0) < 7) {
      await migrateWordParts(tx);
      if ((await tx.all("PRAGMA foreign_key_check")).length) throw new Error("Word migration violates foreign key relationships");
      await tx.exec("PRAGMA user_version=7");
    }
  });
  await db.schemaTransaction(async tx => {
    const version=await tx.first<{user_version:number}>("PRAGMA user_version");
    if ((version?.user_version??0)<8) {
      await migrateLektion2(tx);
      if ((await tx.all("PRAGMA foreign_key_check")).length) throw new Error("Grammar migration violates foreign key relationships");
      await tx.exec("PRAGMA user_version=8");
    }
  });
  await db.schemaTransaction(async tx => {
    const version=await tx.first<{user_version:number}>("PRAGMA user_version");
    if ((version?.user_version??0)<9) {
      await migrateGrammarMastery(tx,today);
      if ((await tx.all("PRAGMA foreign_key_check")).length) throw new Error("Grammar mastery migration violates foreign key relationships");
      await tx.exec("PRAGMA user_version=9");
    }
  });
}
