package acr.browser.lightning.ygg

import android.util.Log
import androidx.webkit.ProxyConfig
import androidx.webkit.ProxyController
import androidx.webkit.WebViewFeature
import java.util.concurrent.Executors

/**
 * Routes all WebView traffic through the local yggstack SOCKS proxy.
 * Hostnames are resolved by yggstack itself, which is what makes
 * <publickey>.pk.ygg (and optionally .ygg) names work.
 *
 * Uses the public androidx.webkit ProxyController API; requires a WebView
 * that supports the PROXY_OVERRIDE feature (Android 5.0+ with an up-to-date
 * WebView provider).
 */
object YggProxy {

    private const val TAG = "YggProxy"

    private val executor by lazy { Executors.newSingleThreadExecutor() }

    fun apply(enabled: Boolean, port: Int) {
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.PROXY_OVERRIDE)) {
            Log.w(TAG, "PROXY_OVERRIDE is not supported by this WebView, cannot route traffic")
            return
        }

        val controller = ProxyController.getInstance()
        if (enabled) {
            // fail-closed: no direct fallback, all traffic goes through Yggdrasil
            val config = ProxyConfig.Builder()
                .addProxyRule("socks://127.0.0.1:$port")
                .build()
            controller.setProxyOverride(config, executor) {
                Log.d(TAG, "proxy override set to socks://127.0.0.1:$port")
            }
        } else {
            controller.clearProxyOverride(executor) {
                Log.d(TAG, "proxy override cleared")
            }
        }
    }
}
