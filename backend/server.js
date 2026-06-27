const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const nodemailer = require('nodemailer');
const jwt = require('jsonwebtoken');
const db = require('./config/db');
const emailService = require('./services/emailService');
const apiRoutes = require('./routes/api');
const firebaseService = require('./services/firebaseService');
require('dotenv').config();

const https = require('https');
const querystring = require('querystring');

// Helper: Retrieve all system settings in a map
async function getSystemSettingsMap() {
  try {
    const res = await db.query('SELECT * FROM system_settings');
    const map = {};
    res.rows.forEach(r => { map[r.key] = r.value; });
    return map;
  } catch (err) {
    console.error('Failed to load system settings from DB:', err.message);
    return {};
  }
}

// Helper: Build a Nodemailer Transporter based on settings or env
async function createMailTransporter(settings) {
  const host = settings.smtp_host || process.env.SMTP_HOST;
  const user = settings.smtp_user || process.env.SMTP_USER;
  const pass = settings.smtp_pass || process.env.SMTP_PASS;
  const port = parseInt(settings.smtp_port || process.env.SMTP_PORT || '587');
  const secure = (settings.smtp_secure || process.env.SMTP_SECURE || 'false') === 'true';

  if (host && user) {
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    });
  } else {
    if (!global.etherealTransporter) {
      try {
        console.log('Generating dynamic Ethereal test account for SMTP fallback...');
        const testAccount = await nodemailer.createTestAccount();
        global.etherealTransporter = nodemailer.createTransport({
          host: 'smtp.ethereal.email',
          port: 587,
          secure: false,
          auth: {
            user: testAccount.user,
            pass: testAccount.pass
          }
        });
        console.log('Ethereal SMTP fallback transporter initialized successfully.');
      } catch (err) {
        console.error('Failed to create Ethereal SMTP fallback transporter:', err.message);
        if (!global.simulatedTransporter) {
          global.simulatedTransporter = nodemailer.createTransport({
            jsonTransport: true
          });
          console.log('Using simulated offline JSON SMTP transporter fallback.');
        }
        return global.simulatedTransporter;
      }
    }
    return global.etherealTransporter;
  }
}

// Helper: Send WhatsApp via Twilio API if credentials exist, else fallback to mock outbox
async function sendWhatsAppMessage(phone, message, settings) {
  const sid = settings.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID;
  const token = settings.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN;
  const from = settings.twilio_whatsapp_from || process.env.TWILIO_WHATSAPP_FROM || 'whatsapp:+14155238886';

  const cleanPhone = phone ? phone.replace(/[^\d+]/g, '') : '';
  const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : '+' + cleanPhone;

  const e164Regex = /^\+[1-9]\d{6,14}$/;
  if (!phone || phone.trim() === '' || phone === 'N/A') {
    throw new Error('Recipient phone number is not configured (currently N/A)');
  }
  if (!e164Regex.test(formattedPhone)) {
    throw new Error('Invalid phone format: Must be in international E.164 format starting with + (e.g. +14155552671)');
  }

  if (sid && token) {
    return new Promise((resolve, reject) => {
      const payload = querystring.stringify({
        From: from.startsWith('whatsapp:') ? from : `whatsapp:${from}`,
        To: `whatsapp:${formattedPhone}`,
        Body: message
      });

      const options = {
        hostname: 'api.twilio.com',
        port: 443,
        path: `/2010-04-01/Accounts/${sid}/Messages.json`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64')
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[TWILIO] WhatsApp alert successfully dispatched to ${formattedPhone}`);
            resolve(JSON.parse(body));
          } else {
            reject(new Error(`Twilio API response code ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('error', (err) => { reject(err); });
      req.write(payload);
      req.end();
    });
  } else {
    saveToWhatsAppOutbox(formattedPhone, message);
  }
}

// Helper: Send SMS via Twilio API if credentials exist, else fallback to mock outbox
async function sendSMSMessage(phone, message, settings) {
  const sid = settings.twilio_account_sid || process.env.TWILIO_ACCOUNT_SID;
  const token = settings.twilio_auth_token || process.env.TWILIO_AUTH_TOKEN;
  const from = settings.twilio_sms_from || process.env.TWILIO_SMS_FROM || '+14155238886';

  const cleanPhone = phone ? phone.replace(/[^\d+]/g, '') : '';
  const formattedPhone = cleanPhone.startsWith('+') ? cleanPhone : '+' + cleanPhone;

  const e164Regex = /^\+[1-9]\d{6,14}$/;
  if (!phone || phone.trim() === '' || phone === 'N/A') {
    throw new Error('Recipient phone number is not configured (currently N/A)');
  }
  if (!e164Regex.test(formattedPhone)) {
    throw new Error('Invalid phone format: Must be in international E.164 format starting with + (e.g. +14155552671)');
  }

  if (sid && token) {
    return new Promise((resolve, reject) => {
      const payload = querystring.stringify({
        From: from,
        To: formattedPhone,
        Body: message
      });

      const options = {
        hostname: 'api.twilio.com',
        port: 443,
        path: `/2010-04-01/Accounts/${sid}/Messages.json`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': 'Basic ' + Buffer.from(`${sid}:${token}`).toString('base64')
        }
      };

      const req = https.request(options, (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            console.log(`[TWILIO] SMS alert successfully dispatched to ${formattedPhone}`);
            resolve(JSON.parse(body));
          } else {
            reject(new Error(`Twilio API response code ${res.statusCode}: ${body}`));
          }
        });
      });

      req.on('error', (err) => { reject(err); });
      req.write(payload);
      req.end();
    });
  } else {
    saveToSMSOutbox(formattedPhone, message);
  }
}

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'sansah_super_secret_jwt_key_2026';

