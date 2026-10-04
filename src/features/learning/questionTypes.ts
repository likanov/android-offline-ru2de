import type { DayKey, LearningState, Word } from './learningTypes';
export type QuizKind = 'ru-de' | 'de-ru' | 'typing' | 'definite-article' | 'indefinite-article' | 'listening';
export type Question = {
    attemptId: string;
    profileId: string;
    wordId: string;
    revision: number;
    kind: QuizKind;
    prompt: string;
    options: string[];
    expected: string[];
    markerVisible: boolean;
    reviewStage: number | null;
    dueDay: DayKey | null;
};
export type TrainingSelection = {
    mode: 'study' | 'review';
    wordIds?: string[];
};
export type AudioAvailability = (word: Word) => Promise<boolean>;
export type AttemptResult = {
    attemptId: string;
    right: boolean;
    xpDelta: number;
    state: LearningState;
    submittedAnswer?: string;
};
export type Session = {
    id: string;
    profileId: string;
    mode: 'study' | 'review';
    wordIds: string[];
    cursor: number;
    kindIndex: number;
    currentQuestion: Question | null;
    result: AttemptResult | null;
    status: 'active' | 'completed' | 'cancelled';
};
