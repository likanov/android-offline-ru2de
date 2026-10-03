import { topicsSchema, seedProfileTopics } from './migrations/004_topics';
import type { SqlStore } from "./sql";
import { profilesSchema } from "./migrations/001_profiles";
import { wordDetailsSchema } from "./migrations/002_word_details";
import { wordKey } from "../features/dictionary/wordValidation";
import type { Word } from "../features/learning/learningTypes";
import { starterWords } from "../data/starterWords";
import { learningSchema } from "./migrations/003_learning";
export async function migrate(db: SqlStore): Promise<void> {
  await db.transaction(async (tx) => {
    const version = await tx.first<{ user_version: number }>(
      "PRAGMA user_version",
    );
    if ((version?.user_version ?? 0) > 4)
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
  });
}