// Enable CORS for frontend requests
const allowedOrigins = [
  'https://sansah.vercel.app',
  'https://sansah-ijyuxkghm-annu-snigdha-s-projects.vercel.app',
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(null, true); // Allow all for now, can restrict later
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

app.use(express.json());

// Health check endpoint (used by UptimeRobot to keep backend alive)
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), server: 'Sansah IoT Backend' });
});

// API mounting
app.use('/api', apiRoutes);

// Create HTTP Server
const server = http.createServer(app);

// Initialize WebSocket Server
const wss = new WebSocket.Server({ server });

// WebSocket client registry
const clients = new Set();

wss.on('connection', (ws) => {
  clients.add(ws);
  ws.user = null; // Unauthenticated initially
  console.log(`New WebSocket connection. Total clients: ${clients.size}`);

  ws.on('message', (messageText) => {
    try {
      const msg = JSON.parse(messageText);
      if (msg.type === 'AUTH') {
        jwt.verify(msg.token, JWT_SECRET, (err, decoded) => {
          if (err) {
            console.log('WS Auth Failed: Invalid or expired token');
            ws.close();
            return;
          }
          ws.user = decoded;
          console.log(`WS Auth Success: User ${decoded.email} (${decoded.role})`);
          // Send initial telemetry update now that user is verified
          sendTelemetryUpdate(ws);
        });
      }
    } catch (err) {
      console.error('WS message error:', err.message);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    console.log(`Client disconnected. Total clients: ${clients.size}`);
  });
});

// Broadcast helper for all connected users
function broadcast(data) {
  const payload = JSON.stringify(data);
  clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

// ----------------------------------------------------
// NOTIFICATION DISPATCH CHANNELS
// ----------------------------------------------------

// Helper: Save mock email to backend/mailbox directory
function saveToMailbox(to, subject, text) {
  try {
    const fs = require('fs');
    const path = require('path');
    const mailboxDir = path.resolve(__dirname, 'mailbox');
    if (!fs.existsSync(mailboxDir)) {
      fs.mkdirSync(mailboxDir, { recursive: true });
    }
    const filename = `mail_${Date.now()}_${Math.floor(Math.random()*1000)}.eml`;
    const filepath = path.join(mailboxDir, filename);
    const emlContent = `To: ${to}
Subject: ${subject}
Date: ${new Date().toUTCString()}
MIME-Version: 1.0
Content-Type: text/plain; charset=utf-8
Custom-Notification-Source: Node-Backend-Server

${text}`;
    
    fs.writeFileSync(filepath, emlContent, 'utf8');
    console.log(`[MAILBOX] Eml saved to: ${filepath}`);
  } catch (err) {
    console.error('[MAILBOX] Error saving eml:', err.message);
  }
}

// Helper: Save WhatsApp outbox mock text
function saveToWhatsAppOutbox(phone, text) {
  try {
    const fs = require('fs');
    const path = require('path');
    const outboxDir = path.resolve(__dirname, 'whatsapp_outbox');
    if (!fs.existsSync(outboxDir)) {
      fs.mkdirSync(outboxDir, { recursive: true });
    }
    const filename = `wa_${Date.now()}_${Math.floor(Math.random()*1000)}.txt`;
    const filepath = path.join(outboxDir, filename);
    const content = `To: ${phone}
Date: ${new Date().toUTCString()}
Message:
${text}`;
    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`[WHATSAPP OUTBOX] Message saved to: ${filepath}`);
  } catch (err) {
    console.error('[WHATSAPP OUTBOX] Error saving text:', err.message);
  }
}

// Helper: Save SMS outbox mock text
function saveToSMSOutbox(phone, text) {
  try {
    const fs = require('fs');
    const path = require('path');
    const outboxDir = path.resolve(__dirname, 'sms_outbox');
    if (!fs.existsSync(outboxDir)) {
      fs.mkdirSync(outboxDir, { recursive: true });
    }
    const filename = `sms_${Date.now()}_${Math.floor(Math.random()*1000)}.txt`;
    const filepath = path.join(outboxDir, filename);
    const content = `To: ${phone}
Date: ${new Date().toUTCString()}
Message:
${text}`;
    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`[SMS OUTBOX] Message saved to: ${filepath}`);
  } catch (err) {
    console.error('[SMS OUTBOX] Error saving text:', err.message);
  }
}

// Simulated WhatsApp API
async function dispatchWhatsApp(phone, message, alertId, userId) {
  console.log(`\n============== [WHATSAPP DISPATCH] ==============`);
  console.log(`Recipient Phone: ${phone}`);
  console.log(`Message Content: ${message}`);
  console.log(`=================================================\n`);
  
  let status = 'sent';
  let errorMessage = null;

  try {
    const settings = await getSystemSettingsMap();
    await sendWhatsAppMessage(phone, message, settings);
  } catch (err) {
    console.error('Failed to send WhatsApp alert:', err.message);
    status = 'failed';
    errorMessage = err.message;
  }

  const notifId = `notif_wa_${Date.now()}_${Math.floor(Math.random()*100)}`;
  try {
    // Record in DB
    await db.query(
      'INSERT INTO notifications (id, user_id, alert_id, channel, status, error_message) VALUES ($1, $2, $3, $4, $5, $6)',
      [notifId, userId, alertId, 'whatsapp', status, errorMessage]
    );
    await firebaseService.syncFirestoreNotification(notifId, {
      id: notifId,
      user_id: userId,
      alert_id: alertId,
      channel: 'whatsapp',
      status: status,
      error_message: errorMessage,
      sent_at: new Date().toISOString()
    });
  // Removed legacy Nodemailer and dispatchEmail in favor of emailService.js
  } catch (err) {
    console.error('Failed to save WhatsApp notification log:', err.message);
  }
}

