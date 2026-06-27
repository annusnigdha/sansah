const db = require('./backend/config/db');

async function inspect() {
  try {
    await db.initDatabase();
    
    console.log('--- USERS ---');
    const users = await db.query('SELECT id, name, email, phone, role FROM users');
    console.log(users.rows);

    console.log('--- ALERTS ---');
    const alerts = await db.query('SELECT id, device_id, message, level, status FROM alerts');
    console.log(alerts.rows.filter(a => a.device_id === 'SYSTEM'));

    console.log('--- NOTIFICATIONS ---');
    const notifs = await db.query('SELECT * FROM notifications');
    console.log(notifs.rows);

  } catch (err) {
    console.error('Inspection failed:', err);
  }
}

inspect();
