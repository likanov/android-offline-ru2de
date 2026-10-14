import { buildQuestion } from '../../src/features/learning/questionFactory';
import type { Word } from '../../src/features/learning/learningTypes';
import type { QuizKind } from '../../src/features/learning/questionTypes';
import { makeGrammarQuestion } from '../../src/features/grammar/grammarQuestionFactory';
import type { GrammarQuestionInput } from '../../src/features/grammar/grammarTypes';
import * as selection from '../../src/features/audio/resultAudioText';

const chair: Word = { id: 'chair', profileId: 'p', de: 'Stuhl', ru: 'стул', pos: 'noun', gender: 'm', plural: 'Stühle', exampleDe: null, exampleRu: null, note: '' };
const lamp: Word = { ...chair, id: 'lamp', de: 'Lampe', ru: 'лампа', gender: 'f', plural: 'Lampen' };

test.each<QuizKind>(['ru-de', 'de-ru', 'typing', 'definite-article', 'indefinite-article', 'listening'])('dictionary %s selects the complete German snapshot', kind => {
  const question = buildQuestion(chair, [chair, lamp], kind, 'attempt')!;
  expect(question.kind).toBe(kind);
  if (kind === 'de-ru') expect(question.expected).toEqual(['стул']);
  expect(selection.dictionaryResultAudioText(question)).toBe(kind === 'indefinite-article' ? 'ein Stuhl' : 'der Stuhl');
});

test('female indefinite article is joined to the noun', () => {
  expect(selection.dictionaryResultAudioText(buildQuestion(lamp, [chair, lamp], 'indefinite-article', 'attempt')!)).toBe('eine Lampe');
});

test.each([
  ['adjective', 'schön', 'красивый'],
  ['number', 'sechzehn', 'шестнадцать'],
  ['phrase', 'Guten Morgen!', 'доброе утро'],
] as const)('%s preserves the canonical German text', (pos, de, ru) => {
  const word: Word = { ...chair, id: pos, pos, de, ru, gender: null, plural: null };
  expect(selection.dictionaryResultAudioText(buildQuestion(word, [word], 'typing', 'attempt')!)).toBe(de);
});

test('typing reads only the canonical first answer, excluding aliases', () => {
  const alias: Word = { ...chair, id: 'seat', de: 'Sitz' };
  const question = buildQuestion(chair, [chair, alias], 'typing', 'attempt')!;
  expect(question.expected).toEqual(['der Stuhl', 'der Sitz']);
  expect(selection.dictionaryResultAudioText(question)).toBe('der Stuhl');
});

const grammarInput = { attemptId: 'a', sessionId: 's', profileId: 'p', responseMode: 'typed' as const, variantIndex: 0, words: [], reviewStage: null, dueDay: null };
test.each([
  ['professions-sein:ich', 0, 'Ich bin Lehrer.'],
  ['yesno-translation:sie_formal', 0, 'Sind Sie Designer?'],
  ['noun-article:buch', 0, 'das Buch'],
  ['noun-article:buch', 1, 'die Bücher'],
  ['noun-plural:stuhl', 0, 'die Stühle'],
  ['noun-plural:strasse', 0, 'die Straßen'],
] as const)('grammar %s variant %s reads full German feedback', (targetId, variantIndex, expectedText) => {
  const question = makeGrammarQuestion({ ...grammarInput, targetId, variantIndex } as GrammarQuestionInput);
  expect(selection.grammarResultAudioText(question)).toBe(expectedText);
});

test('invariant feedback selects expected pairs in feedback order', () => {
  const question = makeGrammarQuestion({ ...grammarInput, targetId: 'plural-invariant:recognition' });
  if (question.catalogVersion !== 3 || question.kind !== 'plural-invariant') throw new Error('Expected invariant question');
  // Reordering expected IDs must not reorder the spoken feedback.
  question.expected.optionIds.reverse();
  const text = selection.grammarResultAudioText(question);
  expect(text).toBe('der Lehrer. die Lehrer. der Computer. die Computer.');
  expect(text).not.toMatch(/→|стул|учитель|der Mensch|der Student|der Schrank|der Stuhl/);
});
