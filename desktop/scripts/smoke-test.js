/*
 * Smoke test: runs the real yggstack sidecar in proxy mode, waits for the
 * SOCKS port, and fetches a page through it. Verifies the exact mechanism
 * the browser uses (SOCKS5 with remote DNS resolution for .pk.ygg names).
 *
 * Usage: node scripts/smoke-test.js [path-to-yggstack] [config-dir]
 */

const { spawn } = require('child_process')
const net = require('net')
const fs = require('fs')
const os = require('os')
const path = require('path')

const binary = process.argv[2] || path.join(__dirname, '..', 'bin', 'yggstack')
const configDir = process.argv[3] || fs.mkdtempSync(path.join(os.tmpdir(), 'ygg-smoke-'))
const socksPort = parseInt(process.env.YGG_SOCKS_PORT || '1080', 10)
const configPath = path.join(configDir, 'yggdrasil.conf.json')

function run (args) {
  return new Promise((resolve, reject) => {
    const p = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    p.stdout.on('data', d => { out += d })
    p.stderr.on('data', d => { out += d })
    p.on('error', reject)
    p.on('close', () => resolve(out))
  })
}

function waitForPort (port, host, timeoutMs) {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    (function attempt () {
      const s = net.connect(port, host)
      s.setTimeout(1000)
      s.once('connect', () => { s.destroy(); resolve() })
      s.once('error', () => {
        s.destroy()
        if (Date.now() - started > timeoutMs) reject(new Error('timeout waiting for port ' + port))
        else setTimeout(attempt, 250)
      })
      s.once('timeout', () => {
        s.destroy()
        if (Date.now() - started > timeoutMs) reject(new Error('timeout waiting for port ' + port))
        else setTimeout(attempt, 250)
      })
    })()
  })
}

/* minimal SOCKS5 client with remote hostname resolution, enough for an HTTP GET */
function socksFetch (host, port = 80, pathReq = '/', useIPv6 = false) {
  return new Promise((resolve, reject) => {
    const s = net.connect(socksPort, '127.0.0.1')
    const chunks = []
    let response = Buffer.alloc(0)
    let header = ''

    s.setTimeout(30000)

    s.on('connect', () => {
      // greeting: no auth
      s.write(Buffer.from([0x05, 0x01, 0x00]))
    })

    s.on('data', d => {
      response = Buffer.concat([response, d])
      if (response.length >= 2 && response[0] === 0x05 && response[1] === 0x00 && header === '' && response.length >= 2) {
        // connected to SOCKS server; send CONNECT with hostname
        const hostBuf = Buffer.from(host, 'utf8')
        const req = Buffer.alloc(7 + hostBuf.length)
        req[0] = 0x05
        req[1] = 0x01 // CONNECT
        req[2] = 0x00
        req[3] = 0x03 // domain name
        req[4] = hostBuf.length
        hostBuf.copy(req, 5)
        req.writeUInt16BE(port, 5 + hostBuf.length)
        s.write(req)
        header = 'sent'
        return
      }
      if (header === 'sent') {
        if (response.length >= 10) {
          const reply = response[1]
          if (reply !== 0x00) {
            s.destroy()
            reject(new Error('SOCKS CONNECT failed, reply code ' + reply))
            return
          }
          // send HTTP request
          s.write('GET ' + pathReq + ' HTTP/1.0\r\nHost: ' + host + '\r\nConnection: close\r\n\r\n')
          header = 'requested'
          // fall through: remaining bytes are HTTP response start
        }
        return
      }
      chunks.push(d)
    })

    s.on('timeout', () => { s.destroy(); finish() })
    s.on('close', () => finish())
    s.on('error', reject)

    let done = false
    function finish () {
      if (done) return
      done = true
      const all = Buffer.concat([response].concat(chunks)).toString('utf8')
      resolve(all)
    }
  })
}

