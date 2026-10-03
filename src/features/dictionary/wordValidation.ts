import type { Word, WordDraft } from '../learning/learningTypes';
import { normalizeAnswer } from '../learning/normalizeAnswer';
import { theme } from '../../ui/theme';
export class WordError extends Error {
    constructor(public code: 'VALIDATION' | 'DUPLICATE' | 'WRONG_PROFILE' | 'NOT_FOUND', message: string) { super(message); }
}
const clean = (value: string) => value.normalize('NFC').trim().replace(/\s+/gu, ' ');
export function validateWord(draft: WordDraft): WordDraft {
    const de = clean(draft.de), ru = clean(draft.ru);
    if (!de)
        throw new WordError('VALIDATION', 'Введите немецкое слово');
    if (!ru)
        throw new WordError('VALIDATION', 'Введите перевод');
    if (!['noun', 'adjective'].includes(draft.pos))
        throw new WordError('VALIDATION', 'Выберите часть речи');
    if (draft.pos === 'noun' && !['m', 'f', 'n'].includes(draft.gender ?? ''))
        throw new WordError('VALIDATION', 'Выберите род существительного');
    return { ...draft, de: draft.pos === 'noun' ? de[0].toLocaleUpperCase('de-DE') + de.slice(1).toLocaleLowerCase('de-DE') : de, ru, gender: draft.pos === 'noun' ? draft.gender : null, plural: draft.plural?.normalize('NFC').trim() || null, exampleDe: draft.exampleDe?.normalize('NFC').trim() || null, exampleRu: draft.exampleRu?.normalize('NFC').trim() || null, note: draft.note?.trim() ?? '', icon: draft.icon ?? null };
}
export function wordKey(word: WordDraft): string { return JSON.stringify([normalizeAnswer(word.de), normalizeAnswer(word.ru), word.pos, word.pos === 'noun' ? word.gender : null]); }
export function genderPresentation(word: Pick<Word, 'pos' | 'gender'>): {
    article: string | null;
    color: string | null;
    label: string;
} {
    if (word.pos === 'adjective')
        return { article: null, color: null, label: 'Прилагательное' };
    const genders = { m: { article: 'der', color: theme.masculine, label: 'Мужской род' }, f: { article: 'die', color: theme.feminine, label: 'Женский род' }, n: { article: 'das', color: theme.neuter, label: 'Средний род' } };
    return word.gender ? genders[word.gender] : { article: null, color: null, label: 'Род не указан' };
}
export function displayGerman(word: Word): string { const { article } = genderPresentation(word); return article ? `${article} ${word.de}` : word.de; }
