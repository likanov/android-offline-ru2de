import type { Word } from '../learning/learningTypes';
export type HelpMode = 'association' | 'example' | 'text' | 'rule';
export type RuleTopic = 'gender' | 'articles';
export type WordRevision = {
    wordId: string;
    revision: number;
};
export type HelperRequest = {
    profileId: string;
    wordId: string;
    mode: HelpMode;
    selectedWordIds: string[];
    ruleTopic: RuleTopic | null;
};
export type HelperDraft = {
    requestId: string;
    profileId: string;
    wordId: string;
    mode: HelpMode;
    ruleTopic: RuleTopic | null;
    text: string;
    dependencies: WordRevision[];
    referenceTitle: string | null;
};
export type AssistantContext = {
    request: HelperRequest;
    word: Word;
    selectedWords: Word[];
    dependencies: WordRevision[];
    reference: {
        title: string;
        text: string;
    } | null;
};
