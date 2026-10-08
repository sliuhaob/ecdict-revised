// SPDX-License-Identifier: MIT
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { TABLES, SCHEMA, csvRows, inspect } = require('./lib.cjs');
async function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) { console.error('Usage: node scripts/build.cjs CSV_DIRECTORY NEW_OUTPUT.sqlite'); process.exitCode = 2; return; }
  // Exclusive creation prevents overwriting an existing dictionary.
  fs.closeSync(fs.openSync(output, 'wx'));
  const db = new DatabaseSync(output);
  try {
    db.exec('PRAGMA trusted_schema=OFF; BEGIN IMMEDIATE;');
    db.exec(SCHEMA);
    for (const [table, columns] of Object.entries(TABLES)) {
      let header = true;
      const insert = db.prepare(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`);
      for await (const row of csvRows(path.join(input, table + '.csv'))) {
        if (header) { if (JSON.stringify(row) !== JSON.stringify(columns)) throw new Error(`Wrong header: ${table}`); header = false; continue; }
        if (row.length !== columns.length) throw new Error(`Wrong field count: ${table}`);
        insert.run(...row);
      }
      if (header) throw new Error(`Missing CSV header: ${table}`);
    }
    const report = inspect(db);
    if (!report.valid) throw new Error('Built database failed validation: ' + JSON.stringify(report));
    db.exec('COMMIT;');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    try { db.exec('ROLLBACK;'); } catch {}
    throw error;
  } finally { db.close(); }
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
