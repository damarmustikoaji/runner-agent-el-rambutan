/**
 * ./forge.config.js
 *
 */

const path = require('path')

module.exports = {
  packagerConfig: {
    name: 'MustLab',
    executableName: 'MustLab',
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
    osxSign: {
      optionsForFile: () => ({
        entitlements: path.join(__dirname, 'resources/entitlements.mac.plist'),
        entitlementsInherit: path.join(__dirname, 'resources/entitlements.mac.plist'),
      }),
    },
  },

  makers: [
    {
      name: '@electron-forge/maker-dmg',
      config: {
        format: 'ULFO',
        name: 'MustLab'
      }
    },
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        name: 'MustLab',
        authors: 'damar',
        exe: 'MustLab.exe'
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