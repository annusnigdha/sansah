const db = require('./backend/config/db');

async function run() {
  await db.initDatabase();
  const res = await db.query("SELECT * FROM system_settings");
  console.log('System Settings:', res.rows);
}

run();
