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
    const name = 'expo.modules.germanoffline.ReminderTimeReceiver';
    if (!app.receiver.some(receiver => receiver.$['android:name'] === name)) {
      app.receiver.push({
        $: { 'android:name': name, 'android:exported': 'false', 'android:enabled': 'true' },
        'intent-filter': [{ action: [
          { $: { 'android:name': 'android.intent.action.TIME_SET' } },
          { $: { 'android:name': 'android.intent.action.TIMEZONE_CHANGED' } },
        ] }],
      });
    }
    return config;
  });
};
