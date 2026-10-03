package expo.modules.germanoffline

// All entry points run on the module's main handler. Engine acceptance is not
// completion: only the utterance callbacks settle a successfully queued request.
internal class SpeechRequests {
  private data class Pending(val resolve: () -> Unit, val reject: (String, String) -> Unit)
  private val pending = mutableMapOf<String, Pending>()

  fun submit(id: String, resolve: () -> Unit, reject: (String, String) -> Unit, speak: () -> Boolean) {
    cancel(id)
    pending[id] = Pending(resolve, reject)
    try {
      if (!speak()) fail(id, "Offline synthesis failed")
    } catch (_: Exception) {
      fail(id, "Offline synthesis failed")
    }
  }
  fun complete(id: String) { pending.remove(id)?.resolve?.invoke() }
  fun fail(id: String, message: String) { pending.remove(id)?.reject?.invoke("AUDIO_UNAVAILABLE", message) }
  fun cancel(id: String) { pending.remove(id)?.reject?.invoke("AUDIO_CANCELLED", "Speech cancelled") }
  fun cancelAll() { pending.keys.toList().forEach { cancel(it) } }
}
