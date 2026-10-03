import { createContext, useContext } from "react";
import type { SqlStore } from "../core/sql";
export type AppServices = { db: SqlStore };
export const AppServicesContext = createContext<AppServices | null>(null);
export function useAppServices(): AppServices {
  const services = useContext(AppServicesContext);
  if (!services) throw new Error("AppServices missing");
  return services;
}
