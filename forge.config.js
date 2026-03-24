const path = require('path')

// Set ke true hanya kalau punya Apple Developer certificate untuk distribusi
const SIGN_FOR_DISTRIBUTION = false

module.exports = {
  packagerConfig: {
    name: 'MustLab',
    executableName: 'MustLab',
    appBundleId: 'com.mustlab.app',
    appCopyright: `Copyright © ${new Date().getFullYear()} MustLab`,
    icon: path.join(__dirname, 'src/renderer/assets/icons/icon'),
    asar: {
      unpack: '**/*.{node,exe,dylib,so,dll}'
    },
    extraResource: [
      path.join(__dirname, 'resources/bin'),
      path.join(__dirname, 'resources/scripts'),
    ],
    ignore: [
      /^\/docs/,
      /^\/\.git/,
      /\.log$/,
      /node_modules\/\.cache/,
    ],
    // osxSign hanya aktif untuk distribusi (butuh Apple Developer certificate)
    ...(SIGN_FOR_DISTRIBUTION ? {
      osxSign: {
        optionsForFile: () => ({
          entitlements: path.join(__dirname, 'resources/entitlements.mac.plist'),
          entitlementsInherit: path.join(__dirname, 'resources/entitlements.mac.plist'),
        }),
      },
    } : {}),
  },

  makers: [
    {
      name: '@electron-forge/maker-dmg',
      config: {
        // UDZO: lebih kompatibel di CI runner (ULFO butuh macOS 10.15+ hdiutil flags tertentu)
        format: 'UDZO',
        name: 'MustLab',
        // Icon untuk file DMG itu sendiri (yang muncul di Finder saat di-mount)
        icon: path.join(__dirname, 'src/renderer/assets/icons/icon.icns'),
        // Ukuran & posisi icon di dalam window DMG
        iconSize: 80,
        contents: [
          { x: 180, y: 170, type: 'file',   path: path.join(__dirname, 'out', 'MustLab-darwin-x64', 'MustLab.app') },
          { x: 480, y: 170, type: 'link',   path: '/Applications' },
        ],
        // Ukuran window DMG
        window: {
          size: { width: 660, height: 400 }
        },
      }
    },
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'mustlab',
        authors: 'TestPilot Team',
        exe: 'mustlab.exe'
      }
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin', 'win32']
    }
  ],

  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {}
    }
  ],

  hooks: {
    packageAfterCopy: async (config, buildPath) => {
      const { execSync } = require('child_process')
      console.log('Rebuilding native modules for packaged app...')
      execSync(`electron-rebuild -f -w better-sqlite3 --module-dir "${buildPath}"`, {
        stdio: 'inherit'
      })
    }
  }
}