async function main () {
  console.log('[smoke] binary:', binary)
  if (!fs.existsSync(binary)) {
    throw new Error('yggstack binary not found, run scripts/get-yggstack.sh first')
  }

  // generate config with a stable private key
  console.log('[smoke] generating node config...')
  const conf = await run(['-genconf', '-json'])
  const parsed = JSON.parse(conf.slice(conf.indexOf('{')))
  parsed.Peers = process.env.YGG_PEERS ? process.env.YGG_PEERS.split(',').filter(Boolean) : []
  parsed.Listen = []
  parsed.AdminListen = 'none'
  parsed.MulticastInterfaces = []
  fs.writeFileSync(configPath, JSON.stringify(parsed, null, 2))

  const address = (await run(['-useconffile', configPath, '-address'])).trim()
  const publicKey = (await run(['-useconffile', configPath, '-publickey'])).trim()
  console.log('[smoke] node address:', address)
  console.log('[smoke] node public key:', publicKey)
  if (!/^2[0-9a-f]{2}|3[0-9a-f]{2}/i.test(address)) {
    throw new Error('generated address does not look like a Yggdrasil address: ' + address)
  }

  console.log('[smoke] starting yggstack in SOCKS mode on 127.0.0.1:' + socksPort)
  const child = spawn(binary, ['-useconffile', configPath, '-socks', '127.0.0.1:' + socksPort], { stdio: ['ignore', 'pipe', 'pipe'] })
  child.stdout.on('data', d => process.stdout.write('[yggstack] ' + d))
  child.stderr.on('data', d => process.stdout.write('[yggstack] ' + d))

  try {
    await waitForPort(socksPort, '127.0.0.1', 15000)
    console.log('[smoke] SOCKS port is up')

    // two local nodes: start a second node that exposes an HTTP server via -remote-tcp
    const httpServerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ygg-smoke-www-'))
    fs.writeFileSync(path.join(httpServerDir, 'index.html'), '<h1>hello from yggdrasil</h1>')
    const { execFile } = require('child_process')
    const httpServer = execFile('python3', ['-m', 'http.server', '18080', '--bind', '127.0.0.1'], { cwd: httpServerDir })
    await new Promise(resolve => setTimeout(resolve, 1000))

    // generate a second node config; node B listens for peering
    // and exposes the http server to the network via -remote-tcp
    const genB = await run(['-genconf', '-json'])
    const confListen = JSON.parse(genB.slice(genB.indexOf('{')))
    confListen.Listen = ['tcp://127.0.0.1:19999']
    confListen.Peers = []
    confListen.AdminListen = 'none'
    confListen.MulticastInterfaces = []
    const listenerConf = path.join(configDir, 'listener.conf.json')
    fs.writeFileSync(listenerConf, JSON.stringify(confListen))

    // reconfigure the client node (the one with the SOCKS proxy) to peer with B
    parsed.Peers = ['tcp://127.0.0.1:19999']
    const clientConf = path.join(configDir, 'client.conf.json')
    fs.writeFileSync(clientConf, JSON.stringify(parsed))

    const listenerAddr = (await run(['-useconffile', listenerConf, '-address'])).trim()
    const listenerKey = (await run(['-useconffile', listenerConf, '-publickey'])).trim()
    console.log('[smoke] peer node address:', listenerAddr)

    const listener = spawn(binary, ['-useconffile', listenerConf, '-remote-tcp', '80:127.0.0.1:18080'], { stdio: ['ignore', 'pipe', 'pipe'] })
    listener.stdout.on('data', d => process.stdout.write('[node-b] ' + d))
    listener.stderr.on('data', d => process.stdout.write('[node-b] ' + d))

    // restart the client with the new peer
    child.kill('SIGTERM')
    await new Promise(resolve => setTimeout(resolve, 500))
    const client = spawn(binary, ['-useconffile', clientConf, '-socks', '127.0.0.1:' + socksPort], { stdio: ['ignore', 'pipe', 'pipe'] })
    client.stdout.on('data', d => process.stdout.write('[client] ' + d))
    client.stderr.on('data', d => process.stdout.write('[client] ' + d))
    await waitForPort(socksPort, '127.0.0.1', 15000)
    await new Promise(resolve => setTimeout(resolve, 2000))

    // fetch through the SOCKS proxy by raw IPv6 literal
    console.log('[smoke] fetching http://[' + listenerAddr + ']/ through SOCKS5...')
    const res1 = await socksFetch(listenerAddr, 80, '/')
    if (!res1.includes('200') || !res1.includes('hello from yggdrasil')) {
      throw new Error('fetch via IPv6 literal failed:\n' + res1.slice(0, 300))
    }
    console.log('[smoke] OK: fetched page via raw Yggdrasil address')

    // fetch through the SOCKS proxy by .pk.ygg name (remote DNS resolution)
    console.log('[smoke] fetching http://' + listenerKey + '.pk.ygg/ through SOCKS5...')
    const res2 = await socksFetch(listenerKey + '.pk.ygg', 80, '/')
    if (!res2.includes('200') || !res2.includes('hello from yggdrasil')) {
      throw new Error('fetch via pk.ygg failed:\n' + res2.slice(0, 300))
    }
    console.log('[smoke] OK: fetched page via <publickey>.pk.ygg (remote DNS)')

    console.log('[smoke] ALL CHECKS PASSED')
    client.kill('SIGTERM')
    listener.kill('SIGTERM')
    httpServer.kill()
    process.exit(0)
  } finally {
    try { child.kill('SIGKILL') } catch (e) {}
  }
}

main().catch(err => {
  console.error('[smoke] FAILED:', err.message)
  process.exit(1)
})
