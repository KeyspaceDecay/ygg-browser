# Ygg Browser

A crypto-anarchist browser for the [Yggdrasil](https://yggdrasil-network.github.io/) mesh network.
Windows · Linux · Android

> Your keys. Your address. No ICANN, no ISPs, no permission.

Ygg Browser is a fork of two respected open-source browsers — [Min](https://github.com/minbrowser/min)
(desktop, Apache-2.0) and [Lightning](https://github.com/anthonycr/Lightning-Browser)
(Android, MPL-2.0) — with a built-in [yggstack](https://github.com/yggdrasil-network/yggstack)
sidecar that turns the browser into a full node of the Yggdrasil network.

## How it works

```
┌──────────────────────────┐        ┌───────────────────────────────┐
│  browser (Chromium /     │  SOCKS5 (localhost)   yggstack node   │
│  WebView engine)  ───────┼──────▶│  userspace, NO root, NO TUN   │
└──────────────────────────┘        └──────────────┬────────────────┘
                                                   │ end-to-end encrypted
                                    Yggdrasil mesh │ 200::/7 overlay
                                                   ▼
                                        every other node on the network
```

- **Fail-closed proxy**: all browser traffic is routed through the local
  yggstack SOCKS5 proxy. Clearnet sites are unreachable — nothing leaks.
- **Your key is your identity**: an ed25519 keypair is generated on first
  launch and stored locally. Your Yggdrasil IPv6 address never changes.
- **`.pk.ygg` names for free**: every node is reachable as
  `<publickey>.pk.ygg` — yggstack resolves these names itself, no external
  DNS needed. Optional external DNS servers enable classic `.ygg` domains.
- **No telemetry, no crash reports, no Google services** (WebView
  metrics opt-out is inherited from Lightning).
- **Userspace networking** — no root/administrator and no TUN adapter
  required, works on locked-down machines.

## Install

Grab a build from [Releases](../../releases) (or see CI artifacts on each
commit):

| Platform | Artifact |
|---|---|
| Windows | `*-setup.exe` / portable `.zip` |
| Linux | `.AppImage`, `.deb` |
| Android | `.apk` (arm64; debug-signed, installable) |

The matching `yggstack` binary for your platform is bundled automatically.

## First start

1. Open **Menu → Yggdrasil Network** (desktop) / **⋮ → Yggdrasil network**
   (Android).
2. A node identity is generated on first launch — copy your
   `address` and `public key`.
3. Pick **a few nearby peers** from
   [publicpeers.neilalexander.dev](https://publicpeers.neilalexander.dev)
   (three known-good peers are preconfigured; replace them with closer ones
   for better latency).
4. Press **Save & restart network** and browse: the new tab page lists
   well-known services inside the network. Try
   `http://d40d4a7153cf288ea28f1865f6cfe95143a478b5c8c9e7cb002a0633d10a53eb.pk.ygg/`
   (HowToYgg wiki) once your node has connected.

The address bar understands Yggdrasil addresses (`201:a8b5::1`,
`[201:a8b5::1]:8080`), `.ygg`/`.pk.ygg` names, and ordinary URLs.

## Settings

| Setting | Meaning |
|---|---|
| Enabled | start the yggstack sidecar with the browser |
| Route all traffic through Yggdrasil | fail-closed SOCKS5 proxy for every page |
| Process mode (desktop) | *embedded* — manage the bundled binary; *external* — attach to an already-running yggstack |
| Peers | one URI per line (`tcp://`, `tls://`, `quic://`, `ws://`, `wss://`) |
| SOCKS host/port | the local proxy endpoint (default `127.0.0.1:1080`) |
| DNS server | optional Yggdrasil DNS server for `.ygg` names, e.g. `[324:71e:281a:9ed3::53]:53` |

Desktop settings and logs also live on disk: `~/.config/ygg-browser/ygg-settings.json`
and `logs/yggstack.log`.

## Build from source

### Desktop (Windows / Linux / macOS)

```sh
cd desktop
npm install
../scripts/get-yggstack.sh     # downloads yggstack binaries
npm start                      # dev mode
npm run buildWindows           # or buildDebian / buildAppImage / buildMacArm
```

Run the network smoke test (two local nodes + SOCKS5 + `.pk.ygg` DNS):

```sh
node scripts/smoke-test.js
```

### Android

Requires JDK 21 and the Android SDK.

```sh
cd android
mkdir -p app/src/main/jniLibs/arm64-v8a
curl -fL -o app/src/main/jniLibs/arm64-v8a/libyggstack.so \
  https://github.com/yggdrasil-network/yggstack/releases/download/1.0.6/yggstack-android-arm64
chmod +x app/src/main/jniLibs/arm64-v8a/libyggstack.so
./gradlew lightningLiteDebug assembleDebug
```

The yggstack binary is packaged as `libyggstack.so` in `jniLibs`, because
Android 10+ only allows executing binaries from the app's native library
directory. Only `arm64-v8a` is shipped.

## Repository layout

```
desktop/   Electron browser based on Min + ygg integration
  main/ygg.js          sidecar manager (spawn/respawn/proxy/IPC)
  pages/yggSettings/   network settings page
  pages/newtab/        start page with known Yggdrasil services
  scripts/smoke-test.js  e2e network test
android/   WebView browser based on Lightning + ygg integration
  .../ygg/YggstackService.kt   foreground service running yggstack
  .../ygg/YggProxy.kt          WebView proxy (fail-closed)
  .../ygg/YggSettingsActivity.kt  network settings screen
scripts/   shared helpers (yggstack downloader)
vendor/    yggstack release binaries (not committed, downloaded on demand)
```

## Licenses & credits

- This repository's own code: **Apache-2.0** (desktop parts) and **MPL-2.0**
  (Android parts), same as the upstream projects it forks. See `LICENSE`
  and `NOTICE.md`.
- Desktop browser: [Min](https://github.com/minbrowser/min) by PalmerAL
  et al., Apache-2.0.
- Android browser: [Lightning Browser](https://github.com/anthonycr/Lightning-Browser)
  by A.C.R. Development, MPL-2.0.
- [yggstack](https://github.com/yggdrasil-network/yggstack) and
  [Yggdrasil-go](https://github.com/yggdrasil-network/yggdrasil-go),
  LGPL-3.0 with a linking exception — distributed as unmodified release
  binaries.

## Threat model (honesty section)

- Traffic inside the network is end-to-end encrypted between Yggdrasil
  nodes; your *peers* and the network topology are still visible to the
  peers you connect to. Choose peers you reasonably trust.
- Most Yggdrasil sites are plain HTTP — transport is encrypted by the
  overlay, but there is no Web PKI inside the network. Verify keys out of
  band when it matters (the `.pk.ygg` name *is* the key).
- The browser only protects what goes through it; other apps on your
  system use the normal internet.
