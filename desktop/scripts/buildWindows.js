const builder = require('electron-builder')
const Arch = builder.Arch
const Platform = builder.Platform

const createPackage = require('./createPackage.js')

/*
Builds NSIS installers for Windows (x64 and arm64). NSIS is used instead
of Squirrel because it works reliably in CI and produces a classic
setup.exe with selectable install directory.
*/

async function buildArch (arch, suffix) {
  const appDir = await createPackage('win32', { arch })

  const options = {
    appId: 'io.github.keyspacedecay.ygg-browser',
    productName: 'Ygg Browser',
    win: {
      icon: 'icons/icon256.ico',
      artifactName: 'Ygg-Browser-Setup-${version}-' + suffix + '.${ext}'
    },
    nsis: {
      oneClick: false,
      allowToChangeInstallationDirectory: true,
      license: 'LICENSE.txt',
      perMachine: false,
      deleteAppDataOnUninstall: false
    },
    directories: {
      output: 'dist/app/',
      buildResources: 'resources'
    },
    publish: null
  }

  await builder.build({
    prepackaged: appDir,
    targets: Platform.WINDOWS.createTarget(['nsis'], arch),
    config: options
  })
}

;(async () => {
  await buildArch(Arch.x64, 'x64')
  await buildArch(Arch.arm64, 'arm64')
    .catch(err => {
      // arm64 windows is nice to have; don't fail the release for it
      console.warn('skipping win-arm64:', err.message)
    })
  console.log('done')
})()
