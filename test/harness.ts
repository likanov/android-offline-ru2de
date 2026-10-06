import { AssistantService } from '../src/features/assistant/assistantService';
import { AidRepository } from '../src/features/assistant/aidRepository';
import { LlamaRuntime } from '../src/features/assistant/llamaRuntime';
import type { LanguageRuntime } from '../src/features/assistant/runtimeTypes';
import type { ModelFiles } from '../src/features/assistant/modelFiles';
import { BackupService } from '../src/features/transfer/backupService';
import { CsvImportService } from '../src/features/transfer/csvImportService';
import { ProgressRepository } from '../src/features/progress/progressRepository';
import { TopicRepository } from '../src/features/topics/topicRepository';
import { ReviewRepository } from '../src/features/reviews/reviewRepository';
import { SessionRepository } from '../src/features/learning/sessionRepository';
import { AnswerService } from '../src/features/learning/answerService';
import { openTestDb } from './sqlite';
import { migrate } from '../src/core/migrations';
import { WordRepository } from '../src/features/dictionary/wordRepository';
import { GrammarRepository } from '../src/features/grammar/grammarRepository';
import { GrammarSessionRepository } from '../src/features/grammar/grammarSessionRepository';
jest.mock("expo-crypto", () => ({
    randomUUID: () => jest.requireActual("crypto").randomUUID(),
}));
// Reusable SQL fixture entry point for feature integration tests.
export async function createWordHarness(path?: string) {
    const store = openTestDb(path);
    await migrate(store.db);
    const words = new WordRepository(store.db);
    return { ...store, words, backup: new BackupService(store.db), csv: new CsvImportService(store.db), progress: new ProgressRepository(store.db), topics: new TopicRepository(store.db), reviews: new ReviewRepository(store.db), sessions: new SessionRepository(store.db), answers: new AnswerService(store.db),
        attemptCount: async (attemptId: string) => (await store.db.first<{
            n: number;
        }>("SELECT count(*) AS n FROM attempts WHERE attemptId=?", [attemptId]))!.n,
        profile: (id: string) => store.db.first<import('../src/core/types').Profile>('SELECT * FROM profiles WHERE id=?', [id]),
        wordState: async (profileId: string, wordId: string): Promise<import('../src/features/learning/learningTypes').LearningState> => {
            await words.get(profileId, wordId);
            const row = await store.db.first<{
                streak: number;
                learned: number;
                bonusAwarded: number;
                reviewStage: number;
                dueDate: string | null;
                difficult: number;
                totalErrors: number;
                recoveryErrors: number;
                recoveryCorrect: number;
            }>('SELECT * FROM word_progress WHERE profileId=? AND wordId=?', [profileId, wordId]);
            if (!row)
                throw new Error('Missing word progress');
            return { streak: row.streak, mastered: !!row.learned, masteryBonusGranted: !!row.bonusAwarded, reviewStage: row.reviewStage, dueDay: row.dueDate, difficult: !!row.difficult, totalErrors: row.totalErrors, recoveryErrors: row.recoveryErrors, recoveryCorrect: row.recoveryCorrect };
        }
    };
}
export async function createGrammarHarness(path?: string) {
    const h = await createWordHarness(path);
    return { ...h, grammar: new GrammarRepository(h.db), grammarSessions: new GrammarSessionRepository(h.db) };
}
export async function createAssistantHarness(runtime: LanguageRuntime = new LlamaRuntime(async () => ({ completion: async () => ({ text: 'Das ist ein Stuhl. Это стул.' }), stopCompletion: async () => { }, release: async () => { } })), files: Pick<ModelFiles, 'installedPath'> = { installedPath: async () => '/models/local.gguf' }, path?: string) {
    const h = await createWordHarness(path);
    return { ...h, assistant: new AssistantService(h.db, h.words, files, runtime), aids: new AidRepository(h.db) };
}
