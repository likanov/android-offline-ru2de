import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { createWordHarness } from '../harness';
import { createProfile } from '../../src/features/profiles/profileRepository';
import { ReminderService, type NotificationPort } from '../../src/features/reminders/reminderService';
import { ReminderSettings } from '../../src/features/reminders/ReminderSettings';
test('reminder_settings_enable_save_time_and_explain_denied_permission', async () => {
  const h = await createWordHarness();
  try {
    const profile = await createProfile(h.db, 'A');
    const port: NotificationPort = {
      permission: async () => 'denied', requestPermission: async () => 'denied',
      cancelAllReminders: async () => {}, scheduleDaily: async () => 'local',
    };
    const service = new ReminderService(h.progress, port);
    await service.reconcile(profile.id);
    render(<ReminderSettings profileId={profile.id} progress={h.progress} service={service} />);
    const toggle = await screen.findByRole('switch', { name: 'Ежедневное напоминание' });
    expect(toggle.props.value).toBe(false);
    expect(screen.getByLabelText('Время напоминания').props.value).toBe('19:00');
    fireEvent(toggle, 'valueChange', true);
    fireEvent.changeText(screen.getByLabelText('Время напоминания'), '20:30');
    fireEvent.press(screen.getByRole('button', { name: 'Сохранить напоминание' }));
    await screen.findByText('Разрешите уведомления в настройках Android. Время сохранено.');
    expect(await h.progress.reminderSettings(profile.id)).toEqual({ enabled: true, hour: 20, minute: 30 });
    fireEvent.changeText(screen.getByLabelText('Время напоминания'), '25:30');
    fireEvent.press(screen.getByRole('button', { name: 'Сохранить напоминание' }));
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    expect(await h.progress.reminderSettings(profile.id)).toEqual({ enabled: true, hour: 20, minute: 30 });
  } finally { h.close(); }
});

test('saving_a_screen_after_profile_switch_cannot_restore_the_old_profile_reminder', async () => {
  const h = await createWordHarness();
  try {
    const p1 = await createProfile(h.db, 'A'), p2 = await createProfile(h.db, 'B');
    let reminders: string[] = [];
    const port: NotificationPort = {
      permission: async () => 'granted', requestPermission: async () => 'granted',
      cancelAllReminders: async () => { reminders = []; },
      scheduleDaily: async id => { reminders.push(id); return 'local'; },
    };
    class SwitchingService extends ReminderService {
      override async setPreference(profileId: string, enabled: boolean, hour: number, minute: number) {
        await super.setPreference(profileId, enabled, hour, minute);
        // A profile switch finishes while the old settings screen's save is pending.
        await this.reconcile(p2.id);
      }
    }
    const service = new SwitchingService(h.progress, port);
    await service.reconcile(p1.id);
    render(<ReminderSettings profileId={p1.id} progress={h.progress} service={service}/>);
    const toggle = await screen.findByRole('switch', { name: 'Ежедневное напоминание' });
    fireEvent(toggle, 'valueChange', true);
    fireEvent.press(screen.getByRole('button', { name: 'Сохранить напоминание' }));
    await waitFor(() => expect(screen.getByText('Напоминание выключено')).toBeTruthy());
    expect(reminders).toEqual([]);
    expect(await h.progress.reminderSettings(p1.id)).toMatchObject({ enabled: true });
  } finally { h.close(); }
});