// Simulated SMS API
async function dispatchSMS(phone, message, alertId, userId) {
  console.log(`\n============== [SMS DISPATCH] ==============`);
  console.log(`Recipient Phone: ${phone}`);
  console.log(`Message Content: ${message}`);
  console.log(`============================================\n`);
  
  let status = 'sent';
  let errorMessage = null;

  try {
    const settings = await getSystemSettingsMap();
    await sendSMSMessage(phone, message, settings);
  } catch (err) {
    console.error('Failed to send SMS alert:', err.message);
    status = 'failed';
    errorMessage = err.message;
  }

  const notifId = `notif_sms_${Date.now()}_${Math.floor(Math.random()*100)}`;
  try {
    // Record in DB
    await db.query(
      'INSERT INTO notifications (id, user_id, alert_id, channel, status, error_message) VALUES ($1, $2, $3, $4, $5, $6)',
      [notifId, userId, alertId, 'sms', status, errorMessage]
    );
    await firebaseService.syncFirestoreNotification(notifId, {
      id: notifId,
      user_id: userId,
      alert_id: alertId,
      channel: 'sms',
      status: status,
      error_message: errorMessage,
      sent_at: new Date().toISOString()
    });
  } catch (err) {
    console.error('Failed to save SMS notification log:', err.message);
  }
}

// Centralized alert notification dispatcher
async function dispatchAlertNotifications(ownerId, message, alertId, subject = 'Sansah Alert') {
  try {
    const ownerResult = await db.query('SELECT * FROM users WHERE id = $1', [ownerId]);
    const owner = ownerResult.rows[0];
    if (!owner) return;

    let preferences = { dashboard: true, email: true, whatsapp: false, sms: false };
    try {
      if (owner.preferences) {
        const parsed = typeof owner.preferences === 'string' ? JSON.parse(owner.preferences) : owner.preferences;
        preferences = { ...preferences, ...parsed };
      }
    } catch(e) {}

    let emailText = message;
    let whatsappText = message;

    const alertDetails = await db.query(
      `SELECT a.message, a.level, a.timestamp, d.name AS device_name, s.name AS sensor_name, s.current_value, s.max_value, s.unit, a.sensor_id
       FROM alerts a
       LEFT JOIN devices d ON a.device_id = d.id
       LEFT JOIN sensors s ON a.sensor_id = s.id
       WHERE a.id = $1`,
      [alertId]
    );

    if (alertDetails.rows.length > 0 && alertDetails.rows[0].sensor_id) {
      const row = alertDetails.rows[0];
      const devName = row.device_name || 'N/A';
      const sensName = row.sensor_name || 'N/A';
      const currVal = row.current_value !== null ? `${row.current_value}${row.unit || ''}` : 'N/A';
      const maxVal = row.max_value !== null ? `${row.max_value}${row.unit || ''}` : 'N/A';
      const severity = row.level || 'warning';
      const timestamp = new Date(row.timestamp || Date.now()).toLocaleString();

      emailText = `Hello,

The Sansah Innovations IoT Alert System has detected an exceeded sensor threshold.

Alert Notification Details:
------------------------------------------
Device Name:    ${devName}
Sensor Name:    ${sensName}
Current Value:  ${currVal}
Maximum Value:  ${maxVal}
Alert Severity: ${severity.toUpperCase()}
Timestamp:      ${timestamp}
------------------------------------------

Please log in to your Sansah dashboard at ${process.env.FRONTEND_URL || 'https://sansah.vercel.app'} to resolve this incident.

Best regards,
The Sansah Innovations Team`;

      whatsappText = `🚨 Sansah IoT Alert Notification 🚨
------------------------------------------
Device Name:    ${devName}
Sensor Name:    ${sensName}
Current Value:  ${currVal}
Maximum Value:  ${maxVal}
Timestamp:      ${timestamp}
------------------------------------------`;
    }

    // Dashboard notification channel
    if (preferences.dashboard) {
      const notifId = `notif_db_${Date.now()}_${Math.floor(Math.random()*100)}`;
      await db.query(
        'INSERT INTO notifications (id, user_id, alert_id, channel, status) VALUES ($1, $2, $3, $4, $5)',
        [notifId, owner.id, alertId, 'dashboard', 'delivered']
      );
      await firebaseService.syncFirestoreNotification(notifId, {
        id: notifId,
        user_id: owner.id,
        alert_id: alertId,
        channel: 'dashboard',
        status: 'delivered',
        sent_at: new Date().toISOString()
      });
    }

    // FCM / Push notification channel
    if (owner.fcm_token) {
      const notifId = `notif_fcm_${Date.now()}_${Math.floor(Math.random()*100)}`;
      await db.query(
        'INSERT INTO notifications (id, user_id, alert_id, channel, status) VALUES ($1, $2, $3, $4, $5)',
        [notifId, owner.id, alertId, 'push', 'delivered']
      );
      await firebaseService.syncFirestoreNotification(notifId, {
        id: notifId,
        user_id: owner.id,
        alert_id: alertId,
        channel: 'push',
        status: 'delivered',
        sent_at: new Date().toISOString()
      });
      await firebaseService.sendFcmNotification(owner.fcm_token, subject, message, {
        alertId: alertId
      });
    }

    // Email notification channel
    if (preferences.email && owner.email) {
      if (message.includes('gone OFFLINE')) {
        await emailService.sendEmail({
          to: owner.email,
          subject: subject,
          text: emailText,
          html: emailText.replace(/\n/g, '<br/>'),
          userId: owner.id,
          alertId: alertId
        });
      } else if (alertDetails.rows.length > 0 && alertDetails.rows[0].sensor_id) {
        const row = alertDetails.rows[0];
        const alertData = {
          deviceName: row.device_name || 'N/A',
          sensorName: row.sensor_name || 'N/A',
          currentValue: row.current_value,
          maxValue: row.max_value,
          unit: row.unit || '',
          timestamp: new Date(row.timestamp || Date.now()).toLocaleString(),
          level: row.level || 'warning',
          message: row.message
        };
        await emailService.sendAlertEmail(owner.email, alertData, owner.id, alertId);
      } else {
        await emailService.sendEmail({
          to: owner.email,
          subject: subject,
          text: emailText,
          html: emailText.replace(/\n/g, '<br/>'),
          userId: owner.id,
          alertId: alertId
        });
      }
    }

    // WhatsApp notification channel
    if (preferences.whatsapp && owner.phone) {
      await dispatchWhatsApp(owner.phone, whatsappText, alertId, owner.id);
    }

    // SMS notification channel
    if (preferences.sms && owner.phone) {
      await dispatchSMS(owner.phone, message, alertId, owner.id);
    }
  } catch (err) {
    console.error('Failed dispatching alert notifications:', err.message);
  }
}

