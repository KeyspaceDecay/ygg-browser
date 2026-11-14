package acr.browser.lightning.ygg

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import java.util.concurrent.atomic.AtomicBoolean
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch

/**
 * Foreground service that runs the bundled yggstack binary as a SOCKS5
 * gateway into the Yggdrasil network, restarts it if it crashes, and
 * keeps a rotating log file.
 */
class YggstackService : Service() {

    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var process: Process? = null
    private val stopping = AtomicBoolean(false)

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        createChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSelf()
            return START_NOT_STICKY
        }

        val prefs = YggPreferences(this)
        if (!prefs.enabled || !YggNode.binaryExists(this)) {
            stopSelf()
            return START_NOT_STICKY
        }

        startForeground(NOTIFICATION_ID, buildNotification(this))
        startNode()
        return START_STICKY
    }

    private fun startNode() {
        if (process != null) return
        stopping.set(false)

        val prefs = YggPreferences(this)
        val peers = prefs.peers.lines().map { it.trim() }.filter { it.isNotEmpty() }
        val config = YggNode.ensureConfig(this, peers)

        val args = mutableListOf(
            "-useconffile", config.absolutePath,
            "-socks", "127.0.0.1:${prefs.socksPort}"
        )
        if (prefs.nameserver.isNotBlank()) {
            args += listOf("-nameserver", prefs.nameserver.trim())
        }

        appendLog("[ygg] starting yggstack ${args.joinToString(" ")}")

        serviceScope.launch {
            var backoffMs = INITIAL_BACKOFF_MS
            while (isActive && !stopping.get()) {
                var proc: Process? = null
                try {
                    proc = ProcessBuilder(listOf(YggNode.binaryPath(this@YggstackService)) + args)
                        .redirectErrorStream(true)
                        .start()
                    process = proc
                    appendLog("[ygg] yggstack started (pid ${proc.pid()})")

                    proc.inputStream.bufferedReader().forEachLine { line ->
                        appendLog(line)
                    }

                    val exit = proc.waitFor()
                    appendLog("[ygg] yggstack exited with code $exit")
                } catch (e: Exception) {
                    appendLog("[ygg] failed to start yggstack: ${e.message}")
                } finally {
                    process = null
                }

                if (stopping.get()) break
                appendLog("[ygg] restarting yggstack in ${backoffMs}ms")
                delay(backoffMs)
                backoffMs = (backoffMs * 2).coerceAtMost(MAX_BACKOFF_MS)
            }
        }
    }

    private fun appendLog(line: String) {
        serviceScope.launch {
            runCatching {
                val file = YggNode.logFile(this@YggstackService)
                val truncated = if (file.exists() && file.length() > MAX_LOG_BYTES) {
                    file.readLines().takeLast(LOG_KEEP_LINES)
                } else {
                    file.readLines()
                }
                (truncated + line).joinToString("\n", postfix = "\n").let { file.writeText(it) }
            }
        }
    }

    override fun onDestroy() {
        stopping.set(true)
        process?.destroy()
        serviceScope.launch {
            delay(500)
            process?.destroyForcibly()
        }
        serviceScope.cancel()
        super.onDestroy()
    }

    private fun createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID,
                "Yggdrasil network",
                NotificationManager.IMPORTANCE_LOW
            ).apply {
                description = "Yggdrasil gateway status"
                setShowBadge(false)
            }
            val manager = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
            manager.createNotificationChannel(channel)
        }
    }

    private fun buildNotification(context: Context): Notification {
        val stopIntent = PendingIntent.getService(
            context,
            0,
            Intent(context, YggstackService::class.java).setAction(ACTION_STOP),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        val openIntent = PendingIntent.getActivity(
            context,
            1,
            Intent(context, YggSettingsActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )

        return NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_manage)
            .setContentTitle("Yggdrasil")
            .setContentText("Gateway to the Yggdrasil network is running")
            .setOngoing(true)
            .setContentIntent(openIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Stop", stopIntent)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build()
    }

    companion object {
        private const val CHANNEL_ID = "yggdrasil"
        private const val NOTIFICATION_ID = 0x797767 // "ywg"
        const val ACTION_STOP = "acr.browser.lightning.ygg.STOP"

        private const val INITIAL_BACKOFF_MS = 1000L
        private const val MAX_BACKOFF_MS = 30_000L
        private const val MAX_LOG_BYTES = 512 * 1024L
        private const val LOG_KEEP_LINES = 500

        fun start(context: Context) {
            val intent = Intent(context, YggstackService::class.java)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                context.startForegroundService(intent)
            } else {
                context.startService(intent)
            }
        }

        fun stop(context: Context) {
            context.startService(
                Intent(context, YggstackService::class.java).setAction(ACTION_STOP)
            )
        }
    }
}
