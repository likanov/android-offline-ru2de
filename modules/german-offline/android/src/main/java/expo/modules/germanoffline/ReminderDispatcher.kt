package expo.modules.germanoffline

/** Shared process-wide boundary for every Expo reminder schedule/cancel/restore. */
class ReminderDispatcher {
  companion object { val shared = ReminderDispatcher() }
  private val lock = Any()
  private var revision = 0L
  fun <T> read(work: () -> T): T = synchronized(lock) { work() }
  fun <T> mutate(work: () -> T): T = synchronized(lock) {
    revision++
    work()
  }
  fun <T> restore(read: () -> T, apply: (T) -> Unit) {
    val expectedRevision = synchronized(lock) { revision }
    val snapshot = read()
    synchronized(lock) {
      // A cancellation or profile change completed while the snapshot was read.
      if (revision == expectedRevision) apply(snapshot)
    }
  }
}
