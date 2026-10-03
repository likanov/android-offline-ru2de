package expo.modules.germanoffline

import android.net.Uri
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream
import java.security.MessageDigest
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

class LocalFilesModule : Module() {
  private val worker = Executors.newSingleThreadExecutor()
  private val cancelled = ConcurrentHashMap.newKeySet<String>()
  private val root: File get() = File(requireNotNull(appContext.reactContext).filesDir, "models")
  private fun owned(path: String): File {
    val file = File(path).canonicalFile
    require(file.parentFile == root.canonicalFile) { "Path outside private model directory" }
    return file
  }
  private fun input(uri: String) = when (Uri.parse(uri).scheme) {
    "content" -> requireNotNull(requireNotNull(appContext.reactContext).contentResolver.openInputStream(Uri.parse(uri)))
    "file" -> FileInputStream(File(requireNotNull(Uri.parse(uri).path)))
    else -> error("Only local content/file URIs are supported")
  }
  override fun definition() = ModuleDefinition {
    Name("GermanOfflineFiles")
    Events("copyProgress")
    AsyncFunction("initialize") {
      root.mkdirs()
      // Only incomplete files: old installed models may still be in a llama context.
      root.listFiles()?.filter { it.name.endsWith(".partial") }?.forEach { it.delete() }
      root.absolutePath
    }
    AsyncFunction("exists") { path: String -> owned(path).isFile }
    AsyncFunction("remove") { path: String ->
      val file = owned(path)
      file.delete()
      File(file.absolutePath + ".partial").delete()
    }
    AsyncFunction("readText") { uri: String ->
      input(uri).use { source ->
        val bytes = source.readBytesBounded(64 * 1024)
        bytes.toString(Charsets.UTF_8)
      }
    }
    AsyncFunction("readTextBounded") { uri: String, maxBytes: Int ->
      require(maxBytes in 1..(10 * 1024 * 1024)) { "Invalid text size limit" }
      input(uri).use { source ->
        // Bound bytes while reading, before allocating the decoded text. No
        // persisted URI grants or storage-wide permission are needed.
        val bytes = source.readBytesBounded(maxBytes)
        Charsets.UTF_8.newDecoder()
          .onMalformedInput(java.nio.charset.CodingErrorAction.REPORT)
          .onUnmappableCharacter(java.nio.charset.CodingErrorAction.REPORT)
          .decode(java.nio.ByteBuffer.wrap(bytes)).toString()
      }
    }
    AsyncFunction("cancelCopy") { requestId: String -> cancelled.add(requestId); Unit }
    AsyncFunction("copyVerified") { uri: String, destination: String, expectedBytes: Double, expectedSha256: String, requestId: String, promise: Promise ->
      worker.execute {
        var temporary: File? = null
        try {
          require(expectedBytes >= 8 && expectedBytes <= Long.MAX_VALUE.toDouble() && expectedBytes % 1 == 0.0)
          require(expectedSha256.matches(Regex("[a-f0-9]{64}")))
          val target = owned(destination)
          require(!target.exists()) { "Destination already exists" }
          temporary = File(target.absolutePath + ".partial")
          require(root.usableSpace >= expectedBytes.toLong() + 16L * 1024 * 1024) { "Insufficient free space" }
          val digest = MessageDigest.getInstance("SHA-256")
          var copied = 0L
          var lastEvent = 0L
          var header = ByteArray(0)
          input(uri).use { source ->
            FileOutputStream(temporary).use { output ->
              val buffer = ByteArray(1024 * 1024)
              while (true) {
                check(!cancelled.contains(requestId)) { "CANCELLED" }
                val count = source.read(buffer)
                if (count < 0) break
                if (header.size < 8) header += buffer.copyOfRange(0, minOf(count, 8 - header.size))
                copied += count
                check(copied <= expectedBytes.toLong()) { "Size exceeds manifest" }
                output.write(buffer, 0, count)
                digest.update(buffer, 0, count)
                val now = System.currentTimeMillis()
                if (now - lastEvent >= 100 || copied == expectedBytes.toLong()) {
                  sendEvent("copyProgress", mapOf("requestId" to requestId, "copiedBytes" to copied.toDouble(), "totalBytes" to expectedBytes))
                  lastEvent = now
                }
              }
              output.fd.sync()
            }
          }
          check(!cancelled.contains(requestId)) { "CANCELLED" }
          check(copied == expectedBytes.toLong()) { "Size does not match manifest" }
          check(header.size == 8 && header.take(4).toByteArray().contentEquals(byteArrayOf(71, 71, 85, 70)) && header[4] == 3.toByte() && header.drop(5).all { it == 0.toByte() }) { "Expected GGUF v3" }
          val actual = digest.digest().joinToString("") { "%02x".format(it) }
          check(actual == expectedSha256) { "SHA-256 does not match manifest" }
          check(temporary.renameTo(target)) { "Cannot publish model file" }
          promise.resolve(target.absolutePath)
        } catch (error: Exception) {
          temporary?.delete()
          promise.reject(if (cancelled.contains(requestId)) "CANCELLED" else "STORAGE", error.message, error)
        } finally { cancelled.remove(requestId) }
      }
    }
  }
}

private fun java.io.InputStream.readBytesBounded(limit: Int): ByteArray {
  val output = java.io.ByteArrayOutputStream()
  val buffer = ByteArray(4096)
  while (true) {
    val count = read(buffer)
    if (count < 0) return output.toByteArray()
    require(output.size() + count <= limit) { "Text file exceeds size limit" }
    output.write(buffer, 0, count)
  }
}
