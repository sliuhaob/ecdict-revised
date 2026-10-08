// SPDX-License-Identifier: MIT
'use strict';
const fs = require('node:fs'), path = require('node:path');
const { TABLES, openRead, writeCsv } = require('./lib.cjs');
const [input, output] = process.argv.slice(2);
if (!input || !output) { console.error('Usage: node scripts/export.cjs INPUT.sqlite NEW_OUTPUT_DIRECTORY'); process.exit(2); }
if (fs.existsSync(output)) throw new Error('Output directory already exists; choose a new directory');
const db = openRead(input);
try {
  fs.mkdirSync(output, { recursive: true });
  const counts = {};
  for (const table of Object.keys(TABLES)) counts[table] = writeCsv(db, table, path.join(output, table + '.csv'));
  console.log(JSON.stringify(counts, null, 2));
} finally { db.close(); }
