/**
 * src/store/database.js
 *
 * SQLite database layer menggunakan better-sqlite3 (synchronous).
 * Semua data project, suite, test case, run history, environment,
 * dan settings disimpan di satu file .db di userData path.
 *
 * Schema:
 *   projects    → id, name, platform, package_id, description, color, created_at
 *   suites      → id, project_id, name, description, order_index, created_at
 *   sections    → id, suite_id, name, order_index
 *   test_cases  → id, section_id, name, tags, steps_yaml, status, steps_count, created_at, updated_at
 *   test_runs   → id, project_id, plan_name, run_type, status, pass, fail, skip, duration_ms, started_at, finished_at
 *   tc_results  → id, run_id, tc_id, tc_name, status, duration_ms, evidence_json, error_msg
 *   environments → id, name, base_url, is_active, vars_enc (encrypted JSON), created_at
 *   settings    → key, value (TEXT), updated_at
 */

const Database = require('better-sqlite3')
const path     = require('path')
const fs       = require('fs')
const logger   = require('../utils/logger')

let db = null

// ── Schema ────────────────────────────────────────────────────

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  platform    TEXT NOT NULL DEFAULT 'android',
  package_id  TEXT,
  description TEXT,
  color       TEXT DEFAULT '#2a9d5c',
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS suites (
  id          TEXT PRIMARY KEY,
  project_id  TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  order_index INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sections (
  id          TEXT PRIMARY KEY,
  suite_id    TEXT NOT NULL REFERENCES suites(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  order_index INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS test_cases (
  id          TEXT PRIMARY KEY,
  section_id  TEXT REFERENCES sections(id) ON DELETE CASCADE,
  suite_id    TEXT REFERENCES suites(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT DEFAULT '',
  tags        TEXT DEFAULT '[]',
  steps_yaml  TEXT DEFAULT '',
  dsl_yaml    TEXT DEFAULT '',
  status      TEXT DEFAULT 'pending',
  priority    TEXT DEFAULT 'medium',
  steps_count INTEGER DEFAULT 0,
  created_at  TEXT DEFAULT (datetime('now')),
  updated_at  TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS test_runs (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id),
  plan_name    TEXT NOT NULL,
  run_type     TEXT DEFAULT 'custom',
  device       TEXT,
  environment  TEXT,
  status       TEXT DEFAULT 'pending',
  pass         INTEGER DEFAULT 0,
  fail         INTEGER DEFAULT 0,
  skip         INTEGER DEFAULT 0,
  duration_ms  INTEGER DEFAULT 0,
  started_at   TEXT,
  finished_at  TEXT,
  created_at   TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS tc_results (
  id            TEXT PRIMARY KEY,
  run_id        TEXT NOT NULL REFERENCES test_runs(id) ON DELETE CASCADE,
  tc_id         TEXT NOT NULL,
  tc_name       TEXT NOT NULL,
  status        TEXT DEFAULT 'pending',
  duration_ms   INTEGER DEFAULT 0,
  evidence_json TEXT DEFAULT '{}',
  error_msg     TEXT,
  step_logs     TEXT DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS environments (
  id        TEXT PRIMARY KEY,
  name      TEXT NOT NULL,
  base_url  TEXT,
  is_active INTEGER DEFAULT 0,
  vars_enc  TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key        TEXT PRIMARY KEY,
  value      TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Index untuk query yang sering
CREATE INDEX IF NOT EXISTS idx_suites_project    ON suites(project_id);
CREATE INDEX IF NOT EXISTS idx_sections_suite    ON sections(suite_id);
CREATE INDEX IF NOT EXISTS idx_tc_section        ON test_cases(section_id);
CREATE INDEX IF NOT EXISTS idx_runs_project      ON test_runs(project_id);
CREATE INDEX IF NOT EXISTS idx_tcresults_run     ON tc_results(run_id);
`

// ── Init ──────────────────────────────────────────────────────

function getDbPath() {
  try {
    const { app } = require('electron')
    const dataDir = path.join(app.getPath('userData'), 'data')
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true })
    return path.join(dataDir, 'testpilot.db')
  } catch {
    const fallbackDir = path.join(require('os').homedir(), '.testpilot', 'data')
    if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true })
    return path.join(fallbackDir, 'testpilot.db')
  }
}

function init() {
  if (db) return db

  const dbPath = getDbPath()
  logger.info(`Opening database: ${dbPath}`)

  db = new Database(dbPath, {
    // verbose: process.env.NODE_ENV === 'development' ? logger.debug.bind(logger) : null
  })

  // Jalankan schema
  db.exec(SCHEMA)

  // Seed default environment jika kosong
  const envCount = db.prepare('SELECT COUNT(*) as c FROM environments').get()
  if (envCount.c === 0) {
    db.prepare(`
      INSERT INTO environments (id, name, base_url, is_active, vars_enc)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      'env-staging',
      'Staging',
      'https://staging.example.com',
      1,
      JSON.stringify({ BASE_URL: 'https://staging.example.com', EMAIL: '', PASSWORD: '' })
    )
  }

  logger.info('Database initialized')
  return db
}

function getDb() {
  if (!db) init()
  return db
}

// ── Helper ────────────────────────────────────────────────────

function generateId(prefix = '') {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function nowIso() {
  return new Date().toISOString()
}

// ── Projects ──────────────────────────────────────────────────

const Projects = {
  getAll() {
    return getDb().prepare('SELECT * FROM projects ORDER BY created_at DESC').all()
  },
  getById(id) {
    return getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id)
  },
  save(p) {
    const existing = this.getById(p.id)
    if (existing) {
      getDb().prepare(`
        UPDATE projects SET name=?, platform=?, package_id=?, description=?, color=?
        WHERE id=?
      `).run(p.name, p.platform, p.package_id || '', p.description || '', p.color || '#2a9d5c', p.id)
    } else {
      const id = p.id || generateId('proj-')
      getDb().prepare(`
        INSERT INTO projects (id, name, platform, package_id, description, color)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, p.name, p.platform || 'android', p.package_id || '', p.description || '', p.color || '#2a9d5c')
      p.id = id
    }
    return this.getById(p.id)
  },
  delete(id) {
    return getDb().prepare('DELETE FROM projects WHERE id = ?').run(id)
  }
}

// ── Suites ────────────────────────────────────────────────────

const Suites = {
  getByProject(projectId) {
    return getDb().prepare('SELECT * FROM suites WHERE project_id=? ORDER BY order_index, created_at').all(projectId)
  },
  getById(id) {
    return getDb().prepare('SELECT * FROM suites WHERE id=?').get(id)
  },
  save(s) {
    const existing = this.getById(s.id)
    if (existing) {
      getDb().prepare('UPDATE suites SET name=?, description=?, order_index=? WHERE id=?')
        .run(s.name, s.description || '', s.order_index || 0, s.id)
    } else {
      const id = s.id || generateId('suite-')
      getDb().prepare('INSERT INTO suites (id, project_id, name, description, order_index) VALUES (?,?,?,?,?)')
        .run(id, s.project_id, s.name, s.description || '', s.order_index || 0)
      s.id = id
    }
    return this.getById(s.id)
  },
  delete(id) {
    return getDb().prepare('DELETE FROM suites WHERE id=?').run(id)
  }
}

// ── Sections ──────────────────────────────────────────────────

const Sections = {
  getBySuite(suiteId) {
    return getDb().prepare('SELECT * FROM sections WHERE suite_id=? ORDER BY order_index').all(suiteId)
  },
  getById(id) {
    return getDb().prepare('SELECT * FROM sections WHERE id=?').get(id)
  },
  save(s) {
    const existing = this.getById(s.id)
    if (existing) {
      getDb().prepare('UPDATE sections SET name=?, order_index=? WHERE id=?')
        .run(s.name, s.order_index || 0, s.id)
    } else {
      const id = s.id || generateId('sec-')
      getDb().prepare('INSERT INTO sections (id, suite_id, name, order_index) VALUES (?,?,?,?)')
        .run(id, s.suite_id, s.name, s.order_index || 0)
      s.id = id
    }
    return this.getById(s.id)
  },
  delete(id) {
    return getDb().prepare('DELETE FROM sections WHERE id=?').run(id)
  }
}

// ── Test Cases ────────────────────────────────────────────────

const TestCases = {
  getBySection(sectionId) {
    const rows = getDb().prepare('SELECT * FROM test_cases WHERE section_id=? ORDER BY created_at').all(sectionId)
    return rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') }))
  },
  getBySuite(suiteId) {
    const rows = getDb().prepare('SELECT * FROM test_cases WHERE suite_id=? ORDER BY created_at').all(suiteId)
    return rows.map(r => ({ ...r, tags: JSON.parse(r.tags || '[]') }))
  },
  getById(id) {
    const r = getDb().prepare('SELECT * FROM test_cases WHERE id=?').get(id)
    if (!r) return null
    return { ...r, tags: JSON.parse(r.tags || '[]') }
  },
  save(tc) {
    // Migration: tambah kolom baru kalau belum ada (untuk DB yang sudah existing)
    const db = getDb()
    const cols = db.prepare("PRAGMA table_info(test_cases)").all().map(c => c.name)
    if (!cols.includes('dsl_yaml'))    db.prepare("ALTER TABLE test_cases ADD COLUMN dsl_yaml    TEXT DEFAULT ''").run()
    if (!cols.includes('description')) db.prepare("ALTER TABLE test_cases ADD COLUMN description TEXT DEFAULT ''").run()
    if (!cols.includes('priority'))    db.prepare("ALTER TABLE test_cases ADD COLUMN priority    TEXT DEFAULT 'medium'").run()
    if (!cols.includes('suite_id'))    db.prepare("ALTER TABLE test_cases ADD COLUMN suite_id    TEXT").run()
    if (!cols.includes('steps_json'))  db.prepare("ALTER TABLE test_cases ADD COLUMN steps_json  TEXT DEFAULT '[]'").run()

    const existing = this.getById(tc.id)
    const tags     = JSON.stringify(Array.isArray(tc.tags) ? tc.tags : [])
    const stepsYaml  = tc.steps_yaml || tc.dsl_yaml || ''
    const dslYaml    = tc.dsl_yaml   || tc.steps_yaml || ''
    const stepsJson  = tc.steps_json
      ? (typeof tc.steps_json === 'string' ? tc.steps_json : JSON.stringify(tc.steps_json))
      : '[]'
    const stepsCount = tc.steps_count
      || (Array.isArray(tc.steps_json) ? tc.steps_json.length : 0)
      || (stepsYaml ? stepsYaml.split('\n- ').length - 1 : 0)

    if (existing) {
      db.prepare(`
        UPDATE test_cases
        SET name=?, description=?, tags=?, steps_yaml=?, dsl_yaml=?, steps_json=?, status=?,
            priority=?, steps_count=?, suite_id=?, updated_at=?
        WHERE id=?
      `).run(
        tc.name, tc.description || '', tags, stepsYaml, dslYaml, stepsJson,
        tc.status || 'pending', tc.priority || 'medium', stepsCount,
        tc.suite_id || null, nowIso(), existing.id
      )
      return this.getById(existing.id)
    } else {
      const id = tc.id || generateId('tc-')
      db.prepare(`
        INSERT INTO test_cases
          (id, section_id, suite_id, name, description, tags, steps_yaml, dsl_yaml, steps_json, status, priority, steps_count)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        id,
        tc.section_id || null,
        tc.suite_id   || null,
        tc.name,
        tc.description || '',
        tags,
        stepsYaml,
        dslYaml,
        stepsJson,
        tc.status   || 'pending',
        tc.priority || 'medium',
        stepsCount
      )
      tc.id = id
      return this.getById(id)
    }
  },
  delete(id) {
    return getDb().prepare('DELETE FROM test_cases WHERE id=?').run(id)
  }
}

// ── Test Runs ─────────────────────────────────────────────────

const TestRuns = {
  getAll() {
    return getDb().prepare('SELECT * FROM test_runs ORDER BY created_at DESC LIMIT 100').all()
  },
  getByProject(projectId) {
    return getDb().prepare('SELECT * FROM test_runs WHERE project_id=? ORDER BY created_at DESC LIMIT 50').all(projectId)
  },
  getById(id) {
    return getDb().prepare('SELECT * FROM test_runs WHERE id=?').get(id)
  },
  save(run) {
    const existing = this.getById(run.id)
    if (existing) {
      getDb().prepare(`
        UPDATE test_runs SET status=?, pass=?, fail=?, skip=?, duration_ms=?, started_at=?, finished_at=?
        WHERE id=?
      `).run(run.status, run.pass || 0, run.fail || 0, run.skip || 0, run.duration_ms || 0,
             run.started_at, run.finished_at, run.id)
    } else {
      const id = run.id || generateId('run-')
      getDb().prepare(`
        INSERT INTO test_runs (id, project_id, plan_name, run_type, device, environment, status)
        VALUES (?,?,?,?,?,?,?)
      `).run(id, run.project_id, run.plan_name, run.run_type || 'custom',
             run.device || '', run.environment || '', run.status || 'pending')
      run.id = id
    }
    return this.getById(run.id)
  },
  delete(id) {
    getDb().prepare('DELETE FROM tc_results WHERE run_id=?').run(id)
    return getDb().prepare('DELETE FROM test_runs WHERE id=?').run(id)
  },
  saveTcResult(result) {
    const id = result.id || generateId('res-')
    getDb().prepare(`
      INSERT OR REPLACE INTO tc_results
        (id, run_id, tc_id, tc_name, status, duration_ms, evidence_json, error_msg, step_logs)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(
      id, result.run_id, result.tc_id, result.tc_name,
      result.status || 'pending', result.duration_ms || 0,
      JSON.stringify(result.evidence || {}),
      result.error_msg || '',
      JSON.stringify(result.step_logs || [])
    )
    return id
  },
  getTcResults(runId) {
    const rows = getDb().prepare('SELECT * FROM tc_results WHERE run_id=?').all(runId)
    return rows.map(r => ({
      ...r,
      evidence: JSON.parse(r.evidence_json || '{}'),
      step_logs: JSON.parse(r.step_logs || '[]')
    }))
  }
}

// ── Environments ──────────────────────────────────────────────

const Environments = {
  getAll() {
    const rows = getDb().prepare('SELECT * FROM environments ORDER BY created_at').all()
    return rows.map(r => ({ ...r, vars: JSON.parse(r.vars_enc || '{}') }))
  },
  getActive() {
    const r = getDb().prepare('SELECT * FROM environments WHERE is_active=1').get()
    if (!r) return null
    return { ...r, vars: JSON.parse(r.vars_enc || '{}') }
  },
  getById(id) {
    const r = getDb().prepare('SELECT * FROM environments WHERE id=?').get(id)
    if (!r) return null
    return { ...r, vars: JSON.parse(r.vars_enc || '{}') }
  },
  save(env) {
    const existing = this.getById(env.id)
    const varsEnc = JSON.stringify(env.vars || {})
    if (existing) {
      getDb().prepare('UPDATE environments SET name=?, base_url=?, is_active=?, vars_enc=? WHERE id=?')
        .run(env.name, env.base_url || '', env.is_active ? 1 : 0, varsEnc, env.id)
    } else {
      const id = env.id || generateId('env-')
      getDb().prepare('INSERT INTO environments (id, name, base_url, is_active, vars_enc) VALUES (?,?,?,?,?)')
        .run(id, env.name, env.base_url || '', env.is_active ? 1 : 0, varsEnc)
      env.id = id
    }
    return this.getById(env.id)
  },
  setActive(id) {
    getDb().prepare('UPDATE environments SET is_active=0').run()
    getDb().prepare('UPDATE environments SET is_active=1 WHERE id=?').run(id)
  },
  delete(id) {
    return getDb().prepare('DELETE FROM environments WHERE id=?').run(id)
  }
}

// ── Settings ──────────────────────────────────────────────────

const Settings = {
  get(key) {
    const row = getDb().prepare('SELECT value FROM settings WHERE key=?').get(key)
    if (!row) return null
    try { return JSON.parse(row.value) } catch { return row.value }
  },
  set(key, value) {
    const strVal = typeof value === 'string' ? value : JSON.stringify(value)
    getDb().prepare(`
      INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at
    `).run(key, strVal)
  },
  getAll() {
    return getDb().prepare('SELECT * FROM settings').all()
  }
}

// ── Close ─────────────────────────────────────────────────────

function close() {
  if (db) {
    db.close()
    db = null
    logger.info('Database closed')
  }
}

module.exports = {
  init,
  getDb,
  close,
  Projects,
  Suites,
  Sections,
  TestCases,
  TestRuns,
  Environments,
  Settings,
  generateId,
}