import React, { useEffect, useState } from 'react';
import { Text, TextInput, Switch } from 'react-native';
import { Screen } from '../../ui/Screen';
import { Button } from '../../ui/Button';
import type { ProgressRepository } from '../progress/progressRepository';
import type { ReminderService } from './reminderService';
export function ReminderSettings({ profileId, progress, service }: {
  profileId: string; progress: ProgressRepository; service: ReminderService;
}) {
  const [enabled, setEnabled] = useState(false), [time, setTime] = useState('19:00');
  const [ready, setReady] = useState(false), [busy, setBusy] = useState(false);
  const [error, setError] = useState(''), [status, setStatus] = useState('');
  useEffect(() => {
    let alive = true;
    void progress.reminderSettings(profileId).then(preference => {
      if (!alive) return;
      setEnabled(preference.enabled);
      setTime(`${String(preference.hour).padStart(2, '0')}:${String(preference.minute).padStart(2, '0')}`);
      setReady(true);
    }).catch(() => { if (alive) setError('Не удалось прочитать настройки напоминания'); });
    return () => { alive = false; };
  }, [profileId, progress]);
  async function save() {
    setBusy(true); setError(''); setStatus('');
    try {
      if (!/^\d{2}:\d{2}$/.test(time)) throw new Error('Введите время в формате ЧЧ:ММ');
      const [hour, minute] = time.split(':').map(Number);
      await service.setPreference(profileId, enabled, hour, minute);
      const result = await service.reconcileActive();
      setStatus(result === 'denied' ? 'Разрешите уведомления в настройках Android. Время сохранено.' : result === 'scheduled' ? 'Напоминание сохранено' : 'Напоминание выключено');
    } catch (e) { setError(e instanceof Error ? e.message : 'Не удалось сохранить напоминание'); }
    finally { setBusy(false); }
  }
  return <Screen><Text style={{ fontSize: 28 }}>Напоминания</Text><Text>Каждый день по местному времени телефона</Text>{ready ? <><Switch accessibilityLabel="Ежедневное напоминание" value={enabled} onValueChange={setEnabled} disabled={busy}/><TextInput accessibilityLabel="Время напоминания" value={time} onChangeText={setTime} editable={!busy} maxLength={5} placeholder="19:00"/><Button title="Сохранить напоминание" disabled={busy} onPress={() => void save()}/></> : <Text>Загрузка…</Text>}{status ? <Text>{status}</Text> : null}{error ? <Text accessibilityRole="alert">{error}</Text> : null}</Screen>;
}
