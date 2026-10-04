import type { AttemptResult, Question } from '../learning/questionTypes';
import type { Word } from '../learning/learningTypes';
import type { WordRevision } from './assistantTypes';

export type PracticeRequest =
    | { kind: 'error'; profileId: string; attemptId: string }
    | { kind: 'cloze'; profileId: string; wordIds: string[] }
    | { kind: 'difficult'; profileId: string; wordIds: string[] };

export type ErrorExplanation = {
    kind: 'error';
    profileId: string;
    attemptId: string;
    submittedAnswer: string | null;
    expected: string[];
    text: string;
    referenceTitle: string | null;
};

export type ClozeExercise = {
    wordId: string;
    revision: number;
    before: string;
    after: string;
    expected: string[];
    sentenceDe: string;
    translationRu: string;
};

export type ClozePractice = {
    kind: 'cloze' | 'difficult';
    profileId: string;
    exercises: ClozeExercise[];
    dependencies: WordRevision[];
};

export type PracticeResult = ErrorExplanation | ClozePractice;

export type ErrorContext = {
    question: Question;
    result: Omit<AttemptResult, 'submittedAnswer'> & { submittedAnswer: string | null };
    word: Word;
    reference: { title: string; text: string } | null;
};
