package org.mozilla.fenix.ygg

import android.content.Context
import org.json.JSONObject
import java.io.File

/**
 * Helpers for managing the bundled yggstack binary and its node configuration.
 *
 * The binary is packaged as a native library (libyggstack.so) so that Android
 * allows us to execute it; on API 29+ apps may only exec binaries from their
 * native library directory.
 */
object YggNode {

    private const val BINARY_NAME = "libyggstack.so"

    fun binaryPath(context: Context): String {
        val nativeDir = context.applicationInfo.nativeLibraryDir
        return File(nativeDir, BINARY_NAME).absolutePath
    }

    fun binaryExists(context: Context): Boolean = File(binaryPath(context)).canExecute()

    fun configDir(context: Context): File =
        File(context.filesDir, "ygg").apply { mkdirs() }

    fun configFile(context: Context): File =
        File(configDir(context), "yggdrasil.conf.json")

    fun logFile(context: Context): File =
        File(configDir(context), "yggstack.log")

    /**
     * Creates the node config on first launch and keeps it in sync with the
     * user's peers. The private key is generated once and never replaced,
     * which keeps the node's Yggdrasil address stable.
     */
    fun ensureConfig(context: Context, peers: List<String>): File {
        val file = configFile(context)
        var conf = if (file.exists()) {
            runCatching { JSONObject(file.readText()) }.getOrNull()
        } else {
            null
        }

        if (conf == null || !conf.has("PrivateKey")) {
            val generated = runBinary(context, listOf("-genconf", "-json"))
            conf = runCatching { JSONObject(generated) }.getOrNull() ?: JSONObject()
        }

        conf.put("Peers", org.json.JSONArray(peers))
        conf.put("Listen", org.json.JSONArray())
        conf.put("AdminListen", "none")
        conf.put("MulticastInterfaces", org.json.JSONArray())

        file.writeText(conf.toString(2))
        return file
    }

    /** Runs the binary synchronously and returns its stdout. */
    fun runBinary(context: Context, args: List<String>): String = runCatching {
        val process = ProcessBuilder(listOf(binaryPath(context)) + args)
            .redirectErrorStream(false)
            .start()
        val output = process.inputStream.bufferedReader().readText().trim()
        process.waitFor()
        output
    }.getOrDefault("")

    fun address(context: Context): String =
        runBinary(context, listOf("-useconffile", configFile(context).absolutePath, "-address"))

    fun publicKey(context: Context): String =
        runBinary(context, listOf("-useconffile", configFile(context).absolutePath, "-publickey"))

    /** Returns the last [maxLines] lines of the node log. */
    fun readLog(context: Context, maxLines: Int = 300): String {
        val file = logFile(context)
        if (!file.exists()) return ""
        return file.readLines().takeLast(maxLines).joinToString("\n")
    }
}
