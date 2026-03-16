const path = require('path')

module.exports = {
    packagerConfig: {
        name: 'TestPilot',
        executableName: 'testpilot',
        icon: path.join(__dirname, 'src/renderer/assets/icons/icon'),
        asar: {
            unpack: '**/*.{node,exe,dylib,so,dll}'  // unpack native binaries dari asar
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
        // Minimum macOS version (untuk Apple Silicon support)
        osxSign: {},
    },

    makers: [
        {
            name: '@electron-forge/maker-dmg',
            config: {
                format: 'ULFO',
                name: 'TestPilot'
            }
        },
        {
            name: '@electron-forge/maker-squirrel',
            config: {
                name: 'testpilot',
                authors: 'TestPilot Team',
                exe: 'testpilot.exe'
            }
        },
        {
            name: '@electron-forge/maker-zip',
            platforms: ['darwin', 'win32']
        }
    ],

    plugins: [
        {
            // Auto-handle native modules (.node files) saat packaging
            name: '@electron-forge/plugin-auto-unpack-natives',
            config: {}
        }
    ],

    // Hook untuk rebuild native modules sebelum packaging
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