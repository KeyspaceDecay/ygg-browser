# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/CypherpunksWriteCode/ygg-browser/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/CypherpunksWriteCode/ygg-browser/releases/tag/v0.1.0
