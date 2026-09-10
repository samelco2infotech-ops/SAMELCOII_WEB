#!/usr/bin/env node
/**
 * Heuristic dead-code finder: flags .js files under backend/src that no other
 * file ever require()s. Written after finding samAgent.js sitting fully built,
 * unit-tested, and completely unused this session — nothing caught that until
 * a human happened to go looking. This won't catch everything (dynamic
 * requires, string-built paths) but catches exactly that class of mistake.
 *
 * Run: node scripts/find-dead-modules.js
 */
const fs = require('fs');
const path = require('path');

const SRC = path.resolve(__dirname, '../src');
// Entry points and CLI scripts are never require()'d by design — not dead code.
const IGNORE_BASENAMES = new Set(['server.js', 'app.js', 'selfcheck.js']);
const IGNORE_SUFFIXES = ['.selfcheck.js', '.parity.js'];

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.js')) out.push(full);
  }
  return out;
}

function isIgnored(file) {
  const base = path.basename(file);
  if (IGNORE_BASENAMES.has(base)) return true;
  return IGNORE_SUFFIXES.some((suffix) => base.endsWith(suffix));
}

const allFiles = walk(SRC);
const required = new Set();

for (const file of allFiles) {
  const content = fs.readFileSync(file, 'utf8');
  const dir = path.dirname(file);
  for (const match of content.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
    let resolved = path.resolve(dir, match[1]);
    if (!resolved.endsWith('.js')) resolved += '.js';
    required.add(resolved);
  }
}

const dead = allFiles.filter((file) => !isIgnored(file) && !required.has(file));

if (!dead.length) {
  console.log('No unreferenced modules found.');
  process.exit(0);
}

console.log(`${dead.length} module(s) are never require()'d by anything else in backend/src:\n`);
for (const file of dead) {
  console.log(`  ${path.relative(SRC, file)}`);
}
console.log('\nEach of these is either a live entry point not in IGNORE_BASENAMES, or genuinely dead code — check before deleting.');
process.exit(1);
