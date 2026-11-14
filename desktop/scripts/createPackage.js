const builder = require('electron-builder')
const Platform = builder.Platform
const Arch = builder.Arch

const { flipFuses, FuseVersion, FuseV1Options } = require('@electron/fuses')
const fs = require('fs')
const path = require('path')

/* Copies the platform-matching yggstack binary into the package, so the
   browser can start a Yggdrasil SOCKS gateway out of the box. */
function copyYggstack (context) {
  const platformName = context.electronPlatformName
  let sourceName
  let destName

  if (platformName === 'win32') {
    sourceName = 'yggstack-windows-amd64.exe'
    destName = 'yggstack.exe'
  } else if (platformName === 'linux') {
    sourceName = context.arch === Arch.arm64 ? 'yggstack-linux-arm64-static' : 'yggstack-linux-amd64-static'
    destName = 'yggstack'
  } else if (platformName === 'darwin') {
    sourceName = context.arch === Arch.arm64 ? 'yggstack-darwin-arm64' : 'yggstack-darwin-amd64'
    destName = 'yggstack'
  } else {
    return
  }

  const source = path.join(__dirname, '..', '..', 'vendor', 'yggstack', sourceName)
  if (!fs.existsSync(source)) {
    console.warn('yggstack binary not found at ' + source + ' — the app will fall back to a system-installed yggstack')
    return
  }

  const destDir = path.join(context.appOutDir, 'resources', 'yggstack')
  fs.mkdirSync(destDir, { recursive: true })
  fs.copyFileSync(source, path.join(destDir, destName))
  fs.chmodSync(path.join(destDir, destName), 0o755)
  console.log('bundled ' + sourceName + ' -> resources/yggstack/' + destName)
}

function toPath (platform, arch) {
  if (platform == 'win32') {
    switch (arch) {
      case Arch.arm64:
        return 'dist/app/win-arm64-unpacked'
      case Arch.x64:
        return 'dist/app/win-unpacked'
      default:
        return null
    }
  } else if (platform == 'linux') {
    switch (arch) {
      case Arch.x64:
        return 'dist/app/linux-unpacked'
      case Arch.arm64:
        return 'dist/app/linux-arm64-unpacked'
      default:
        return null
    }
  } else if (platform == 'mac') {
    switch (arch) {
      case Arch.arm64:
        return 'dist/app/mac-arm64'
      case Arch.x64:
        return 'dist/app/mac'
      default:
        return null
    }
  }
}

module.exports = function (platform, extraOptions) {
  //https://github.com/electron-userland/electron-builder/issues/6365#issuecomment-1186038034
  const afterPack = async context => {
    const ext = {
      darwin: '.app',
      win32: '.exe',
      linux: ['']
    }[context.electronPlatformName]

    const IS_LINUX = context.electronPlatformName === 'linux'
    /* on Linux the executable is named after package.json "name",
       on Windows/macOS after productName */
    const executableName = IS_LINUX
      ? context.packager.appInfo.executableName
      : context.packager.appInfo.productFilename

    const electronBinaryPath = path.join(
      context.appOutDir,
      `${executableName}${ext}`
    )

    await flipFuses(electronBinaryPath, {
      version: FuseVersion.V1,
      [FuseV1Options.GrantFileProtocolExtraPrivileges]: false
    })

    copyYggstack(context)
  }

  const options = {
    files: [
      '**/*',
      '!**/{.DS_Store,.git,.hg,.svn,CVS,RCS,SCCS,.gitignore,.gitattributes}',
      '!**/{appveyor.yml,.travis.yml,circle.yml}',
      '!**/node_modules/*.d.ts',
      '!**/*.map',
      '!**/*.md',
      '!**/._*',
      '!**/icons/source',
      '!dist/app',
      // this is copied during the build
      '!**/icons/icon.icns',
      // localization files are compiled and copied to dist
      '!localization/',
      '!scripts/',
      // dev-only yggstack binary, the packaged one is copied in afterPack
      '!bin/',
      // These are bundled in.
      '!**/main',
      // parts of modules that aren"t needed
      '!**/node_modules/@types/',
      '!**/node_modules/pdfjs-dist/legacy',
      '!**/node_modules/pdfjs-dist/lib',
      '!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}'
    ],
    linux: {
      target: [
        {
          target: 'dir',
          arch: ['x64', 'arm64']
        }
      ]
    },
    win: {
      target: 'dir',
      icon: 'icons/icon256.ico'
    },
    mac: {
      icon: 'icons/icon.icns',
      target: 'dir',
      darkModeSupport: true,
      extendInfo: {
        NSHumanReadableCopyright: null,
        CFBundleDocumentTypes: [
          {
            CFBundleTypeName: 'HTML document',
            CFBundleTypeRole: 'Viewer',
            LSItemContentTypes: ['public.html']
          },
          {
            CFBundleTypeName: 'XHTML document',
            CFBundleTypeRole: 'Viewer',
            LSItemContentTypes: ['public.xhtml']
          }
        ],
        NSUserActivityTypes: ['NSUserActivityTypeBrowsingWeb'], // macOS handoff support
        LSFileQuarantineEnabled: true // https://github.com/minbrowser/min/issues/2073
        // need to revisit if implementing autoupdate, see https://github.com/brave/browser-laptop/issues/13817
      }
    },
    directories: {
      output: 'dist/app',
      buildResources: 'resources'
    },
    protocols: [
      {
        name: 'HTTP link',
        schemes: ['http', 'https']
      },
      {
        name: 'File',
        schemes: ['file']
      }
    ],
    asar: false,
    afterPack: afterPack,
    publish: null,
    /*
    Rebuilding native modules that use nan is currently broken for Electron 32+: https://github.com/nodejs/nan/issues/973
    This breaks PDFJS -> canvas, which causes packaging to fail.
    Luckily for us, we don't actually use this functionality in PDFJS, and this is the only native module in the build,
    so we can just disable rebuilding entirely. However, we may need to find a better solution in the future.
    */
    npmRebuild: false
  }

  const target = (function () {
    if (platform == 'win32') {
      return Platform.WINDOWS.createTarget(['dir'], extraOptions.arch)
    } else if (platform == 'linux') {
      return Platform.LINUX.createTarget(['dir'], extraOptions.arch)
    } else if (platform == 'mac') {
      return Platform.MAC.createTarget(['dir'], extraOptions.arch)
    }
  }())

  return builder.build({
    targets: target,
    config: options
  }).then(() => {
    return Promise.resolve(toPath(platform, extraOptions.arch))
  })
}
