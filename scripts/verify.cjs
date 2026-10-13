// SPDX-License-Identifier: MIT
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { openRead, inspect, inspectInflections, sha256, safeRelative } = require('./lib.cjs');
const args = process.argv.slice(2), sumsAt = args.indexOf('--checksums');
const sumsFile = sumsAt < 0 ? null : args[sumsAt + 1];
const files = sumsAt < 0 ? args : args.slice(0, sumsAt);
if (files.length < 1 || files.length > 2 || (sumsAt >= 0 && !sumsFile)) {
  console.error('Usage: node scripts/verify.cjs DATABASE.sqlite [COMPARISON.sqlite] [--checksums SHA256SUMS]'); process.exit(2);
}
const reports = files.map(file => {
  const db = openRead(file);
  try { return { file: path.basename(file), sha256: sha256(file), ...inspect(db),
    verbInflections: inspectInflections(db, path.join(path.dirname(file), 'verb-inflections.json')) }; }
  finally { db.close(); }
});
let valid = reports.every(r => r.valid), logicalContentEqual = null, checksumsVerified = 0;
if (reports.length === 2) {
  logicalContentEqual = JSON.stringify(reports[0].tables) === JSON.stringify(reports[1].tables);
  valid &&= logicalContentEqual;
}
if (sumsFile) {
  const root = path.dirname(path.resolve(sumsFile)), seen = new Set();
  for (const line of fs.readFileSync(sumsFile, 'utf8').split(/\r?\n/).filter(Boolean)) {
    const match = /^([a-f0-9]{64})  (.+)$/.exec(line);
    if (!match || seen.has(match[2])) throw new Error('Invalid or duplicate SHA256SUMS line');
    seen.add(match[2]);
    const file = safeRelative(root, match[2]);
    if (sha256(file) !== match[1]) throw new Error('Checksum mismatch: ' + match[2]);
    checksumsVerified++;
  }
  if (!checksumsVerified) throw new Error('Empty checksum manifest');
}
console.log(JSON.stringify({ valid, reports, logicalContentEqual, checksumsVerified,
  semanticAccuracyCertified: false }, null, 2));
if (!valid) process.exitCode = 1;
