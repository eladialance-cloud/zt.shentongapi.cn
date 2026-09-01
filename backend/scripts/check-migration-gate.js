#!/usr/bin/env node
/**
 * 迁移通道门禁（P0 止血冻结）
 *
 * 规则：新增表/字段必须走 TypeORM migrations（backend/src/migrations/*.ts）。
 *  legacy 通道（backend/migrations|sql|database/*.sql、db-migration.ts）只允许改名/修 bug，
 *  禁止新增 CREATE TABLE / ALTER TABLE 结构变更（P4 改名等结构变更必须带 TypeORM 迁移类）。
 *
 * 判定（只检查本次变更的新增行/新文件）：
 *   1. db-migration.ts 新增结构变更（CREATE/ALTER）→ 必须同时新增 TypeORM 迁移类，否则失败
 *   2. legacy SQL 新增 CREATE TABLE → 必须同时新增 TypeORM 迁移类，否则失败
 *   3. legacy SQL 新增 ALTER TABLE → 必须同时新增 TypeORM 迁移类，否则失败
 *
 * 变更范围：
 *   - CI（PR）：GITHUB_BASE_REF / origin/main → 对比 <base>...HEAD
 *   - 本地：工作区未提交 + 未跟踪文件
 */
'use strict';

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BACKEND_ROOT = path.resolve(__dirname, '..');
const LEGACY_SQL_DIRS = ['migrations', 'sql', 'database'];
const LEGACY_TS_FILE = 'src/common/utils/db-migration.ts';
const TYPEORM_MIGRATION_DIR = 'src/migrations';

function runGit(args, okOnError = false) {
  try {
    return execSync(`git ${args}`, {
      cwd: BACKEND_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return okOnError ? [] : null;
  }
}

function normalizeToBackend(file) {
  const prefix = 'backend/';
  return file.startsWith(prefix) ? file.slice(prefix.length) : file;
}

function availableBaseRefs() {
  const candidates = [];
  if (process.env.GITHUB_BASE_REF) candidates.push('origin/' + process.env.GITHUB_BASE_REF);
  candidates.push('origin/main', 'main', 'origin/develop');
  const refs = [];
  for (const ref of candidates) {
    const ok = runGit(`rev-parse --verify --quiet ${ref}`, true).length > 0;
    if (ok) refs.push(ref);
  }
  return refs;
}

function changedFiles() {
  const files = new Set();
  const bases = availableBaseRefs();
  for (const base of bases) {
    for (const f of runGit(`diff --name-only ${base}...HEAD`) || []) files.add(normalizeToBackend(f));
  }
  for (const args of ['diff --cached --name-only', 'diff --name-only', 'diff --name-only HEAD']) {
    for (const f of runGit(args) || []) files.add(normalizeToBackend(f));
  }
  // 未跟踪新文件（?? 路径）
  for (const line of runGit('status --porcelain') || []) {
    const m = line.match(/^\?\?\s+(.+)$/);
    if (m) files.add(normalizeToBackend(m[1].replace(/^"|"$/g, '')));
  }
  return [...files];
}

function isUntracked(file) {
  const porcelain = runGit('status --porcelain -- "' + file.replace(/\\/g, '/') + '"') || [];
  return porcelain.some((l) => l.startsWith('??'));
}

function addedLinesOf(file) {
  const quoted = '"' + file.replace(/\\/g, '/') + '"';
  if (isUntracked(file)) {
    try {
      return fs.readFileSync(path.join(BACKEND_ROOT, file), 'utf8').split(/\r?\n/);
    } catch {
      return [];
    }
  }
  const added = [];
  const diffs = [];
  for (const base of availableBaseRefs()) diffs.push(`${base}...HEAD`);
  diffs.push('HEAD');
  for (const range of diffs) {
    const diff = runGit(`diff ${range} -- ${quoted}`);
    if (diff === null) continue;
    let inHunk = false;
    for (const line of diff) {
      if (line.startsWith('@@')) { inHunk = true; continue; }
      if (!inHunk || line.startsWith('+++')) continue;
      if (line.startsWith('+')) added.push(line.slice(1));
    }
  }
  return added;
}

function isLegacySql(f) {
  return LEGACY_SQL_DIRS.some((d) => f.startsWith(d + '/') && f.endsWith('.sql'));
}

function main() {
  const changed = changedFiles();
  if (changed.length === 0) {
    console.log('[migration:gate] 无变更文件，通过。');
    return 0;
  }

  const legacyFiles = changed.filter((f) => isLegacySql(f) || f === LEGACY_TS_FILE);
  const sqlCreateFiles = [];
  const sqlAlterFiles = [];
  let tsFileStructural = false;

  for (const f of legacyFiles) {
    const added = addedLinesOf(f);
    const hasCreate = added.some((l) => /\bCREATE\s+TABLE\b/i.test(l));
    const hasAlter = added.some((l) => /\bALTER\s+TABLE\b/i.test(l));
    if (f === LEGACY_TS_FILE) {
      if (hasCreate || hasAlter) tsFileStructural = true;
    } else {
      if (hasCreate) sqlCreateFiles.push(f);
      if (hasAlter) sqlAlterFiles.push(f);
    }
  }

  // 结构变更必须伴随 TypeORM 迁移类（P4 改名/补丁的统一闸门）
  const typeormNew = changed.filter(
    (f) => f.startsWith(TYPEORM_MIGRATION_DIR + '/') && f.endsWith('.ts')
  );
  const errors = [];
  if (tsFileStructural && typeormNew.length === 0) {
    errors.push('db-migration.ts 结构变更（CREATE/ALTER）必须同时新增 TypeORM 迁移类（' + TYPEORM_MIGRATION_DIR + '/xxx.ts）');
  }
  if (sqlAlterFiles.length > 0 && typeormNew.length === 0) {
    errors.push('legacy SQL 新增 ALTER TABLE 必须同时新增 TypeORM 迁移类：' + sqlAlterFiles.join(', '));
  }
  if (sqlCreateFiles.length > 0 && typeormNew.length === 0) {
    errors.push(
      'legacy SQL 新增 CREATE TABLE，但未新增 TypeORM 迁移类（' +
      TYPEORM_MIGRATION_DIR + '/xxx.ts）：' + sqlCreateFiles.join(', ')
    );
  }

  if (errors.length > 0) {
    console.error('[migration:gate] FAIL（P0 止血冻结）:');
    for (const e of errors) console.error('  - ' + e);
    console.error('规则：新表/新字段强制 TypeORM migrations；legacy 只允许修 bug。');
    return 1;
  }

  console.log('[migration:gate] 通过：本次 legacy 变更无新增结构补丁。');
  return 0;
}

process.exit(main());