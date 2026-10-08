import { checkGrammarAnswer, makeGrammarQuestion } from '../../src/features/grammar/grammarQuestionFactory';
import { grammarTargets } from '../../src/features/grammar/grammarCatalog';
import type { GrammarQuestion } from '../../src/features/grammar/grammarTypes';
import { legacySiePluralQuestion } from '../fixtures/legacyGrammarQuestion';

const q = (targetId: any, variantIndex = 0, responseMode: 'choice'|'typed' = 'choice') => makeGrammarQuestion({ attemptId: 'a', sessionId: 's', profileId: 'p', targetId, responseMode, reviewStage: null, dueDay: null, variantIndex, words: [] });

test('internal_formal_sie_preserves_case', () => {
  const question = q('pronoun-cloze:sie_formal');
  if (question.position === 'initial') return;
  expect(checkGrammarAnswer(question, { kind: 'typed', text: ' sie ' })).toBe(false);
  expect(checkGrammarAnswer(question, { kind: 'typed', text: ' Sie ' })).toBe(true);
});

test('initial_plural_preserves_case', () => {
  const question = q('pronoun-cloze:sie_plural', 1, 'typed');
  if (question.position !== 'initial') return;
  expect(checkGrammarAnswer(question, { kind: 'typed', text: 'Sie' })).toBe(true);
  expect(checkGrammarAnswer(question, { kind: 'typed', text: 'sie' })).toBe(false);
});

test('invalid_answers_throw_and_valid_wrong_answers_are_false', () => {
  const question = q(grammarTargets[0].id);
  expect(() => checkGrammarAnswer(question, { kind: 'typed', text: '' })).toThrow('GRAMMAR_ANSWER_INVALID');
  expect(() => checkGrammarAnswer(question, { kind: 'typed', text: '   ' })).toThrow('GRAMMAR_ANSWER_INVALID');
  expect(() => checkGrammarAnswer(question, { kind: 'typed', text: 'x'.repeat(65) })).toThrow('GRAMMAR_ANSWER_INVALID');
  expect(() => checkGrammarAnswer(question, { kind: 'choice', optionId: 'unknown' as any })).toThrow('GRAMMAR_ANSWER_INVALID');
  expect(() => checkGrammarAnswer(question, { kind: 'wat' } as any)).toThrow('GRAMMAR_ANSWER_INVALID');
  const wrong = question.options.find(o => o.id !== question.expected.optionId)!;
  expect(checkGrammarAnswer(question, { kind: 'choice', optionId: wrong.id })).toBe(false);
});

test('response_mode_must_match_submission_kind', () => {
  const choice = q(grammarTargets[0].id, 0, 'choice');
  expect(() => checkGrammarAnswer(choice, { kind: 'typed', text: choice.expected.token })).toThrow('GRAMMAR_ANSWER_INVALID');
  const typed = q(grammarTargets[0].id, 0, 'typed');
  expect(() => checkGrammarAnswer(typed, { kind: 'choice', optionId: typed.expected.optionId })).toThrow('GRAMMAR_ANSWER_INVALID');
});

test('question_validation_rejects_modified_expected', () => {
  const question = q(grammarTargets[0].id);
  expect(() => checkGrammarAnswer({ ...question, expected: { ...question.expected, token: 'wrong' } }, { kind: 'typed', text: 'wrong' })).toThrow('GRAMMAR_QUESTION_INVALID');
});

test('question_validation_rejects_tampered_fields', () => {
  const question = q('pronoun-cloze:ich', 1, 'choice');
  expect(() => checkGrammarAnswer({ ...question, options: question.options.map((option, index) => index === 0 ? { ...option, label: 'подмена' } : option) }, { kind: 'choice', optionId: question.expected.optionId })).toThrow('GRAMMAR_QUESTION_INVALID');
  expect(() => checkGrammarAnswer({ ...question, feedback: { ...question.feedback, ruleId: 'sein-present' } }, { kind: 'choice', optionId: question.expected.optionId })).toThrow('GRAMMAR_QUESTION_INVALID');
  expect(() => checkGrammarAnswer({ ...question, dependencies: [{ wordId: 'other', revision: 1, de: 'Tisch', ru: 'стол', gender: 'm', plural: 'Tische' }] }, { kind: 'choice', optionId: question.expected.optionId })).toThrow('GRAMMAR_QUESTION_INVALID');
});

test('legacy_question_accepts_a_current_german_distractor_for_grading', () => {
  const question = legacySiePluralQuestion(q('pronoun-cloze:sie_plural'));
  expect(checkGrammarAnswer(question, { kind: 'choice', optionId: 'du' })).toBe(false);
});

test('legacy_question_keeps_historical_semantic_answer_results', () => {
  const question = legacySiePluralQuestion(q('pronoun-cloze:sie_plural'));
  expect(checkGrammarAnswer(question, { kind: 'choice', optionId: 'sie_plural' })).toBe(true);
  expect(checkGrammarAnswer(question, { kind: 'choice', optionId: 'sie_feminine' })).toBe(false);
  expect(checkGrammarAnswer(question, { kind: 'choice', optionId: 'sie_formal' })).toBe(false);
});

test('compatible_legacy_options_still_reject_tampered_labels_and_ids', () => {
  const question = legacySiePluralQuestion(q('pronoun-cloze:sie_plural'));
  expect(() => checkGrammarAnswer({ ...question, options: question.options.map((option, index) => index === 0 ? { ...option, label: 'sie — подсказка' } : option) }, { kind: 'choice', optionId: 'sie_plural' })).toThrow('GRAMMAR_QUESTION_INVALID');
  expect(() => checkGrammarAnswer({ ...question, options: question.options.map((option, index) => index === 0 ? { ...option, id: 'du' } : option) }, { kind: 'choice', optionId: 'du' })).toThrow('GRAMMAR_QUESTION_INVALID');
});
