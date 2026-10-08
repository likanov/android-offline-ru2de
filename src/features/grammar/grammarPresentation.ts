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

export function grammarLessonTitle(lesson: GrammarLesson): string {
  return lektion2Lessons.find(entry => entry.lesson === lesson)?.title ??
    (lesson === 'pronouns' ? 'Личные местоимения' : lesson === 'sein' ? 'Глагол sein' : 'Местоимения и sein');
}
