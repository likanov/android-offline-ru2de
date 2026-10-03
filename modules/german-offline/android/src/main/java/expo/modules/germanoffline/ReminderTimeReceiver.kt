package expo.modules.germanoffline

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import expo.modules.notifications.service.delegates.ExpoSchedulingDelegate
import kotlin.concurrent.thread

/** Recalculate Expo's persisted local daily trigger after a system time change. */
class ReminderTimeReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    if (intent.action != Intent.ACTION_TIME_CHANGED && intent.action != Intent.ACTION_TIMEZONE_CHANGED) return
    val result = goAsync()
    thread(name = "reminder-time-change") {
      try {
        // Expo persists the single active-profile request including its local hour/minute.
        // Scheduling the same identifier replaces its alarm; it cannot add another reminder.
        ExpoSchedulingDelegate(context.applicationContext).setupScheduledNotifications()
      } catch (error: Exception) {
        Log.w("GermanReminders", "Could not restore local reminder", error)
      } finally { result.finish() }
    }
  }
}
