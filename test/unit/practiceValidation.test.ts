import { decodeClozeOutput, gradeCloze } from '../../src/features/assistant/practiceValidation';
import type { Word } from '../../src/features/learning/learningTypes';

const stuhl: Word = { id: 'stuhl', profileId: 'p1', de: 'Stuhl', ru: 'стул', pos: 'noun', gender: 'm', plural: 'Stühle', exampleDe: null, exampleRu: null, note: '', revision: 2 };
const pruefung: Word = { ...stuhl, id: 'pruefung', de: 'Prüß', ru: 'проверка', revision: 1 };
const phrase: Word = { ...stuhl, id: 'phrase', de: 'Guten Morgen', ru: 'доброе утро', revision: 1 };

test('cloze_expected_comes_only_from_owned_card', () => {
    const [exercise] = decodeClozeOutput(JSON.stringify({ exercises: [{ wordId: 'stuhl', before: 'Der ', after: ' ist klein.', translationRu: 'Стул маленький.', expected: ['falsch'] }] }), [stuhl]);

    expect(exercise).toEqual({
        wordId: 'stuhl',
        revision: 2,
        before: 'Der ',
        after: ' ist klein.',
        expected: ['Stuhl'],
        sentenceDe: 'Der Stuhl ist klein.',
        translationRu: 'Стул маленький.',
    });
});

test('cloze_rejects_partial_json_duplicates_unknown_or_missing_ids', () => {
    expect(() => decodeClozeOutput('{"exercises":[', [stuhl])).toThrow();
    expect(() => decodeClozeOutput(JSON.stringify({ exercises: [
        { wordId: 'stuhl', before: 'Der ', after: ' ist klein.', translationRu: 'Стул маленький.' },
        { wordId: 'stuhl', before: 'Ein ', after: ' ist hier.', translationRu: 'Стул здесь.' },
    ] }), [stuhl])).toThrow();
    expect(() => decodeClozeOutput(JSON.stringify({ exercises: [{ wordId: 'unknown', before: 'Der ', after: ' ist klein.', translationRu: 'Стул маленький.' }] }), [stuhl])).toThrow();
    expect(() => decodeClozeOutput(JSON.stringify({ exercises: [{ wordId: 'stuhl', before: 'Der ', after: ' ist klein.', translationRu: 'Стул маленький.' }] }), [stuhl, pruefung])).toThrow();
});

test('cloze_rejects_answer_leak_in_context', () => {
    expect(() => decodeClozeOutput(JSON.stringify({ exercises: [{ wordId: 'stuhl', before: 'Der Stuhl ', after: ' ist klein.', translationRu: 'Стул маленький.' }] }), [stuhl])).toThrow();
    expect(() => decodeClozeOutput(JSON.stringify({ exercises: [{ wordId: 'stuhl', before: 'Der ', after: ' stuhl ist klein.', translationRu: 'Стул маленький.' }] }), [stuhl])).toThrow();
    expect(() => decodeClozeOutput(JSON.stringify({ exercises: [{ wordId: 'phrase', before: 'Ich sage Guten Morgen ', after: ' heute.', translationRu: 'Я говорю доброе утро.' }] }), [phrase])).toThrow();
});

test('cloze_grade_preserves_umlauts_and_eszett', () => {
    const [exercise] = decodeClozeOutput(JSON.stringify({ exercises: [{ wordId: 'pruefung', before: 'Das Wort ', after: ' ist kurz.', translationRu: 'Слово короткое.' }] }), [pruefung]);

    expect(gradeCloze(exercise, ' prüß ')).toBe(true);
    expect(gradeCloze(exercise, 'PRÜß')).toBe(true);
    expect(gradeCloze(exercise, 'Pruess')).toBe(false);
    expect(gradeCloze(exercise, 'Pruss')).toBe(false);
});