// ----------------------------------------------------
// TELEMETRY SIMULATOR & ALERT CHECKER
// ----------------------------------------------------

// LA highway coordinates route logs
const GPS_ROUTES = {
  route_delivery_truck: [
    [34.0522, -118.2437], // Downtown LA
    [34.0560, -118.2500],
    [34.0610, -118.2580],
    [34.0680, -118.2700],
    [34.0720, -118.2800], // Near Echo Park
    [34.0780, -118.2900],
    [34.0850, -118.3000],
    [34.0900, -118.3200], // Hollywood
    [34.0950, -118.3400],
    [34.0980, -118.3600],
    [34.0950, -118.3800],
    [34.0850, -118.4000], // Beverly Hills
    [34.0700, -118.4100],
    [34.0550, -118.4200],
    [34.0400, -118.4300], // Westwood
    [34.0250, -118.4500],
    [34.0150, -118.4700],
    [34.0080, -118.4900], // Santa Monica
    [34.0522, -118.2437]  // Loop
  ],
  route_field_engineer: [
    [34.0194, -118.4912], // Santa Monica Pier
    [34.0150, -118.4850],
    [34.0050, -118.4750],
    [33.9900, -118.4600], // Venice Beach
    [33.9850, -118.4500],
    [33.980, -118.4400],  // Marina Del Rey
    [34.0194, -118.4912]
  ]
};

let routeIndices = {
  TRK_03: 0,
  TRK_04: 0
};

