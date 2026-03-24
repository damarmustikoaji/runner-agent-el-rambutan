<div align="center">
  <img src="https://github.com/damarmustikoaji/murbei/blob/master/src/renderer/assets/logo.png" width="80" alt="MustLab"/>
  <h1>MustLab</h1>
  <p>Mobile test automation for QA teams — no coding required</p>

  ![Platform](https://img.shields.io/badge/platform-macOS-lightgrey)
  ![Android](https://img.shields.io/badge/Android-supported-green)
  ![iOS](https://img.shields.io/badge/iOS%20Simulator-supported-blue)
  ![Electron](https://img.shields.io/badge/Electron-29-47848F)
  ![Node](https://img.shields.io/badge/Node-20-339933)
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

---

## Requirements

### System
| Requirement | Versi minimum | Keterangan |
|---|---|---|
| **macOS** | 12 Monterey+ | Platform utama |
| **Node.js** | 20.x | Untuk development & build |
| **npm** | 9+ | Bundled dengan Node 20 |

### Android testing
| Dependency | Keterangan | Install |
|---|---|---|
| **ADB** | Android Debug Bridge | Otomatis dari Android Studio SDK, atau via Setup Wizard |
| **Java JRE 17** | Untuk Maestro CLI | Otomatis via Setup Wizard (`~/.mustlab/java/`) |
| **Maestro CLI** | Test runner | Otomatis via Setup Wizard (`~/.mustlab/bin/`) |

### iOS Simulator testing (macOS only)
| Dependency | Keterangan | Install |
|---|---|---|
| **Xcode** | IDE + Simulator runtime | App Store (~15GB) |
| **idb-companion** | iOS Device Bridge server | `brew install idb-companion` |
| **Python 3.11** | Required by idb client (bukan 3.12+) | `brew install python@3.11` |
| **fb-idb** | iOS Device Bridge client | `pipx install fb-idb --python python3.11` |

> Semua panduan install tersedia di halaman **First-time Setup** dalam app.

---

## Getting Started

### Development

```bash
git clone https://github.com/damarmustikoaji/murbei.git
cd murbei

# Install dependencies (otomatis rebuild native module better-sqlite3)
npm install

# Jalankan dalam mode development (hot reload via nodemon)
npm run dev
```

### npm Scripts

| Script | Perintah | Keterangan |
|---|---|---|
| `npm start` | `electron .` | Jalankan tanpa hot reload |
| `npm run dev` | `nodemon` | Development mode, auto-restart saat file berubah |
| `npm run make` | `electron-forge make` | Build DMG untuk distribusi |
| `npm run build` | `electron-forge package` | Package saja (tanpa buat installer) |
| `npm run rebuild` | `electron-rebuild ...` | Rebuild native module `better-sqlite3` (jalankan setelah upgrade Electron) |
| `npm run uninstall` | `rm -rf node_modules` | Hapus node_modules untuk clean install |

### Production Build

```bash
# Build DMG (macOS)
npm run make

# Output di:
# out/make/MustLab.dmg              ← installer
# out/make/zip/darwin/*.zip         ← portable (zip)
```

> **Catatan:** Build memerlukan Xcode Command Line Tools.
> Cek dengan: `xcode-select -p`
> Install jika belum: `xcode-select --install`

#### Gatekeeper (distribusi internal tanpa code signing)

App tidak di-sign dengan Apple Developer certificate, sehingga macOS menampilkan warning saat pertama kali dibuka. Instruksikan user untuk:

```
Klik kanan → Open → Open
```

atau via System Settings → Privacy & Security → Open Anyway.

---

## Release & Distribusi

### Proses Release (step by step)

```bash
# 1. Pastikan di branch master dan tidak ada uncommitted changes
git status

# 2. Bump versi — pilih salah satu:
npm version patch    # bugfix:  1.0.0 → 1.0.1
npm version minor    # fitur:   1.0.0 → 1.1.0
npm version major    # breaking: 1.0.0 → 2.0.0
# Otomatis: update package.json + commit + buat git tag vX.X.X

# 3. Push commit + tag sekaligus
git push origin master --follow-tags
```

GitHub Actions otomatis berjalan → build DMG di macOS runner → publish ke GitHub Releases.

Pantau progress di: `https://github.com/damarmustikoaji/murbei/actions`

Download DMG setelah release:
```
https://github.com/damarmustikoaji/murbei/releases/latest
```

atau per versi spesifik:
```
https://github.com/damarmustikoaji/murbei/releases/download/vX.X.X/MustLab-X.X.X.dmg
```

### Cek Update dari dalam App

Fitur **Cek Update** di Settings memanggil GitHub Releases API:
```
GET https://api.github.com/repos/damarmustikoaji/murbei/releases/latest
```
App membandingkan versi saat ini (`package.json`) dengan `tag_name` release terbaru. Tidak butuh token — endpoint publik, gratis.

### Manual Build (tanpa CI/CD)

```bash
# Build lokal
npm run make
# Output: out/make/MustLab.dmg
```

---

## Data & Storage

Penting diketahui untuk maintenance, backup, dan troubleshooting:

| Data | Lokasi | Keterangan |
|---|---|---|
| **Database** | `~/Library/Application Support/MustLab/data/mustlab.db` | SQLite — projects, TC, run history, environments |
| **Evidence** | `~/Library/Application Support/MustLab/evidence/` | Screenshot hasil test run |
| **Log app** | `~/Library/Application Support/MustLab/logs/app-YYYY-MM-DD.log` | Rotasi harian, simpan 7 hari |
| **Log error** | `~/Library/Application Support/MustLab/logs/error-YYYY-MM-DD.log` | Rotasi harian, simpan 30 hari |
| **Maestro CLI** | `~/.mustlab/bin/maestro/bin/maestro` | Didownload via Setup Wizard |
| **Java JRE** | `~/.mustlab/java/` | Didownload via Setup Wizard (~80MB) |
| **ADB** | `~/.mustlab/adb/` atau system Android SDK | Tergantung instalasi |
| **Cache** | `~/.mustlab/cache/` | File sementara saat download — aman dihapus |

### Backup

Untuk backup data user (test cases, history):
```bash
cp ~/Library/Application\ Support/MustLab/data/mustlab.db mustlab-backup-$(date +%Y%m%d).db
```

### Clear Data

Tersedia di Settings → Clear Data & Uninstall:
- **Reset Database** — hapus semua project & TC, binary tetap ada
- **Hapus Cache** — bersihkan `~/.mustlab/cache/`
- **Reinstall Dependencies** — hapus `~/.mustlab/`, Setup Wizard dijalankan ulang
- **Uninstall Lengkap** — hapus semua data + binary

---

## Project Structure

```
runner-agent-elc4/
├── src/
│   ├── core/
│   │   ├── device-manager.js    # Android ADB + iOS Simulator detection & polling
│   │   ├── inspector.js         # Screenshot, XML dump, tap — Android & iOS
│   │   ├── setup-manager.js     # Install Java, Maestro; check Xcode, idb
│   │   └── test-runner.js       # Maestro CLI execution engine
│   ├── main/
│   │   ├── app.js               # Electron main process, BrowserWindow setup
│   │   └── ipc-handlers.js      # Semua IPC channel handler terpusat
│   ├── renderer/
│   │   ├── index.html           # Entry point UI
│   │   ├── pages/               # Satu file per halaman
│   │   │   ├── setup.js         # First-time Setup + iOS guide
│   │   │   ├── dashboard.js     # Summary stats & quick actions
│   │   │   ├── inspector.js     # Device inspector + step editor
│   │   │   ├── projects.js      # Project/suite/TC management
│   │   │   ├── testrun.js       # Test Run create/run/detail
│   │   │   ├── reports.js       # History & reports
│   │   │   ├── environments.js  # Environment variables
│   │   │   └── settings.js      # Global settings + deps status + log viewer
│   │   └── assets/
│   │       ├── css/             # Styling
│   │       └── js/
│   │           ├── bridge.js    # window.api wrapper — error handling IPC
│   │           ├── router.js    # Client-side navigation
│   │           ├── state.js     # AppState global object
│   │           └── utils.js     # esc(), toast(), helpers
│   ├── store/
│   │   └── database.js          # SQLite via better-sqlite3
│   └── utils/
│       ├── logger.js            # Winston logger (file rotation)
│       └── process-utils.js     # spawn/exec helpers, TESTPILOT_DIR, getAdbPath, getMaestroPath
├── resources/
│   ├── entitlements.mac.plist   # macOS entitlements untuk DMG build
│   ├── bin/                     # Bundled binaries (ADB)
│   └── scripts/                 # Helper scripts
├── scripts/
│   └── upload-release.sh        # Manual upload build (opsional, tanpa CI/CD)
├── .github/
│   └── workflows/
│       └── release.yml          # GitHub Actions — build DMG + publish Release
├── main.js                      # Electron entry point
├── preload.js                   # contextBridge — expose IPC ke renderer secara aman
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
  (router.js)         inspector.js           xcrun simctl
  (state.js)          test-runner.js          idb
                       database.js            SQLite DB
```

**Prinsip:**
- Renderer tidak punya akses Node.js (`contextIsolation: true`, `nodeIntegration: false`)
- Semua komunikasi renderer ↔ main lewat `window.api.*` → IPC → handler
- Handler tipis — hanya routing dan error wrapping, logic di core modules

**IPC channel convention:**
| Prefix | Contoh | Keterangan |
|---|---|---|
| `db:entity:action` | `db:testcases:save` | Database CRUD |
| `device:action` | `device:connect` | Device management |
| `inspector:action` | `inspector:screenshot` | Screenshot, tap, XML |
| `runner:action` | `runner:run` | Test execution |
| `setup:action` | `setup:checkDeps` | Dependency management |
| `system:action` | `system:clearData` | OS-level operations |

**Path constants** — satu sumber kebenaran di `src/utils/process-utils.js`:
```js
TESTPILOT_DIR = ~/.mustlab/   // semua binary yang diinstall app
userData      = ~/Library/Application Support/MustLab/  // DB, evidence, logs
```

---

## iOS Simulator Setup (step by step)

```bash
# 1. Install Xcode dari App Store (~15GB), lalu:
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept

# 2. Download iOS Simulator Runtime
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
# → harus tampil daftar simulator yang tersedia

# 5. Boot simulator dan buka MustLab
open -a Simulator
# → iPhone terdeteksi otomatis di Inspector
```

**Bundle ID built-in apps iOS (untuk test tanpa install app sendiri):**
```
com.apple.MobileAddressBook   → Contacts
com.apple.mobilesafari        → Safari
com.apple.mobilenotes         → Notes
com.apple.Maps                → Maps
com.apple.Preferences         → Settings
```

---

## Test Case DSL

MustLab generate Maestro YAML secara otomatis dari UI. Format yang didukung:

```yaml
appId: com.example.myapp
---
- launchApp
- tapOn: "Login"
- inputText: "{{USERNAME}}"
- tapOn: "Password"
- inputText: "{{PASSWORD}}"
- tapOn: "Sign In"
- assertVisible: "Home Screen"
- takeScreenshot: login_success
```

**iOS vs Android:** Format YAML identik. Beda hanya `appId`:
- Android → package name (e.g. `com.tokopedia.tkpd`)
- iOS → Bundle ID (e.g. `com.apple.mobilesafari`)

---

## Environment Variables

Gunakan `{{KEY}}` di test steps untuk nilai yang berbeda per environment:

```yaml
- tapOn: "{{BASE_URL}}"
- inputText: "{{USERNAME}}"
- inputText: "{{PASSWORD}}"
```

Definisikan di menu **Environments** → buat Staging/Production/UAT dengan variabel masing-masing. Variabel disimpan encrypted di database.

---

## Troubleshooting

### Android

**Device tidak terdeteksi**
```bash
adb kill-server && adb start-server
adb devices
# Pastikan "Allow USB Debugging" di HP sudah di-tap
# Kalau "unauthorized" → cabut-colok kabel, tap Allow lagi di HP
```

**Maestro error "driver not found"**
```bash
# Jalankan Setup Wizard di app → Install Driver
# atau cek manual:
~/.mustlab/bin/maestro/bin/maestro --version
```

**UIAutomator OOM (XML dump gagal di emulator)**
- AVD Manager → edit emulator → naikkan RAM ke 4096MB, VM Heap ke 512MB

**ADB tidak ditemukan setelah pindah komputer**
- Pastikan Android Studio terinstall, atau jalankan Setup Wizard ulang
- Cek: Settings → Dependencies → ADB path

### iOS Simulator

**idb error "no companion connected"**
```bash
# Cari UDID simulator yang sedang running
xcrun simctl list devices | grep Booted

# Connect idb ke simulator tersebut
idb connect <UDID>
```

**Simulator tidak terdeteksi di MustLab**
```bash
# Pastikan simulator sedang Booted
xcrun simctl list devices | grep Booted
# Kalau kosong, buka Simulator dulu
open -a Simulator
```

**idb `asyncio` error saat running**
```bash
# idb butuh Python 3.11, bukan 3.12+
pipx reinstall fb-idb --python /usr/local/bin/python3.11
```

**`xcrun simctl` tidak ditemukan**
```bash
# Pastikan Xcode.app terinstall (bukan hanya Command Line Tools)
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
xcode-select -p
# Output harus: /Applications/Xcode.app/Contents/Developer
```

### Log & Diagnostik

Buka log di: **Settings → Log & Diagnostik → Buka Folder**

Atau langsung di terminal:
```bash
# Log hari ini
tail -f ~/Library/Application\ Support/MustLab/logs/app-$(date +%Y-%m-%d).log

# Filter hanya error
grep '"level":"error"' ~/Library/Application\ Support/MustLab/logs/app-$(date +%Y-%m-%d).log | python3 -m json.tool
```

Aktifkan **Debug Mode** di Settings untuk log lebih verbose (semua level termasuk DEBUG ditampilkan dan dikirim ke main process).

---

## Dependencies

### Production (masuk ke dalam build)
```
better-sqlite3       SQLite database (native module)
winston              Structured logging
winston-daily-rotate-file  Log rotation
adm-zip              ZIP extraction (Maestro, ADB)
axios                HTTP requests (version check, download)
yamljs               YAML parse/generate (Maestro DSL)
node-machine-id      Device fingerprint
```

### Dev (hanya untuk build, tidak masuk app)
```
electron             Desktop app framework
@electron-forge/*    Build & packaging toolchain
@electron/rebuild    Rebuild native modules untuk Electron ABI
nodemon              Development auto-restart
```

No Appium. No WebDriverAgent. No Docker. Hanya Maestro CLI + idb untuk iOS.

---

## Contributing

Alur kerja:

1. Buat branch dari `main`: `git checkout -b feature/nama-fitur` atau `fix/nama-bug`
2. Commit dengan prefix konvensional:
   - `feat:` — fitur baru
   - `fix:` — bugfix
   - `refactor:` — perubahan kode tanpa ubah behavior
   - `docs:` — perubahan dokumentasi
   - `chore:` — update dependency, config
3. Push dan buat **Merge Request** ke `main`
4. Minta review dari minimal 1 orang sebelum merge

### Bump versi & release

```bash
npm version patch   # bugfix   → 1.0.0 → 1.0.1
npm version minor   # fitur    → 1.0.0 → 1.1.0
npm version major   # breaking → 1.0.0 → 2.0.0
# Otomatis: update package.json + commit + buat git tag

git push origin master --follow-tags
# --follow-tags: push commit sekaligus tag → trigger GitHub Actions build
```

---

## License

MIT © MustLab Team
