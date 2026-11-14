package acr.browser.lightning

import acr.browser.lightning.concurrency.AppCoroutineScope
import acr.browser.lightning.database.bookmark.BookmarkExporter
import acr.browser.lightning.database.bookmark.BookmarkRepository
import acr.browser.lightning.device.BuildInfo
import acr.browser.lightning.device.BuildType
import acr.browser.lightning.di.AppComponent
import acr.browser.lightning.di.DaggerAppComponent
import acr.browser.lightning.di.injector
import acr.browser.lightning.migration.Cleanup
import acr.browser.lightning.utils.FileUtils
import acr.browser.lightning.utils.LeakCanaryUtils
import android.app.Application
import android.os.Build
import android.os.StrictMode
import android.webkit.WebView
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.io.File
import javax.inject.Inject
import kotlin.system.exitProcess

/**
 * The browser application.
 */
class BrowserApp : Application() {

    @Inject
    internal lateinit var leakCanaryUtils: LeakCanaryUtils

    @Inject
    internal lateinit var bookmarkModel: BookmarkRepository

    @Inject
    internal lateinit var buildInfo: BuildInfo

    @Inject
    internal lateinit var cleanup: Cleanup

    @Inject
    internal lateinit var appCoroutineScope: AppCoroutineScope

    @Inject
    internal lateinit var bookmarkExporter: BookmarkExporter

    lateinit var applicationComponent: AppComponent

    override fun onCreate() {
        super.onCreate()
        if (BuildConfig.DEBUG) {
            StrictMode.setThreadPolicy(
                StrictMode.ThreadPolicy.Builder()
                    .detectAll()
                    .penaltyLog()
                    .build()
            )
            StrictMode.setVmPolicy(
                StrictMode.VmPolicy.Builder()
                    .detectAll()
                    .penaltyLog()
                    .build()
            )
        }

        val isIncognito = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            getProcessName() == "$packageName:incognito"
        } else {
            false
        }

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P && isIncognito) {
            File(dataDir, "app_webview_incognito").deleteRecursively()
            WebView.setDataDirectorySuffix("incognito")
        }

        val defaultHandler = Thread.getDefaultUncaughtExceptionHandler()

        Thread.setDefaultUncaughtExceptionHandler { thread, ex ->
            // always keep a local crash log (no telemetry: the user decides
            // whether to share it, from Yggdrasil network settings)
            runCatching {
                val dir = File(filesDir, "crash-logs").apply { mkdirs() }
                val old = dir.listFiles()?.sortedBy { it.name } ?: emptyList()
                if (old.size >= 5) {
                    old.take(old.size - 4).forEach { it.delete() }
                }
                val file = File(dir, "crash-" + System.currentTimeMillis() + ".txt")
                file.writeText(
                    buildString {
                        appendLine("time: " + java.util.Date())
                        appendLine("thread: " + thread.name)
                        appendLine("version: " + BuildConfig.VERSION_NAME + " (" + BuildConfig.VERSION_CODE + ")")
                        appendLine("android: " + Build.VERSION.SDK_INT + " / " + Build.VERSION.INCREMENTAL)
                        appendLine()
                        appendLine(android.util.Log.getStackTraceString(ex))
                    }
                )
            }
            if (BuildConfig.DEBUG) {
                FileUtils.writeCrashToStorage(ex)
            }

            if (defaultHandler != null) {
                defaultHandler.uncaughtException(thread, ex)
            } else {
                exitProcess(2)
            }
        }

        applicationComponent = DaggerAppComponent.builder()
            .application(this)
            .buildInfo(createBuildInfo())
            .incognitoMode(isIncognito)
            .build()
        injector.inject(this)

        appCoroutineScope.launch {
            cleanup.cleanup()
        }

        appCoroutineScope.launch {
            if (bookmarkModel.count() == 0L) {
                val assetsBookmarks = bookmarkExporter.importBookmarksFromAssets()
                bookmarkModel.addBookmarkList(assetsBookmarks)
            }
        }

        if (buildInfo.buildType == BuildType.DEBUG) {
            leakCanaryUtils.setup()
        }

        if (buildInfo.buildType == BuildType.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true)
        }
    }

    override fun onTerminate() {
        super.onTerminate()
        appCoroutineScope.cancel()
    }

    /**
     * Create the [BuildType] from the [BuildConfig].
     */
    private fun createBuildInfo() = BuildInfo(
        packageName = packageName,
        buildType = when {
            BuildConfig.DEBUG -> BuildType.DEBUG
            else -> BuildType.RELEASE
        },
        versionCode = BuildConfig.VERSION_CODE,
        isPlus = BuildConfig.FULL_VERSION,
    )

    companion object {
        private const val TAG = "BrowserApp"
    }
}
