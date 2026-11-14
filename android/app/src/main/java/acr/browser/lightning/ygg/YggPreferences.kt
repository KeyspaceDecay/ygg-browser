package acr.browser.lightning.ygg

import android.content.Context
import android.content.SharedPreferences

/**
 * Yggdrasil network settings, stored in shared preferences.
 */
class YggPreferences(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("yggdrasil", Context.MODE_PRIVATE)

    var enabled: Boolean
        get() = prefs.getBoolean(KEY_ENABLED, true)
        set(value) = prefs.edit().putBoolean(KEY_ENABLED, value).apply()

    /** One peer URI per line: tcp://, tls://, quic://, ws://, wss:// */
    var peers: String
        get() = prefs.getString(KEY_PEERS, DEFAULT_PEERS) ?: DEFAULT_PEERS
        set(value) = prefs.edit().putString(KEY_PEERS, value).apply()

    var socksPort: Int
        get() = prefs.getInt(KEY_SOCKS_PORT, 1080)
        set(value) = prefs.edit().putInt(KEY_SOCKS_PORT, value).apply()

    /** Optional Yggdrasil DNS server for .ygg names, e.g. [324:71e:281a:9ed3::53]:53 */
    var nameserver: String
        get() = prefs.getString(KEY_NAMESERVER, "") ?: ""
        set(value) = prefs.edit().putString(KEY_NAMESERVER, value).apply()

    companion object {
        private const val KEY_ENABLED = "enabled"
        private const val KEY_PEERS = "peers"
        private const val KEY_SOCKS_PORT = "socks_port"
        private const val KEY_NAMESERVER = "nameserver"

        /**
         * A few public peers with good uptime; replace with nearby ones:
         * https://publicpeers.neilalexander.dev
         */
        val DEFAULT_PEERS = """
            tcp://51.15.204.214:12345
            tcp://ygg.mkg20001.io:80
            tcp://89.110.116.167:65535
        """.trimIndent()
    }
}
