
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
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Enterprise Assets & Health Metrics
  serial_number TEXT,
  owner_name TEXT,
  installation_date TEXT,
  warranty_expiry TEXT,
  category TEXT,
  lifecycle_status TEXT,
  health_score DOUBLE PRECISION DEFAULT 100.0,
  uptime_percent DOUBLE PRECISION DEFAULT 100.0,
  signal_strength INTEGER DEFAULT -70,
  last_communication TIMESTAMP,
  simulated_fault INTEGER DEFAULT 0
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
  resolved_at TIMESTAMP,
  
  -- Smart Alert timelines & assignments
  acknowledged_by INTEGER,
  acknowledged_at TIMESTAMP,
  assigned_to INTEGER,
  assigned_to_name TEXT,
  resolved_by INTEGER,
  resolution_notes TEXT
);

CREATE TABLE IF NOT EXISTS notifications (
  id VARCHAR(100) PRIMARY KEY,
  user_id INTEGER,
  alert_id VARCHAR(100) NOT NULL,
  channel VARCHAR(20) NOT NULL,
  status VARCHAR(20) DEFAULT 'sent',
  sent_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  -- Notification inbox read/unread status
  read_status INTEGER DEFAULT 0,
  error_message TEXT
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

-- Comments & Notes on Incidents
CREATE TABLE IF NOT EXISTS alert_notes (
  id SERIAL PRIMARY KEY,
  alert_id VARCHAR(100) NOT NULL,
  user_id INTEGER NOT NULL,
  user_name VARCHAR(100) NOT NULL,
  note TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Device Maintenance Log
CREATE TABLE IF NOT EXISTS device_maintenance (
  id SERIAL PRIMARY KEY,
  device_id VARCHAR(50) NOT NULL,
  performed_by VARCHAR(100),
  description TEXT,
  cost DOUBLE PRECISION,
  maintenance_date TEXT
);

-- Global System settings
CREATE TABLE IF NOT EXISTS system_settings (
  key VARCHAR(100) PRIMARY KEY,
  value TEXT
);
