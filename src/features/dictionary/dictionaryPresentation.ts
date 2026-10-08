import { wordParts, type WordPart } from './wordParts';
import { addDays } from '../../core/calendar';
import type { DayKey } from '../learning/learningTypes';
import type { DictionaryProgress } from './dictionaryTypes';

export function wordLearningLabel(progress: DictionaryProgress): string {
  if (progress.mastered) return 'Изучено';
  if (progress.started) return `В процессе · ${progress.streak}/20`;
  return 'Новое';
}

export function formatReviewDay(day: DayKey): string {
  const valid = addDays(day, 0);
  const [year, month, date] = valid.split('-');
  return `${date}.${month}.${year}`;
}

export function wordPartLabel(part: WordPart): string {
  return wordParts.find(value => value.value === part)!.labelRu;
}
