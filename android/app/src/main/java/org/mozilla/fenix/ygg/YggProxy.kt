package org.mozilla.fenix.ygg

import android.content.Context
import java.io.File

/**
 * Routes all Gecko traffic through the local yggstack SOCKS5 proxy.
 *
 * GeckoView applies the proxy at runtime creation from a YAML config file
 * (GeckoRuntimeSettings.Builder.configFile), which sets the classic
 * network.proxy.* preferences before Gecko starts. Hostnames are resolved
 * by yggstack itself, which is what makes <publickey>.pk.ygg (and
 * optionally .ygg) names work.
 */
object YggProxy {

    fun configPath(context: Context): File =
        File(YggNode.configDir(context), "gecko-proxy.yaml")

    /**
     * Writes the proxy config. Applied when the Gecko runtime is created,
     * i.e. on the next app start after changing settings.
     */
    fun apply(context: Context, enabled: Boolean, host: String, port: Int) {
        val file = configPath(context)
        if (!enabled) {
            if (file.exists()) {
                file.delete()
            }
            return
        }
        file.writeText(
            buildString {
                appendLine("prefs:")
                appendLine("  network.proxy.type: 1")
                appendLine("  network.proxy.socks: \"$host\"")
                appendLine("  network.proxy.socks_port: $port")
                appendLine("  network.proxy.socks_version: 5")
                // resolve DNS through the proxy, never locally
                appendLine("  network.proxy.socks_remote_dns: true")
                appendLine("  network.proxy.proxy_over_tls: false")
            }
        )
    }

    fun isEnabledConfigPresent(context: Context): Boolean = configPath(context).exists()
}
