import { makeGrammarQuestion } from '../../src/features/grammar/grammarQuestionFactory';
import { grammarTargets } from '../../src/features/grammar/grammarCatalog';
import type { GrammarTargetId } from '../../src/features/grammar/grammarTypes';

const words = [{ id: 'bad', profileId: 'p', de: 'Tisch', ru: 'стол', pos: 'noun', gender: 'f', plural: 'Tische', exampleDe: null, exampleRu: null, note: '', revision: 7 } as any,
  { id: 'girl', profileId: 'p', de: 'Mädchen', ru: 'девочка', pos: 'noun', gender: 'n', plural: 'Mädchen', exampleDe: null, exampleRu: null, note: '', revision: 3 } as any];

test('unsupported_dictionary_uses_builtin_example', () => {
  const q = makeGrammarQuestion({ attemptId: 'a', sessionId: 's', profileId: 'p', targetId: 'pronoun-cloze:ich' as GrammarTargetId, responseMode: 'choice', reviewStage: null, dueDay: null, variantIndex: 0, words });
  expect(q.dependencies).toEqual([]);
  expect(q.feedback.sentenceDe).toContain('Ich');
});

test('options_are_reproducibly_shuffled_by_attempt', () => {
  const target = grammarTargets[0].id;
  const base = { sessionId: 's', profileId: 'p', targetId: target, responseMode: 'choice' as const, reviewStage: null, dueDay: null, variantIndex: 0, words: [] };
  expect(makeGrammarQuestion({ ...base, attemptId: 'same' }).options).toEqual(makeGrammarQuestion({ ...base, attemptId: 'same' }).options);
});
