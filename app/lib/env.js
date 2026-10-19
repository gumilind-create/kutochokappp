'use strict';
/* Читает .env рядом с проектом и кладёт значения в process.env.
   Переменные, заданные снаружи (на хостинге), имеют приоритет. */
const fs = require('node:fs');
const path = require('node:path');

const file = process.env.ENV_FILE || path.join(__dirname, '..', '.env');
if (fs.existsSync(file)) {
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    if (process.env[key] === undefined) process.env[key] = val;
  }
}
