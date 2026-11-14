package acr.browser.lightning.ygg

import android.content.Context
import android.webkit.ProxyConfig
import android.webkit.ProxyController
import java.util.concurrent.Executors

/**
 * Routes all WebView traffic through the local yggstack SOCKS5 proxy.
 * Hostnames are resolved by yggstack itself, which is what makes
 * <publickey>.pk.ygg (and optionally .ygg) names work.
 */
object YggProxy {

    private val executor by lazy { Executors.newSingleThreadExecutor() }

    fun apply(context: Context, enabled: Boolean, port: Int) {
        val controller = ProxyController.getInstance()
        if (enabled) {
            // fail-closed: no direct fallback, all traffic goes through Yggdrasil
            val config = ProxyConfig.Builder()
                .addProxyRule("socks5://127.0.0.1:$port")
                .build()
            controller.setProxyOverride(config, executor) {
                android.util.Log.d(TAG, "proxy override set to socks5://127.0.0.1:$port")
            }
        } else {
            controller.clearProxyOverride(executor) {
                android.util.Log.d(TAG, "proxy override cleared")
            }
        }
    }
}
