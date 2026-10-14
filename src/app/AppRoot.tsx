import React, { useEffect, useState } from "react";
import { ActivityIndicator, AppState, Text } from "react-native";
import { openAppDb } from "../core/sql";
import { migrate } from "../core/migrations";
import { mountAppDatabase } from "./databaseLifecycle";
import { AppServices, AppServicesContext, getReminderService, cancelAssistant } from "./AppServices";
import { ActiveProfileProvider } from "./ActiveProfileProvider";
import { Navigation } from "./navigation";
import { Screen } from "../ui/Screen";
export function AppRoot() {
  const [services, setServices] = useState<AppServices | null>(null);
  const [error, setError] = useState("");
  useEffect(() => mountAppDatabase({
    open: openAppDb,
    migrate,
    onReady: db => setServices({ db, reminders: getReminderService({ db }) }),
    onError: () => setError("Не удалось открыть локальную базу. Перезапустите приложение."),
  }), []);
  useEffect(() => {
    if (!services) return;
    const subscription=AppState.addEventListener("change",state => { if(state !== "active") void cancelAssistant(services).catch(() => {}); });
    return () => { subscription.remove(); void cancelAssistant(services).catch(() => {}); };
  }, [services]);
  if (!services)
    return (
      <Screen>
        {error ? (
          <Text accessibilityRole="alert">{error}</Text>
        ) : (
          <ActivityIndicator accessibilityLabel="Открываем словарь" />
        )}
      </Screen>
    );
  return (
    <AppServicesContext.Provider value={services}>
      <ActiveProfileProvider>
        <Navigation />
      </ActiveProfileProvider>
    </AppServicesContext.Provider>
  );
}
