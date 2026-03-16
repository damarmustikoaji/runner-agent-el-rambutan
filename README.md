# TestPilot — Mobile Test Runner Agent

Local Electron app untuk membuat dan menjalankan automation test Android.

## Stack
- **Electron 29** + vanilla HTML/CSS/JS (no frontend framework)
- **better-sqlite3** — local SQLite database
- **Maestro CLI** — Android test runner (auto-downloaded saat setup)
- **ADB** — device communication (bundled di `resources/bin/`)
- **Winston** — structured logging

## Developer Setup

```bash
# 1. Install dependencies
npm install

# 2. Rebuild native modules untuk Electron
npm run rebuild

# 3. Jalankan development mode
npm start
```

## Build Distribusi (macOS)

```bash
npm run make
# Output: out/make/TestPilot-darwin-arm64.dmg
```

## Struktur Project

```
testpilot-app/
├── main.js              ← Electron entry point
├── preload.js           ← IPC security bridge
├── forge.config.js      ← Build config
├── src/
│   ├── main/            ← Main Process (Node.js)
│   │   ├── app.js       ← BrowserWindow setup
│   │   └── ipc-handlers.js ← Semua IPC routes
│   ├── core/            ← Business logic
│   │   ├── device-manager.js  ← ADB device detection
│   │   ├── inspector.js       ← Screenshot, XML dump, element parsing
│   │   ├── test-runner.js     ← Maestro execution + session lock
│   │   └── setup-manager.js   ← First-time dependency install
│   ├── store/
│   │   └── database.js  ← SQLite (better-sqlite3)
│   ├── utils/
│   │   ├── logger.js    ← Winston logger
│   │   └── process-utils.js ← ADB/Maestro binary helpers
│   └── renderer/        ← UI (HTML/CSS/JS)
│       ├── index.html
│       ├── assets/      ← CSS, JS modules
│       └── pages/       ← Per-page scripts
└── resources/
    ├── bin/             ← ADB binaries (bundled)
    └── scripts/         ← Install scripts
```

## Session Isolation (Inspector vs Runner)

Inspector dan Runner **tidak boleh berjalan bersamaan** pada device yang sama.
Ini dijaga oleh `RunnerLock` di `src/core/test-runner.js`:

```
Inspector (ADB langsung) ← tidak ada session
Runner (Maestro)         ← acquire lock → run → release lock
```

IPC handler `inspector:screenshot` dan `inspector:dumpXml` akan throw error
jika runner sedang aktif.

## Database

Data disimpan di `~/Library/Application Support/testpilot/data/testpilot.db`

Schema: `projects` → `suites` → `sections` → `test_cases`
Run history: `test_runs` → `tc_results`
Config: `environments`, `settings`

## Logs

Log tersimpan di `~/Library/Application Support/testpilot/logs/`
- `app-YYYY-MM-DD.log` — semua log
- `error-YYYY-MM-DD.log` — error saja
- Rotasi 7 hari untuk app log, 30 hari untuk error log
