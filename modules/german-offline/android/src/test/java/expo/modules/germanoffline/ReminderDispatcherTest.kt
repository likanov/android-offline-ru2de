package expo.modules.germanoffline

import org.junit.Assert.*
import org.junit.Test
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicReference
import kotlin.concurrent.thread

class ReminderDispatcherTest {
  @Test fun unchanged_request_is_restored() {
    val dispatcher = ReminderDispatcher()
    val persisted = "P1"
    var alarm: String? = null
    dispatcher.restore({ persisted }, { alarm = it })
    assertEquals("P1", alarm)
  }
  @Test fun paused_restore_cannot_resurrect_disabled_reminder() = checkPausedRestore(null)
  @Test fun paused_restore_cannot_replace_new_active_profile() = checkPausedRestore("P2")

  private fun checkPausedRestore(replacement: String?) {
    val dispatcher = ReminderDispatcher()
    var persisted: String? = "P1"
    var alarm: String? = "P1"
    val read = CountDownLatch(1)
    val resume = CountDownLatch(1)
    val failure = AtomicReference<Throwable?>()
    val worker = thread {
      try {
        dispatcher.restore({
          val old = persisted
          read.countDown()
          check(resume.await(5, TimeUnit.SECONDS))
          old
        }, { old -> persisted = old; alarm = old })
      } catch (error: Throwable) { failure.set(error) }
    }
    assertTrue(read.await(5, TimeUnit.SECONDS))
    dispatcher.mutate { persisted = replacement; alarm = replacement }
    resume.countDown()
    worker.join(5000)
    assertFalse(worker.isAlive)
    failure.get()?.let { throw it }
    assertEquals(replacement, persisted)
    assertEquals(replacement, alarm)
  }
}