// Calculate Haversine distance in meters
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = lat1 * Math.PI/180;
  const phi2 = lat2 * Math.PI/180;
  const deltaPhi = (lat2-lat1) * Math.PI/180;
  const deltaLambda = (lon2-lon1) * Math.PI/180;

  const a = Math.sin(deltaPhi/2) * Math.sin(deltaPhi/2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda/2) * Math.sin(deltaLambda/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// Background simulation runner
async function runSimulatorTick() {
  try {
    // Fetch all devices
    const devicesResult = await db.query('SELECT * FROM devices');
    
    for (const dev of devicesResult.rows) {
      const wasConnected = !!dev.connected;
      let connected = dev.simulated_fault === 1 ? false : true;
      
      // Automatic Offline Device Detection & State Transitions
      if (wasConnected && !connected) {
        await db.query('UPDATE devices SET connected = 0 WHERE id = $1', [dev.id]);
        await db.query("UPDATE sensors SET status = 'offline' WHERE device_id = $1", [dev.id]);
        
        const alertId = `alert_offline_${dev.id}_${Date.now()}`;
        const message = `CRITICAL: Device ${dev.name} (${dev.id}) has gone OFFLINE. Connection heartbeat lost.`;
        
        // Prevent duplicate offline alerts
        const activeCheck = await db.query("SELECT id FROM alerts WHERE device_id = $1 AND message LIKE '%gone OFFLINE%' AND status = 'active'", [dev.id]);
        const isRegistered = dev.created_by !== null && dev.created_by !== undefined;
        if (activeCheck.rows.length === 0 && isRegistered) {
          await db.query(
            'INSERT INTO alerts (id, device_id, message, level, status) VALUES ($1, $2, $3, $4, $5)',
            [alertId, dev.id, message, 'critical', 'active']
          );
          await firebaseService.syncFirestoreAlert(alertId, {
            id: alertId,
            device_id: dev.id,
            message,
            level: 'critical',
            status: 'active',
            timestamp: new Date().toISOString()
          });
          
          // Dispatch notifications (non-blocking)
          dispatchAlertNotifications(dev.created_by, message, alertId, 'Sansah Alert: Device Offline');
        }
        
        await db.query(
          "INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)",
          [1, 'Device Offline', `Device ${dev.id} connection heartbeat lost.`]
        );
      } else if (!wasConnected && connected) {
        await db.query('UPDATE devices SET connected = 1 WHERE id = $1', [dev.id]);
        await db.query("UPDATE sensors SET status = 'online' WHERE device_id = $1", [dev.id]);
        
        // Resolve active offline alert
        const activeAlert = await db.query(
          "SELECT id FROM alerts WHERE device_id = $1 AND message LIKE '%gone OFFLINE%' AND status = 'active'",
          [dev.id]
        );
        if (activeAlert.rows.length > 0) {
          const resolvedAlertId = activeAlert.rows[0].id;
          await db.query(
            "UPDATE alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = $1",
            [resolvedAlertId]
          );
          await firebaseService.syncFirestoreAlert(resolvedAlertId, {
            status: 'resolved',
            resolved_at: new Date().toISOString()
          });
        }
        
        await db.query(
          "INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)",
          [1, 'Device Online', `Device ${dev.id} connection heartbeat recovered.`]
        );
      }
      
      // Skip telemetry updates for offline devices
      if (!connected) {
        let uptime = parseFloat(dev.uptime_percent || 100.0);
        uptime = Math.max(0.0, uptime - 0.1);
        await db.query('UPDATE devices SET health_score = 0.0, uptime_percent = $1 WHERE id = $2', [
          parseFloat(uptime.toFixed(2)),
          dev.id
        ]);
        
        try {
          const sensorsResult = await db.query('SELECT * FROM sensors WHERE device_id = $1', [dev.id]);
          const sensorsList = sensorsResult.rows.map(s => ({
            id: s.id,
            name: s.name,
            type: s.type,
            unit: s.unit,
            current_value: s.current_value,
            max_value: s.max_value,
            status: 'offline'
          }));
          await firebaseService.updateFirestoreDeviceStatus(dev.id, {
            connected: false,
            health_score: 0.0,
            uptime_percent: parseFloat(uptime.toFixed(2)),
            last_communication: new Date().toISOString(),
            sensors: sensorsList
          });
        } catch (err) {
          console.error('Offline device telemetry sync to Firestore failed:', err.message);
        }
        continue;
      }

      // Battery level drainage simulation
      let nextBattery = parseInt(dev.battery);
      if (nextBattery > 0 && dev.id !== 'ARD_05') {
        if (Math.random() > 0.85) {
          nextBattery = Math.max(0, nextBattery - 1);
        }
      } else if (nextBattery === 0 && dev.id !== 'ARD_05') {
        if (Math.random() > 0.95) { // Recharge trigger simulation
          nextBattery = 100;
        }
      }

      // Signal strength fluctuations (-50 to -95 dBm)
      let sig = parseInt(dev.signal_strength || -70);
      sig = sig + (Math.floor(Math.random() * 5) - 2);
      if (sig > -50) sig = -50;
      if (sig < -95) sig = -95;

      // Uptime increments
      let uptime = parseFloat(dev.uptime_percent || 99.8);
      uptime = Math.min(100.0, uptime + 0.01);

      // Fetch sensors
      const sensorsResult = await db.query('SELECT * FROM sensors WHERE device_id = $1', [dev.id]);
      
      let critDeductions = 0;
      let warnDeductions = 0;

      for (const sensor of sensorsResult.rows) {
        let value = parseFloat(sensor.current_value);
        let change = 0;

        // Simulate fluctuations
        if (sensor.type === 'Soil Moisture') {
          change = (Math.random() - 0.5) * 2.0;
          value = Math.max(0, Math.min(100, parseFloat((value + change).toFixed(1))));
        } else if (sensor.type === 'Soil Temperature') {
          change = (Math.random() - 0.5) * 0.4;
          value = Math.max(-10, Math.min(60, parseFloat((value + change).toFixed(1))));
        } else if (sensor.type === 'Air Temperature' || sensor.type === 'Temperature') {
          change = (Math.random() - 0.48) * 0.6;
          value = Math.max(-20, Math.min(60, parseFloat((value + change).toFixed(1))));
        } else if (sensor.type === 'Air Humidity' || sensor.type === 'Humidity') {
          change = (Math.random() - 0.5) * 1.5;
          value = Math.max(0, Math.min(100, parseFloat((value + change).toFixed(1))));
        } else if (sensor.type === 'Rainfall Sensor') {
          change = (Math.random() - 0.45) * 0.5; // slight positive drift
          value = Math.max(0, Math.min(300, parseFloat((value + change).toFixed(1))));
        } else if (sensor.type === 'Water Level Sensor' || sensor.type === 'Water Level') {
          if (dev.id === 'ARD_05') {
            if (value >= 780) {
              value -= 300;
            } else {
              value += Math.floor(Math.random() * 40) + 10;
            }
          } else {
            change = (Math.random() - 0.5) * 0.2;
            value = Math.max(0, Math.min(1000, parseFloat((value + change).toFixed(2))));
          }
        } else if (sensor.type === 'Water Flow Sensor') {
          change = (Math.random() - 0.5) * 1.0;
          value = Math.max(0, Math.min(100, parseFloat((value + change).toFixed(1))));
        } else if (sensor.type === 'pH Sensor' || sensor.type.includes('pH')) {
          change = (Math.random() - 0.5) * 0.05;
          value = Math.max(0, Math.min(14, parseFloat((value + change).toFixed(2))));
        } else if (sensor.type === 'CO2 Sensor' || sensor.type.includes('CO2')) {
          change = (Math.random() - 0.48) * 12.0;
          value = Math.max(300, Math.min(2000, parseFloat((value + change).toFixed(1))));
        } else if (sensor.type === 'EC Sensor') {
          change = (Math.random() - 0.5) * 0.1;
          value = Math.max(0, Math.min(10, parseFloat((value + change).toFixed(2))));
        } else if (sensor.type === 'NPK Sensor') {
          change = (Math.random() - 0.5) * 4.0;
          value = Math.max(0, Math.min(1000, parseFloat((value + change).toFixed(0))));
        } else if (sensor.type === 'Leaf Wetness Sensor') {
          change = (Math.random() - 0.5) * 3.0;
          value = Math.max(0, Math.min(100, parseFloat((value + change).toFixed(1))));
        } else if (sensor.type === 'Solar Radiation Sensor') {
          change = (Math.random() - 0.48) * 12.0;
          value = Math.max(0, Math.min(1500, parseFloat((value + change).toFixed(1))));
        } else if (sensor.type === 'Light Intensity Sensor') {
          change = (Math.random() - 0.48) * 500;
          value = Math.max(0, Math.min(120000, parseFloat((value + change).toFixed(0))));
        } else if (sensor.type === 'Wind Speed Sensor') {
          change = (Math.random() - 0.48) * 0.8;
          value = Math.max(0, Math.min(75, parseFloat((value + change).toFixed(1))));
        } else if (sensor.type === 'Wind Direction Sensor') {
          change = (Math.random() - 0.5) * 8.0;
          value = Math.max(0, Math.min(360, parseFloat((value + change).toFixed(0))));
        } else if (sensor.type === 'Pressure Sensor') {
          change = (Math.random() - 0.5) * 0.3;
          value = Math.max(900, Math.min(1100, parseFloat((value + change).toFixed(1))));
        } else if (sensor.type === 'Gas Sensor' || sensor.type === 'Smoke Sensor') {
          change = (Math.random() - 0.5) * 2.0;
          value = Math.max(0, Math.min(5000, parseFloat((value + change).toFixed(1))));
        } else if (sensor.type === 'Vibration Sensor') {
          change = (Math.random() - 0.5) * 1.5;
          value = Math.max(0, Math.min(500, parseFloat((value + change).toFixed(1))));
        } else if (sensor.type === 'Motion Sensor' || sensor.type === 'Motion') {
          if (Math.random() > 0.93) {
            value = value === 0 ? 1 : 0;
          }
        } else if (sensor.type === 'GPS Tracker') {
          // Just small status/speed indicators, coords are separate in gps_tracking
          if (Math.random() > 0.95) {
            value = value === 0 ? 1 : 0;
          }
        } else {
          // Default fallback fluctuation
          change = (Math.random() - 0.5) * 1.0;
          value = parseFloat((value + change).toFixed(1));
        }

        // Update sensor reading
        await db.query(
          'UPDATE sensors SET current_value = $1, last_updated = CURRENT_TIMESTAMP WHERE id = $2',
          [value, sensor.id]
        );

        // Record history
        await db.query(
          'INSERT INTO sensor_readings (sensor_id, value) VALUES ($1, $2)',
          [sensor.id, value]
        );

        // Evaluate thresholds
        const thresholdExceeded = value > parseFloat(sensor.max_value);
        const existingAlertResult = await db.query(
          'SELECT * FROM alerts WHERE sensor_id = $1 AND status = $2',
          [sensor.id, 'active']
        );
        const existingAlert = existingAlertResult.rows;

        const isRegistered = dev.created_by !== null && dev.created_by !== undefined;
        if (thresholdExceeded && isRegistered) {
          if (existingAlert.length === 0) {
            // Priority Escalations: Critical, High, Medium, Low
            let severity = 'low';
            const ratio = value / parseFloat(sensor.max_value);
            if (ratio >= 1.35) severity = 'critical';
            else if (ratio >= 1.20) severity = 'high';
            else if (ratio >= 1.05) severity = 'medium';

            const message = `${dev.name} ${sensor.name} reading: ${value}${sensor.unit} (exceeded threshold ${sensor.max_value}${sensor.unit}).`;
            const newAlertId = `alert_${sensor.id}_${Date.now()}`;
            
            await db.query(
              'INSERT INTO alerts (id, device_id, sensor_id, message, level, status) VALUES ($1, $2, $3, $4, $5, $6)',
              [newAlertId, dev.id, sensor.id, message, severity, 'active']
            );
            await firebaseService.syncFirestoreAlert(newAlertId, {
              id: newAlertId,
              device_id: dev.id,
              sensor_id: sensor.id,
              message,
              level: severity,
              status: 'active',
              timestamp: new Date().toISOString()
            });

            // Notify User (non-blocking)
            dispatchAlertNotifications(dev.created_by, message, newAlertId, `Sansah Alert: ${severity.toUpperCase()} limit exceeded`);
          }
        } else if (!thresholdExceeded && isRegistered) {
          if (existingAlert.length > 0) {
            const activeAlertId = existingAlert[0].id;
            await db.query(
              "UPDATE alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = $1",
              [activeAlertId]
            );
            await firebaseService.syncFirestoreAlert(activeAlertId, {
              status: 'resolved',
              resolved_at: new Date().toISOString()
            });
          }
        }
      }

      // Compute deductions for device health scoring
      const alertsCheck = await db.query("SELECT level FROM alerts WHERE device_id = $1 AND status = 'active'", [dev.id]);
      alertsCheck.rows.forEach(a => {
        if (a.level === 'critical' || a.level === 'high') {
          critDeductions += 30;
        } else {
          warnDeductions += 15;
        }
      });

      let batteryDeduction = nextBattery < 20 ? 20 : 0;
      let signalDeduction = sig < -85 ? 25 : 0;
      let totalDeductions = critDeductions + warnDeductions + batteryDeduction + signalDeduction;
      let health = Math.max(0.0, 100.0 - totalDeductions);

      // Save parameters back to devices table
      await db.query(
        'UPDATE devices SET battery = $1, signal_strength = $2, uptime_percent = $3, health_score = $4, last_communication = CURRENT_TIMESTAMP WHERE id = $5',
        [nextBattery, sig, parseFloat(uptime.toFixed(2)), parseFloat(health.toFixed(1)), dev.id]
      );

      try {
        const sensorsList = sensorsResult.rows.map(s => ({
          id: s.id,
          name: s.name,
          type: s.type,
          unit: s.unit,
          current_value: s.current_value,
          max_value: s.max_value,
          status: s.status
        }));
        await firebaseService.updateFirestoreDeviceStatus(dev.id, {
          connected: true,
          battery: nextBattery,
          signal_strength: sig,
          uptime_percent: parseFloat(uptime.toFixed(2)),
          health_score: parseFloat(health.toFixed(1)),
          last_communication: new Date().toISOString(),
          sensors: sensorsList
        });
      } catch (err) {
        console.error('Online device telemetry sync to Firestore failed:', err.message);
      }

      // GPS simulation
      const gpsEnabled = !!dev.gps_enabled;
      if (gpsEnabled) {
        let routeName = dev.id === 'TRK_03' ? 'route_delivery_truck' : 'route_field_engineer';
        let route = GPS_ROUTES[routeName];
        
        if (route) {
          let idx = routeIndices[dev.id] || 0;
          idx = (idx + 1) % route.length;
          routeIndices[dev.id] = idx;

          const currentCoords = route[idx];
          const lat = currentCoords[0];
          const lng = currentCoords[1];

          const lastGps = await db.query(
            'SELECT lat, lng, distance FROM gps_tracking WHERE device_id = $1 ORDER BY id DESC LIMIT 1',
            [dev.id]
          );

          let distance = 0.0;
          if (lastGps.rows.length > 0) {
            const prev = lastGps.rows[0];
            const incr = getDistance(prev.lat, prev.lng, lat, lng) / 1000;
            distance = parseFloat((parseFloat(prev.distance) + incr).toFixed(2));
          }

          const speed = dev.id === 'TRK_03' ? 45.0 : 4.5;

          await db.query(
            'INSERT INTO gps_tracking (device_id, lat, lng, speed, distance) VALUES ($1, $2, $3, $4, $5)',
            [dev.id, lat, lng, speed, distance]
          );

          // Geofencing checks
          const geofences = await db.query('SELECT * FROM geofences');
          
          for (const fence of geofences.rows) {
            const dist = getDistance(lat, lng, parseFloat(fence.lat), parseFloat(fence.lng));
            const isInside = dist <= parseFloat(fence.radius);

            const prevInsideCheck = await db.query(
              'SELECT message, status FROM alerts WHERE device_id = $1 AND geofence_id = $2 ORDER BY timestamp DESC LIMIT 1',
              [dev.id, fence.id]
            );

            let wasInside = false;
            if (prevInsideCheck.rows.length > 0) {
              const last = prevInsideCheck.rows[0];
              wasInside = last.message.includes('ENTERED');
            }

            const isRegistered = dev.created_by !== null && dev.created_by !== undefined;
            if (isInside && !wasInside && isRegistered) {
              const message = `Device ${dev.name} (${dev.id}) ENTERED geofence boundary: "${fence.name}".`;
              const alertId = `geo_enter_${dev.id}_${fence.id}_${Date.now()}`;
              
              await db.query(
                'INSERT INTO alerts (id, device_id, geofence_id, message, level, status) VALUES ($1, $2, $3, $4, $5, $6)',
                [alertId, dev.id, fence.id, message, 'medium', 'resolved']
              );
              await firebaseService.syncFirestoreAlert(alertId, {
                id: alertId,
                device_id: dev.id,
                geofence_id: fence.id,
                message,
                level: 'medium',
                status: 'resolved',
                timestamp: new Date().toISOString(),
                resolved_at: new Date().toISOString()
              });

              // Dispatch notifications (non-blocking)
              dispatchAlertNotifications(dev.created_by, message, alertId, 'Geofence Entry');
            } else if (!isInside && wasInside && isRegistered) {
              const message = `Device ${dev.name} (${dev.id}) EXITED geofence boundary: "${fence.name}".`;
              const alertId = `geo_exit_${dev.id}_${fence.id}_${Date.now()}`;

              await db.query(
                'INSERT INTO alerts (id, device_id, geofence_id, message, level, status) VALUES ($1, $2, $3, $4, $5, $6)',
                [alertId, dev.id, fence.id, message, 'high', 'resolved']
              );
              await firebaseService.syncFirestoreAlert(alertId, {
                id: alertId,
                device_id: dev.id,
                geofence_id: fence.id,
                message,
                level: 'high',
                status: 'resolved',
                timestamp: new Date().toISOString(),
                resolved_at: new Date().toISOString()
              });

              // Dispatch notifications (non-blocking)
              dispatchAlertNotifications(dev.created_by, message, alertId, 'Geofence Exit');
            }
          }
        }
      }
    }

    // 3. Process Escalation Rules for unattended alerts (older than 15s)
    const activeAlertsRes = await db.query("SELECT * FROM alerts WHERE status = 'active'");
    const nowTime = Date.now();
    for (const alert of activeAlertsRes.rows) {
      const alertTime = new Date(alert.timestamp).getTime();
      if (nowTime - alertTime > 15000 && !alert.message.includes('[ESCALATED]')) {
        const escalatedMsg = `[ESCALATED] ${alert.message}`;
        await db.query(
          "UPDATE alerts SET message = $1, level = 'critical', assigned_to = 1, assigned_to_name = 'Sansah Admin' WHERE id = $2",
          [escalatedMsg, alert.id]
        );
        await db.query(
          "INSERT INTO alert_notes (alert_id, user_id, user_name, note) VALUES ($1, $2, $3, $4)",
          [alert.id, 1, 'System', 'Auto-Escalation: Incident remained unattended for 15 seconds. Escalated level to CRITICAL and assigned to Sansah Admin.']
        );
        
        await db.query(
          "INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)",
          [1, 'Alert Escalated', `Alert ${alert.id} auto-escalated to Admin.`]
        );
      }
    }

    // Broadcast updated telemetry to connected UI clients
    broadcastTelemetryData();
  } catch (err) {
    console.error('Simulator Tick Error:', err.message);
  }
}

// Build broadcast JSON
async function broadcastTelemetryData() {
  if (clients.size === 0) return;

  try {
    // 1. Fetch all devices from DB
    const devListResult = await db.query('SELECT * FROM devices ORDER BY id ASC');
    const allDevices = devListResult.rows;
    for (const d of allDevices) {
      const sensors = await db.query('SELECT * FROM sensors WHERE device_id = $1', [d.id]);
      d.sensors = sensors.rows;

      d.connected = !!d.connected;
      d.gps_enabled = !!d.gps_enabled;

      if (d.gps_enabled) {
        const gpsHist = await db.query(
          'SELECT lat, lng, speed, distance, timestamp FROM gps_tracking WHERE device_id = $1 ORDER BY id DESC LIMIT 1',
          [d.id]
        );
        d.gpsData = gpsHist.rows.length > 0 ? gpsHist.rows[0] : null;
      }
    }

    // 2. Fetch all recent alerts (last 10)
    const recentAlertsResult = await db.query(
      `SELECT a.*, d.name as device_name, d.created_by,
              s.name as sensor_name, s.max_value as threshold_value,
              s.current_value, s.unit
       FROM alerts a 
       JOIN devices d ON a.device_id = d.id 
       LEFT JOIN sensors s ON a.sensor_id = s.id 
       ORDER BY a.timestamp DESC LIMIT 10`
    );
    const allRecentAlerts = recentAlertsResult.rows;

    // 3. Fetch all active alerts for stats counts
    const activeAlertsResult = await db.query(
      "SELECT a.*, d.created_by FROM alerts a JOIN devices d ON a.device_id = d.id WHERE a.status = 'active'"
    );
    const allActiveAlerts = activeAlertsResult.rows;

    // 4. Fetch global counts for admins
    const usersCount = await db.query('SELECT COUNT(*) as count FROM users');
    const sensorsCount = await db.query('SELECT COUNT(*) as count FROM sensors');

    const totalAdminDevices = allDevices.length;
    const onlineAdminDevices = allDevices.filter(d => d.connected).length;
    const offlineAdminDevices = allDevices.filter(d => !d.connected).length;

    const adminStats = {
      totalUsers: parseInt(usersCount.rows[0].count),
      totalDevices: totalAdminDevices,
      totalSensors: parseInt(sensorsCount.rows[0].count),
      activeAlerts: allActiveAlerts.length,
      criticalAlerts: allActiveAlerts.filter(a => a.level === 'critical').length,
      warningAlerts: allActiveAlerts.filter(a => a.level !== 'critical').length,
      onlineDevices: onlineAdminDevices,
      offlineDevices: offlineAdminDevices
    };

    // 5. Broadcast to each client individually based on their access scope
    clients.forEach(client => {
      if (client.readyState !== WebSocket.OPEN || !client.user) return;

      if (client.user.role === 'admin') {
        client.send(JSON.stringify({
          type: 'TELEMETRY_TICK',
          stats: adminStats,
          devices: allDevices,
          recentAlerts: allRecentAlerts
        }));
      } else {
        // Filter elements for standard user
        const userDevices = allDevices.filter(d => d.created_by === client.user.id);
        const userDeviceIds = new Set(userDevices.map(d => d.id));

        const userRecentAlerts = allRecentAlerts.filter(a => userDeviceIds.has(a.device_id));
        const userActiveAlerts = allActiveAlerts.filter(a => a.created_by === client.user.id);

        const onlineCount = userDevices.filter(d => d.connected).length;
        const offlineCount = userDevices.filter(d => !d.connected).length;
        const totalSensorsCount = userDevices.reduce((sum, d) => sum + (d.sensors ? d.sensors.length : 0), 0);

        const userStats = {
          totalUsers: 1, // Only themselves
          totalDevices: userDevices.length,
          totalSensors: totalSensorsCount,
          activeAlerts: userActiveAlerts.length,
          criticalAlerts: userActiveAlerts.filter(a => a.level === 'critical').length,
          warningAlerts: userActiveAlerts.filter(a => a.level !== 'critical').length,
          onlineDevices: onlineCount,
          offlineDevices: offlineCount
        };

        client.send(JSON.stringify({
          type: 'TELEMETRY_TICK',
          stats: userStats,
          devices: userDevices,
          recentAlerts: userRecentAlerts
        }));
      }
    });
  } catch (err) {
    console.error('Failed to broadcast telemetry update:', err.message);
  }
}

global.broadcastTelemetryData = broadcastTelemetryData;

async function sendTelemetryUpdate(ws) {
  try {
    if (!ws.user) return; // Skip if unauthenticated

    let result;
    if (ws.user.role === 'admin') {
      result = await db.query('SELECT * FROM devices ORDER BY id ASC');
    } else {
      result = await db.query('SELECT * FROM devices WHERE created_by = $1 ORDER BY id ASC', [ws.user.id]);
    }
    const devices = result.rows;
    for (const d of devices) {
      const sensors = await db.query('SELECT * FROM sensors WHERE device_id = $1', [d.id]);
      d.sensors = sensors.rows;

      d.connected = !!d.connected;
      d.gps_enabled = !!d.gps_enabled;

      if (d.gps_enabled) {
        const gpsHist = await db.query(
          'SELECT lat, lng, speed, distance, timestamp FROM gps_tracking WHERE device_id = $1 ORDER BY id DESC LIMIT 1',
          [d.id]
        );
        d.gpsData = gpsHist.rows.length > 0 ? gpsHist.rows[0] : null;
      }
    }

    ws.send(JSON.stringify({
      type: 'INIT_TELEMETRY',
      devices
    }));
  } catch (err) {
    console.error('Failed to send initial socket telemetry payload:', err.message);
  }
}

// Start HTTP Server and connect DB
db.initDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`Express server successfully running on port ${PORT}`);
    
    // Start Server-Side Telemetry Tick every 3 seconds
    setInterval(runSimulatorTick, 3000);
  });
}).catch(err => {
  console.error('Database initialization crash:', err.message);
});
