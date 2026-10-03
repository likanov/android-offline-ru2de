import type { ProgressRepository } from '../progress/progressRepository';
export interface NotificationPort {
  permission(): Promise<'granted' | 'denied' | 'undetermined'>;
  requestPermission(): Promise<'granted' | 'denied'>;
  cancelAllReminders(): Promise<void>;
  scheduleDaily(profileId: string, hour: number, minute: number): Promise<string>;
}
export type ReminderStatus = 'scheduled' | 'disabled' | 'denied';
export class ReminderService {
  private pending: Promise<unknown> = Promise.resolve();
  private activeProfileId: string | null = null;
  constructor(private settings: ProgressRepository, private notifications: NotificationPort) {}
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const next = this.pending.then(work);
    this.pending = next.catch(() => {});
    return next;
  }
  reconcile(profileId: string | null): Promise<ReminderStatus> {
    this.activeProfileId = profileId;
    return this.enqueue(() => this.apply(profileId));
  }
  reconcileActive(): Promise<ReminderStatus> {
    return this.enqueue(() => this.apply(this.activeProfileId));
  }
  private async apply(profileId: string | null): Promise<ReminderStatus> {
    await this.notifications.cancelAllReminders();
    if (!profileId) return 'disabled';
    const preference = await this.settings.reminderSettings(profileId);
    if (!preference.enabled) return 'disabled';
    if (await this.notifications.permission() !== 'granted') return 'denied';
    await this.notifications.scheduleDaily(profileId, preference.hour, preference.minute);
    return 'scheduled';
  }
  setPreference(profileId: string, enabled: boolean, hour: number, minute: number): Promise<void> {
    return this.enqueue(async () => {
      await this.settings.setReminder(profileId, enabled, hour, minute);
      if (enabled && await this.notifications.permission() !== 'granted') await this.notifications.requestPermission();
      await this.apply(this.activeProfileId);
    });
  }
}
