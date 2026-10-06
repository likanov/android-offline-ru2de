import { checkGrammarAnswer, makeGrammarQuestion } from '../../src/features/grammar/grammarQuestionFactory';
import { grammarTargets } from '../../src/features/grammar/grammarCatalog';
import type { GrammarQuestion } from '../../src/features/grammar/grammarTypes';

const q = (targetId: any, variantIndex = 0, responseMode: 'choice'|'typed' = 'typed') => makeGrammarQuestion({ attemptId: 'a', sessionId: 's', profileId: 'p', targetId, responseMode, reviewStage: null, dueDay: null, variantIndex, words: [] });

test('internal_formal_sie_preserves_case', () => {
  const question = q('pronoun-cloze:sie_formal');
  if (question.position === 'initial') return;
  expect(checkGrammarAnswer(question, { kind: 'typed', text: ' sie ' })).toBe(false);
  expect(checkGrammarAnswer(question, { kind: 'typed', text: ' Sie ' })).toBe(true);
});

test('initial_plural_preserves_case', () => {
  const question = q('pronoun-cloze:sie_plural', 1);
  if (question.position !== 'initial') return;
  expect(checkGrammarAnswer(question, { kind: 'typed', text: 'Sie' })).toBe(true);
  expect(checkGrammarAnswer(question, { kind: 'typed', text: 'sie' })).toBe(false);
});

test('invalid_answers_throw_and_valid_wrong_answers_are_false', () => {
  const question = q(grammarTargets[0].id);
  expect(() => checkGrammarAnswer(question, { kind: 'typed', text: '' })).toThrow('GRAMMAR_ANSWER_INVALID');
  expect(() => checkGrammarAnswer(question, { kind: 'typed', text: 'x'.repeat(65) })).toThrow('GRAMMAR_ANSWER_INVALID');
  expect(() => checkGrammarAnswer(question, { kind: 'choice', optionId: 'unknown' as any })).toThrow('GRAMMAR_ANSWER_INVALID');
  expect(() => checkGrammarAnswer(question, { kind: 'wat' } as any)).toThrow('GRAMMAR_ANSWER_INVALID');
  const wrong = question.options.find(o => o.id !== question.expected.optionId)!;
  expect(checkGrammarAnswer(question, { kind: 'choice', optionId: wrong.id })).toBe(false);
});

test('question_validation_rejects_modified_expected', () => {
  const question = q(grammarTargets[0].id) as GrammarQuestion;
  expect(() => checkGrammarAnswer({ ...question, expected: { ...question.expected, token: 'wrong' } }, { kind: 'typed', text: 'wrong' })).toThrow('GRAMMAR_QUESTION_INVALID');
});
