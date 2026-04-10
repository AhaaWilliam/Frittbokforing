#!/usr/bin/env node
/**
 * dump-source.mjs — Genererar en textfil med all källkod för extern granskning.
 * Kör: node scripts/dump-source.mjs
 */

import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';

// ─── Konfiguration ──────────────────────────────────────────────────────────

const ROOT = new URL('..', import.meta.url).pathname.replace(/\/$/, '');
const OUTPUT = join(ROOT, 'fritt-bokforing-source-dump.txt');
const MAX_SIZE_MB = 10;

/** Kataloger att rekursivt inkludera */
const INCLUDE_DIRS = ['src', 'tests', 'e2e'];

/** Enskilda rotfiler att inkludera (relativa till ROOT) */
const INCLUDE_ROOT_FILES = [
  'package.json',
  'tsconfig.json',
  'tsconfig.main.json',
  'vite.config.ts',
  'playwright.config.ts',
  'CLAUDE.md',
];

/** Kataloger att utesluta (matchas som prefix) */
const EXCLUDE_DIRS = [
  'node_modules', 'dist', 'out', 'build', 'release', 'coverage',
  'playwright-report', 'test-results', '__snapshots__', '.git',
];

/** Filer/mönster att utesluta */
const EXCLUDE_FILES = [
  'package-lock.json', '.DS_Store',
];

/** Filändelser som behandlas som binära och utesluts */
const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.webp',
  '.pdf', '.db', '.db-wal', '.db-shm',
  '.woff', '.woff2', '.ttf', '.eot',
  '.zip', '.tar', '.gz', '.snap',
  '.exe', '.dmg', '.AppImage', '.deb',
]);

// ─── Hjälpfunktioner ────────────────────────────────────────────────────────

function shouldExcludeDir(name) {
  return EXCLUDE_DIRS.includes(name);
}

function shouldExcludeFile(filePath) {
  const name = filePath.split('/').pop();
  if (EXCLUDE_FILES.includes(name)) return true;
  if (name.startsWith('.DS_Store')) return true;
  if (name.endsWith('.log')) return true;
  if (BINARY_EXTENSIONS.has(extname(name).toLowerCase())) return true;
  return false;
}

function collectFiles(dir, base = ROOT) {
  const results = [];
  let entries;
  try {
    entries = readdirSync(join(base, dir), { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const rel = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (!shouldExcludeDir(entry.name)) {
        results.push(...collectFiles(rel, base));
      }
    } else if (entry.isFile() && !shouldExcludeFile(rel)) {
      results.push(rel);
    }
  }
  return results;
}

function buildTree(files) {
  const lines = [];
  const tree = {};
  for (const f of files) {
    const parts = f.split('/');
    let node = tree;
    for (const p of parts) {
      node[p] = node[p] || {};
      node = node[p];
    }
  }
  function render(node, prefix = '') {
    const keys = Object.keys(node).sort();
    keys.forEach((key, i) => {
      const isLast = i === keys.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      lines.push(prefix + connector + key);
      const children = Object.keys(node[key]);
      if (children.length > 0) {
        render(node[key], prefix + (isLast ? '    ' : '│   '));
      }
    });
  }
  render(tree);
  return lines.join('\n');
}

/** Ordning: rotfiler → src/shared → src/main → src/preload → src/renderer → tests → e2e */
function sortKey(filePath) {
  const order = [
    'package.json', 'tsconfig', 'vite.config', 'playwright.config', 'CLAUDE.md',
    'src/shared/', 'src/main/', 'src/preload/', 'src/renderer/',
    'tests/', 'e2e/',
  ];
  for (let i = 0; i < order.length; i++) {
    if (filePath.startsWith(order[i]) || filePath.includes(order[i])) {
      return `${String(i).padStart(2, '0')}_${filePath}`;
    }
  }
  return `99_${filePath}`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

// Samla filer
let allFiles = [];

// Rotfiler
for (const f of INCLUDE_ROOT_FILES) {
  try {
    statSync(join(ROOT, f));
    allFiles.push(f);
  } catch {
    // filen finns inte, skippa
  }
}

// Rekursiva kataloger
for (const dir of INCLUDE_DIRS) {
  allFiles.push(...collectFiles(dir));
}

// Sortera i logisk ordning
allFiles.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

// Git commit hash
let commitHash = 'unknown';
try {
  commitHash = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf-8' }).trim();
} catch { /* ignore */ }

// Bygg output
const SEP = '='.repeat(80);
const parts = [];
let totalLines = 0;

// Läs alla filer och räkna rader
const fileContents = [];
for (const f of allFiles) {
  const content = readFileSync(join(ROOT, f), 'utf-8');
  const lineCount = content.split('\n').length;
  totalLines += lineCount;
  fileContents.push({ path: f, content, lineCount });
}

// Header
parts.push(SEP);
parts.push('FRITT BOKFÖRING — SOURCE CODE DUMP');
parts.push(SEP);
parts.push(`Generated:    ${new Date().toISOString()}`);
parts.push(`Git commit:   ${commitHash}`);
parts.push(`Total files:  ${allFiles.length}`);
parts.push(`Total lines:  ${totalLines}`);
parts.push('');

// Trädvy
parts.push(SEP);
parts.push('FILE TREE');
parts.push(SEP);
parts.push(buildTree(allFiles));
parts.push('');

// Filinnehåll
for (const { path, content, lineCount } of fileContents) {
  parts.push(SEP);
  parts.push(`FILE: ${path}`);
  parts.push(`SIZE: ${lineCount} lines`);
  parts.push(SEP);
  parts.push(content);
  parts.push('');
}

const output = parts.join('\n');

// Kolla storlek
const sizeBytes = Buffer.byteLength(output, 'utf-8');
const sizeMB = sizeBytes / (1024 * 1024);

if (sizeMB > MAX_SIZE_MB) {
  console.error(`\n❌ Filen skulle bli ${sizeMB.toFixed(2)} MB (max ${MAX_SIZE_MB} MB). Scope behöver trimmas.`);
  process.exit(1);
}

writeFileSync(OUTPUT, output, 'utf-8');

console.log(`✅ ${OUTPUT}`);
console.log(`   Filer:   ${allFiles.length}`);
console.log(`   Rader:   ${totalLines}`);
console.log(`   Storlek: ${sizeMB.toFixed(2)} MB`);
