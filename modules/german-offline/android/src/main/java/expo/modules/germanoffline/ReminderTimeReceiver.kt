package expo.modules.germanoffline

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.ComponentName
import android.net.Uri
import android.os.Build
import android.content.Context
import android.content.Intent
import expo.modules.notifications.notifications.model.Notification
import expo.modules.notifications.notifications.model.NotificationRequest
import expo.modules.notifications.service.NotificationsService
import expo.modules.notifications.service.delegates.ExpoSchedulingDelegate
import expo.modules.notifications.service.interfaces.SchedulingDelegate

/** Designated Expo dispatcher for local notification, boot and time-change events. */
class ReminderTimeReceiver : NotificationsService() {
  override fun getSchedulingDelegate(context: Context): SchedulingDelegate =
    ReminderSchedulingDelegate(context)

  override fun handleIntent(context: Context, intent: Intent) {
    if (intent.action == Intent.ACTION_TIME_CHANGED || intent.action == Intent.ACTION_TIMEZONE_CHANGED) {
      getSchedulingDelegate(context).setupScheduledNotifications()
    } else {
      super.handleIntent(context, intent)
    }
  }
}

/** Every mutation uses the same dispatcher, including Expo JS API broadcasts. */
private class ReminderSchedulingDelegate(private val context: Context) : SchedulingDelegate {
  private val delegate = ExpoSchedulingDelegate(context)
  private val dispatcher = ReminderDispatcher.shared
  override fun setupScheduledNotifications() = dispatcher.restore(
    { delegate.getAllScheduledNotifications() },
    { requests -> requests.forEach { clearLegacyAlarm(it.identifier); delegate.scheduleNotification(it) } }
  )
  override fun getAllScheduledNotifications(): Collection<NotificationRequest> =
    dispatcher.read { delegate.getAllScheduledNotifications() }
  override fun getScheduledNotification(identifier: String): NotificationRequest? =
    dispatcher.read { delegate.getScheduledNotification(identifier) }
  override fun scheduleNotification(request: NotificationRequest) =
    dispatcher.mutate { clearLegacyAlarm(request.identifier); delegate.scheduleNotification(request) }
  override fun removeScheduledNotifications(identifiers: Collection<String>) =
    dispatcher.mutate { identifiers.forEach(::clearLegacyAlarm); delegate.removeScheduledNotifications(identifiers) }
  override fun removeAllScheduledNotifications() =
    dispatcher.mutate {
      delegate.getAllScheduledNotifications().forEach { clearLegacyAlarm(it.identifier) }
      delegate.removeAllScheduledNotifications()
    }
  // Upgrading from the original Expo receiver changes the PendingIntent component
  // and request code. Remove its old alarms as well as the new designated ones.
  private fun clearLegacyAlarm(identifier: String) {
    val receiver = NotificationsService::class.java.name
    val uri = Uri.parse("expo-notifications://notifications/").buildUpon()
      .appendPath("scheduled").appendPath(identifier).appendPath("trigger").build()
    val intent = Intent(NotificationsService.NOTIFICATION_EVENT_ACTION, uri)
      .setComponent(ComponentName(context.packageName, receiver))
    val mutable = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) PendingIntent.FLAG_MUTABLE else 0
    val pending = PendingIntent.getBroadcast(context, receiver.hashCode(), intent, PendingIntent.FLAG_NO_CREATE or mutable)
    if (pending != null) {
      (context.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(pending)
      pending.cancel()
    }
  }
  override fun triggerNotification(identifier: String) = dispatcher.mutate {
    val request = delegate.getScheduledNotification(identifier) ?: return@mutate
    NotificationsService.receive(context, Notification(request))
    // Expo's default trigger enqueues another asynchronous schedule broadcast.
    // Reschedule directly in this critical section so cancellation cannot be
    // followed by a queued schedule containing the old profile's request.
    delegate.scheduleNotification(request)
  }
}
