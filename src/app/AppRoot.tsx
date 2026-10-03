import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text } from "react-native";
import { openAppDb } from "../core/sql";
import { migrate } from "../core/migrations";
import { AppServices, AppServicesContext, getReminderService } from "./AppServices";
import { ActiveProfileProvider } from "./ActiveProfileProvider";
import { Navigation } from "./navigation";
import { Screen } from "../ui/Screen";
export function AppRoot() {
  const [services, setServices] = useState<AppServices | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    void (async () => {
      try {
        const db = await openAppDb();
        await migrate(db);
        if (mounted) setServices({ db, reminders: getReminderService({ db }) });
      } catch {
        if (mounted)
          setError(
            "Не удалось открыть локальную базу. Перезапустите приложение.",
          );
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);
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
