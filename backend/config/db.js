const { Pool } = require('pg');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
require('dotenv').config();

let dbClient = null;
let isSQLite = false;
let sqliteDb = null;

// Initialize Database connection
async function initDatabase() {
  const usePostgres = process.env.PGHOST || process.env.DATABASE_URL;

  if (usePostgres) {
    console.log('Attempting to connect to PostgreSQL...');
    try {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        host: process.env.PGHOST,
        user: process.env.PGUSER,
        database: process.env.PGDATABASE,
        password: process.env.PGPASSWORD,
        port: process.env.PGPORT || 5432,
        // Short timeout for fallback detection
        connectionTimeoutMillis: 5000,
        idleTimeoutMillis: 10000
      });

      // Test connection
      await pool.query('SELECT NOW()');
      console.log('Successfully connected to PostgreSQL database!');
      dbClient = pool;
      isSQLite = false;
      
      // Execute PostgreSQL schema creation if tables don't exist
      await createTables();
      return;
    } catch (err) {
      console.error('PostgreSQL connection failed:', err.message);
      console.log('Falling back to SQLite database for development...');
    }
  } else {
    console.log('No PostgreSQL credentials found. Initializing SQLite...');
  }

  // SQLite Fallback
  isSQLite = true;
  const dbPath = path.join(__dirname, '..', 'database.sqlite');
  console.log(`SQLite database located at: ${dbPath}`);
  
  sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Failed to open SQLite database:', err.message);
    } else {
      console.log('Successfully connected to SQLite database!');
    }
  });

  dbClient = {
    query: (sql, params = []) => {
      return new Promise((resolve, reject) => {
        // Convert PostgreSQL parameters ($1, $2, etc) to SQLite (? or $1)
        // sqlite3 supports $1, $2 if passed as named parameters in an object, 
        // but for array parameters it's easier to convert them to '?'
        let sqliteSql = sql;
        if (params && params.length > 0) {
          sqliteSql = sql.replace(/\$\d+/g, '?');
        }

        // Clean up any PostgreSQL-specific syntax like 'SERIAL PRIMARY KEY' 
        // (though we handle this in the schema definition specifically, sometimes queries have minor dialect details)
        const isSelect = sqliteSql.trim().toUpperCase().startsWith('SELECT') || sqliteSql.trim().toUpperCase().includes('RETURNING');

        if (isSelect) {
          sqliteDb.all(sqliteSql, params, (err, rows) => {
            if (err) {
              console.error(`SQLite Select Error [${sqliteSql}]:`, err.message);
              return reject(err);
            }
            resolve({ rows });
          });
        } else {
          sqliteDb.run(sqliteSql, params, function (err) {
            if (err) {
              console.error(`SQLite Run Error [${sqliteSql}]:`, err.message);
              return reject(err);
            }
            resolve({ rows: [], lastID: this.lastID, changes: this.changes });
          });
        }
      });
    }
  };

  // Execute SQLite schema creation
  await createTables();
}

