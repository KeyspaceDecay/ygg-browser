/* Yggdrasil settings bridge for min:// pages (contextIsolation-safe) */

var yggIpc = require('electron').ipcRenderer

window.addEventListener('message', function (e) {
  if (!e.origin.startsWith('min://')) {
    return
  }

  if (e.data && e.data.message === 'yggRequest') {
    var kind = e.data.kind // 'state' | 'log' | 'save'
    var payload = e.data.payload
    var promise
    if (kind === 'state') {
      promise = yggIpc.invoke('ygg-get-state')
    } else if (kind === 'log') {
      promise = yggIpc.invoke('ygg-get-log')
    } else if (kind === 'save') {
      promise = yggIpc.invoke('ygg-save-settings', payload)
    }
    if (promise) {
      promise.then(function (response) {
        window.postMessage({ message: 'yggResponse', kind: kind, response: response }, window.location.toString())
      }).catch(function (err) {
        window.postMessage({ message: 'yggResponse', kind: kind, error: String(err) }, window.location.toString())
      })
    }
  }
})
