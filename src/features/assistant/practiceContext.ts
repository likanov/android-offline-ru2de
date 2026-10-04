import { AppError } from '../../core/errors';
import type { SqlStore } from '../../core/sql';
import { reference } from '../../data/reference';
import type { Word } from '../learning/learningTypes';
import type { AttemptResult, Question } from '../learning/questionTypes';
import type { ErrorContext } from './practiceTypes';

function parseJson<T>(value: string, message: string): T {
    try {
        return JSON.parse(value) as T;
    }
    catch (error) {
        throw new AppError('VALIDATION', message, error);
    }
}

function practiceReference(question: Question): ErrorContext['reference'] {
    return question.kind.includes('article') ? reference.articles : null;
}

export async function readErrorContext(db: SqlStore, profileId: string, attemptId: string): Promise<ErrorContext> {
    const active = await db.first<{ activeProfileId: string | null }>('SELECT activeProfileId FROM app_settings WHERE id=1');
    if (active?.activeProfileId !== profileId)
        throw new AppError('WRONG_PROFILE', 'Выберите этот профиль');
    const row = await db.first<{
        attemptProfileId: string | null;
        attemptResult: string | null;
        attemptRight: number | null;
        questionProfileId: string | null;
        questionPayload: string | null;
        questionStatus: string | null;
        wordProfileId: string | null;
        wordRevision: number | null;
        id: string | null;
        de: string | null;
        ru: string | null;
        pos: Word['pos'] | null;
        gender: Word['gender'];
        plural: string | null;
        exampleDe: string | null;
        exampleRu: string | null;
        note: string | null;
        icon: string | null;
    }>(`SELECT a.profileId AS attemptProfileId,a.result AS attemptResult,a.right AS attemptRight,
            q.profileId AS questionProfileId,q.payload AS questionPayload,q.status AS questionStatus,
            w.profileId AS wordProfileId,w.revision AS wordRevision,w.id,w.de,w.ru,w.pos,w.gender,w.plural,w.exampleDe,w.exampleRu,w.note,w.icon
        FROM questions q
        LEFT JOIN attempts a ON a.attemptId=q.attemptId
        LEFT JOIN words w ON w.profileId=q.profileId AND w.id=q.wordId
        WHERE q.attemptId=?`, [attemptId]);
    if (!row?.questionPayload)
        throw new AppError('STALE_QUESTION', 'Задание устарело');
    if (row.questionProfileId !== profileId || row.attemptProfileId && row.attemptProfileId !== profileId)
        throw new AppError('WRONG_PROFILE', 'Другой профиль');
    if (row.questionStatus !== 'answered' || !row.attemptResult)
        throw new AppError('STALE_QUESTION', 'Задание устарело');
    const question = parseJson<Question>(row.questionPayload, 'Задание повреждено');
    const result = parseJson<AttemptResult>(row.attemptResult, 'Результат повреждён');
    if (row.attemptRight !== 0 || result.right)
        throw new AppError('VALIDATION', 'Объяснение доступно только после ошибки');
    if (!row.id || row.wordProfileId !== profileId || row.wordRevision !== question.revision)
        throw new AppError('STALE_QUESTION', 'Карточка изменилась');
    return {
        question,
        result: { ...result, submittedAnswer: result.submittedAnswer ?? null },
        word: {
            id: row.id,
            profileId,
            de: row.de!,
            ru: row.ru!,
            pos: row.pos!,
            gender: row.gender,
            plural: row.plural,
            exampleDe: row.exampleDe,
            exampleRu: row.exampleRu,
            note: row.note ?? '',
            icon: row.icon,
            revision: row.wordRevision ?? 1,
        },
        reference: practiceReference(question),
    };
}

export async function readClozeWords(db: SqlStore, profileId: string, wordIds: string[]): Promise<Word[]> {
    if (!Array.isArray(wordIds) || wordIds.length < 1 || wordIds.length > 5 || new Set(wordIds).size !== wordIds.length)
        throw new AppError('VALIDATION', 'Выберите от 1 до 5 слов');
    const active = await db.first<{ activeProfileId: string | null }>('SELECT activeProfileId FROM app_settings WHERE id=1');
    if (active?.activeProfileId !== profileId)
        throw new AppError('WRONG_PROFILE', 'Выберите этот профиль');
    const words: Word[] = [];
    for (const id of wordIds) {
        const word = await db.first<Word>('SELECT * FROM words WHERE profileId=? AND id=?', [profileId, id]);
        if (!word)
            throw new AppError('WRONG_PROFILE', 'Слово не принадлежит профилю');
        words.push(word);
    }
    return words;
}
