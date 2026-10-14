import type { GrammarQuestion } from '../grammar/grammarTypes';
import type { Question } from '../learning/questionTypes';

export function dictionaryResultAudioText(question: Question): string {
  if (question.kind === 'de-ru') return question.prompt;
  if (question.kind === 'definite-article' || question.kind === 'indefinite-article') {
    return `${question.expected[0]} ${question.prompt}`;
  }
  return question.expected[0];
}

export function grammarResultAudioText(question: GrammarQuestion): string {
  if (question.catalogVersion === 3 && question.kind === 'plural-invariant') {
    return question.feedback.items
      .filter(item => question.expected.optionIds.includes(item.nounId))
      .map(item => `${item.singularDe}. ${item.pluralDe}.`)
      .join(' ');
  }
  return question.feedback.sentenceDe;
}
