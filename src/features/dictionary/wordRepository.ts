import { randomUUID } from 'expo-crypto';
import type { SqlStore, SqlExecutor } from '../../core/sql';
import type { Word, WordDraft } from '../learning/learningTypes';
import { normalizeAnswer } from '../learning/normalizeAnswer';
import { validateWord, wordKey, WordError } from './wordValidation';
export type WordFilter = {
    query?: string;
    state?: 'all' | 'learning' | 'mastered';
    difficult?: boolean;
};
export class WordRepository {
    constructor(private db: SqlStore) { }
    async list(profileId: string, filter: WordFilter = {}): Promise<Word[]> {
        const rows = await this.db.all<Word & {
            learned: number;
            difficult: number;
        }>('SELECT w.*,p.learned,p.difficult FROM words w JOIN word_progress p ON p.profileId=w.profileId AND p.wordId=w.id WHERE w.profileId=? ORDER BY w.de,w.id', [profileId]);
        const query = normalizeAnswer(filter.query ?? '');
        return rows.filter(w => (!query || normalizeAnswer(w.de).includes(query) || normalizeAnswer(w.ru).includes(query)) && (filter.state !== 'mastered' || !!w.learned) && (filter.state !== 'learning' || !w.learned) && (filter.difficult === undefined || !!w.difficult === filter.difficult));
    }
    private async owned(tx: SqlExecutor, profileId: string, wordId: string): Promise<Word> {
        const word = await tx.first<Word>('SELECT * FROM words WHERE id=?', [wordId]);
        if (!word)
            throw new WordError('NOT_FOUND', 'Слово не найдено');
        if (word.profileId !== profileId)
            throw new WordError('WRONG_PROFILE', 'Слово принадлежит другому профилю');
        return word;
    }
    get(profileId: string, wordId: string): Promise<Word> { return this.owned(this.db, profileId, wordId); }
    private async unique(tx: SqlExecutor, profileId: string, draft: WordDraft, except?: string) {
        const match = await tx.first<{
            id: string;
        }>('SELECT id FROM words WHERE profileId=? AND canonicalKey=?', [profileId, wordKey(draft)]);
        if (match && match.id !== except)
            throw new WordError('DUPLICATE', 'Такое слово уже есть в словаре');
    }
    async create(profileId: string, input: WordDraft): Promise<Word> {
        const draft = validateWord(input);
        return this.db.transaction(async (tx) => {
            await this.unique(tx, profileId, draft);
            const id = randomUUID();
            await tx.run('INSERT INTO words(id,profileId,de,ru,pos,gender,plural,exampleDe,exampleRu,note,icon,canonicalKey) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', [id, profileId, draft.de, draft.ru, draft.pos, draft.gender, draft.plural ?? null, draft.exampleDe ?? null, draft.exampleRu ?? null, draft.note ?? '', draft.icon ?? null, wordKey(draft)]);
            await tx.run('INSERT INTO word_progress(profileId,wordId) VALUES (?,?)', [profileId, id]);
            return this.owned(tx, profileId, id);
        });
    }
    update(profileId: string, wordId: string, input: WordDraft): Promise<{
        word: Word;
        learningReset: boolean;
    }> {
        return this.db.transaction(async (tx) => {
            const old = await this.owned(tx, profileId, wordId), draft = validateWord(input);
            await this.unique(tx, profileId, draft, wordId);
            const learningReset = wordKey(old) !== wordKey(draft), revision = (old.revision ?? 1) + (learningReset ? 1 : 0);
            await tx.run('UPDATE words SET de=?,ru=?,pos=?,gender=?,plural=?,exampleDe=?,exampleRu=?,note=?,icon=?,canonicalKey=?,revision=? WHERE id=? AND profileId=?', [draft.de, draft.ru, draft.pos, draft.gender, draft.plural ?? null, draft.exampleDe ?? null, draft.exampleRu ?? null, draft.note ?? '', draft.icon ?? null, wordKey(draft), revision, wordId, profileId]);
            if (learningReset) {
                await tx.run('UPDATE word_progress SET streak=0,learned=0,reviewStage=0,dueDate=NULL,difficult=0,totalErrors=0,recoveryErrors=0,recoveryCorrect=0 WHERE profileId=? AND wordId=?', [profileId, wordId]);
                await tx.run('DELETE FROM skill_stats WHERE profileId=? AND wordId=?', [profileId, wordId]);
                await tx.run('UPDATE aids SET stale=1 WHERE profileId=? AND id IN (SELECT aidId FROM aid_words WHERE profileId=? AND wordId=?)', [profileId, profileId, wordId]);
            }
            return { word: await this.owned(tx, profileId, wordId), learningReset };
        });
    }
}
