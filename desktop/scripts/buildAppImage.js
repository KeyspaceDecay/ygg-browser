const builder = require('electron-builder')
const packageFile = require('./../package.json')
const version = packageFile.version
const Platform = builder.Platform
const Arch = builder.Arch

  require('./createPackage.js')('linux', {arch: Arch.x64}).then(function (path) {
  const options = {
    linux: {
      target: ['AppImage'],
      icon: 'icons/icon256.png',
      category: 'Network',
      packageCategory: 'Network',
      mimeTypes: ['x-scheme-handler/http', 'x-scheme-handler/https', 'text/html'],
      synopsis: 'A browser that routes all traffic through the end-to-end encrypted Yggdrasil network.',
      description: 'A crypto-anarchist browser for the Yggdrasil mesh network, based on Min. Includes a built-in yggstack node, fail-closed SOCKS5 routing, .ygg and .pk.ygg name support, and a network settings screen.',
      maintainer: 'Ygg Browser contributors',
      artifactName: 'Ygg-Browser-${version}-${arch}.AppImage',
    },
    directories: {
      output: 'dist/app/'
    },
    publish: null
  }

  builder.build({
    prepackaged: path,
    targets: Platform.LINUX.createTarget(['AppImage'], Arch.x64),
    config: options
  })
})
