import { AssistantService } from '../features/assistant/assistantService';
import { BackupService } from '../features/transfer/backupService';
import { CsvImportService } from '../features/transfer/csvImportService';
import { ReminderService } from '../features/reminders/reminderService';
import { createNotificationPort } from '../features/reminders/expoNotificationPort';
import { createAudioService } from '../features/audio/audioAdapters';
import type { AudioService } from '../features/audio/audioService';
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
    assistant?: AssistantService;
    reminders?: ReminderService;
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
    // Resolve optional native files only when an operation actually uses them.
    const adapter = {
        initialize: async () => localFiles().initialize(),
        exists: async (path: string) => localFiles().exists(path),
        remove: async (path: string) => localFiles().remove(path),
        copyVerified: async (...args: Parameters<ReturnType<typeof localFiles>['copyVerified']>) => localFiles().copyVerified(...args),
        cancelCopy: async (id: string) => localFiles().cancelCopy(id),
        readText: async (uri: string) => localFiles().readText(uri),
        subscribeProgress: (listener: Parameters<NonNullable<ReturnType<typeof localFiles>['subscribeProgress']>>[0]) => {
            try { return localFiles().subscribeProgress!(listener); } catch { return {remove: () => {}}; }
        },
    };
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
    value = { sessions: new SessionRepository(app.db, word => getAudioService(app).available(word)), answers: new AnswerService(app.db) };
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

const audio = new WeakMap<SqlStore, AudioService>();
export function getAudioService(app: AppServices): AudioService {
 let value=audio.get(app.db);if(!value){value=createAudioService();audio.set(app.db,value);}return value;
}

const reminders = new WeakMap<SqlStore, ReminderService>();
export function getReminderService(app: AppServices): ReminderService {
  let value = reminders.get(app.db);
  if (!value) { value = new ReminderService(getProgressRepository(app), createNotificationPort()); reminders.set(app.db, value); }
  return value;
}

const transfers = new WeakMap<SqlStore, CsvImportService>();
export function getCsvImportService(app: AppServices): CsvImportService {
 let value=transfers.get(app.db);if(!value){value=new CsvImportService(app.db);transfers.set(app.db,value);}return value;
}

const backups=new WeakMap<SqlStore,BackupService>();
export function getBackupService(app:AppServices):BackupService {let value=backups.get(app.db);if(!value){value=new BackupService(app.db);backups.set(app.db,value);}return value;}

const memoryAssistants = new WeakMap<SqlStore, AssistantService>();
export function getMemoryAssistant(app: AppServices): AssistantService {
    if (app.assistant) return app.assistant;
    let value=memoryAssistants.get(app.db);
    if (!value) { const setup=getAssistantServices(app); value=new AssistantService(app.db,getWordRepository(app),setup.files,setup.runtime); memoryAssistants.set(app.db,value); }
    return value;
}
// Lifecycle cleanup must not instantiate an optional model during dictionary use.
export async function cancelAssistant(app: AppServices): Promise<void> {
    await (app.assistant ?? memoryAssistants.get(app.db))?.cancelAndRelease();
}
