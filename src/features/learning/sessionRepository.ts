import { randomUUID } from 'expo-crypto';
import type { SqlStore, SqlExecutor } from '../../core/sql';
import type { DayKey, Word, LearningState } from './learningTypes';
import type { Session, Question, TrainingSelection, AudioAvailability, QuizKind } from './questionTypes';
import { buildQuestion } from './questionFactory';
import { addDays } from '../../core/calendar';
export class TrainingError extends Error {
    constructor(public code: string, message: string) { super(message); }
}
type Row = Omit<Session, 'wordIds' | 'currentQuestion' | 'result'> & {
    wordIds: string;
    currentQuestion: string | null;
    result: string | null;
};
export function decodeSession(row: Row): Session { return { ...row, wordIds: JSON.parse(row.wordIds), currentQuestion: row.currentQuestion ? JSON.parse(row.currentQuestion) : null, result: row.result ? JSON.parse(row.result) : null }; }
export async function ownedSession(tx: SqlExecutor, profileId: string, id: string): Promise<Session> { const row = await tx.first<Row>('SELECT * FROM sessions WHERE id=?', [id]); if (!row)
    throw new TrainingError('NOT_FOUND', 'Занятие не найдено'); if (row.profileId !== profileId)
    throw new TrainingError('WRONG_PROFILE', 'Другой профиль'); return decodeSession(row); }
export async function readState(tx: SqlExecutor, profileId: string, wordId: string): Promise<LearningState> { const r = await tx.first<{
    streak: number;
    learned: number;
    bonusAwarded: number;
    reviewStage: number;
    dueDate: string | null;
    difficult: number;
    totalErrors: number;
    recoveryErrors: number;
    recoveryCorrect: number;
}>('SELECT * FROM word_progress WHERE profileId=? AND wordId=?', [profileId, wordId]); if (!r)
    throw new TrainingError('NOT_FOUND', 'Прогресс не найден'); return { streak: r.streak, mastered: !!r.learned, masteryBonusGranted: !!r.bonusAwarded, reviewStage: r.reviewStage, dueDay: r.dueDate, difficult: !!r.difficult, totalErrors: r.totalErrors, recoveryErrors: r.recoveryErrors, recoveryCorrect: r.recoveryCorrect }; }
export function eligible(s: LearningState, mode: 'study' | 'review', today: string) { return mode === 'study' ? !s.mastered : s.mastered && s.dueDay !== null && s.dueDay <= today; }
export class SessionRepository {
    constructor(private db: SqlStore, private audio: AudioAvailability = async () => false) { }
    async start(profileId: string, selection: TrainingSelection, today: DayKey): Promise<Session> { addDays(today, 0); if (!['study', 'review'].includes(selection.mode))
        throw new TrainingError('VALIDATION', 'Режим не найден'); return this.db.transaction(async (tx) => { const all = await tx.all<Word>('SELECT * FROM words WHERE profileId=? ORDER BY de,id', [profileId]); if (selection.wordIds?.some(id => !all.some(w => w.id === id)))
        throw new TrainingError('WRONG_PROFILE', 'Слово не принадлежит профилю'); const ids: string[] = []; for (const w of all) {
        if ((!selection.wordIds || selection.wordIds.includes(w.id)) && eligible(await readState(tx, profileId, w.id), selection.mode, today))
            ids.push(w.id);
        if (ids.length === 5)
            break;
    }
    // Eligibility is checked inside the transaction, before replacing any session.
    if (!ids.length) throw new TrainingError('EMPTY_QUEUE', 'Нет доступных слов для занятия');
    await tx.run("UPDATE questions SET status='cancelled' WHERE profileId=? AND status='active'", [profileId]); await tx.run("UPDATE sessions SET status='cancelled' WHERE profileId=? AND status='active'", [profileId]); const id = randomUUID(); await tx.run("INSERT INTO sessions(id,profileId,mode,wordIds,status) VALUES (?,?,?,?,'active')", [id, profileId, selection.mode, JSON.stringify(ids)]); return ownedSession(tx, profileId, id); }); }
    async resume(profileId: string): Promise<Session | null> { const r = await this.db.first<Row>("SELECT * FROM sessions WHERE profileId=? AND status='active'", [profileId]); return r ? decodeSession(r) : null; }
    async next(profileId: string, sessionId: string, today: DayKey): Promise<Question | null> { addDays(today, 0); return this.db.transaction(async (tx) => { const s = await ownedSession(tx, profileId, sessionId); if (s.status !== 'active')
        return null; if (s.currentQuestion && !s.result)
        return s.currentQuestion; const vocabulary = await tx.all<Word>('SELECT * FROM words WHERE profileId=? ORDER BY de,id', [profileId]); for (let i = 0; i < s.wordIds.length; i++) {
        const index = (s.cursor + i) % s.wordIds.length;
        const w = vocabulary.find(w => w.id === s.wordIds[index]);
        if (!w)
            continue;
        const state = await readState(tx, profileId, w.id);
        if (!eligible(state, s.mode, today))
            continue;
        const kinds: QuizKind[] = ['ru-de', 'de-ru', 'typing', 'definite-article', 'indefinite-article', 'listening'];
        let q: Question | null = null;
        // Each word continues its own persisted rotation. Advancing only a global
        // kind alongside the word cursor locks five-word pools to five kinds.
        const previous = await tx.first<{payload: string}>(
            'SELECT payload FROM questions WHERE profileId=? AND sessionId=? AND wordId=? ORDER BY rowid DESC LIMIT 1',
            [profileId, sessionId, w.id],
        );
        const previousQuestion = previous ? JSON.parse(previous.payload) as Question & { nextKindIndex?: number } : null;
        // Keep the requested-kind cursor separate from the displayed kind: a
        // ru-de question can render as typing without consuming de-ru next.
        // Older stored questions lack the cursor and resume from their kind once.
        let k = previousQuestion?.nextKindIndex ?? (previousQuestion ? kinds.indexOf(previousQuestion.kind) + 1 : s.kindIndex);
        while (!q) {
            const kind = kinds[k % kinds.length];
            k++;
            if (kind === 'listening' && !await this.audio(w))
                continue;
            q = buildQuestion(w, vocabulary, kind, randomUUID());
        }
        q.reviewStage = s.mode === 'review' ? state.reviewStage : null;
        q.dueDay = s.mode === 'review' ? state.dueDay : null;
        await tx.run("INSERT INTO questions(attemptId,profileId,sessionId,wordId,revision,payload,status) VALUES (?,?,?,?,?,?,'active')", [q.attemptId, profileId, sessionId, w.id, q.revision, JSON.stringify({ ...q, nextKindIndex: k })]);
        await tx.run('UPDATE sessions SET cursor=?,kindIndex=?,currentQuestion=?,result=NULL WHERE id=?', [(index + 1) % s.wordIds.length, k, JSON.stringify(q), sessionId]);
        return q;
    } await tx.run("UPDATE sessions SET status='completed',currentQuestion=NULL,result=NULL WHERE id=?", [sessionId]); return null; }); }
    async cancelQuestion(profileId: string, sessionId: string): Promise<void> { await this.db.transaction(async (tx) => { const s = await ownedSession(tx, profileId, sessionId); if (s.currentQuestion && !s.result) {
        await tx.run("UPDATE questions SET status='cancelled' WHERE attemptId=? AND status='active'", [s.currentQuestion.attemptId]);
        await tx.run('UPDATE sessions SET currentQuestion=NULL,result=NULL WHERE id=?', [sessionId]);
    } }); }
}
