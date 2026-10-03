export type DayKey = string;
export type Skill = "translation" | "writing" | "article" | "listening";
export type Word = {
  id: string;
  profileId: string;
  de: string;
  ru: string;
  pos: "noun" | "adjective";
  gender: "m" | "f" | "n" | null;
  plural: string | null;
  exampleDe: string | null;
  exampleRu: string | null;
  note: string;
  icon?: string | null;
  revision?: number;
};
export type LearningState = {
  streak: number;
  mastered: boolean;
  masteryBonusGranted: boolean;
  reviewStage: number;
  dueDay: DayKey | null;
  difficult: boolean;
  totalErrors: number;
  recoveryErrors: number;
  recoveryCorrect: number;
};
export type LearningTransition = {
  state: LearningState;
  xpDelta: number;
  firstMastery: boolean;
};
export type WordDraft = Pick<Word, 'de'|'ru'|'pos'|'gender'> & Partial<Pick<Word,'plural'|'exampleDe'|'exampleRu'|'note'>> & { icon?: string | null };
