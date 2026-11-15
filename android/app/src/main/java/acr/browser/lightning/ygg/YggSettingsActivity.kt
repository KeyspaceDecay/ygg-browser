package acr.browser.lightning.ygg

import android.os.Bundle
import android.content.Intent
import android.view.MenuItem
import android.widget.Button
import android.widget.EditText
import android.widget.Switch
import android.widget.TextView
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.appcompat.widget.Toolbar
import androidx.lifecycle.lifecycleScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import acr.browser.lightning.R
import java.io.File

/**
 * Yggdrasil network settings: status, identity, peers and proxy options.
 */
class YggSettingsActivity : AppCompatActivity() {

    private lateinit var statusText: TextView
    private lateinit var addressView: TextView
    private lateinit var publicKeyView: TextView
    private lateinit var resolverView: TextView
    private lateinit var logView: TextView
    private lateinit var enabledSwitch: Switch
    private lateinit var peersInput: EditText
    private lateinit var portInput: EditText
    private lateinit var nameserverInput: EditText
    private lateinit var saveButton: Button
    private lateinit var crashView: TextView
    private lateinit var shareCrashButton: Button

    private val prefs by lazy { YggPreferences(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_ygg_settings)

        val toolbar = findViewById<Toolbar>(R.id.ygg_toolbar)
        setSupportActionBar(toolbar)
        supportActionBar?.setDisplayHomeAsUpEnabled(true)
        supportActionBar?.setTitle(R.string.ygg_settings_title)

        statusText = findViewById(R.id.ygg_status)
        addressView = findViewById(R.id.ygg_address)
        publicKeyView = findViewById(R.id.ygg_public_key)
        resolverView = findViewById(R.id.ygg_resolver)
        logView = findViewById(R.id.ygg_log)
        enabledSwitch = findViewById(R.id.ygg_switch_enabled)
        peersInput = findViewById(R.id.ygg_input_peers)
        portInput = findViewById(R.id.ygg_input_port)
        nameserverInput = findViewById(R.id.ygg_input_nameserver)
        saveButton = findViewById(R.id.ygg_button_save)

        enabledSwitch.isChecked = prefs.enabled
        peersInput.setText(prefs.peers)
        portInput.setText(prefs.socksPort.toString())
        nameserverInput.setText(prefs.nameserver)

        saveButton.setOnClickListener { saveAndRestart() }

        crashView = findViewById(R.id.ygg_crash_log)
        shareCrashButton = findViewById(R.id.ygg_share_crash)
        setupDiagnostics()

        refreshIdentity()
        window.decorView.post { refreshLog() }
    }

    override fun onResume() {
        super.onResume()
        refreshLog()
    }

    private fun saveAndRestart() {
        prefs.enabled = enabledSwitch.isChecked
        prefs.peers = peersInput.text.toString()
        prefs.socksPort = portInput.text.toString().toIntOrNull()?.coerceIn(1, 65535) ?: 1080
        prefs.nameserver = nameserverInput.text.toString().trim()

        if (prefs.enabled) {
            YggstackService.start(this)
            YggProxy.apply(enabled = true, port = prefs.socksPort)
        } else {
            YggstackService.stop(this)
            YggProxy.apply(enabled = false, port = prefs.socksPort)
        }

        Toast.makeText(this, R.string.ygg_settings_saved, Toast.LENGTH_SHORT).show()
        refreshIdentity()
        refreshLog()
    }

    private fun refreshIdentity() {
        lifecycleScope.launch(Dispatchers.IO) {
            val hasBinary = YggNode.binaryExists(this@YggSettingsActivity)
            val address = if (hasBinary && YggNode.configFile(this@YggSettingsActivity).exists()) {
                YggNode.address(this@YggSettingsActivity).ifBlank { getString(R.string.ygg_unknown) }
            } else {
                getString(R.string.ygg_unknown)
            }
            val publicKey = if (hasBinary && YggNode.configFile(this@YggSettingsActivity).exists()) {
                YggNode.publicKey(this@YggSettingsActivity).ifBlank { getString(R.string.ygg_unknown) }
            } else {
                getString(R.string.ygg_unknown)
            }

            withContext(Dispatchers.Main) {
                statusText.text = if (!hasBinary) {
                    getString(R.string.ygg_status_no_binary)
                } else if (prefs.enabled) {
                    getString(R.string.ygg_status_running)
                } else {
                    getString(R.string.ygg_status_disabled)
                }
                addressView.text = address
                publicKeyView.text = publicKey
                resolverView.text = if (publicKey.length == 64) "$publicKey.pk.ygg" else "-"
            }
        }
    }

    private fun refreshLog() {
        lifecycleScope.launch(Dispatchers.IO) {
            val log = YggNode.readLog(this@YggSettingsActivity)
            withContext(Dispatchers.Main) {
                logView.text = log.ifBlank { getString(R.string.ygg_log_empty) }
            }
        }
    }

    private fun latestCrashLog(): String? {
        return runCatching {
            val dir = File(filesDir, "crash-logs")
            dir.listFiles()?.maxByOrNull { it.name }?.takeIf { it.length() > 0 }?.readText()
        }.getOrNull()
    }

    private fun setupDiagnostics() {
        crashView.text = buildString {
            appendLine("device: ${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL} (${android.os.Build.DEVICE})")
            appendLine("android: ${android.os.Build.VERSION.RELEASE} (SDK ${android.os.Build.VERSION.SDK_INT})")
            runCatching {
                val wv = android.webkit.WebView.getCurrentWebViewPackage()
                appendLine("webview: ${wv?.versionName}")
            }
            appendLine("cpu: ${android.os.Build.SUPPORTED_ABIS?.joinToString(",")}")
            appendLine("---")
            append(latestCrashLog() ?: getString(R.string.ygg_crash_empty))
        }
        shareCrashButton.setOnClickListener {
            val text = crashView.text.toString()
            val intent = Intent(Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(Intent.EXTRA_TEXT, text)
            }
            startActivity(Intent.createChooser(intent, getString(R.string.ygg_share_crash)))
        }
    }

    override fun onOptionsItemSelected(item: MenuItem): Boolean {
        if (item.itemId == android.R.id.home) {
            finish()
            return true
        }
        return super.onOptionsItemSelected(item)
    }
}
