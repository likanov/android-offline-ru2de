import { Platform } from 'react-native';
import type { NotificationPort } from './reminderService';
const channelId = 'daily-vocabulary';
// Loading Expo and creating a channel never requests permission or registers a push token.
async function notifications() {
  const api = await import('expo-notifications');
  if (Platform.OS === 'android') await api.setNotificationChannelAsync(channelId, {
    name: 'Ежедневное напоминание', importance: api.AndroidImportance.DEFAULT,
  });
  api.setNotificationHandler({ handleNotification: async () => ({
    shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false,
  }) });
  return api;
}
export function createNotificationPort(): NotificationPort {
  return {
    permission: async () => {
      const permission = await (await notifications()).getPermissionsAsync();
      return permission.granted ? 'granted' : permission.status === 'undetermined' ? 'undetermined' : 'denied';
    },
    requestPermission: async () => (await (await notifications()).requestPermissionsAsync()).granted ? 'granted' : 'denied',
    cancelAllReminders: async () => { await (await notifications()).cancelAllScheduledNotificationsAsync(); },
    scheduleDaily: async (profileId, hour, minute) => {
      const api = await notifications();
      return api.scheduleNotificationAsync({
        identifier: 'active-profile-reminder',
        content: { title: 'Немецкие слова', body: 'Пора немного потренироваться', data: { profileId }, sound: 'default' },
        trigger: { type: api.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId },
      });
    },
  };
}