async function createTables() {
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.sql');
  if (!fs.existsSync(schemaPath)) {
    // Ensure database directory exists
    fs.mkdirSync(path.dirname(schemaPath), { recursive: true });
    // Write standard schema.sql
    writeDefaultSchema(schemaPath);
  }

  const rawSchema = fs.readFileSync(schemaPath, 'utf8');
  
  if (isSQLite) {
    console.log('Creating tables in SQLite database...');
    // Split standard DDL statements by semicolon.
    // SQLite can execute multiple statements via db.exec, but we'll do it safely.
    // Replace SERIAL PRIMARY KEY with INTEGER PRIMARY KEY AUTOINCREMENT for SQLite compatibility
    let sqliteSchema = rawSchema
      .replace(/SERIAL PRIMARY KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
      .replace(/VARCHAR\(\d+\)/gi, 'TEXT')
      .replace(/\bTIMESTAMP\b/g, 'TEXT')
      .replace(/\bTIMESTAMP DEFAULT CURRENT_TIMESTAMP\b/g, 'TEXT DEFAULT CURRENT_TIMESTAMP')
      .replace(/BOOLEAN DEFAULT (TRUE|FALSE)/gi, (match, val) => `INTEGER DEFAULT ${val.toLowerCase() === 'true' ? 1 : 0}`)
      .replace(/JSONB/gi, 'TEXT');
      
    // Execute block by block
    const statements = sqliteSchema.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      try {
        await dbClient.query(stmt);
      } catch (err) {
        // Suppress errors about tables already existing
        if (!err.message.includes('already exists') && !err.message.includes('duplicate table')) {
          console.error('Schema initialization warning (SQLite):', err.message);
        }
      }
    }
  } else {
    console.log('Creating tables in PostgreSQL database...');
    const statements = rawSchema.split(';').map(s => s.trim()).filter(s => s.length > 0);
    for (const stmt of statements) {
      try {
        await dbClient.query(stmt);
      } catch (err) {
        if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
          console.error('Schema initialization warning (PostgreSQL):', err.message);
        }
      }
    }
  }
  
  console.log('Database tables verified/created successfully.');
  await runMigrations();
  await seedInitialData();
}

