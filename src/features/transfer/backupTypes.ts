import type { GrammarRulesTransition } from '../grammar/grammarRuleTypes';
import type { Profile } from '../../core/types';
import type { Word, Skill } from '../learning/learningTypes';
import type { Session, Question, AttemptResult } from '../learning/questionTypes';
import type { GrammarAttemptResult, GrammarProgress, GrammarQuestion, GrammarSession, GrammarTargetId, LegacyGrammarQuestion, LegacyGrammarTargetId, GrammarCatalogVersion, PreLektion3Question } from '../grammar/grammarTypes';
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
export type LegacyBackupWord = Omit<BackupWord, 'pos'> & { pos: 'noun' | 'adjective' };
export type LegacyProfileBackup = Omit<ProfileBackup, 'words'> & { words: LegacyBackupWord[] };
export type BackupV1 = {
    format: 'german-vocabulary-backup';
    version: 1;
    createdAt: string;
    profiles: LegacyProfileBackup[];
};
type LegacyGrammarProgress = Omit<GrammarProgress, 'targetId'> & { targetId: LegacyGrammarTargetId };
type HistoricalGrammarAttempt = Omit<GrammarAttemptResult, 'rulesVersion'> & { rulesVersion?: 1 };
type LegacyGrammarAttempt = Omit<HistoricalGrammarAttempt, 'targetId'> & { targetId: LegacyGrammarTargetId };
type LegacyBackupQuestion = Omit<LegacyGrammarQuestion, 'targetId'> & { targetId: LegacyGrammarTargetId };
type LegacyBackupSession = Omit<GrammarSession, 'selection' | 'targetIds' | 'currentQuestion' | 'result'> & { selection: { mode: 'study' | 'review'; lesson: 'mixed' | 'pronouns' | 'sein'; targetIds?: LegacyGrammarTargetId[] }; targetIds: LegacyGrammarTargetId[]; currentQuestion: LegacyBackupQuestion | null; result: LegacyGrammarAttempt | null };
export type GrammarProfileBackup = {
    catalogVersion: 1;
    progress: (LegacyGrammarProgress & { profileId: string })[];
    sessions: LegacyBackupSession[];
    questions: {
        question: LegacyBackupQuestion;
        status: 'active' | 'answered' | 'cancelled';
    }[];
    attempts: {
        profileId: string;
        sessionId: string;
        targetId: LegacyGrammarTargetId;
        day: string;
        result: LegacyGrammarAttempt;
    }[];
    rewards: {
        profileId: string;
        targetId: LegacyGrammarTargetId;
        attemptId: string;
        amount: 50;
        day: string;
    }[];
};
export type ProfileBackupV2 = LegacyProfileBackup & { grammar: GrammarProfileBackup };
export type BackupV2 = Omit<BackupV1, 'version' | 'profiles'> & {
    version: 2;
    profiles: ProfileBackupV2[];
};
export type GrammarProfileBackupV3 = {
    catalogVersions: (1 | 2)[];
    progress: (GrammarProgress & { profileId: string })[];
    sessions: (Omit<GrammarSession, 'currentQuestion' | 'result'> & { currentQuestion: PreLektion3Question | null; result: HistoricalGrammarAttempt | null })[];
    questions: { question: PreLektion3Question; status: 'active' | 'answered' | 'cancelled' }[];
    attempts: { profileId: string; sessionId: string; targetId: GrammarTargetId; day: string; result: HistoricalGrammarAttempt }[];
    rewards: { profileId: string; targetId: GrammarTargetId; attemptId: string; amount: 50; day: string }[];
};
export type ProfileBackupV3 = ProfileBackup & { grammar: GrammarProfileBackupV3 };
export type BackupV3 = Omit<BackupV1, 'version' | 'profiles'> & { version: 3; profiles: ProfileBackupV3[] };
export type GrammarProfileBackupV4 = Omit<GrammarProfileBackupV3, 'catalogVersions' | 'sessions' | 'questions' | 'attempts'> & {
    catalogVersions: GrammarCatalogVersion[];
    rulesVersion: 2;
    rulesTransitions: GrammarRulesTransition[];
    sessions: GrammarSession[];
    questions: { question: GrammarQuestion; status: 'active' | 'answered' | 'cancelled' }[];
    attempts: { profileId: string; sessionId: string; targetId: GrammarTargetId; day: string; result: GrammarAttemptResult }[];
};
export type ProfileBackupV4 = ProfileBackup & { grammar: GrammarProfileBackupV4 };
export type BackupV4 = Omit<BackupV3, 'version' | 'profiles'> & { version: 4; profiles: ProfileBackupV4[] };
export type RestorePreview = {
    backup: BackupV3 | BackupV4;
    profileCount: number;
    wordCount: number;
    grammarTargetCount: number;
};
export const BACKUP_MAX_BYTES = 50 * 1024 * 1024;
