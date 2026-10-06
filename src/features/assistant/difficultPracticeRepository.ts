import type { SqlStore } from '../../core/sql';
import type { Word } from '../learning/learningTypes';

export class DifficultPracticeRepository {
    constructor(private db: SqlStore) {}

    async select(profileId: string): Promise<Word[]> {
        const rows = await this.db.all<Word>(`SELECT w.* FROM words w JOIN word_progress p
            ON p.profileId=w.profileId AND p.wordId=w.id
            WHERE w.profileId=? AND p.difficult=1
            `, [profileId]);
        const collator = new Intl.Collator('de-DE', { sensitivity: 'base' });
        return rows.sort((a, b) => collator.compare(a.de, b.de) || a.id.localeCompare(b.id)).slice(0, 5);
    }
}