async function runMigrations() {
  console.log('Running database migrations...');
  
  // Create notification_history table
  try {
    if (isSQLite) {
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS notification_history (
          id TEXT PRIMARY KEY,
          user_id INTEGER,
          device_name TEXT,
          sensor_name TEXT,
          timestamp TEXT,
          alert_type TEXT,
          status TEXT
        )
      `);
    } else {
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS notification_history (
          id VARCHAR(100) PRIMARY KEY,
          user_id INTEGER,
          device_name TEXT,
          sensor_name TEXT,
          timestamp VARCHAR(100),
          alert_type VARCHAR(100),
          status VARCHAR(100)
        )
      `);
    }
    console.log('Verified notification_history table.');
  } catch (err) {
    console.error('Migration error (notification_history):', err.message);
  }

  // Update admin email to angeljaison625@gmail.com for sandbox delivery
  try {
    await dbClient.query("UPDATE users SET email = 'angeljaison625@gmail.com' WHERE email = 'admin@sansah.com'");
  } catch (err) {
    console.error('Migration warning (update admin email):', err.message);
  }

  // Create system_settings table
  try {
    if (isSQLite) {
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key TEXT PRIMARY KEY,
          value TEXT
        )
      `);
    } else {
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS system_settings (
          key VARCHAR(100) PRIMARY KEY,
          value TEXT
        )
      `);
    }
  } catch (err) {
    console.error('Migration error (system_settings):', err.message);
  }

  // Create alert_notes table
  try {
    if (isSQLite) {
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS alert_notes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          alert_id TEXT NOT NULL,
          user_id INTEGER NOT NULL,
          user_name TEXT NOT NULL,
          note TEXT NOT NULL,
          created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )
      `);
    } else {
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS alert_notes (
          id SERIAL PRIMARY KEY,
          alert_id VARCHAR(100) NOT NULL,
          user_id INTEGER NOT NULL,
          user_name VARCHAR(100) NOT NULL,
          note TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }
  } catch (err) {
    console.error('Migration error (alert_notes):', err.message);
  }

  // Create device_maintenance table
  try {
    if (isSQLite) {
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS device_maintenance (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          device_id TEXT NOT NULL,
          performed_by TEXT,
          description TEXT,
          cost DOUBLE PRECISION,
          maintenance_date TEXT
        )
      `);
    } else {
      await dbClient.query(`
        CREATE TABLE IF NOT EXISTS device_maintenance (
          id SERIAL PRIMARY KEY,
          device_id VARCHAR(50) NOT NULL,
          performed_by VARCHAR(100),
          description TEXT,
          cost DOUBLE PRECISION,
          maintenance_date TEXT
        )
      `);
    }
  } catch (err) {
    console.error('Migration error (device_maintenance):', err.message);
  }

  // Columns to add to users
  const usersColumns = [
    { name: 'organization', type: 'TEXT', def: "NULL" },
    { name: 'fcm_token', type: 'TEXT', def: "NULL" }
  ];

  for (const col of usersColumns) {
    try {
      await dbClient.query(`ALTER TABLE users ADD COLUMN ${col.name} ${col.type}`);
      console.log(`Added column ${col.name} to users.`);
    } catch (err) {
      if (!err.message.includes('duplicate column') && !err.message.includes('already exists') && !err.message.includes('duplicate column name')) {
        console.error(`Warning: Failed to add column ${col.name} to users:`, err.message);
      }
    }
  }

  // Columns to add to devices
  const devicesColumns = [
    { name: 'remarks', type: 'TEXT', def: "NULL" },
    { name: 'serial_number', type: 'TEXT', def: "NULL" },
    { name: 'owner_name', type: 'TEXT', def: "NULL" },
    { name: 'installation_date', type: 'TEXT', def: "NULL" },
    { name: 'warranty_expiry', type: 'TEXT', def: "NULL" },
    { name: 'category', type: 'TEXT', def: "NULL" },
    { name: 'lifecycle_status', type: 'TEXT', def: "NULL" },
    { name: 'health_score', type: 'DOUBLE PRECISION', def: "100.0" },
    { name: 'uptime_percent', type: 'DOUBLE PRECISION', def: "100.0" },
    { name: 'signal_strength', type: 'INTEGER', def: "-70" },
    { name: 'last_communication', type: isSQLite ? 'TEXT' : 'TIMESTAMP', def: "NULL" },
    { name: 'simulated_fault', type: 'INTEGER', def: "0" }
  ];

  for (const col of devicesColumns) {
    try {
      await dbClient.query(`ALTER TABLE devices ADD COLUMN ${col.name} ${col.type}`);
      // Update default values if not null
      if (col.def !== "NULL") {
        await dbClient.query(`UPDATE devices SET ${col.name} = ${col.def} WHERE ${col.name} IS NULL`);
      }
      console.log(`Added column ${col.name} to devices.`);
    } catch (err) {
      if (!err.message.includes('duplicate column') && !err.message.includes('already exists') && !err.message.includes('duplicate column name')) {
        console.error(`Warning: Failed to add column ${col.name} to devices:`, err.message);
      }
    }
  }

  // Columns to add to alerts
  const alertsColumns = [
    { name: 'acknowledged_by', type: 'INTEGER', def: "NULL" },
    { name: 'acknowledged_at', type: isSQLite ? 'TEXT' : 'TIMESTAMP', def: "NULL" },
    { name: 'assigned_to', type: 'INTEGER', def: "NULL" },
    { name: 'assigned_to_name', type: 'TEXT', def: "NULL" },
    { name: 'resolved_by', type: 'INTEGER', def: "NULL" },
    { name: 'resolution_notes', type: 'TEXT', def: "NULL" }
  ];

  for (const col of alertsColumns) {
    try {
      await dbClient.query(`ALTER TABLE alerts ADD COLUMN ${col.name} ${col.type}`);
      console.log(`Added column ${col.name} to alerts.`);
    } catch (err) {
      if (!err.message.includes('duplicate column') && !err.message.includes('already exists') && !err.message.includes('duplicate column name')) {
        console.error(`Warning: Failed to add column ${col.name} to alerts:`, err.message);
      }
    }
  }

  // Columns to add to notifications
  const notificationsColumns = [
    { name: 'read_status', type: 'INTEGER', def: "0" },
    { name: 'error_message', type: 'TEXT', def: "NULL" }
  ];

  for (const col of notificationsColumns) {
    try {
      await dbClient.query(`ALTER TABLE notifications ADD COLUMN ${col.name} ${col.type}`);
      if (col.def !== "NULL") {
        await dbClient.query(`UPDATE notifications SET ${col.name} = ${col.def} WHERE ${col.name} IS NULL`);
      }
      console.log(`Added column ${col.name} to notifications.`);
    } catch (err) {
      if (!err.message.includes('duplicate column') && !err.message.includes('already exists') && !err.message.includes('duplicate column name')) {
        console.error(`Warning: Failed to add column ${col.name} to notifications:`, err.message);
      }
    }
  }

  // Columns to add to notification_history
  const historyColumns = [
    { name: 'resolved_at', type: 'TEXT', def: "NULL" },
    { name: 'resolved_by_name', type: 'TEXT', def: "NULL" }
  ];

  for (const col of historyColumns) {
    try {
      await dbClient.query(`ALTER TABLE notification_history ADD COLUMN ${col.name} ${col.type}`);
      console.log(`Added column ${col.name} to notification_history.`);
    } catch (err) {
      if (!err.message.includes('duplicate column') && !err.message.includes('already exists') && !err.message.includes('duplicate column name')) {
        console.error(`Warning: Failed to add column ${col.name} to notification_history:`, err.message);
      }
    }
  }

  // Add rich demo details to seeded rows if they exist
  try {
    await dbClient.query("UPDATE devices SET serial_number = 'SN-ESP32-901', owner_name = 'Sansah Facilities', category = 'Climate', lifecycle_status = 'Active', installation_date = '2025-01-10', warranty_expiry = '2027-01-10', signal_strength = -65, uptime_percent = 99.8, health_score = 100.0, last_communication = CURRENT_TIMESTAMP WHERE id = 'ESP32_01' AND (serial_number IS NULL OR serial_number = '')");
    await dbClient.query("UPDATE devices SET serial_number = 'SN-NODE-112', owner_name = 'Boiler Ops Team', category = 'Industrial', lifecycle_status = 'Active', installation_date = '2025-02-15', warranty_expiry = '2028-02-15', signal_strength = -78, uptime_percent = 99.2, health_score = 100.0, last_communication = CURRENT_TIMESTAMP WHERE id = 'NODEMCU_02' AND (serial_number IS NULL OR serial_number = '')");
    await dbClient.query("UPDATE devices SET serial_number = 'SN-TRACK-556', owner_name = 'Fleet Manager', category = 'Logistics', lifecycle_status = 'Active', installation_date = '2025-03-22', warranty_expiry = '2026-03-22', signal_strength = -55, uptime_percent = 98.7, health_score = 100.0, last_communication = CURRENT_TIMESTAMP WHERE id = 'TRK_03' AND (serial_number IS NULL OR serial_number = '')");
    await dbClient.query("UPDATE devices SET serial_number = 'SN-TRACK-789', owner_name = 'Field Safety Team', category = 'Logistics', lifecycle_status = 'Active', installation_date = '2025-04-05', warranty_expiry = '2026-04-05', signal_strength = -82, uptime_percent = 97.4, health_score = 100.0, last_communication = CURRENT_TIMESTAMP WHERE id = 'TRK_04' AND (serial_number IS NULL OR serial_number = '')");
    await dbClient.query("UPDATE devices SET serial_number = 'SN-ARD-334', owner_name = 'Facility Engineering', category = 'Utility', lifecycle_status = 'Maintenance', installation_date = '2024-11-12', warranty_expiry = '2025-11-12', signal_strength = -70, uptime_percent = 99.9, health_score = 100.0, last_communication = CURRENT_TIMESTAMP WHERE id = 'ARD_05' AND (serial_number IS NULL OR serial_number = '')");
  } catch (err) {
    console.error('Failed to populate demo asset details:', err.message);
  }

  // Seed default settings individually if missing
  try {
    const defaultSettings = [
      { key: 'global_temp_threshold', value: '28.0' },
      { key: 'global_humidity_threshold', value: '65.0' },
      { key: 'whatsapp_sandbox_phone', value: '+14155238886' },
      { key: 'email_alert_template', value: 'Warning limit exceeded on sensor: {sensor_name}. Current value: {value}' },
      { key: 'dashboard_pref_refresh_seconds', value: '3' },
      { key: 'smtp_host', value: '' },
      { key: 'smtp_port', value: '587' },
      { key: 'smtp_user', value: '' },
      { key: 'smtp_pass', value: '' },
      { key: 'smtp_secure', value: 'false' },
      { key: 'smtp_from', value: 'support@sansah.com' },
      { key: 'twilio_account_sid', value: '' },
      { key: 'twilio_auth_token', value: '' },
      { key: 'twilio_whatsapp_from', value: 'whatsapp:+14155238886' },
      { key: 'google_maps_api_key', value: '' }
    ];

    for (const s of defaultSettings) {
      const exists = await dbClient.query('SELECT key FROM system_settings WHERE key = $1', [s.key]);
      if (exists.rows.length === 0) {
        await dbClient.query('INSERT INTO system_settings (key, value) VALUES ($1, $2)', [s.key, s.value]);
      }
    }
  } catch (err) {
    console.error('Failed to seed default settings:', err.message);
  }

  console.log('Database migrations completed.');
}


