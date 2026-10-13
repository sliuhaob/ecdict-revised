// SPDX-License-Identifier: MIT
'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), os = require('node:os'), path = require('node:path');
const { spawnSync } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const { SCHEMA, writeCsv, csvRows, inspect, inspectInflections, sha256, safeRelative } = require('./lib.cjs');
test('CSV round trip preserves commas, quotes, line breaks, literal separators and Unicode', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecdict-release-test-'));
  const input = path.join(dir, 'input.sqlite'), output = path.join(dir, 'output.sqlite');
  const created = [input, output, path.join(dir, 'entries.csv'), path.join(dir, 'aliases.csv'), path.join(dir, 'bad.csv')];
  let db;
  try {
    db = new DatabaseSync(input); db.exec(SCHEMA);
    const rows = [
      ['alpha', 'æ', 'n. 甲\\n古义\n实际换行\r\n次行, "引号"'],
      ['中文', '', '含中文、emoji 🪷 与行末空格 '],
      ['=token', '', '+literal; @not-formula'],
      ['large', '', '词'.repeat(70000) + '"\nend']
    ];
    const add = db.prepare('INSERT INTO entries VALUES (?,?,?)');
    rows.forEach(r => add.run(...r)); db.prepare('INSERT INTO aliases VALUES (?,?)').run('alphas', 'alpha');
    assert.throws(() => add.run('ALPHA', '', 'duplicate'));
    const expected = inspect(db); assert.equal(expected.valid, true);
    for (const table of ['entries', 'aliases']) writeCsv(db, table, path.join(dir, table + '.csv'));
    db.close(); db = null;
    const build = spawnSync(process.execPath, [path.join(__dirname, 'build.cjs'), dir, output], { encoding: 'utf8' });
    assert.equal(build.status, 0, build.stderr);
    db = new DatabaseSync(output, { readOnly: true });
    assert.deepEqual(inspect(db).tables, expected.tables); db.close(); db = null;
    const before = sha256(output);
    const overwrite = spawnSync(process.execPath, [path.join(__dirname, 'build.cjs'), dir, output], { encoding: 'utf8' });
    assert.notEqual(overwrite.status, 0); assert.equal(sha256(output), before);
    fs.writeFileSync(path.join(dir, 'bad.csv'), 'a,b\r\n"unclosed');
    await assert.rejects(async () => { for await (const row of csvRows(path.join(dir, 'bad.csv'))) void row; });
  } finally {
    db?.close();
    for (const file of created) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
});
test('validation detects blank meanings and orphan aliases', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(SCHEMA); db.prepare('INSERT INTO entries VALUES (?,?,?)').run('x', '', '');
    db.prepare('INSERT INTO aliases VALUES (?,?)').run('xs', 'missing');
    const report = inspect(db); assert.equal(report.valid, false);
    assert.equal(report.blankTranslations, 1); assert.equal(report.orphanAliases, 1);
  } finally { db.close(); }
});
test('checksum paths cannot escape the release directory', () => {
  for (const p of ['../secret', '/secret', 'C:/secret', 'data\\secret']) assert.throws(() => safeRelative(process.cwd(), p));
  assert.equal(safeRelative(process.cwd(), 'data/entries.csv'), path.resolve('data/entries.csv'));
});
test('verb metadata validates type codes, lemma targets and primary alias consistency', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecdict-inflections-test-'));
  const file = path.join(dir, 'verb-inflections.json'), db = new DatabaseSync(':memory:');
  try {
    db.exec(SCHEMA); db.prepare('INSERT INTO entries VALUES (?,?,?)').run('atone', '', 'vi. 赎罪');
    db.prepare('INSERT INTO aliases VALUES (?,?)').run('atoned', 'atone');
    assert.equal(inspectInflections(db, file), null);
    const data = { version: 1, source: 'test', forms: { atoned: [{ lemma: 'atone', types: ['d', 'p'] }] } };
    const save = () => fs.writeFileSync(file, JSON.stringify(data));
    save(); const report = inspectInflections(db, file);
    assert.equal(report.forms, 1); assert.equal(report.pastParticiples, 1); assert.equal(report.pastTenses, 1);
    data.forms.atoned[0].types = ['x']; save(); assert.throws(() => inspectInflections(db, file), /Invalid lemma/);
    data.forms.atoned[0].types = ['d']; data.forms.atoned[0].lemma = 'aton'; save();
    assert.throws(() => inspectInflections(db, file), /Invalid lemma/);
    data.forms.atoned[0].lemma = 'atone'; save(); db.exec('DELETE FROM aliases');
    assert.throws(() => inspectInflections(db, file), /alias mismatch/);
  } finally { db.close(); if (fs.existsSync(file)) fs.unlinkSync(file); fs.rmdirSync(dir); }
});
test('upstream comparison separates content edits, formatting, additions and absences', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ecdict-upstream-test-'));
  const csv = path.join(dir, 'source.csv'), current = path.join(dir, 'current.sqlite'), output = path.join(dir, 'diff');
  let db;
  try {
    fs.writeFileSync(csv, 'word,phonetic,translation\r\n"Alpha","","old"\r\n"beta",""," unchanged "\r\n"DEL","","removed"\r\n');
    db = new DatabaseSync(current); db.exec(SCHEMA);
    const put = db.prepare('INSERT INTO entries VALUES (?,?,?)');
    put.run('alpha', '', 'new'); put.run('beta', '', 'unchanged'); put.run('gamma', '', 'added');
    db.close(); db = null;
    const before = sha256(current);
    const comparison = spawnSync(process.execPath, [path.join(__dirname, 'compare-upstream.cjs'), csv, current, output], { encoding: 'utf8' });
    assert.equal(comparison.status, 0, comparison.stderr);
    const report = JSON.parse(comparison.stdout);
    assert.equal(report.counts.contentRevised, 1); assert.equal(report.counts.formattingOnly, 1);
    assert.equal(report.counts.added, 1); assert.equal(report.counts.absentFromCurrent, 1);
    assert.equal(report.counts.currentEntries, 3); assert.equal(report.counts.sourceEntries, 3);
    assert.equal(sha256(current), before);
  } finally {
    db?.close();
    for (const name of ['entries.jsonl.gz', 'deletions.jsonl.gz', 'formatting.jsonl.gz', 'summary.json']) {
      const file = path.join(output, name); if (fs.existsSync(file)) fs.unlinkSync(file);
    }
    if (fs.existsSync(output)) fs.rmdirSync(output);
    for (const file of [csv, current]) if (fs.existsSync(file)) fs.unlinkSync(file);
    fs.rmdirSync(dir);
  }
});
