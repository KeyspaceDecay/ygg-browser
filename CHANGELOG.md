# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.2] - 2026-11-15

### Fixed

- Android: startup crash — the Yggdrasil gateway service called
  Process.pid() which is not available on all runtimes
  (NoSuchMethodError, reproduced and verified fixed on an API 35
  emulator with a signed release build)
- Android: on-device crash logs are captured again (the handler was
  not carried over to the Fenix base)
- Android: single launcher icon; the Yggdrasil network settings now
  live inside the browser's Settings screen (Tor Browser style)

## [0.2.1] - 2026-11-15

### Fixed

- Android: the app is named "Ygg Browser" everywhere (the fork flavor
  still carried the upstream "Iceraven" name and "Firefox" strings)

## [0.2.0] - 2026-11-15

### Changed

- Android: complete rebase — the browser is now Firefox 160 (GeckoView)
  via the Iceraven fork, replacing the Lightning/WebView base. The proxy
  is applied through Gecko's own network.proxy.* preferences (SOCKS5,
  remote DNS) before the engine starts; no dependency on the system
  WebView at all
- Android: telemetry remains off by default; app id org.mozilla.ygg

### Fixed

- Android: launcher icon and app name are Ygg Browser everywhere
- Windows: NSIS installer (Squirrel was unreliable in CI)

## [0.1.2]

## [0.1.2] - 2026-11-15

### Added

- "Ygg Diagnostics" launcher entry: opens the network/diagnostics screen
  directly, so crash logs can be read even if the browser fails to start
- Device info (model, Android, WebView version, ABIs) in diagnostics
- Lite flavor launcher icons now use the Ygg Browser icon

## [0.1.1] - 2026-11-15

### Added

- Local crash logging (kept on-device, shareable from
  Yggdrasil settings — Diagnostics) instead of any telemetry
- Diagnostics section in the Android network settings screen

### Fixed

- Android: app name is now "Ygg Browser" in every locale
- Android: only arm64-v8a is packaged (no dead ABI filters)
- Android: failures of the Yggdrasil integration can no longer
  crash the browser at startup
- Windows: NSIS installer replaces Squirrel (works reliably in CI)
- Release: APK is a signed release build; SHA256SUMS cover all assets

## [0.1.0] - 2026-11-15

First public release.

### Added

- Desktop browser (Windows, Linux) based on Min 1.35.7:
  - Built-in yggstack sidecar managed by the browser — no root, no TUN
    device, respawn on crash, rotating log file
  - Fail-closed routing: all traffic goes through the local SOCKS5 proxy,
    clearnet is unreachable
  - Persistent node identity (ed25519 keypair generated on first launch,
    stable Yggdrasil address and `<publickey>.pk.ygg` resolver name)
  - Address bar support for Yggdrasil IPv6 literals, `.ygg` and `.pk.ygg`
    names; HTTPS-upgrade is disabled for Yggdrasil sites
  - Network settings screen (peers, SOCKS port, optional `.ygg` DNS
    server, proxy mode, embedded/external process mode)
  - Start page with known network services; yggdrasil bookmarks
  - Crash reporter and other upstream telemetry removed
- Android browser (arm64) based on Lightning Browser:
  - yggstack binary packaged as `libyggstack.so`, run by a foreground
    service with auto-restart
  - WebView routing via the public `androidx.webkit` ProxyController API
    (SOCKS, fail-closed)
  - Network settings screen with identity display and log viewer
  - Default bookmarks pointing into the network
- CI: lint, build and an end-to-end network smoke test (two local
  yggstack nodes, SOCKS5 fetch via raw address and `.pk.ygg`), release
  packaging for Windows, Linux and Android

[Unreleased]: https://github.com/KeyspaceDecay/ygg-browser/compare/v0.2.2...HEAD
[0.2.2]: https://github.com/KeyspaceDecay/ygg-browser/compare/v0.2.1...v0.2.2
[0.2.1]: https://github.com/KeyspaceDecay/ygg-browser/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/KeyspaceDecay/ygg-browser/compare/v0.1.2...v0.2.0
[0.1.2]: https://github.com/KeyspaceDecay/ygg-browser/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/KeyspaceDecay/ygg-browser/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/KeyspaceDecay/ygg-browser/releases/tag/v0.1.0
