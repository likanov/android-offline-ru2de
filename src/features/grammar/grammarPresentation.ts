import type { GrammarKind, GrammarQuestion } from './grammarTypes';

export function grammarInstruction(kind: GrammarKind, responseMode: GrammarQuestion['responseMode']): string {
  if (kind === 'pronoun-cloze') return responseMode === 'typed' ? 'Введите местоимение' : 'Выберите местоимение';
  return responseMode === 'typed' ? 'Введите форму sein' : 'Выберите форму sein';
}
