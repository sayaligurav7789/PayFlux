require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('./db');

async function run() {
  const migrationsDir = path.join(__dirname, '..', '..', 'migrations');
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    console.log(`Running migration: ${file}`);
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    try {
      await pool.query(sql);
      console.log(`  done`);
    } catch (err) {
      // Most common cause during dev: re-running a migration that already
      // ran (types/tables already exist). Log and continue so `npm run
      // migrate` stays idempotent-ish for local iteration.
      console.warn(`  skipped (${err.message.split('\n')[0]})`);
    }
  }

  await pool.end();
  console.log('Migrations complete.');
}

run().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
