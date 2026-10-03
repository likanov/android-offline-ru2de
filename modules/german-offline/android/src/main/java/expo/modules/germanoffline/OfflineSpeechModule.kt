package expo.modules.germanoffline

import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class OfflineSpeechModule : Module() {
  private val main = Handler(Looper.getMainLooper())
  private var engine: TextToSpeech? = null
  private var ready = false
  private var starting = false
  private val requests = SpeechRequests()
  private val listener = object : UtteranceProgressListener() {
    override fun onStart(id: String?) {}
    override fun onDone(id: String?) { if (id != null) main.post { requests.complete(id) } }
    @Deprecated("Android legacy callback")
    override fun onError(id: String?) { if (id != null) main.post { requests.fail(id, "Offline synthesis failed") } }
    override fun onError(id: String?, errorCode: Int) { if (id != null) main.post { requests.fail(id, "Offline synthesis failed: $errorCode") } }
    override fun onStop(id: String?, interrupted: Boolean) { if (id != null) main.post { requests.cancel(id) } }
  }
  private val waiting = mutableListOf<Pair<Promise, (TextToSpeech) -> Unit>>()

  private fun withEngine(promise: Promise, action: (TextToSpeech) -> Unit) {
    main.post {
      val current = engine
      if (ready && current != null) { action(current); return@post }
      waiting.add(promise to action)
      if (starting) return@post
      starting = true
      engine = TextToSpeech(appContext.reactContext!!) { status ->
        main.post {
          ready = status == TextToSpeech.SUCCESS && engine?.setOnUtteranceProgressListener(listener) == TextToSpeech.SUCCESS
          starting = false
          val pending = waiting.toList()
          waiting.clear()
          pending.forEach { (p, run) ->
            val tts = engine
            if (ready && tts != null) run(tts)
            else p.reject("AUDIO_UNAVAILABLE", "Offline speech engine unavailable", null)
          }
        }
      }
    }
  }
  private fun installed(voice: Voice) = !voice.features.orEmpty().contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED)
  private fun allowed(voice: Voice) = voice.locale.language == "de" && !voice.isNetworkConnectionRequired && installed(voice)

  override fun definition() = ModuleDefinition {
    Name("GermanOfflineSpeech")
    AsyncFunction("listVoices") { promise: Promise ->
      withEngine(promise) { tts ->
        promise.resolve(tts.voices.orEmpty().map { voice ->
          mapOf("id" to voice.name, "language" to voice.locale.toLanguageTag(),
            "requiresNetwork" to voice.isNetworkConnectionRequired, "installed" to installed(voice))
        })
      }
    }
    AsyncFunction("speakOffline") { text: String, voiceId: String, requestId: String, promise: Promise ->
      withEngine(promise) { tts ->
        // Re-read voices for every request. Never speak after a failed setVoice.
        val voice = tts.voices.orEmpty().find { it.name == voiceId && allowed(it) }
        if (voice == null || tts.setVoice(voice) != TextToSpeech.SUCCESS || tts.voice?.name != voiceId) {
          promise.reject("AUDIO_UNAVAILABLE", "Installed offline German voice unavailable", null)
        } else {
          requests.cancelAll()
          requests.submit(requestId, { promise.resolve(null) }, { code, message -> promise.reject(code, message, null) }) {
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, requestId) == TextToSpeech.SUCCESS
          }
        }
      }
    }
    AsyncFunction("stopSpeech") { promise: Promise ->
      main.post {
        waiting.forEach { (p, _) -> p.reject("AUDIO_CANCELLED", "Speech cancelled", null) }
        waiting.clear()
        requests.cancelAll()
        engine?.stop()
        promise.resolve(null)
      }
    }
    OnDestroy { main.post { waiting.forEach { (p, _) -> p.reject("AUDIO_CANCELLED", "Speech cancelled", null) }; waiting.clear(); requests.cancelAll(); engine?.stop(); engine?.shutdown(); engine = null; ready = false } }
  }
}
