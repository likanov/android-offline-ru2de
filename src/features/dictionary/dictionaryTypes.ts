import type { DayKey, Word } from '../learning/learningTypes';
import type { Topic } from '../topics/topicRepository';

export type DictionaryProgress = {
  streak: number;
  mastered: boolean;
  difficult: boolean;
  dueDay: DayKey | null;
  started: boolean;
};

export type DictionaryEntry = Word & {
  learning: DictionaryProgress;
  topicIds: string[];
};

export type DictionarySnapshot = {
  profileId: string;
  entries: DictionaryEntry[];
  topics: Topic[];
};
