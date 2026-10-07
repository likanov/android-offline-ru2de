import { trainingInstruction } from '../../src/features/learning/trainingPresentation';

test('instructions_match_question_and_part_of_speech', () => {
  expect(trainingInstruction('ru-de', 'noun')).toBe('Выберите перевод на немецком');
  expect(trainingInstruction('de-ru', 'adjective')).toBe('Выберите перевод на русском');
  expect(trainingInstruction('typing', 'noun')).toBe('Введите слово с определённым артиклем');
  expect(trainingInstruction('typing', 'adjective')).toBe('Введите слово на немецком');
  expect(trainingInstruction('definite-article', 'noun')).toBe('Выберите определённый артикль');
  expect(trainingInstruction('indefinite-article', 'noun')).toBe('Выберите неопределённый артикль');
  expect(trainingInstruction('listening', 'noun')).toBe('Прослушайте и введите слово с определённым артиклем');
  expect(trainingInstruction('listening', 'adjective')).toBe('Прослушайте и введите слово на немецком');
});
