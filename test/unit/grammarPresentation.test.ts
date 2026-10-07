import { grammarInstruction } from '../../src/features/grammar/grammarPresentation';

test('grammar_instructions_match_response_mode', () => {
  expect(grammarInstruction('pronoun-cloze', 'typed')).toBe('Введите местоимение');
  expect(grammarInstruction('pronoun-cloze', 'choice')).toBe('Выберите местоимение');
  expect(grammarInstruction('sein-cloze', 'typed')).toBe('Введите форму sein');
  expect(grammarInstruction('sein-cloze', 'choice')).toBe('Выберите форму sein');
});
