import { AppState, Text } from 'react-native';
import { subscribeProfileChanges } from './refreshBus';
import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from "react";
import type { Profile } from "../core/types";
import { useAppServices } from "./AppServices";
import {
  getActiveProfile,
  setActiveProfile,
} from "../features/profiles/profileRepository";
type ActiveProfile = {
  profile: Profile | null;
  select(profileId: string): Promise<void>;
  reload(): Promise<void>;
};
const Context = createContext<ActiveProfile>({
  profile: null,
  select: async () => {},
  reload: async () => {},
});
export const useActiveProfile = () => useContext(Context);
export function ActiveProfileProvider({ children }: React.PropsWithChildren) {
  const { db, reminders } = useAppServices();
  const [reminderError, setReminderError] = useState('');
  const [profile, setProfile] = useState<Profile | null>(null);
  const reload = useCallback(async () => {
    setProfile(await getActiveProfile(db));
  }, [db]);
  const select = useCallback(
    async (id: string) => {
      await setActiveProfile(db, id);
      await reload();
    },
    [db, reload],
  );
  useEffect(() => {
    let mounted = true;
    void getActiveProfile(db).then((saved) => {
      if (mounted) setProfile(saved);
    });
    return () => {
      mounted = false;
    };
  }, [db]);
  const profileId = profile?.id;
  useEffect(() => {
    if (!profileId) return;
    let alive = true;
    const off = subscribeProfileChanges(profileId, () => {
      void getActiveProfile(db).then(saved => { if (alive) setProfile(saved); });
    });
    return () => { alive = false; off(); };
  }, [db, profileId]);
  useEffect(() => {
    if (!reminders) return;
    const reconcile = () => {
      void reminders.reconcile(profileId ?? null).then(() => setReminderError('')).catch(() => setReminderError('Не удалось обновить напоминание. Откройте настройки напоминаний.'));
    };
    reconcile();
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') reconcile(); });
    return () => subscription.remove();
  }, [reminders, profileId]);
  return (
    <Context.Provider value={{ profile, select, reload }}>
      {children}
      {reminderError ? <Text accessibilityRole="alert">{reminderError}</Text> : null}
    </Context.Provider>
  );
}
