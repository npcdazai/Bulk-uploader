import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Guardrail: these terms must NEVER appear anywhere in the project source —
 * code, identifiers, config, comments, docs, or filenames. This test scans the
 * whole repo and fails the build if any reappear, so they can't sneak back in.
 *
 * Patterns and labels are assembled from fragments so the exact forbidden
 * strings never appear literally — not even in this enforcer file.
 */

const f1 = ['switch', 'my', 'loan']; // brand name (no spaces)
const f2 = ['durwang', '@', 'cready', '.', 'in']; // email
const f3 = ['s', 'm', 'l']; // standalone token

const FORBIDDEN = [
  { label: f1.join(''), re: new RegExp(f1.join(' ?'), 'i') },
  { label: f2.join(''), re: new RegExp(f2.map((p) => (p === '.' ? '\\.' : p)).join(''), 'i') },
  { label: `${f3.join('')} (standalone)`, re: new RegExp(`\\b${f3.join('')}\\b`, 'i') },
];

const SELF = path.basename(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

// .claude is Claude Code's local tooling config (gitignored, never shipped).
const SKIP_DIRS = new Set(['node_modules', '.git', '.claude', 'dist', 'downloads', 'tmp-uploads', 'htdocs-store', '.pm2']);
const SKIP_FILES = new Set(['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml', SELF]);
const SCAN_EXT = new Set(['.js', '.ts', '.tsx', '.jsx', '.json', '.md', '.yml', '.yaml', '.mjs', '.cjs', '.html', '.css']);

function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!SKIP_DIRS.has(entry.name)) yield* walk(path.join(dir, entry.name));
    } else if (entry.isFile() && !SKIP_FILES.has(entry.name)) {
      const ext = path.extname(entry.name);
      if (SCAN_EXT.has(ext) || entry.name === '.env.example') yield path.join(dir, entry.name);
    }
  }
}

test('no forbidden terms appear anywhere in the project (files + paths)', () => {
  const hits = [];
  for (const file of walk(REPO_ROOT)) {
    const rel = path.relative(REPO_ROOT, file);
    // path/filename check
    for (const { label, re } of FORBIDDEN) {
      if (re.test(rel)) hits.push(`${rel} (in path) -> ${label}`);
    }
    // content check
    const text = fs.readFileSync(file, 'utf8');
    for (const { label, re } of FORBIDDEN) {
      if (re.test(text)) {
        const line = text.split(/\r?\n/).findIndex((l) => re.test(l)) + 1;
        hits.push(`${rel}:${line} -> ${label}`);
      }
    }
  }
  assert.equal(hits.length, 0, `Forbidden term(s) found:\n${hits.join('\n')}`);
});
