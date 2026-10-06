import { NotFoundError } from '../../core/errors';
import type { SqlStore } from '../../core/sql';
import type { Topic } from '../topics/topicRepository';
import type { Word } from '../learning/learningTypes';
import type { WordFilter } from './wordRepository';
import { searchWords } from './dictionarySearch';
import type { DictionaryEntry, DictionaryProgress, DictionarySnapshot } from './dictionaryTypes';

type Row = Word & {
  streak: number;
  learned: number;
  difficult: number;
  dueDate: string | null;
  totalErrors: number;
  currentRevisionAttempt: number;
};

export class DictionaryRepository {
  constructor(private readonly db: SqlStore) {}

  async load(profileId: string): Promise<DictionarySnapshot> {
    const profile = await this.db.first<{ id: string }>('SELECT id FROM profiles WHERE id=?', [profileId]);
    if (!profile) throw new NotFoundError('Профиль не найден');
    const rows = await this.db.all<Row>(`SELECT w.*,p.streak,p.learned,p.difficult,p.dueDate,p.totalErrors,
      EXISTS(SELECT 1 FROM attempts a JOIN questions q ON q.attemptId=a.attemptId
        WHERE a.profileId=w.profileId AND a.wordId=w.id AND q.revision=w.revision) AS currentRevisionAttempt
      FROM words w JOIN word_progress p ON p.profileId=w.profileId AND p.wordId=w.id
      WHERE w.profileId=? ORDER BY w.de,w.id`, [profileId]);
    const topics = await this.db.all<Topic>('SELECT * FROM topics WHERE profileId=? ORDER BY name,id', [profileId]);
    const memberships = await this.db.all<{ wordId: string; topicId: string }>('SELECT wordId,topicId FROM word_topics WHERE profileId=?', [profileId]);
    const topicIds = new Map<string, string[]>();
    for (const membership of memberships) topicIds.set(membership.wordId, [...(topicIds.get(membership.wordId) ?? []), membership.topicId]);
    const entries = rows.map(({ streak, learned, difficult, dueDate, totalErrors, currentRevisionAttempt, ...word }): DictionaryEntry => {
      const learning: DictionaryProgress = {
        streak, mastered: !!learned, difficult: !!difficult, dueDay: dueDate,
        started: !!currentRevisionAttempt || streak > 0 || totalErrors > 0,
      };
      return { ...word, learning, topicIds: topicIds.get(word.id) ?? [] };
    });
    return { profileId, entries, topics };
  }

  async getEntry(profileId: string, wordId: string): Promise<DictionaryEntry> {
    const entry = (await this.load(profileId)).entries.find(item => item.id === wordId);
    if (!entry) throw new NotFoundError('Слово не найдено');
    return entry;
  }
}

export function filterDictionaryEntries(snapshot: DictionarySnapshot, filter: WordFilter): DictionaryEntry[] {
  const candidates = snapshot.entries.filter(entry =>
    (filter.state !== 'mastered' || entry.learning.mastered) &&
    (filter.state !== 'learning' || !entry.learning.mastered) &&
    (filter.difficult === undefined || entry.learning.difficult === filter.difficult) &&
    (!filter.topicId || entry.topicIds.includes(filter.topicId)),
  );
  return searchWords(candidates, filter.query ?? '');
}
