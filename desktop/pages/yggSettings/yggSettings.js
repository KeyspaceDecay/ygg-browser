document.title = 'Yggdrasil Network'

function yggRequest (kind, payload) {
  return new Promise(function (resolve, reject) {
    function onMessage (e) {
      if (e.data && e.data.message === 'yggResponse' && e.data.kind === kind) {
        window.removeEventListener('message', onMessage)
        if (e.data.error) {
          reject(new Error(e.data.error))
        } else {
          resolve(e.data.response)
        }
      }
    }
    window.addEventListener('message', onMessage)
    window.postMessage({ message: 'yggRequest', kind: kind, payload: payload }, window.location.toString())
  })
}

var state = null

function renderState (s) {
  state = s

  var dot = document.getElementById('ygg-status-dot')
  var text = document.getElementById('ygg-status-text')

  dot.classList.remove('running', 'stopped', 'waiting')

  if (!s.settings.enabled && s.settings.mode !== 'external') {
    dot.classList.add('stopped')
    text.textContent = 'Yggdrasil is disabled'
  } else if (s.running) {
    dot.classList.add('running')
    text.textContent = 'yggstack is running'
  } else if (s.settings.mode === 'external') {
    dot.classList.add('waiting')
    text.textContent = 'External mode \u2014 using ' + s.settings.socksHost + ':' + s.settings.socksPort
  } else {
    dot.classList.add('waiting')
    text.textContent = 'Starting yggstack...'
  }

  function setRow (rowId, valueId, value) {
    var row = document.getElementById(rowId)
    if (value) {
      row.hidden = false
      document.getElementById(valueId).textContent = value
    } else {
      row.hidden = true
    }
  }

  setRow('ygg-address-row', 'ygg-address', s.address)
  setRow('ygg-publickey-row', 'ygg-publickey', s.publicKey)
  setRow('ygg-subnet-row', 'ygg-subnet', s.subnet)

  document.getElementById('ygg-resolver').textContent = s.publicKey ? s.publicKey + '.pk.ygg' : '\u2014'
  document.getElementById('ygg-socks').textContent = s.settings.socksHost + ':' + s.settings.socksPort

  document.getElementById('ygg-enabled').checked = s.settings.enabled
  document.getElementById('ygg-proxy').checked = s.settings.proxyMode === 'ygg-only'
  document.getElementById('ygg-mode').value = s.settings.mode
  document.getElementById('ygg-peers').value = s.settings.peers.join('\n')
  document.getElementById('ygg-socks-host').value = s.settings.socksHost
  document.getElementById('ygg-socks-port').value = s.settings.socksPort
  document.getElementById('ygg-nameserver').value = s.settings.nameserver || ''
}

function refreshState () {
  yggRequest('state').then(renderState).catch(function (e) {
    document.getElementById('ygg-status-text').textContent = 'Error: ' + e.message
  })
}

function refreshLog () {
  yggRequest('log').then(function (log) {
    var el = document.getElementById('ygg-log')
    var wasAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 20
    el.textContent = log || '(no log output)'
    if (wasAtBottom) {
      el.scrollTop = el.scrollHeight
    }
  }).catch(function () {})
}

document.getElementById('ygg-save').addEventListener('click', function () {
  var peers = document.getElementById('ygg-peers').value
    .split('\n')
    .map(function (line) { return line.trim() })
    .filter(Boolean)

  var newSettings = Object.assign({}, state ? state.settings : {}, {
    enabled: document.getElementById('ygg-enabled').checked,
    proxyMode: document.getElementById('ygg-proxy').checked ? 'ygg-only' : 'off',
    mode: document.getElementById('ygg-mode').value,
    peers: peers,
    socksHost: document.getElementById('ygg-socks-host').value.trim() || '127.0.0.1',
    socksPort: parseInt(document.getElementById('ygg-socks-port').value, 10) || 1080,
    nameserver: document.getElementById('ygg-nameserver').value.trim()
  })

  yggRequest('save', newSettings).then(function (s) {
    renderState(s)
    var indicator = document.getElementById('ygg-saved-indicator')
    indicator.hidden = false
    setTimeout(function () { indicator.hidden = true }, 2000)
  })
})

Array.prototype.forEach.call(document.querySelectorAll('.ygg-copy-button'), function (button) {
  button.addEventListener('click', function () {
    var text = document.getElementById(button.getAttribute('data-copy-target')).textContent
    navigator.clipboard.writeText(text)
  })
})

refreshState()
refreshLog()
setInterval(refreshLog, 2500)
setInterval(refreshState, 10000)
