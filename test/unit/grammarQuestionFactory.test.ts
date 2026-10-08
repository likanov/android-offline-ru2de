import { makeGrammarQuestion, validateGrammarQuestion } from '../../src/features/grammar/grammarQuestionFactory';
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
  const first=makeGrammarQuestion({ ...base, attemptId:'same' });
  const second=makeGrammarQuestion({ ...base, attemptId:'same' });
  if(first.catalogVersion!==1 || second.catalogVersion!==1) throw new Error('Expected legacy questions');
  expect(first.options).toEqual(second.options);
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

test('all_choice_buttons_have_four_distinct_german_forms_without_translation', () => {
  for (const target of grammarTargets) for (const variantIndex of [0, 1, 2]) {
    const q = makeGrammarQuestion({ attemptId: `${target.id}-${variantIndex}`, sessionId: 's', profileId: 'p', targetId: target.id, responseMode: 'choice', reviewStage: null, dueDay: null, variantIndex, words: [] });
    if(q.catalogVersion!==1) throw new Error('Expected legacy question');
    const labels = q.options.map(option => option.label);
    expect(labels).toHaveLength(4);
    expect(new Set(labels).size).toBe(4);
    expect(labels.every(label => /^[A-Za-z]+$/.test(label))).toBe(true);
    expect(q.options.find(option => option.id === q.expected.optionId)!.label).toBe(q.expected.token);
  }
});

test.each(['sie_feminine', 'sie_plural', 'sie_formal'] as const)('internal_%s_distinguishes_ordinary_and_formal_sie', pronounId => {
  const q = makeGrammarQuestion({ attemptId: pronounId, sessionId: 's', profileId: 'p', targetId: `pronoun-cloze:${pronounId}`, responseMode: 'choice', reviewStage: null, dueDay: null, variantIndex: 2, words: [] });
  expect(q.options.map(option => option.label)).toEqual(expect.arrayContaining(['sie', 'Sie']));
  expect(q.options.filter(option => option.label === 'sie')).toHaveLength(1);
  expect(q.options.filter(option => option.label === 'Sie')).toHaveLength(1);
});

test('dependencies_are_profile_scoped_and_match_rendered_noun', () => {
  const q = makeGrammarQuestion({ attemptId: 'dep', sessionId: 's', profileId: 'p', targetId: 'pronoun-cloze:er' as GrammarTargetId, responseMode: 'choice', reviewStage: null, dueDay: null, variantIndex: 1, words: [
    { id: 'foreign', profileId: 'other', de: 'Tisch', ru: 'стол', pos: 'noun', gender: 'm', plural: 'Tische', exampleDe: null, exampleRu: null, note: '', revision: 1 } as any,
    { id: 'owned', profileId: 'p', de: 'Tisch', ru: 'стол', pos: 'noun', gender: 'm', plural: 'Tische', exampleDe: null, exampleRu: null, note: '', revision: 2 } as any,
  ]});
  expect(q.dependencies).toEqual([expect.objectContaining({ wordId: 'owned', profileId: 'p' })]);
  expect(q.feedback.sentenceDe).toContain('Der Tisch');
});

test('trusted_dictionary_rows_reject_forged_dependency_identity', () => {
  const word = { id: 'owned', profileId: 'p', de: 'Tisch', ru: 'стол', pos: 'noun', gender: 'm', plural: 'Tische', exampleDe: null, exampleRu: null, note: '', revision: 2 } as any;
  const question = makeGrammarQuestion({ attemptId: 'trusted', sessionId: 's', profileId: 'p', targetId: 'pronoun-cloze:er' as GrammarTargetId, responseMode: 'choice', reviewStage: null, dueDay: null, variantIndex: 1, words: [word] });
  expect(() => validateGrammarQuestion({ ...question, dependencies: [{ ...question.dependencies[0], wordId: 'forged' }] }, [word])).toThrow('GRAMMAR_QUESTION_INVALID');
});
