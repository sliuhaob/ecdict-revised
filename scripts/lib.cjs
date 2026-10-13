// SPDX-License-Identifier: MIT
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const TABLES = { entries: ['word', 'phonetic', 'translation'], aliases: ['alias', 'target'] };
const SCHEMA = `CREATE TABLE entries (
  word TEXT PRIMARY KEY COLLATE NOCASE,
  phonetic TEXT NOT NULL DEFAULT '',
  translation TEXT NOT NULL
) WITHOUT ROWID;
CREATE TABLE aliases (
  alias TEXT PRIMARY KEY COLLATE NOCASE,
  target TEXT NOT NULL
) WITHOUT ROWID;`;
function openRead(file) {
  if (!fs.statSync(file).isFile()) throw new Error('Not a regular database file');
  const db = new DatabaseSync(file, { readOnly: true });
  db.exec('PRAGMA query_only=ON; PRAGMA trusted_schema=OFF;');
  return db;
}
function sha256(file) {
  const h = crypto.createHash('sha256'), b = Buffer.alloc(1024 * 1024);
  const fd = fs.openSync(file, 'r');
  try { for (;;) { const n = fs.readSync(fd, b); if (!n) break; h.update(b.subarray(0, n)); } }
  finally { fs.closeSync(fd); }
  return h.digest('hex');
}
function inspect(db) {
  const tables = {};
  for (const [name, columns] of Object.entries(TABLES)) {
    const actual = db.prepare(`PRAGMA table_info(${name})`).all().map(x => x.name);
    if (JSON.stringify(actual) !== JSON.stringify(columns)) throw new Error(`Schema mismatch: ${name}`);
    const hash = crypto.createHash('sha256'); let count = 0;
    for (const row of db.prepare(`SELECT ${columns.join(',')} FROM ${name} ORDER BY ${columns[0]} COLLATE BINARY`).iterate()) {
      if (columns.some(c => typeof row[c] !== 'string')) throw new Error(`Non-text field in ${name}`);
      hash.update(JSON.stringify(columns.map(c => row[c])) + '\n'); count++;
    }
    tables[name] = { rows: count, logicalSha256: hash.digest('hex') };
  }
  const integrity = db.prepare('PRAGMA integrity_check').all().map(x => x.integrity_check);
  const blankTranslations = db.prepare("SELECT count(*) n FROM entries WHERE trim(translation)='' ").get().n;
  const blankKeys = db.prepare("SELECT (SELECT count(*) FROM entries WHERE trim(word)='')+(SELECT count(*) FROM aliases WHERE trim(alias)='' OR trim(target)='') n").get().n;
  const orphanAliases = db.prepare('SELECT count(*) n FROM aliases a LEFT JOIN entries e ON e.word=a.target WHERE e.word IS NULL').get().n;
  return { tables, integrity, blankTranslations, blankKeys, orphanAliases,
    valid: integrity.length === 1 && integrity[0] === 'ok' && !blankTranslations && !blankKeys && !orphanAliases };
}
function writeCsv(db, table, file) {
  const cols = TABLES[table]; if (!cols) throw new Error('Unknown table');
  const fd = fs.openSync(file, 'wx'); let count = 0, buffer = cols.join(',') + '\r\n';
  try {
    for (const row of db.prepare(`SELECT ${cols.join(',')} FROM ${table} ORDER BY ${cols[0]} COLLATE BINARY`).iterate()) {
      buffer += cols.map(c => '"' + row[c].replaceAll('"', '""') + '"').join(',') + '\r\n';
      count++;
      if (buffer.length >= 1024 * 1024) { fs.writeSync(fd, buffer); buffer = ''; }
    }
    if (buffer) fs.writeSync(fd, buffer);
  } finally { fs.closeSync(fd); }
  return count;
}
// Streaming CSV parser: UTF-8, quoted/unquoted fields, escaped quotes, embedded CR/LF.
async function* csvRows(file) {
  let state = 'start', field = '', row = [], skipLf = false, first = true;
  for await (let chunk of fs.createReadStream(file, { encoding: 'utf8' })) {
    if (first) { chunk = chunk.replace(/^\uFEFF/, ''); first = false; }
    for (const ch of chunk) {
      if (skipLf) { skipLf = false; if (ch === '\n') continue; }
      if (state === 'quoted') {
        if (ch === '"') state = 'closed'; else field += ch;
        continue;
      }
      if (state === 'closed' && ch === '"') { field += '"'; state = 'quoted'; continue; }
      if (ch === ',' || ch === '\r' || ch === '\n') {
        row.push(field); field = ''; state = 'start';
        if (ch !== ',') { yield row; row = []; skipLf = ch === '\r'; }
        continue;
      }
      if (state === 'closed') throw new Error('Unexpected character after CSV closing quote');
      if (state === 'start' && ch === '"') { state = 'quoted'; continue; }
      if (ch === '"') throw new Error('Unexpected quote in unquoted CSV field');
      field += ch; state = 'plain';
    }
  }
  if (state === 'quoted') throw new Error('Unterminated CSV quoted field');
  if (field || row.length || state === 'closed') { row.push(field); yield row; }
}
function safeRelative(root, relative) {
  if (!relative || relative.includes('\\') || path.posix.isAbsolute(relative) || /^[A-Za-z]:/.test(relative)) throw new Error('Unsafe checksum path');
  const target = path.resolve(root, relative);
  if (!target.startsWith(path.resolve(root) + path.sep)) throw new Error('Checksum path escapes package');
  return target;
}
function inspectInflections(db, file) {
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (data.version !== 1 || typeof data.source !== 'string' || !data.forms ||
      typeof data.forms !== 'object' || Array.isArray(data.forms)) throw new Error('Invalid verb inflections format');
  const entry = db.prepare('SELECT word FROM entries WHERE word=?');
  const alias = db.prepare('SELECT target FROM aliases WHERE alias=?');
  let forms = 0, pastTenses = 0, pastParticiples = 0, presentParticiples = 0, multipleLemmas = 0;
  for (const [form, candidates] of Object.entries(data.forms)) {
    if (!form.trim() || form !== form.trim().toLowerCase() || !Array.isArray(candidates) || !candidates.length)
      throw new Error('Invalid verb form: ' + form);
    const seen = new Set(), types = new Set();
    for (const item of candidates) {
      if (!item || typeof item.lemma !== 'string' || !item.lemma.trim() ||
          item.lemma !== item.lemma.trim().toLowerCase() || item.lemma === form || seen.has(item.lemma) ||
          !entry.get(item.lemma) || !Array.isArray(item.types) || !item.types.length ||
          new Set(item.types).size !== item.types.length || item.types.some(t => !['p', 'd', 'i'].includes(t)))
        throw new Error('Invalid lemma/types for: ' + form);
      seen.add(item.lemma); item.types.forEach(t => types.add(t));
    }
    if (alias.get(form)?.target.toLowerCase() !== candidates[0].lemma)
      throw new Error('Verb form/alias mismatch: ' + form);
    forms++; pastTenses += Number(types.has('p')); pastParticiples += Number(types.has('d'));
    presentParticiples += Number(types.has('i')); multipleLemmas += Number(candidates.length > 1);
  }
  if (!forms) throw new Error('Empty verb inflections');
  return { file: path.basename(file), sha256: sha256(file), forms, pastTenses, pastParticiples, presentParticiples, multipleLemmas, valid: true };
}
module.exports = { TABLES, SCHEMA, openRead, sha256, inspect, inspectInflections, writeCsv, csvRows, safeRelative };
