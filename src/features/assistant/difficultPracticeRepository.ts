import type { SqlStore } from '../../core/sql';
import type { Word } from '../learning/learningTypes';

export class DifficultPracticeRepository {
    constructor(private db: SqlStore) {}

    async select(profileId: string): Promise<Word[]> {
        return this.db.all<Word>(`SELECT w.* FROM words w JOIN word_progress p
            ON p.profileId=w.profileId AND p.wordId=w.id
            WHERE w.profileId=? AND p.difficult=1
            ORDER BY w.de,w.id LIMIT 5`, [profileId]);
    }
}
