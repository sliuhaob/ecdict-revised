// SPDX-License-Identifier: MIT
'use strict';
const fs = require('node:fs'), path = require('node:path'), zlib = require('node:zlib');
const { DatabaseSync } = require('node:sqlite');
const { csvRows, sha256 } = require('./lib.cjs');
async function main() {
  const [csv, current, output] = process.argv.slice(2);
  if (!csv || !current || !output) {
    console.error('Usage: node scripts/compare-upstream.cjs UPSTREAM_ECDICT.csv CURRENT.sqlite NEW_OUTPUT_DIRECTORY');
    process.exitCode = 2; return;
  }
  if (fs.existsSync(output)) throw new Error('Output directory already exists');
  const sourceHash = sha256(csv), currentHash = sha256(current);
  fs.mkdirSync(output, { recursive: true });
  const temporary = path.join(output, '_compare.sqlite');
  const db = new DatabaseSync(temporary);
  let completed = false;
  try {
    db.exec(`PRAGMA trusted_schema=OFF; PRAGMA journal_mode=MEMORY;
      CREATE TABLE source (key TEXT PRIMARY KEY COLLATE NOCASE, word TEXT NOT NULL,
        phonetic TEXT NOT NULL, translation TEXT NOT NULL) WITHOUT ROWID; BEGIN;`);
    const insert = db.prepare('INSERT INTO source VALUES (?,?,?,?)');
    let headers, sourceRows = 0;
    for await (const fields of csvRows(csv)) {
      if (!headers) {
        headers = fields;
        if (!['word', 'phonetic', 'translation'].every(k => headers.includes(k))) throw new Error('Missing required upstream fields');
        continue;
      }
      if (fields.length !== headers.length) throw new Error('Invalid upstream CSV row');
      const o = Object.fromEntries(headers.map((h, i) => [h, fields[i]]));
      const key = o.word.trim().toLowerCase();
      if (!key) throw new Error('Empty upstream key');
      insert.run(key, o.word, o.phonetic, o.translation); sourceRows++;
    }
    if (!sourceRows) throw new Error('Empty upstream CSV');
    db.exec('COMMIT;');
    db.prepare('ATTACH DATABASE ? AS current').run(path.resolve(current));
    db.exec('PRAGMA query_only=ON;');
    const changes = [], deletions = [], formatting = [];
    let common = 0, unchanged = 0, translationChanged = 0, phoneticChanged = 0;
    for (const r of db.prepare(`SELECT s.key,s.word,s.phonetic,s.translation,
      c.word current_word,c.phonetic current_phonetic,c.translation current_translation
      FROM source s LEFT JOIN current.entries c ON c.word=s.key ORDER BY s.key COLLATE BINARY`).iterate()) {
      const before = { word: r.word, phonetic: r.phonetic, translation: r.translation };
      if (r.current_word === null) {
        deletions.push({ action: 'delete', word: r.key, before, after: null }); continue;
      }
      common++;
      const after = { word: r.current_word, phonetic: r.current_phonetic, translation: r.current_translation };
      const t = before.translation.trim() !== after.translation.trim();
      const p = before.phonetic.trim() !== after.phonetic.trim();
      if (t || p) {
        translationChanged += Number(t); phoneticChanged += Number(p);
        changes.push({ action: 'revise', word: r.key, before, after });
      } else if (JSON.stringify(before) !== JSON.stringify(after)) {
        formatting.push({ action: 'format', word: r.key, before, after });
      } else unchanged++;
    }
    for (const r of db.prepare(`SELECT c.* FROM current.entries c LEFT JOIN source s ON s.key=c.word
      WHERE s.key IS NULL ORDER BY c.word COLLATE BINARY`).iterate()) {
      changes.push({ action: 'add', word: r.word, before: null, after: r });
    }
    changes.sort((a, b) => Buffer.compare(Buffer.from(a.word), Buffer.from(b.word)));
    const added = changes.filter(r => r.action === 'add').length;
    const report = {
      sourceCsvSha256: sourceHash, currentDatabaseSha256: currentHash,
      comparedFields: ['word', 'phonetic', 'translation'], omittedUpstreamFields: headers.filter(k => !['word', 'phonetic', 'translation'].includes(k)),
      matchingRule: 'Upstream word.trim().toLowerCase(), joined using SQLite NOCASE; duplicate normalized upstream keys are rejected',
      contentComparison: 'Both translation and phonetic are compared after ECMAScript String.trim(); original strings are retained in before/after records',
      counts: { sourceEntries: sourceRows, currentEntries: common + added, commonEntries: common,
        added, absentFromCurrent: deletions.length, contentRevised: changes.length - added,
        translationRevised: translationChanged, phoneticRevised: phoneticChanged,
        formattingOnly: formatting.length, byteIdenticalCommonEntries: unchanged,
        netEntries: common + added - sourceRows },
      caveat: 'Absence includes import scope differences and later removals; not all absences are editorial deletions. Content revision counts are text differences, not accuracy certification.'
    };
    for (const [name, rows] of [['entries', changes], ['deletions', deletions], ['formatting', formatting]]) {
      fs.writeFileSync(path.join(output, name + '.jsonl.gz'), zlib.gzipSync(rows.map(r => JSON.stringify(r) + '\n').join(''), { level: 9 }));
    }
    if (sha256(current) !== currentHash || sha256(csv) !== sourceHash) throw new Error('An input changed during comparison');
    fs.writeFileSync(path.join(output, 'summary.json'), JSON.stringify(report, null, 2) + '\n');
    console.log(JSON.stringify(report, null, 2)); completed = true;
  } finally {
    db.close();
    // This is solely the temporary database created in the new output directory.
    if (completed) fs.unlinkSync(temporary);
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
