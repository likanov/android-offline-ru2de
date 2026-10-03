import { CsvImportService } from '../src/features/transfer/csvImportService';
import { ProgressRepository } from '../src/features/progress/progressRepository';
import { TopicRepository } from '../src/features/topics/topicRepository';
import { ReviewRepository } from '../src/features/reviews/reviewRepository';
import { SessionRepository } from '../src/features/learning/sessionRepository';
import { AnswerService } from '../src/features/learning/answerService';
import { openTestDb } from './sqlite';
import { migrate } from '../src/core/migrations';
import { WordRepository } from '../src/features/dictionary/wordRepository';
jest.mock("expo-crypto", () => ({
    randomUUID: () => jest.requireActual("crypto").randomUUID(),
}));
// Reusable SQL fixture entry point for feature integration tests.
export async function createWordHarness() {
    const store = openTestDb();
    await migrate(store.db);
    const words = new WordRepository(store.db);
    return { ...store, words, csv: new CsvImportService(store.db), progress: new ProgressRepository(store.db), topics: new TopicRepository(store.db), reviews: new ReviewRepository(store.db), sessions: new SessionRepository(store.db), answers: new AnswerService(store.db),
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
