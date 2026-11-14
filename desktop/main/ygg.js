/*
Yggdrasil network integration.

Manages a bundled (or system) yggstack process that provides a SOCKS5
proxy into the Yggdrasil network, without requiring root or a TUN
device. The node identity (ed25519 private key) is stored in the user
data directory, so your Yggdrasil address is stable across launches.
*/

const electron = require('electron')
const { app, ipcMain, session } = electron
const fs = require('fs')
const net = require('net')
const path = require('path')
const { spawn } = require('child_process')

const isWindows = process.platform === 'win32'
const binaryName = isWindows ? 'yggstack.exe' : 'yggstack'

const DEFAULT_SETTINGS = {
  enabled: true,
  mode: 'embedded', // embedded = we manage the binary, external = connect to an already-running yggstack
  // A few well-known public peers with good uptime (https://publicpeers.neilalexander.dev).
  // Replace them with nearby peers for better latency.
  peers: [
    'tcp://51.15.204.214:12345', // France
    'tcp://ygg.mkg20001.io:80', // Germany
    'tcp://89.110.116.167:65535' // Netherlands
  ],
  socksHost: '127.0.0.1',
  socksPort: 1080,
  nameserver: '', // optional Yggdrasil DNS server, e.g. [324:71e:281a:9ed3::53]:53
  proxyMode: 'ygg-only' // ygg-only = all traffic through Yggdrasil, off = no proxy
}

var settings = Object.assign({}, DEFAULT_SETTINGS)
var nodeInfo = { address: null, publicKey: null, subnet: null }
var child = null
var stopping = false
var restartTimer = null
var restartBackoff = 1000
var logLines = []
var stateListeners = []

function userDataDir () {
  return app.getPath('userData')
}

function settingsFile () {
  return path.join(userDataDir(), 'ygg-settings.json')
}

function nodeConfigFile () {
  return path.join(userDataDir(), 'ygg', 'yggdrasil.conf.json')
}

function logFile () {
  return path.join(userDataDir(), 'logs', 'yggstack.log')
}

function loadSettings () {
  try {
    const data = JSON.parse(fs.readFileSync(settingsFile(), 'utf-8'))
    settings = Object.assign({}, DEFAULT_SETTINGS, data)
  } catch (e) {}
  return settings
}

function saveSettings (newSettings) {
  settings = Object.assign({}, DEFAULT_SETTINGS, newSettings)
  fs.mkdirSync(userDataDir(), { recursive: true })
  fs.writeFileSync(settingsFile(), JSON.stringify(settings, null, 2))
}

function resolveBinary () {
  // packaged app: extraResources/yggstack
  const packaged = path.join(process.resourcesPath, 'yggstack', binaryName)
  if (process.resourcesPath && fs.existsSync(packaged)) {
    return packaged
  }
  // development checkout: desktop/bin/
  const dev = path.join(__dirname, '..', 'bin', binaryName)
  if (fs.existsSync(dev)) {
    return dev
  }
  // fall back to PATH
  return binaryName
}

function runSync (args) {
  const result = require('child_process').spawnSync(resolveBinary(), args, { encoding: 'utf-8' })
  if (result.error) {
    throw result.error
  }
  return (result.stdout || '').trim()
}

/*
Creates userData/ygg/yggdrasil.conf.json on first run and keeps it in
sync with the user's settings. The PrivateKey is generated once and
never overwritten, which keeps the node identity stable.
*/
function ensureNodeConfig () {
  const file = nodeConfigFile()
  fs.mkdirSync(path.dirname(file), { recursive: true })

  let conf = {}
  let isNew = false
  try {
    conf = JSON.parse(fs.readFileSync(file, 'utf-8'))
  } catch (e) {
    isNew = true
  }

  if (isNew || !conf.PrivateKey) {
    try {
      conf = JSON.parse(runSync(['-genconf', '-json']))
    } catch (e) {
      conf = {}
    }
  }

  conf.Peers = settings.peers.filter(function (p) { return p && p.trim() })
  conf.Listen = [] // client node: no inbound listeners unless the user adds peers that require it
  conf.AdminListen = 'none'
  conf.MulticastInterfaces = []

  fs.writeFileSync(file, JSON.stringify(conf, null, 2))
  return file
}

function refreshIdentity () {
  try {
    nodeInfo.address = runSync(['-useconffile', nodeConfigFile(), '-address'])
    nodeInfo.publicKey = runSync(['-useconffile', nodeConfigFile(), '-publickey'])
    nodeInfo.subnet = runSync(['-useconffile', nodeConfigFile(), '-subnet'])
  } catch (e) {}
}

function appendLog (line) {
  logLines.push(line)
  if (logLines.length > 1000) {
    logLines = logLines.slice(-500)
  }
  try {
    fs.mkdirSync(path.dirname(logFile()), { recursive: true })
    fs.appendFileSync(logFile(), line + '\n')
  } catch (e) {}
  emitState()
}

function emitState () {
  stateListeners.forEach(function (fn) { fn(getState()) })
}

function getState () {
  return {
    settings: settings,
    running: isRunning(),
    embedded: settings.mode === 'embedded' && settings.enabled,
    address: nodeInfo.address,
    publicKey: nodeInfo.publicKey,
    subnet: nodeInfo.subnet,
    socks: (settings.enabled || settings.mode === 'external') ? (settings.socksHost + ':' + settings.socksPort) : null,
    proxyMode: settings.proxyMode
  }
}

