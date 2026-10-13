import type { GrammarKind, GrammarQuestion, GrammarLesson } from './grammarTypes';

export function grammarInstruction(kind: GrammarKind, responseMode: GrammarQuestion['responseMode']): string {
  if (kind === 'pronoun-cloze') return responseMode === 'typed' ? 'Введите местоимение' : 'Выберите местоимение';
  return responseMode === 'typed' ? 'Введите форму sein' : 'Выберите форму sein';
}

export const lektion2Lessons = [
  { lesson: 'professions-pronoun', title: 'Профессии: местоимения' },
  { lesson: 'professions-sein', title: 'Профессии: sein' },
  { lesson: 'demonstrative-statement', title: 'Указательные местоимения' },
  { lesson: 'yesno-transform', title: 'Преобразование в вопрос' },
  { lesson: 'yesno-translation', title: 'Перевод вопросов' },
] as const;

export const lektion3Lessons = [
  { lesson: 'noun-article', title: 'Артикли: единственное и множественное число' },
  { lesson: 'noun-plural', title: 'Образуйте множественное число' },
  { lesson: 'plural-invariant', title: 'Найдите неизменяемые формы' },
] as const;

export function grammarLessonTitle(lesson: GrammarLesson): string {
  return [...lektion2Lessons, ...lektion3Lessons].find(entry => entry.lesson === lesson)?.title ??
    (lesson === 'pronouns' ? 'Личные местоимения' : lesson === 'sein' ? 'Глагол sein' : 'Местоимения и sein');
}

/** Prompt text contains only the saved question, never its verified solution. */
export function grammarQuestionPrompt(question: GrammarQuestion): { instructionRu: string; prompt: string; sourceDe: string | null } {
  if (question.catalogVersion === 3) {
    if (question.kind === 'noun-plural') return { instructionRu: 'Введите артикль и существительное во множественном числе', prompt: question.sourcePhraseDe, sourceDe: null };
    if (question.kind === 'plural-invariant') return { instructionRu: question.contextRu, prompt: question.contextRu, sourceDe: null };
    return { instructionRu: question.responseMode === 'typed' ? 'Введите определённый артикль' : 'Выберите определённый артикль', prompt: `${question.beforeDe}___${question.afterDe}`, sourceDe: null };
  }
  if (question.catalogVersion === 2 && question.presentation === 'sentence') return { instructionRu: 'Напишите полное предложение.', prompt: question.promptRu, sourceDe: question.sourceSentenceDe };
  return { instructionRu: question.catalogVersion === 2 ? 'Вставьте пропущенное слово.' : grammarInstruction(question.kind, question.responseMode), prompt: `${question.beforeDe}___${question.afterDe}`, sourceDe: null };
}

export function grammarExpectedAnswer(question: GrammarQuestion): string {
  if (question.catalogVersion === 3 && question.kind === 'plural-invariant') return question.expected.optionIds.map(id => question.options.find(option => option.id === id)!.label).join(', ');
  if (question.catalogVersion === 3 && question.kind === 'noun-plural') return question.expected.phrases.join(' / ');
  if (question.catalogVersion === 2 && question.presentation === 'sentence') return question.expected.sentences.join(' / ');
  return question.expected.token;
}
