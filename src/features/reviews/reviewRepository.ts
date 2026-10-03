import type { SqlStore } from '../../core/sql';
import type { DayKey, Word } from '../learning/learningTypes';
import { addDays } from '../../core/calendar';
export type DifficultWord = { word: Word; eligible: boolean; dueDay: DayKey | null };
export class ReviewRepository {
    constructor(private db: SqlStore) {}
    async dueWords(profileId: string, today: DayKey): Promise<Word[]> {
        addDays(today, 0);
        return this.db.all<Word>(`SELECT w.* FROM words w JOIN word_progress p
            ON p.profileId=w.profileId AND p.wordId=w.id
            WHERE w.profileId=? AND p.learned=1 AND p.dueDate<=?
            ORDER BY p.dueDate,w.de,w.id`, [profileId, today]);
    }
    async difficultWords(profileId: string, today: DayKey): Promise<DifficultWord[]> {
        addDays(today, 0);
        const rows = await this.db.all<Word & { learned: number; dueDate: DayKey | null }>(`SELECT w.*,p.learned,p.dueDate FROM words w JOIN word_progress p
            ON p.profileId=w.profileId AND p.wordId=w.id
            WHERE w.profileId=? AND p.difficult=1 ORDER BY w.de,w.id`, [profileId]);
        return rows.map(({ learned, dueDate, ...word }) => ({ word, eligible: !learned || (dueDate !== null && dueDate <= today), dueDay: dueDate }));
    }
    async nextDueDay(profileId: string, today: DayKey): Promise<DayKey | null> {
        addDays(today, 0);
        const row = await this.db.first<{ day: DayKey | null }>('SELECT MIN(dueDate) AS day FROM word_progress WHERE profileId=? AND learned=1 AND dueDate>?', [profileId, today]);
        return row?.day ?? null;
    }
}