function isRunning () {
  return !!(child && !child.killed && child.exitCode === null)
}

function start () {
  if (settings.mode === 'external' || !settings.enabled) {
    appendLog('[ygg] external/legacy mode: not starting a sidecar process')
    return
  }
  if (isRunning()) {
    return
  }
  stopping = false
  const confFile = ensureNodeConfig()

  const args = ['-useconffile', confFile, '-socks', settings.socksHost + ':' + settings.socksPort]
  if (settings.nameserver) {
    args.push('-nameserver', settings.nameserver)
  }

  appendLog('[ygg] starting yggstack: ' + resolveBinary() + ' ' + args.join(' '))
  try {
    child = spawn(resolveBinary(), args, { stdio: ['ignore', 'pipe', 'pipe'] })
  } catch (e) {
    appendLog('[ygg] failed to start yggstack: ' + e.message)
    return
  }

  child.stdout.on('data', function (data) {
    data.toString().split('\n').filter(Boolean).forEach(appendLog)
  })
  child.stderr.on('data', function (data) {
    data.toString().split('\n').filter(Boolean).forEach(appendLog)
  })
  child.on('error', function (err) {
    appendLog('[ygg] yggstack error: ' + err.message)
  })
  child.on('exit', function (code, signal) {
    appendLog('[ygg] yggstack exited (code ' + code + ', signal ' + signal + ')')
    child = null
    emitState()
    if (!stopping && settings.enabled && settings.mode === 'embedded') {
      scheduleRestart()
    }
  })
  emitState()
}

function scheduleRestart () {
  if (restartTimer) {
    clearTimeout(restartTimer)
  }
  appendLog('[ygg] restarting yggstack in ' + restartBackoff + ' ms')
  restartTimer = setTimeout(function () {
    restartTimer = null
    start()
    restartBackoff = Math.min(restartBackoff * 2, 30000)
  }, restartBackoff)
}

function stop () {
  stopping = true
  if (restartTimer) {
    clearTimeout(restartTimer)
    restartTimer = null
  }
  if (child) {
    try {
      child.kill(isWindows ? '' : 'SIGTERM')
      // give it a moment, then force-kill
      const c = child
      setTimeout(function () {
        try { c.kill('SIGKILL') } catch (e) {}
      }, 3000)
    } catch (e) {}
    child = null
  }
  restartBackoff = 1000
  emitState()
}

function restart () {
  stop()
  setTimeout(function () {
    loadSettings()
    refreshIdentity()
    start()
    applyProxyToAllSessions()
  }, 500)
}

function isSocksReady (timeoutMs) {
  return new Promise(function (resolve) {
    const started = Date.now()
    function attempt () {
      const socket = net.connect(settings.socksPort, settings.socksHost)
      socket.setTimeout(1500)
      socket.on('connect', function () {
        socket.destroy()
        resolve(true)
      })
      socket.on('error', function () {
        socket.destroy()
        if (Date.now() - started > (timeoutMs || 15000)) {
          resolve(false)
        } else {
          setTimeout(attempt, 300)
        }
      })
      socket.on('timeout', function () {
        socket.destroy()
        if (Date.now() - started > (timeoutMs || 15000)) {
          resolve(false)
        } else {
          setTimeout(attempt, 300)
        }
      })
    }
    attempt()
  })
}

function applyProxy (ses) {
  if (!ses || ses.isDestroyed()) {
    return
  }
  if (settings.enabled && settings.proxyMode === 'ygg-only') {
    ses.setProxy({
      proxyRules: 'socks5://' + settings.socksHost + ':' + settings.socksPort
    }).catch(function () {})
  } else {
    ses.setProxy({ mode: 'direct' }).catch(function () {})
  }
}

function applyProxyToAllSessions () {
  applyProxy(session.defaultSession)
  session.getAllSessions().forEach(applyProxy)
}

function initialize () {
  loadSettings()
  if (settings.enabled && settings.mode === 'embedded') {
    try {
      ensureNodeConfig()
      refreshIdentity()
    } catch (e) {
      appendLog('[ygg] warning: could not read node identity: ' + e.message)
    }
    start()
    isSocksReady(20000).then(function (ready) {
      appendLog(ready ? '[ygg] SOCKS proxy is ready' : '[ygg] SOCKS proxy did not become ready in time (no peers?)')
    })
  }
  applyProxyToAllSessions()
}

function shutdown () {
  stop()
}

/* IPC API, used by the ygg:// settings page and the start page */

ipcMain.handle('ygg-get-state', function () {
  return getState()
})

ipcMain.handle('ygg-get-log', function () {
  return logLines.slice(-300).join('\n')
})

ipcMain.handle('ygg-save-settings', function (e, newSettings) {
  saveSettings(newSettings)
  restart()
  return getState()
})

ipcMain.on('ygg-open-settings', function () {
  electron.BrowserWindow.getAllWindows().forEach(function (win) {
    // only the browser windows (they have a child webContents view)
    try {
      win.getContentView().children[0].webContents.send('addTab', {
        url: 'min://app/pages/yggSettings/index.html'
      })
      if (win.isMinimized()) {
        win.restore()
      }
      win.focus()
    } catch (err) {}
  })
})

app.on('session-created', function (ses) {
  applyProxy(ses)
})

module.exports = {
  initialize: initialize,
  shutdown: shutdown,
  restart: restart,
  getState: getState,
  applyProxy: applyProxy,
  loadSettings: loadSettings,
  isSocksReady: isSocksReady
}
