const db = require('./backend/config/db');

async function run() {
  await db.initDatabase();
  const res = await db.query("SELECT * FROM users ORDER BY id DESC LIMIT 3");
  console.log('Last 3 users:', res.rows.map(u => ({ id: u.id, email: u.email, name: u.name })));
  if (res.rows.length > 0) {
    const lastUser = res.rows[0];
    const notifs = await db.query("SELECT * FROM notifications WHERE user_id = $1", [lastUser.id]);
    console.log(`Notifications for last user (${lastUser.email}, id=${lastUser.id}):`, notifs.rows);
    
    // Check if there are any alerts
    const alerts = await db.query("SELECT * FROM alerts WHERE id IN (SELECT alert_id FROM notifications WHERE user_id = $1)", [lastUser.id]);
    console.log('Alerts linked to these notifications:', alerts.rows);
  }
}

run();
