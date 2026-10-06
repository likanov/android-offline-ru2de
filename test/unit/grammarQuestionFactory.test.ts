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

test('all_templates_have_valid_german_and_russian_feedback', () => {
  for (const target of grammarTargets) for (const variantIndex of [0, 1, 2]) {
    const q = makeGrammarQuestion({ attemptId: `${target.id}-${variantIndex}`, sessionId: 's', profileId: 'p', targetId: target.id, responseMode: 'choice', reviewStage: null, dueDay: null, variantIndex, words: [] });
    expect(q.feedback.translationRu).toMatch(/[А-Яа-яЁё]/);
    expect(q.feedback.translationRu).not.toMatch(/\b(bin|bist|ist|sind|seid)\b/);
    expect(q.feedback.sentenceDe).not.toMatch(/\b(bin|bist|ist|sind|seid)\s+\1\b/);
    expect(q.feedback.sentenceDe).not.toContain('Das Lampe');
  }
});

test('sie_targets_keep_all_three_sie_meanings_as_choice_options', () => {
  for (const target of grammarTargets.filter(t => t.pronounId.startsWith('sie_') && t.kind === 'pronoun-cloze')) {
    const q = makeGrammarQuestion({ attemptId: target.id, sessionId: 's', profileId: 'p', targetId: target.id, responseMode: 'choice', reviewStage: null, dueDay: null, variantIndex: 0, words: [] });
    expect(q.options.map(option => option.id)).toEqual(expect.arrayContaining(['sie_feminine', 'sie_plural', 'sie_formal']));
  }
});

test('dependencies_are_profile_scoped_and_match_rendered_noun', () => {
  const q = makeGrammarQuestion({ attemptId: 'dep', sessionId: 's', profileId: 'p', targetId: 'pronoun-cloze:er' as GrammarTargetId, responseMode: 'choice', reviewStage: null, dueDay: null, variantIndex: 1, words: [
    { id: 'foreign', profileId: 'other', de: 'Tisch', ru: 'стол', pos: 'noun', gender: 'm', plural: 'Tische', exampleDe: null, exampleRu: null, note: '', revision: 1 } as any,
    { id: 'owned', profileId: 'p', de: 'Tisch', ru: 'стол', pos: 'noun', gender: 'm', plural: 'Tische', exampleDe: null, exampleRu: null, note: '', revision: 2 } as any,
  ]});
  expect(q.dependencies).toEqual([expect.objectContaining({ wordId: 'owned', profileId: 'p' })]);
  expect(q.feedback.sentenceDe).toContain('Der Tisch');
});
