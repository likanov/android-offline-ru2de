package expo.modules.germanoffline

import org.junit.Assert.*
import org.junit.Test

class SpeechRequestsTest {
  @Test fun accepted_request_waits_for_async_error_instead_of_resolving() {
    val requests = SpeechRequests()
    var completed = false
    val failures = mutableListOf<String>()
    requests.submit("accepted", { completed = true }, { code, _ -> failures.add(code) }) { true }
    assertFalse(completed)
    assertTrue(failures.isEmpty())
    requests.fail("accepted", "synthesis output failure")
    assertFalse(completed)
    assertEquals(listOf("AUDIO_UNAVAILABLE"), failures)
    requests.complete("accepted")
    assertFalse(completed)
  }
  @Test fun successful_utterance_resolves_once_only_after_done() {
    val requests = SpeechRequests()
    var completions = 0
    requests.submit("success", { completions++ }, { _, _ -> fail("Unexpected failure") }) { true }
    assertEquals(0, completions)
    requests.complete("success")
    requests.complete("success")
    assertEquals(1, completions)
  }
  @Test fun stopping_rejects_pending_requests_as_cancelled_and_ignores_late_error() {
    val requests = SpeechRequests()
    val failures = mutableListOf<String>()
    requests.submit("stopped", { fail("Cancelled request completed") }, { code, _ -> failures.add(code) }) { true }
    requests.cancelAll()
    requests.fail("stopped", "late failure")
    requests.complete("stopped")
    assertEquals(listOf("AUDIO_CANCELLED"), failures)
  }
  @Test fun immediate_rejection_is_unavailable() {
    val requests = SpeechRequests()
    val failures = mutableListOf<String>()
    requests.submit("rejected", { fail("Rejected request completed") }, { code, _ -> failures.add(code) }) { false }
    assertEquals(listOf("AUDIO_UNAVAILABLE"), failures)
  }
}
