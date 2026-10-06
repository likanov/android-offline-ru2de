import type { Profile } from '../../core/types';
import type { Word, Skill } from '../learning/learningTypes';
import type { Session, Question, AttemptResult } from '../learning/questionTypes';
import type { GrammarAttemptResult, GrammarProgress, GrammarQuestion, GrammarSession, GrammarTargetId } from '../grammar/grammarTypes';
export type BackupWord = Word & {
    seedKey: string | null;
    seedDe: string | null;
    icon: string | null;
    revision: number;
    canonicalKey: string;
};
export type ProgressRow = {
    profileId: string;
    wordId: string;
    streak: number;
    learned: number;
    bonusAwarded: number;
    reviewStage: number;
    dueDate: string | null;
    difficult: number;
    totalErrors: number;
    recoveryErrors: number;
    recoveryCorrect: number;
};
export type SkillRow = {
    profileId: string;
    wordId: string;
    skill: Skill;
    correct: number;
    errors: number;
    revision: number;
};
export type HistoryRow = {
    attemptId: string;
    profileId: string;
    wordId: string;
    revision: number;
    skill: Skill;
    right: number;
    day: string;
};
export type QuestionRow = {
    attemptId: string;
    profileId: string;
    sessionId: string;
    wordId: string;
    revision: number;
    payload: Question & {
        nextKindIndex?: number;
    };
    status: 'active' | 'answered' | 'cancelled';
};
export type AttemptRow = {
    attemptId: string;
    profileId: string;
    sessionId: string;
    wordId: string;
    right: number;
    xpDelta: number;
    result: AttemptResult;
    day: string;
};
export type ProfileBackup = {
    profile: Profile;
    words: BackupWord[];
    progress: ProgressRow[];
    skillStats: SkillRow[];
    skillHistory: HistoryRow[];
    topics: {
        id: string;
        profileId: string;
        name: string;
    }[];
    wordTopics: {
        profileId: string;
        wordId: string;
        topicId: string;
    }[];
    settings: {
        profileId: string;
        dailyGoal: number;
    };
    dailyActivity: {
        profileId: string;
        day: string;
        correct: number;
        errors: number;
        xp: number;
    }[];
    aids: {
        id: string;
        profileId: string;
        content: string;
        stale: number;
    }[];
    aidWords: {
        aidId: string;
        profileId: string;
        wordId: string;
        revision: number;
    }[];
    sessions: Session[];
    questions: QuestionRow[];
    attempts: AttemptRow[];
    rewards: {
        profileId: string;
        wordId: string;
        attemptId: string;
        amount: number;
        day: string;
    }[];
};
export type BackupV1 = {
    format: 'german-vocabulary-backup';
    version: 1;
    createdAt: string;
    profiles: ProfileBackup[];
};
export type GrammarProfileBackup = {
    catalogVersion: 1;
    progress: (GrammarProgress & { profileId: string })[];
    sessions: GrammarSession[];
    questions: {
        question: GrammarQuestion;
        status: 'active' | 'answered' | 'cancelled';
    }[];
    attempts: {
        profileId: string;
        sessionId: string;
        targetId: GrammarTargetId;
        day: string;
        result: GrammarAttemptResult;
    }[];
    rewards: {
        profileId: string;
        targetId: GrammarTargetId;
        attemptId: string;
        amount: 50;
        day: string;
    }[];
};
export type ProfileBackupV2 = ProfileBackup & { grammar: GrammarProfileBackup };
export type BackupV2 = Omit<BackupV1, 'version' | 'profiles'> & {
    version: 2;
    profiles: ProfileBackupV2[];
};
export type RestorePreview = {
    backup: BackupV2;
    profileCount: number;
    wordCount: number;
    grammarTargetCount: number;
};
export const BACKUP_MAX_BYTES = 50 * 1024 * 1024;
