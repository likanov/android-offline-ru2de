import { WordRepository } from "../features/dictionary/wordRepository";
import { createContext, useContext } from "react";
import type { SqlStore } from "../core/sql";
import { ModelFiles } from "../features/assistant/modelFiles";
import {
  createLlamaRuntime,
  inspectModel,
} from "../features/assistant/llamaRuntime";
import type { SetupServices } from "../features/assistant/ModelSetupScreen";
import type { ModelManifest } from "../features/assistant/runtimeTypes";
import { localFiles } from "../../modules/german-offline";
export type AppServices = { db: SqlStore };
export const AppServicesContext = createContext<AppServices | null>(null);
export function useAppServices(): AppServices {
  const services = useContext(AppServicesContext);
  if (!services) throw new Error("AppServices missing");
  return services;
}

// Assistant services are created only when model setup is opened, so an optional
// inference failure cannot prevent the independent SQLite dictionary from starting.
const assistants = new WeakMap<SqlStore, SetupServices>();
export function getAssistantServices(app: AppServices): SetupServices {
  const existing = assistants.get(app.db);
  if (existing) return existing;
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
 const existing=dictionaries.get(app.db); if(existing) return existing;
 const words=new WordRepository(app.db); dictionaries.set(app.db,words); return words;
}
