import type { QuizKind } from './questionTypes';
import type { Word } from './learningTypes';

export function trainingInstruction(kind: QuizKind, pos: Word['pos']): string {
  if (kind === 'ru-de') return 'Выберите перевод на немецком';
  if (kind === 'de-ru') return 'Выберите перевод на русском';
  if (kind === 'typing') return pos === 'noun' ? 'Введите слово с определённым артиклем' : 'Введите слово на немецком';
  if (kind === 'definite-article') return 'Выберите определённый артикль';
  if (kind === 'indefinite-article') return 'Выберите неопределённый артикль';
  return pos === 'noun' ? 'Прослушайте и введите слово с определённым артиклем' : 'Прослушайте и введите слово на немецком';
}
