import { randomUUID } from 'expo-crypto';
import type { SqlExecutor } from '../sql';
import { starterTopics, starterWords } from '../../data/starterWords';

export const topicsSchema = `
CREATE TABLE topics(
 id TEXT PRIMARY KEY NOT NULL,
 profileId TEXT NOT NULL REFERENCES profiles(id),
 name TEXT NOT NULL CHECK(length(trim(name))>0),
 UNIQUE(profileId,id)
);
CREATE TABLE word_topics(
 profileId TEXT NOT NULL, wordId TEXT NOT NULL, topicId TEXT NOT NULL,
 PRIMARY KEY(topicId,wordId),
 FOREIGN KEY(profileId,wordId) REFERENCES words(profileId,id),
 FOREIGN KEY(profileId,topicId) REFERENCES topics(profileId,id)
);
CREATE INDEX word_topics_by_word ON word_topics(profileId,wordId);
`;

export async function seedProfileTopics(tx: SqlExecutor, profileId: string): Promise<void> {
 for (const seed of starterTopics) {
  const topicId = randomUUID();
  await tx.run('INSERT INTO topics(id,profileId,name) VALUES (?,?,?)', [topicId,profileId,seed.name]);
  for (const de of seed.words) {
   // Stable seed identity keeps membership correct when an existing seed was edited.
   const seedKey = starterWords.find(word => word.seedDe === de)!.seedKey;
   const word = await tx.first<{id:string}>('SELECT id FROM words WHERE profileId=? AND seedKey=?', [profileId,seedKey]);
   if (word) await tx.run('INSERT INTO word_topics(profileId,wordId,topicId) VALUES (?,?,?)', [profileId,word.id,topicId]);
  }
 }
}