function writeDefaultSchema(targetPath) {
  const schemaText = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  phone VARCHAR(50) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) DEFAULT 'user',
  preferences TEXT DEFAULT '{"dashboard": true, "email": true, "whatsapp": false, "sms": false}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS devices (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  hardware_type VARCHAR(50) NOT NULL,
  location VARCHAR(100) NOT NULL,
  communication_protocol VARCHAR(20) DEFAULT 'HTTP',
  max_sensor_value DOUBLE PRECISION DEFAULT 100.0,
  connected BOOLEAN DEFAULT TRUE,
  battery INTEGER DEFAULT 100,
  gps_enabled BOOLEAN DEFAULT FALSE,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sensors (
  id VARCHAR(100) PRIMARY KEY,
  device_id VARCHAR(50) NOT NULL,
  type VARCHAR(50) NOT NULL,
  name VARCHAR(100) NOT NULL,
  unit VARCHAR(20) NOT NULL,
  max_value DOUBLE PRECISION DEFAULT 100.0,
  current_value DOUBLE PRECISION DEFAULT 0.0,
  status VARCHAR(20) DEFAULT 'online',
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sensor_readings (
  id SERIAL PRIMARY KEY,
  sensor_id VARCHAR(100) NOT NULL,
  value DOUBLE PRECISION NOT NULL,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS alerts (
  id VARCHAR(100) PRIMARY KEY,
  device_id VARCHAR(50) NOT NULL,
  sensor_id VARCHAR(100),
  geofence_id VARCHAR(100),
  message TEXT NOT NULL,
  level VARCHAR(20) DEFAULT 'warning',
  status VARCHAR(20) DEFAULT 'active',
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(100) PRIMARY KEY,
  user_id INTEGER,
  alert_id VARCHAR(100) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'sent',
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS geofences (
  id VARCHAR(100) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  radius DOUBLE PRECISION NOT NULL,
  color VARCHAR(20) DEFAULT '#00b0ff',
  alerts_enabled BOOLEAN DEFAULT TRUE,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gps_tracking (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(50) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  speed DOUBLE PRECISION DEFAULT 0.0,
  distance DOUBLE PRECISION DEFAULT 0.0,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  action VARCHAR(100) NOT NULL,
  details TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER,
  file_path VARCHAR(255) NOT NULL,
  file_type VARCHAR(20) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
`;
  fs.writeFileSync(targetPath, schemaText, 'utf8');
}

async function seedInitialData() {
  // Check if users table is empty
  const usersCheck = await dbClient.query('SELECT COUNT(*) as count FROM users');
  const count = parseInt(usersCheck.rows[0].count);
  
  if (count === 0) {
    console.log('Seeding initial database data...');
    // Insert admin user (pwd: admin123)
    const adminHash = bcrypt.hashSync('admin123', 10);
    // Insert test user (pwd: user123)
    const userHash = bcrypt.hashSync('user123', 10);

    await dbClient.query(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
      ['Sansah Admin', 'angeljaison625@gmail.com', '+15550199', adminHash, 'admin']
    );
    await dbClient.query(
      'INSERT INTO users (name, email, phone, password_hash, role) VALUES ($1, $2, $3, $4, $5)',
      ['John Doe', 'user@sansah.com', '+15550299', userHash, 'user']
    );
    
    // Seed initial devices
    const devices = [
      ['ESP32_01', 'Server Room A Climate Controller', 'ESP32', 'Main HQ Server Room A', 'HTTP', 28.0, 1, 98, 0, 1],
      ['NODEMCU_02', 'Industrial Boiler Watchdog', 'NodeMCU', 'Boiler Subroom C', 'MQTT', 95.0, 1, 85, 0, 1],
      ['TRK_03', 'Delivery Fleet - Van A', 'Smart IoT Tracker', 'Los Angeles Highway Route', 'HTTP', 8.0, 1, 74, 1, 1],
      ['TRK_04', 'Field Operations - Engineer Mark', 'Smart IoT Tracker', 'Santa Monica Operations Site', 'HTTP', 40.0, 1, 12, 1, 1],
      ['ARD_05', 'Basement Drainage Sump Pump', 'Arduino', 'Basement Utility Room B', 'HTTP', 800.0, 1, 100, 0, 1]
    ];
    
    for (const d of devices) {
      await dbClient.query(
        'INSERT INTO devices (id, name, hardware_type, location, communication_protocol, max_sensor_value, connected, battery, gps_enabled, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)',
        d
      );
    }

    // Seed initial sensors
    const sensors = [
      ['ESP32_01_temp', 'ESP32_01', 'Temperature', 'DHT11 Temperature Sensor', '°C', 28.0, 22.4, 'online'],
      ['ESP32_01_hum', 'ESP32_01', 'Humidity', 'DHT11 Humidity Sensor', '%', 65.0, 45.2, 'online'],
      ['NOD_02_temp', 'NODEMCU_02', 'Temperature', 'High-Temp Sensor', '°C', 95.0, 78.5, 'online'],
      ['NOD_02_water', 'NODEMCU_02', 'Water Level', 'Coolant Level Indicator', 'mm', 150.0, 450.0, 'online'],
      ['TRK_03_temp', 'TRK_03', 'Temperature', 'Cargo Temperature Sensor', '°C', 8.0, 5.4, 'online'],
      ['TRK_03_motion', 'TRK_03', 'Motion', 'Cargo Vibration Tracker', 'status', 1.0, 0.0, 'online'],
      ['TRK_04_temp', 'TRK_04', 'Temperature', 'Wearable Temp Probe', '°C', 40.0, 36.8, 'online'],
      ['TRK_04_motion', 'TRK_04', 'Motion', 'Man-Down PIR Motion Sensor', 'status', 0.0, 1.0, 'online'],
      ['ARD_05_water', 'ARD_05', 'Water Level', 'Sump Level Sensor', 'mm', 800.0, 120.0, 'online']
    ];
    
    for (const s of sensors) {
      await dbClient.query(
        'INSERT INTO sensors (id, device_id, type, name, unit, max_value, current_value, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        s
      );
    }

    // Seed initial geofences
    const geofences = [
      ['fence_downtown', 'HQ Downtown Core Geofence', 34.0522, -118.2437, 1200.0, '#00b0ff', 1, 1],
      ['fence_santa_monica', 'Santa Monica Restricted Safe Zone', 34.0150, -118.4850, 1000.0, '#00e676', 1, 1]
    ];
    for (const g of geofences) {
      await dbClient.query(
        'INSERT INTO geofences (id, name, lat, lng, radius, color, alerts_enabled, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
        g
      );
    }
    
    console.log('Seeding complete.');
  }
}

module.exports = {
  initDatabase,
  query: (text, params) => {
    if (!dbClient) {
      throw new Error('Database is not initialized. Call initDatabase() first.');
    }
    return dbClient.query(text, params);
  },
  getIsSQLite: () => isSQLite
};
