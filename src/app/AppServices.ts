import { ProgressRepository } from '../features/progress/progressRepository';
import { TopicRepository } from '../features/topics/topicRepository';
import { ReviewRepository } from '../features/reviews/reviewRepository';
import { SessionRepository } from '../features/learning/sessionRepository';
import { AnswerService } from '../features/learning/answerService';
import { WordRepository } from "../features/dictionary/wordRepository";
import { createContext, useContext } from "react";
import type { SqlStore } from "../core/sql";
import { ModelFiles } from "../features/assistant/modelFiles";
import { createLlamaRuntime, inspectModel, } from "../features/assistant/llamaRuntime";
import type { SetupServices } from "../features/assistant/ModelSetupScreen";
import type { ModelManifest } from "../features/assistant/runtimeTypes";
import { localFiles } from "../../modules/german-offline";
export type AppServices = {
    db: SqlStore;
};
export const AppServicesContext = createContext<AppServices | null>(null);
export function useAppServices(): AppServices {
    const services = useContext(AppServicesContext);
    if (!services)
        throw new Error("AppServices missing");
    return services;
}
// Assistant services are created only when model setup is opened, so an optional
// inference failure cannot prevent the independent SQLite dictionary from starting.
const assistants = new WeakMap<SqlStore, SetupServices>();
export function getAssistantServices(app: AppServices): SetupServices {
    const existing = assistants.get(app.db);
    if (existing)
        return existing;
    const adapter = localFiles();
    const choose = async () => {
        const { getDocumentAsync } = await import("expo-document-picker");
        const result = await getDocumentAsync({
            type: "*/*",
            copyToCacheDirectory: false,
            multiple: false,
        });
        return result.canceled ? null : result.assets[0].uri;
    };
    const services: SetupServices = {
        files: new ModelFiles(app.db, adapter, inspectModel),
        runtime: createLlamaRuntime(),
        chooseModel: choose,
        chooseManifest: async () => {
            const uri = await choose();
            return uri
                ? (JSON.parse(await adapter.readText(uri)) as ModelManifest)
                : null;
        },
        subscribeProgress: adapter.subscribeProgress,
    };
    assistants.set(app.db, services);
    return services;
}
const dictionaries = new WeakMap<SqlStore, WordRepository>();
export function getWordRepository(app: AppServices): WordRepository {
    const existing = dictionaries.get(app.db);
    if (existing)
        return existing;
    const words = new WordRepository(app.db);
    dictionaries.set(app.db, words);
    return words;
}
const training = new WeakMap<SqlStore, {
    sessions: SessionRepository;
    answers: AnswerService;
}>();
export function getTrainingServices(app: AppServices) { let value = training.get(app.db); if (!value) {
    value = { sessions: new SessionRepository(app.db), answers: new AnswerService(app.db) };
    training.set(app.db, value);
} return value; }

const reviews = new WeakMap<SqlStore, ReviewRepository>();
export function getReviewRepository(app: AppServices): ReviewRepository {
    let value = reviews.get(app.db);
    if (!value) { value = new ReviewRepository(app.db); reviews.set(app.db, value); }
    return value;
}

const topics = new WeakMap<SqlStore, TopicRepository>();
export function getTopicRepository(app: AppServices): TopicRepository {
 let value=topics.get(app.db);
 if(!value){value=new TopicRepository(app.db);topics.set(app.db,value);}
 return value;
}

const progress = new WeakMap<SqlStore, ProgressRepository>();
export function getProgressRepository(app: AppServices): ProgressRepository {
 let value=progress.get(app.db);if(!value){value=new ProgressRepository(app.db);progress.set(app.db,value);}return value;
}
