import { notifyProfileChanged } from '../../app/refreshBus';
import { randomUUID } from 'expo-crypto';
import type { SqlStore, SqlExecutor } from '../../core/sql';
import { WordError } from '../dictionary/wordValidation';
export type Topic = { id: string; profileId: string; name: string };
function topicName(name: string): string {
 const value=name.trim();
 if (!value) throw new WordError('VALIDATION','Введите название набора');
 return value;
}
async function ownedTopic(tx: SqlExecutor, profileId: string, topicId: string): Promise<Topic> {
 const topic=await tx.first<Topic>('SELECT * FROM topics WHERE id=?',[topicId]);
 if (!topic) throw new WordError('NOT_FOUND','Набор не найден');
 if (topic.profileId!==profileId) throw new WordError('WRONG_PROFILE','Набор принадлежит другому профилю');
 return topic;
}
async function ownedWord(tx: SqlExecutor, profileId: string, wordId: string): Promise<void> {
 const word=await tx.first<{profileId:string}>('SELECT profileId FROM words WHERE id=?',[wordId]);
 if (!word) throw new WordError('NOT_FOUND','Слово не найдено');
 if (word.profileId!==profileId) throw new WordError('WRONG_PROFILE','Слово принадлежит другому профилю');
}
// Shared transaction primitive: the editor commits vocabulary and membership together.
export async function replaceWordTopics(tx: SqlExecutor, profileId: string, wordId: string, topicIds: string[]): Promise<void> {
 await ownedWord(tx,profileId,wordId);
 const ids=[...new Set(topicIds)];
 for (const id of ids) await ownedTopic(tx,profileId,id);
 await tx.run('DELETE FROM word_topics WHERE profileId=? AND wordId=?',[profileId,wordId]);
 for (const id of ids) await tx.run('INSERT INTO word_topics(profileId,wordId,topicId) VALUES (?,?,?)',[profileId,wordId,id]);
}
export class TopicRepository {
 constructor(private db: SqlStore) {}
 list(profileId: string): Promise<Topic[]> {return this.db.all<Topic>('SELECT * FROM topics WHERE profileId=? ORDER BY name,id',[profileId]);}
 async create(profileId: string, name: string): Promise<Topic> {
  const topic={id:randomUUID(),profileId,name:topicName(name)};
  await this.db.run('INSERT INTO topics(id,profileId,name) VALUES (?,?,?)',[topic.id,profileId,topic.name]);
  notifyProfileChanged(profileId);return topic;
 }
 async rename(profileId: string, topicId: string, name: string): Promise<void> {
  const value=topicName(name);
  await this.db.transaction(async tx=>{await ownedTopic(tx,profileId,topicId);await tx.run('UPDATE topics SET name=? WHERE id=? AND profileId=?',[value,topicId,profileId]);});
  notifyProfileChanged(profileId);
 }
 async setWordTopics(profileId: string, wordId: string, topicIds: string[]): Promise<void> {await this.db.transaction(tx=>replaceWordTopics(tx,profileId,wordId,topicIds));notifyProfileChanged(profileId);}
 wordTopics(profileId: string, wordId: string): Promise<Topic[]> {
  return this.db.transaction(async tx=>{await ownedWord(tx,profileId,wordId);return tx.all<Topic>('SELECT t.* FROM topics t JOIN word_topics wt ON wt.profileId=t.profileId AND wt.topicId=t.id WHERE wt.profileId=? AND wt.wordId=? ORDER BY t.name,t.id',[profileId,wordId]);});
 }
}

export async function findOrCreateTopic(tx: SqlExecutor, profileId: string, name: string): Promise<Topic> {
 const normalized=topicName(name).normalize('NFC');
 const existing=(await tx.all<Topic>('SELECT * FROM topics WHERE profileId=? ORDER BY id',[profileId])).find(topic=>topic.name.normalize('NFC')===normalized);
 if(existing)return existing;
 const topic={id:randomUUID(),profileId,name:normalized};
 await tx.run('INSERT INTO topics(id,profileId,name) VALUES (?,?,?)',[topic.id,profileId,topic.name]);
 return topic;
}
