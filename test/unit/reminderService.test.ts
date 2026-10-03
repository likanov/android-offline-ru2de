import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { ReminderService, type NotificationPort } from '../../src/features/reminders/reminderService';

class Notifications implements NotificationPort {
  status: 'granted' | 'denied' | 'undetermined' = 'granted';
  scheduled: { profileId: string; hour: number; minute: number }[] = [];
  requests = 0;
  async permission() { return this.status; }
  async requestPermission(): Promise<'granted' | 'denied'> { this.requests++; return this.status === 'granted' ? 'granted' : 'denied'; }
  async cancelAllReminders() { this.scheduled = []; }
  async scheduleDaily(profileId: string, hour: number, minute: number) { this.scheduled.push({ profileId, hour, minute }); return 'local-reminder'; }
}

test('only_active_profile_has_one_reminder', async () => {
  const h = await createWordHarness();
  try {
    const p1 = await createProfile(h.db, 'A'), p2 = await createProfile(h.db, 'B');
    const port = new Notifications(), service = new ReminderService(h.progress, port);
    expect(await service.reconcile(p1.id)).toBe('disabled');
    expect(await h.progress.reminderSettings(p1.id)).toEqual({ enabled: false, hour: 19, minute: 0 });
    await service.setPreference(p1.id, true, 19, 0);
    expect(await service.reconcile(p1.id)).toBe('scheduled');
    expect(port.scheduled).toEqual([{ profileId: p1.id, hour: 19, minute: 0 }]);
    expect(await service.reconcile(p2.id)).toBe('disabled');
    expect(port.scheduled).toEqual([]);
    expect(await service.reconcile(p1.id)).toBe('scheduled');
    expect(port.scheduled).toHaveLength(1);
    await service.reconcile(null);
    expect(port.scheduled).toEqual([]);
  } finally { h.close(); }
});

test('denied_permission_saves_preference_without_scheduling_or_requesting_on_reconcile', async () => {
  const h = await createWordHarness();
  try {
    const p = await createProfile(h.db, 'A'), port = new Notifications(); port.status = 'denied';
    const service = new ReminderService(h.progress, port);
    await service.setPreference(p.id, true, 20, 30);
    expect(port.requests).toBe(1);
    expect(await h.progress.reminderSettings(p.id)).toEqual({ enabled: true, hour: 20, minute: 30 });
    expect(await service.reconcile(p.id)).toBe('denied');
    expect(port.requests).toBe(1);
    expect(port.scheduled).toEqual([]);
    port.status = 'granted';
    expect(await service.reconcile(p.id)).toBe('scheduled');
    expect(port.scheduled).toEqual([{ profileId: p.id, hour: 20, minute: 30 }]);
  } finally { h.close(); }
});

test('repeated_and_concurrent_reconcile_do_not_accumulate_reminders', async () => {
  const h = await createWordHarness();
  try {
    const p = await createProfile(h.db, 'A'), other = await createProfile(h.db, 'B'), port = new Notifications();
    const service = new ReminderService(h.progress, port);
    await service.setPreference(p.id, true, 19, 0);
    await service.setPreference(other.id, true, 8, 15);
    await Promise.all([service.reconcile(p.id), service.reconcile(p.id), service.reconcile(other.id)]);
    expect(port.scheduled).toEqual([{ profileId: other.id, hour: 8, minute: 15 }]);
    await service.setPreference(other.id, false, 8, 15);
    expect(await service.reconcile(other.id)).toBe('disabled');
    expect(port.scheduled).toEqual([]);
    for (const [hour, minute] of [[24, 0], [-1, 0], [19, 60], [19, 0.5]])
      await expect(service.setPreference(p.id, true, hour, minute)).rejects.toMatchObject({ code: 'VALIDATION' });
  } finally { h.close(); }
});
