<div align="center">
  <img src="src/renderer/assets/icons/icon.png" width="80" alt="MustLab"/>
  <h1>MustLab</h1>
  <p>Mobile test automation for QA teams — no coding required</p>

  ![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
  ![Android](https://img.shields.io/badge/Android-supported-green)
  ![iOS](https://img.shields.io/badge/iOS%20Simulator-supported-blue)
  ![Electron](https://img.shields.io/badge/Electron-29-47848F)
  ![Maestro](https://img.shields.io/badge/Maestro%20CLI-latest-FF6B6B)
  ![License](https://img.shields.io/badge/license-MIT-blue)
</div>

---

MustLab adalah Electron app untuk QA non-teknis yang ingin menjalankan automation test di Android dan iOS Simulator tanpa perlu belajar koding. Semua dilakukan lewat UI — mulai dari inspect element, buat test case, sampai eksekusi dan lihat hasilnya.

## Features

- **Inspector & Editor** — screenshot live device, klik element untuk generate selector, tambah steps via tombol (Tap, Assert, Swipe, dll)
- **Projects & Test Cases** — organisir TC dalam project → suite → section, dengan DSL Maestro YAML di baliknya
- **Test Run / Plan** — pilih TC, device, environment, jalankan, lihat step log real-time dan evidence screenshot
- **Reports & History** — tabel semua run dengan filter project/status/search, export CSV
- **Environments** — kelola variabel `{{KEY}}` untuk staging/production/UAT
- **Android** — USB device, wireless ADB, AVD emulator
- **iOS Simulator** — full support via `idb` (element inspector + tap + screenshot)

## Screenshots

> Inspector dengan iOS Simulator — element tree dari idb, tap presisi, screenshot otomatis

---

## Requirements

### Android testing
| Dependency | Keterangan | Install |
|---|---|---|
| **ADB** | Android Debug Bridge | Otomatis dari Android Studio SDK |
| **Java JRE 17** | Untuk Maestro CLI | Otomatis via Setup Wizard |
| **Maestro CLI** | Test runner | Otomatis via Setup Wizard |

### iOS Simulator testing (macOS only)
| Dependency | Keterangan | Install |
|---|---|---|
| **Xcode** | IDE + Simulator runtime | App Store (~15GB) |
| **idb-companion** | iOS Device Bridge server | `brew install idb-companion` |
| **Python 3.11** | Required by idb client | `brew install python@3.11` |
| **fb-idb** | iOS Device Bridge client | `pipx install fb-idb --python python3.11` |

> Semua panduan install tersedia di halaman **First-time Setup** dalam app.

---

## Getting Started

### Development

```bash
# Clone repo
git clone https://github.com/your-username/MustLab.git
cd MustLab

# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Production Build

```bash
# Build DMG (macOS)
npm run make

# Output di: out/make/
```

> **Catatan:** Build DMG memerlukan Xcode Command Line Tools dan file `resources/entitlements.mac.plist` sudah ada (sudah di-include di repo).

---

## Project Structure

```
MustLab/
├── src/
│   ├── core/
│   │   ├── device-manager.js    # Android ADB + iOS Simulator detection
│   │   ├── inspector.js         # Screenshot, XML dump, tap — Android & iOS
│   │   ├── setup-manager.js     # Install Java, Maestro; check Xcode, idb
│   │   └── test-runner.js       # Maestro CLI execution engine
│   ├── main/
│   │   ├── app.js               # Electron main process
│   │   └── ipc-handlers.js      # All IPC channel registrations
│   ├── renderer/
│   │   ├── pages/
│   │   │   ├── setup.js         # First-time Setup + iOS guide
│   │   │   ├── dashboard.js     # Summary stats & quick actions
│   │   │   ├── inspector.js     # Device inspector + step editor
│   │   │   ├── projects.js      # Project/suite/TC management
│   │   │   ├── testrun.js       # Test Run create/run/detail
│   │   │   ├── reports.js       # History & reports
│   │   │   ├── environments.js  # Environment variables
│   │   │   └── settings.js      # Global settings + deps status
│   │   └── assets/
│   │       └── js/
│   │           ├── bridge.js    # window.api wrapper
│   │           ├── router.js    # Client-side navigation
│   │           ├── state.js     # AppState global
│   │           └── utils.js     # esc(), toast(), helpers
│   ├── store/
│   │   └── database.js          # SQLite via better-sqlite3
│   └── utils/
│       ├── logger.js            # Winston logger
│       └── process-utils.js     # spawn/exec helpers, path resolution
├── resources/
│   ├── entitlements.mac.plist   # macOS entitlements for DMG build
│   ├── bin/                     # Bundled binaries (ADB)
│   └── scripts/                 # Helper scripts
├── main.js                      # Electron entry point
├── preload.js                   # contextBridge IPC exposure
├── forge.config.js              # Electron Forge build config
└── package.json
```

---

## Architecture

```
Renderer (UI)          Main Process             External
─────────────         ──────────────          ──────────
window.api.xxx   →    ipc-handlers.js   →     ADB
  (bridge.js)         device-manager         Maestro CLI
                       inspector.js          xcrun simctl
                       test-runner.js         idb
                       database.js           SQLite DB
```

**IPC convention:**
- `db:entity:action` — database operations (e.g. `db:testcases:save`)
- `device:action` — device management
- `inspector:action` — screenshot, tap, XML dump
- `runner:action` — test execution
- `setup:action` — dependency management
- `system:action` — OS-level operations (file dialog, open external, clear data)

---

## iOS Simulator Setup (step by step)

```bash
# 1. Install Xcode dari App Store (~15GB), lalu:
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept

# 2. Install iOS Simulator Runtime
open -a Simulator
# atau: Xcode → Settings → Platforms → (+) → iOS latest

# 3. Install idb
brew tap facebook/fb
brew install idb-companion
brew install python@3.11
brew install pipx && pipx ensurepath
source ~/.zshrc
pipx install fb-idb --python /usr/local/bin/python3.11

# 4. Verifikasi
idb list-targets
# → harus tampil daftar simulator

# 5. Boot simulator
open -a Simulator
# Pilih iPhone model dari File → Open Simulator

# 6. Buka MustLab
# → iPhone terdeteksi otomatis di Inspector
# → Klik Detect untuk list bundle ID
# → Buat TC dengan appId = Bundle ID app
```

**Bundle ID built-in apps:**
```
com.apple.MobileAddressBook   → Contacts
com.apple.mobilesafari        → Safari
com.apple.mobilenotes         → Notes
com.apple.Maps                → Maps
com.apple.Preferences         → Settings
```

---

## Test Case DSL

MustLab generate Maestro YAML. Format yang didukung:

```yaml
appId: com.example.myapp
---
- launchApp
- tapOn: "Login"
- inputText: "user@example.com"
- tapOn: "Password"
- inputText: "secret123"
- tapOn: "Sign In"
- assertVisible: "Home Screen"
- takeScreenshot: login_success
```

**iOS vs Android:** Format YAML identik. Beda hanya `appId` — iOS pakai Bundle ID, Android pakai package name.

---

## Environment Variables

Gunakan `{{KEY}}` di test steps untuk nilai yang berbeda per environment:

```yaml
- tapOn: "{{BASE_URL}}"
- inputText: "{{USERNAME}}"
```

Definisikan di menu Environments → buat Staging/Production/UAT dengan variabel masing-masing.

---

## Troubleshooting

### Android

**Device tidak terdeteksi**
```bash
adb kill-server && adb start-server
adb devices
# Pastikan "Allow USB Debugging" di HP sudah di-tap
```

**Maestro error "driver not found"**
```bash
# Jalankan ulang Setup Wizard di app
# atau manual:
~/.MustLab/bin/maestro/bin/maestro --version
```

**UIAutomator OOM (XML dump gagal)**
- Buka AVD Manager → edit emulator → naikkan RAM ke 4096MB, VM Heap ke 512MB

### iOS Simulator

**idb error "no companion connected"**
```bash
idb connect <UDID>
# UDID dari: xcrun simctl list devices | grep Booted
```

**Simulator tidak terdeteksi di MustLab**
```bash
# Pastikan simulator sedang Booted
xcrun simctl list devices | grep Booted
# Kalau kosong, buka Simulator dulu
open -a Simulator
```

**idb `asyncio` error**
```bash
# idb butuh Python 3.11, bukan 3.12+
pipx reinstall fb-idb --python /usr/local/bin/python3.11
```

**`xcrun simctl` tidak ditemukan**
```bash
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
# Pastikan bukan hanya Command Line Tools
```

---

## Dependencies

```json
{
  "better-sqlite3": "^9.4.3",
  "winston": "^3.11.0",
  "adm-zip": "^0.5.10",
  "axios": "^1.6.7"
}
```

No Appium. No WebDriverAgent. No Docker. Hanya Maestro CLI + idb untuk iOS.

---

## Contributing

1. Fork repo
2. Buat branch: `git checkout -b feature/nama-fitur`
3. Commit dengan prefix: `feat:`, `fix:`, `refactor:`, `docs:`
4. Push dan buat Pull Request

---

## License

MIT © MustLab Team