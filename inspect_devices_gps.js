const db = require('./backend/config/db');

async function run() {
  await db.initDatabase();
  const res = await db.query("SELECT * FROM devices");
  console.log('--- ALL DEVICES ---');
  for (const d of res.rows) {
    const gpsHist = await db.query(
      'SELECT lat, lng, speed, distance, timestamp FROM gps_tracking WHERE device_id = $1 ORDER BY id DESC LIMIT 1',
      [d.id]
    );
    console.log(`Device ID: ${d.id}, name: ${d.name}, gps_enabled: ${d.gps_enabled}`);
    console.log('Last GPS entry:', gpsHist.rows[0]);
  }
}

run();
