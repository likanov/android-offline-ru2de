import { AppError } from '../../core/errors';
import type { Word } from '../learning/learningTypes';
import { checkAnswer, normalizeAnswer } from '../learning/normalizeAnswer';
import type { ClozeExercise } from './practiceTypes';

function reject(message = 'Не удалось создать упражнение'): never {
    throw new AppError('VALIDATION', message);
}

function stringField(value: unknown): string {
    return typeof value === 'string' ? value : reject();
}

function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
}

function leaksAnswer(before: string, after: string, target: string): boolean {
    const context = normalizeAnswer(`${before} ${after}`);
    const answer = normalizeAnswer(target);
    if (answer.includes(' '))
        return context.includes(answer);
    return new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegExp(answer)}($|[^\\p{L}\\p{N}_])`, 'u').test(context);
}

export function decodeClozeOutput(raw: string, words: Word[]): ClozeExercise[] {
    let parsed: unknown;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return reject();
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
        return reject();
    const exercises = (parsed as { exercises?: unknown }).exercises;
    if (!Array.isArray(exercises) || exercises.length !== words.length)
        return reject();
    const byId = new Map(words.map(word => [word.id, word]));
    const seen = new Set<string>();
    const decoded = exercises.map(item => {
        if (!item || typeof item !== 'object' || Array.isArray(item))
            return reject();
        const source = item as Record<string, unknown>;
        const wordId = stringField(source.wordId);
        const word = byId.get(wordId);
        if (!word || seen.has(wordId))
            return reject();
        seen.add(wordId);
        const before = stringField(source.before), after = stringField(source.after), translationRu = stringField(source.translationRu);
        if ((!before.trim() && !after.trim()) || before.length + after.length > 240 || !translationRu.trim() || translationRu.length > 300 || leaksAnswer(before, after, word.de))
            return reject();
        return { wordId, revision: word.revision ?? 1, before, after, expected: [word.de], sentenceDe: `${before}${word.de}${after}`, translationRu };
    });
    if (seen.size !== words.length)
        return reject();
    return decoded;
}

export function gradeCloze(exercise: ClozeExercise, answer: string): boolean {
    return checkAnswer(answer, exercise.expected);
}
