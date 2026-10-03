const { withAndroidManifest } = require('expo/config-plugins');
// Expo restores alarms at boot, but does not listen for timezone/time changes.
module.exports = function withOfflineAndroid(config) {
  return withAndroidManifest(config, config => {
    const app = config.modResults.manifest.application[0];
    app['meta-data'] = app['meta-data'] || [];
    for (const name of ['firebase_messaging_auto_init_enabled', 'firebase_analytics_collection_enabled']) {
      const existing = app['meta-data'].find(item => item.$['android:name'] === name);
      if (existing) existing.$['android:value'] = 'false';
      else app['meta-data'].push({ $: { 'android:name': name, 'android:value': 'false' } });
    }
    app.receiver = app.receiver || [];
    // Expo discovers its designated receiver by NOTIFICATION_EVENT_ACTION.
    // Replace the default receiver so JS schedule/cancel, boot restoration and
    // delivery all enter the same native synchronization boundary.
    const defaultReceiver = 'expo.modules.notifications.service.NotificationsService';
    app.receiver = app.receiver.filter(receiver => receiver.$['android:name'] !== defaultReceiver);
    app.receiver.push({ $: { 'android:name': defaultReceiver, 'tools:node': 'remove' } });
    const name = 'expo.modules.germanoffline.ReminderTimeReceiver';
    app.receiver = app.receiver.filter(receiver => receiver.$['android:name'] !== name);
    if (!app.receiver.some(receiver => receiver.$['android:name'] === name)) {
      app.receiver.push({
        $: { 'android:name': name, 'android:exported': 'false', 'android:enabled': 'true' },
        'intent-filter': [{ $: { 'android:priority': '-1' }, action: [
          { $: { 'android:name': 'expo.modules.notifications.NOTIFICATION_EVENT' } },
          { $: { 'android:name': 'android.intent.action.BOOT_COMPLETED' } },
          { $: { 'android:name': 'android.intent.action.REBOOT' } },
          { $: { 'android:name': 'android.intent.action.QUICKBOOT_POWERON' } },
          { $: { 'android:name': 'com.htc.intent.action.QUICKBOOT_POWERON' } },
          { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } },
          { $: { 'android:name': 'android.intent.action.TIME_SET' } },
          { $: { 'android:name': 'android.intent.action.TIMEZONE_CHANGED' } },
        ] }],
      });
    }
    return config;
  });
};
