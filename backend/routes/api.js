const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const PDFDocument = require('pdfkit');
const nodemailer = require('nodemailer');
const db = require('../config/db');
const emailService = require('../services/emailService');
const firebaseService = require('../services/firebaseService');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'sansah_super_secret_jwt_key_2026';

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

// ----------------------------------------------------
// AUTH MIDDLEWARE
// ----------------------------------------------------
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  let token = authHeader && authHeader.split(' ')[1];
  if (!token && req.query.token) {
    token = req.query.token;
  }

  if (!token) {
    return res.status(401).json({ error: 'Access token missing' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
}

function isAdmin(req, res, next) {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403).json({ error: 'Admin role required' });
  }
}

// Helper: Log audit trail entries
async function logAudit(userId, action, details) {
  try {
    await db.query(
      'INSERT INTO audit_logs (user_id, action, details) VALUES ($1, $2, $3)',
      [userId, action, details]
    );
  } catch (err) {
    console.error('Failed to write audit log:', err.message);
  }
}

// Helper: Save mock email to backend/mailbox directory
function saveToMailbox(to, subject, text) {
  try {
    const fs = require('fs');
    const path = require('path');
    const mailboxDir = path.resolve(__dirname, '..', 'mailbox');
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
Custom-Notification-Source: Router-API-Routes

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
    const outboxDir = path.resolve(__dirname, '..', 'whatsapp_outbox');
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
    const outboxDir = path.resolve(__dirname, '..', 'sms_outbox');
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

// Helper: Send System Emails (Welcome & Security Alerts)
async function sendSystemEmail(email, subject, message, userId) {
  console.log(`\n============== [SYSTEM EMAIL DISPATCH] ==============`);
  console.log(`To: ${email}`);
  console.log(`Subject: ${subject}`);
  console.log(`Message:\n${message}`);
  console.log(`====================================================\n`);

  const alertId = `sys_mail_${Date.now()}_${Math.floor(Math.random()*100)}`;
  const shortDesc = `System Email: ${subject}`;
  let sentStatus = 'sent';
  let errorMessage = null;

  try {
    const settings = await getSystemSettingsMap();
    const transporter = await createMailTransporter(settings);

    if (transporter) {
      const fromEmail = settings.smtp_from || process.env.SMTP_FROM || settings.smtp_user || process.env.SMTP_USER || 'support@sansah.com';
      let info;
      try {
        info = await transporter.sendMail({
          from: `"Sansah Innovations" <${fromEmail}>`,
          to: email,
          subject: subject,
          text: message
        });
      } catch (sendErr) {
        if (transporter === global.etherealTransporter) {
          console.warn('Ethereal fallback SMTP send failed. Falling back to local simulated transporter...', sendErr.message);
          const simulatedTransporter = nodemailer.createTransport({ jsonTransport: true });
          info = await simulatedTransporter.sendMail({
            from: `"Sansah Innovations" <${fromEmail}>`,
            to: email,
            subject: subject,
            text: message
          });
        } else {
          throw sendErr;
        }
      }

      const testUrl = nodemailer.getTestMessageUrl(info);
      if (testUrl) {
        sentStatus = 'ethereal';
        console.log(`System email dispatched via Ethereal. Preview URL: ${testUrl}`);
      } else if (info.message || (transporter.options && transporter.options.jsonTransport)) {
        sentStatus = 'simulated';
        console.log('System email dispatch simulated locally (JSON transporter).');
      } else {
        console.log('System email dispatched successfully via SMTP.');
      }
    } else {
      sentStatus = 'simulated';
      console.log('SMTP config missing and Ethereal fallback failed. System email dispatch simulated.');
    }
  } catch (err) {
    console.error('Failed to send system email:', err.message);
    sentStatus = 'failed';
    errorMessage = err.message;
  }

  // Save copy locally to verify delivery offline
  saveToMailbox(email, subject, message);

  try {
    // Write system alert record first
    await db.query(
      "INSERT INTO alerts (id, device_id, message, level, status) VALUES ($1, 'SYSTEM', $2, 'low', 'resolved')",
      [alertId, shortDesc]
    );

    // Record notification log
    await db.query(
      'INSERT INTO notifications (id, user_id, alert_id, channel, status, error_message) VALUES ($1, $2, $3, $4, $5, $6)',
      [`notif_sys_${Date.now()}_${Math.floor(Math.random()*100)}`, userId, alertId, 'email', sentStatus, errorMessage]
    );
  } catch (err) {
    console.error('Failed to save system notification log to DB:', err.message);
  }
}

function getSensorUnit(type) {
  if (type.includes('Moisture') || type.includes('Humidity') || type.includes('Wetness')) return '%';
  if (type.includes('Temperature')) return '°C';
  if (type.includes('Rainfall')) return 'mm';
  if (type.includes('Water Level')) return 'cm'; // default unit to cm for requirement validation
  if (type.includes('Water Flow')) return 'L/min';
  if (type.includes('pH')) return 'pH';
  if (type.includes('EC')) return 'dS/m';
  if (type.includes('NPK')) return 'mg/kg';
  if (type.includes('Solar Radiation')) return 'W/m²';
  if (type.includes('Light')) return 'lux';
  if (type.includes('Wind Speed')) return 'km/h'; // default unit to km/h for requirement validation
  if (type.includes('Wind Direction')) return '°';
  if (type.includes('Pressure')) return 'hPa';
  if (type.includes('CO2')) return 'ppm';
  if (type.includes('Gas') || type.includes('Smoke')) return 'ppm';
  if (type.includes('Vibration')) return 'Hz';
  if (type.includes('Motion')) return 'status';
  if (type.includes('GPS') || type.includes('Livestock') || type.includes('Tracking')) return 'coord';
  return 'units';
}

function validatePhysicalLimits(sensorType, value) {
  const val = parseFloat(value);
  if (isNaN(val)) return null;

  if (sensorType.includes('Wind Speed')) {
    if (val < 0 || val > 200) {
      return 'Wind Speed must be between 0 and 200 km/h.';
    }
  } else if (sensorType.includes('Temperature')) {
    if (val < -50 || val > 100) {
      return 'Temperature must be between -50 and 100 °C.';
    }
  } else if (sensorType.includes('Humidity') || sensorType.includes('Moisture')) {
    if (val < 0 || val > 100) {
      return 'Humidity/Moisture must be between 0 and 100%.';
    }
  } else if (sensorType.includes('Water Level')) {
    if (val < 0 || val > 1000) {
      return 'Water Level must be between 0 and 1000 cm.';
    }
  } else if (sensorType.includes('Pressure')) {
    if (val < 800 || val > 1200) {
      return 'Pressure must be between 800 and 1200 hPa.';
    }
  } else if (sensorType.includes('pH')) {
    if (val < 0 || val > 14) {
      return 'pH must be between 0 and 14 on the pH scale.';
    }
  }
  return null;
}


async function triggerInstantAlertForExceededValue(userId, deviceId, sensorId, sensorType, sensorName, unit, maxValue, value) {
  try {
    const devRes = await db.query('SELECT name FROM devices WHERE id = $1', [deviceId]);
    const devName = devRes.rows[0]?.name || 'Device';

    let severity = 'low';
    const ratio = parseFloat(value) / parseFloat(maxValue);
    if (ratio >= 1.35) severity = 'critical';
    else if (ratio >= 1.20) severity = 'high';
    else if (ratio >= 1.05) severity = 'medium';

    const message = `${devName} ${sensorName || sensorType} reading: ${value}${unit} (exceeded threshold ${maxValue}${unit}).`;
    const newAlertId = `alert_${sensorId}_${Date.now()}`;
    
    await db.query(
      'INSERT INTO alerts (id, device_id, sensor_id, message, level, status) VALUES ($1, $2, $3, $4, $5, $6)',
      [newAlertId, deviceId, sensorId, message, severity, 'active']
    );

    await firebaseService.syncFirestoreAlert(newAlertId, {
      id: newAlertId,
      device_id: deviceId,
      sensor_id: sensorId,
      message,
      level: severity,
      status: 'active',
      timestamp: new Date().toISOString()
    }).catch(e => console.error('Firestore syncAlert error:', e.message));

    // Dispatch notifications in background
    dispatchAlertNotifications(userId, message, newAlertId, `Sansah Alert: ${severity.toUpperCase()} limit exceeded`);

    // Record to notification_history
    const histId = `hist_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    await db.query(
      `INSERT INTO notification_history (id, user_id, device_name, sensor_name, timestamp, alert_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [histId, userId, devName, sensorName || sensorType, new Date().toISOString(), severity, 'sent']
    );
  } catch (err) {
    console.error('triggerInstantAlertForExceededValue error:', err.message);
  }
}

async function checkSensorThreshold(sensorId, deviceId, type, name, unit, maxValue, value, createdBy) {
  try {
    const thresholdExceeded = parseFloat(value) > parseFloat(maxValue);
    const existingAlertResult = await db.query(
      'SELECT * FROM alerts WHERE sensor_id = $1 AND status = $2',
      [sensorId, 'active']
    );
    const existingAlert = existingAlertResult.rows;

    if (thresholdExceeded) {
      if (existingAlert.length === 0) {
        let severity = 'low';
        const ratio = parseFloat(value) / parseFloat(maxValue);
        if (ratio >= 1.35) severity = 'critical';
        else if (ratio >= 1.20) severity = 'high';
        else if (ratio >= 1.05) severity = 'medium';

        // Fetch device name
        const devRes = await db.query('SELECT name FROM devices WHERE id = $1', [deviceId]);
        const devName = devRes.rows[0]?.name || 'Device';

        const message = `${devName} ${name || type} reading: ${value}${unit} (exceeded threshold ${maxValue}${unit}).`;
        const newAlertId = `alert_${sensorId}_${Date.now()}`;
        
        await db.query(
          'INSERT INTO alerts (id, device_id, sensor_id, message, level, status) VALUES ($1, $2, $3, $4, $5, $6)',
          [newAlertId, deviceId, sensorId, message, severity, 'active']
        );
        await firebaseService.syncFirestoreAlert(newAlertId, {
          id: newAlertId,
          device_id: deviceId,
          sensor_id: sensorId,
          message,
          level: severity,
          status: 'active',
          timestamp: new Date().toISOString()
        });

        // Notify User
        await dispatchAlertNotifications(createdBy || 1, message, newAlertId, `Sansah Alert: ${severity.toUpperCase()} limit exceeded`);
      }
    } else {
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
  } catch (err) {
    console.error('checkSensorThreshold error:', err.message);
  }
}

async function dispatchAlertNotifications(userId, message, alertId, subject = 'Sansah Alert') {
  try {
    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
    if (userRes.rows.length === 0) return;
    const user = userRes.rows[0];

    let prefs = { dashboard: true, email: true, whatsapp: false, sms: false, push: false };
    try {
      if (user.preferences) {
        prefs = typeof user.preferences === 'string' ? JSON.parse(user.preferences) : user.preferences;
      }
    } catch (e) {}

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

Please log in to your Sansah dashboard at http://localhost:3000 to resolve this incident.

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

    // Dashboard notifications
    if (prefs.dashboard) {
      const notifId = `notif_db_${Date.now()}_${Math.floor(Math.random()*100)}`;
      await db.query(
        'INSERT INTO notifications (id, user_id, alert_id, channel, status) VALUES ($1, $2, $3, $4, $5)',
        [notifId, user.id, alertId, 'dashboard', 'delivered']
      );
      await firebaseService.syncFirestoreNotification(notifId, {
        id: notifId,
        user_id: user.id,
        alert_id: alertId,
        channel: 'dashboard',
        status: 'delivered',
        sent_at: new Date().toISOString()
      });
    }

    // Push notifications
    if (prefs.push || user.fcm_token) {
      const notifId = `notif_ps_${Date.now()}_${Math.floor(Math.random()*100)}`;
      await db.query(
        'INSERT INTO notifications (id, user_id, alert_id, channel, status) VALUES ($1, $2, $3, $4, $5)',
        [notifId, user.id, alertId, 'push', 'delivered']
      );
      await firebaseService.syncFirestoreNotification(notifId, {
        id: notifId,
        user_id: user.id,
        alert_id: alertId,
        channel: 'push',
        status: 'delivered',
        sent_at: new Date().toISOString()
      });
      if (user.fcm_token) {
        firebaseService.sendFcmNotification(user.fcm_token, subject, message, {
          alertId: alertId
        }).catch(err => console.error('FCM send failure:', err.message));
      }
    }

    // Email notifications
    if (prefs.email && user.email) {
      const row = alertDetails.rows[0] || {};
      emailService.sendAlertEmail(user.email, {
        deviceName: row.device_name || 'Device',
        sensorName: row.sensor_name || 'Sensor',
        currentValue: row.current_value,
        maxValue: row.max_value,
        unit: row.unit,
        timestamp: new Date(row.timestamp || Date.now()).toLocaleString(),
        level: row.level || 'warning',
        message: row.message || ''
      }, user.id, alertId).catch(err => {
        console.error('Alert email dispatch fail:', err.message);
      });
    }

    // WhatsApp notifications
    if (prefs.whatsapp && user.phone) {
      console.log(`\n============== [WHATSAPP DISPATCH] ==============`);
      console.log(`Recipient Phone: ${user.phone}`);
      console.log(`Message: ${whatsappText}`);
      console.log(`=================================================\n`);
      
      (async () => {
        let status = 'sent';
        let errorMessage = null;
        try {
          const settings = await getSystemSettingsMap();
          await sendWhatsAppMessage(user.phone, whatsappText, settings);
        } catch (err) {
          status = 'failed';
          errorMessage = err.message;
        }

        const notifId = `notif_wa_${Date.now()}_${Math.floor(Math.random()*100)}`;
        await db.query(
          'INSERT INTO notifications (id, user_id, alert_id, channel, status, error_message) VALUES ($1, $2, $3, $4, $5, $6)',
          [notifId, user.id, alertId, 'whatsapp', status, errorMessage]
        );
        await firebaseService.syncFirestoreNotification(notifId, {
          id: notifId,
          user_id: user.id,
          alert_id: alertId,
          channel: 'whatsapp',
          status: status,
          error_message: errorMessage,
          sent_at: new Date().toISOString()
        });
      })().catch(err => console.error('WhatsApp async dispatch error:', err.message));
    }

    // SMS notifications
    if (prefs.sms && user.phone) {
      console.log(`\n============== [SMS DISPATCH] ==============`);
      console.log(`Recipient Phone: ${user.phone}`);
      console.log(`Message: ${message}`);
      console.log(`============================================\n`);

      (async () => {
        let status = 'sent';
        let errorMessage = null;
        try {
          const settings = await getSystemSettingsMap();
          await sendSMSMessage(user.phone, message, settings);
        } catch (err) {
          status = 'failed';
          errorMessage = err.message;
        }

        const notifId = `notif_sms_${Date.now()}_${Math.floor(Math.random()*100)}`;
        await db.query(
          'INSERT INTO notifications (id, user_id, alert_id, channel, status, error_message) VALUES ($1, $2, $3, $4, $5, $6)',
          [notifId, user.id, alertId, 'sms', status, errorMessage]
        );
        await firebaseService.syncFirestoreNotification(notifId, {
          id: notifId,
          user_id: user.id,
          alert_id: alertId,
          channel: 'sms',
          status: status,
          error_message: errorMessage,
          sent_at: new Date().toISOString()
        });
      })().catch(err => console.error('SMS async dispatch error:', err.message));
    }
  } catch (err) {
    console.error('Failed dispatching alert notifications in API:', err.message);
  }
}



// ----------------------------------------------------
// AUTHENTICATION APIs
// ----------------------------------------------------

// Helper: E.164 international phone formatter
function formatE164(phoneStr) {
  if (!phoneStr) return null;
  // Remove all non-numeric characters except +
  let clean = phoneStr.replace(/[^\d+]/g, '');
  if (!clean.startsWith('+')) {
    clean = '+' + clean.replace(/^\+/, '');
  }
  const e164Regex = /^\+[1-9]\d{6,14}$/;
  if (e164Regex.test(clean)) {
    return clean;
  }
  return null;
}

// User Registration
router.post('/auth/register', async (req, res) => {
  const { name, email, phone, password, role, organization } = req.body;

  const userRole = role === 'admin' ? 'admin' : 'user';

  if (userRole === 'admin') {
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are mandatory for Admin registration' });
    }
  } else {
    if (!name || !email || !phone || !password) {
      return res.status(400).json({ error: 'All fields (name, email, phone, password) are mandatory for User registration' });
    }
    // Only allow @gmail.com emails for user registration
    if (!email.toLowerCase().endsWith('@gmail.com')) {
      return res.status(400).json({ error: 'Only Gmail addresses (@gmail.com) are allowed to register as a user.' });
    }
  }

  // Validate E.164 for User Phone
  let regPhone = 'N/A';
  if (phone && phone.trim() !== '') {
    const formattedPhone = formatE164(phone);
    if (!formattedPhone) {
      return res.status(400).json({ error: 'Phone number must be in valid international E.164 format (e.g., +14155552671)' });
    }
    regPhone = formattedPhone;
  } else if (userRole !== 'admin') {
    return res.status(400).json({ error: 'Phone number must be in valid international E.164 format (e.g., +14155552671)' });
  }

  try {
    // Check if email already registered
    const existing = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Email is already registered' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const defaultPrefs = JSON.stringify({ dashboard: true, email: true, whatsapp: false, sms: false, push: false });

    const regName = userRole === 'admin' ? 'Admin' : name;
    const orgName = userRole === 'admin' ? null : (organization || null);

    const result = await db.query(
      'INSERT INTO users (name, email, phone, password_hash, role, preferences, organization) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id, name, email, phone, role, organization',
      [regName, email, regPhone, passwordHash, userRole, defaultPrefs, orgName]
    );

    const newUser = result.rows[0];
    await logAudit(newUser.id, 'User Registration', `User ${email} registered successfully as ${userRole}.`);
    await firebaseService.syncFirestoreUser(newUser.id, newUser);

    // Send Welcome Email
    const welcomeSubject = 'Welcome to Sansah Innovations!';
    const welcomeMsg = `Hello ${newUser.name},

Welcome to Sansah Innovations! We are thrilled to have you join our platform.

Sansah Innovations is an enterprise-grade IoT Alert Notification & SaaS Platform. Our system provides real-time device health scoring, smart alerts prioritizations, predictive sensor anomaly analytics, GPS routes playback, and highly custom notification settings.

Getting Started Instructions:
1. Log in to your portal gateway at http://localhost:3000/ using your registered credentials.
2. Link your hardware nodes and telemetry sensors under the "Asset Inventory" panel.
3. Configure your alert channels (Dashboard, Email, WhatsApp, SMS) under the "Preferences" settings.
4. Set up Geofences in the GPS tab to monitor mobile hardware entry and exit actions.

If you have any questions or require assistance setting up your hardware, please reach out to our Support team:
Email: support@sansah.com
Phone: +1-800-555-0199

Best regards,
The Sansah Innovations Team`;

    emailService.sendWelcomeEmail(newUser.email, newUser.name, newUser.id).catch(err => {
      console.error('Welcome email dispatch crash:', err.message);
    });

    res.status(201).json({
      message: 'User registered successfully',
      user: newUser
    });
  } catch (err) {
    console.error('Registration error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin and User Login
router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await db.query('SELECT * FROM users WHERE email = $1', [email]);
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = result.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate JWT
    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // Parse preferences
    let prefs = {};
    try {
      prefs = typeof user.preferences === 'string' ? JSON.parse(user.preferences) : user.preferences;
    } catch (e) {
      prefs = { dashboard: true, email: true, whatsapp: false, sms: false };
    }

    await logAudit(user.id, 'User Login', `${user.role} logged in successfully.`);

    // Send Login Notification Email
    const userAgent = req.headers['user-agent'] || 'Unknown Browser/Device';
    const loginSubject = 'Security Notification: Successful Account Login';
    const loginMsg = `Hello ${user.name},

Security Notice: Your Sansah Innovations account was successfully accessed.

Login Details:
Timestamp: ${new Date().toLocaleString()}
Device/Browser: ${userAgent}

If this login was you, no action is required. If you did not initiate this session, please secure your account by resetting your password immediately.

Sincerely,
Sansah Innovations Security Team`;

    emailService.sendEmail({
      to: user.email,
      subject: loginSubject,
      text: loginMsg,
      html: `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #0b131a; color: #cbd5e1; padding: 20px; border-radius: 8px; border: 1px solid #1e293b; max-width: 500px; margin: auto;">
        <h2 style="color: #3b82f6; margin-top: 0; font-size: 18px; border-bottom: 1px solid #1e293b; padding-bottom: 10px;">🔒 Security Notification: Account Login</h2>
        <p>Hello <strong>${user.name}</strong>,</p>
        <p>Security Notice: Your Sansah Innovations account was successfully accessed.</p>
        <div style="background-color: #0f1c29; padding: 12px; border-radius: 6px; border: 1px solid #1e293b; font-size: 13px;">
          <strong>Login Details:</strong><br/>
          Timestamp: ${new Date().toLocaleString()}<br/>
          Device/Browser: ${userAgent}
        </div>
        <p style="font-size: 11px; color: #64748b; border-top: 1px solid #1e293b; padding-top: 10px; margin-top: 15px;">
        If this login was you, no action is required. If you did not initiate this session, please secure your account by resetting your password immediately.
        </p>
      </div>`,
      userId: user.id,
      alertId: `sys_login_${Date.now()}`
    }).catch(err => {
      console.error('Login notification email dispatch crash:', err.message);
    });

    if (user.role === 'user') {
      const welcomeSubject = '🎉 Welcome to Sansah Innovations!';
      const welcomeMessage = `🎉 Welcome to Sansah Innovations!

Thank you for choosing Sansah Innovations. We are delighted to have you with us and truly appreciate the trust you've placed in our team.

At Sansah Innovations, we are committed to delivering innovative solutions, exceptional service, and a seamless experience tailored to your needs. We look forward to working with you and helping you achieve your goals.

To keep you informed, we will send important alerts, updates, notifications, and relevant information regarding our services. Please keep an eye on your messages to stay up to date.

If you have any questions or need assistance, our team is always here to help.

Thank you once again for choosing Sansah Innovations. We are excited to begin this journey with you!

Warm regards,
Team Sansah Innovations`;

      // Welcome Email
      emailService.sendEmail({
        to: user.email,
        subject: welcomeSubject,
        text: welcomeMessage,
        html: `<div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; background-color: #0b131a; color: #cbd5e1; padding: 20px; border-radius: 8px; border: 1px solid #1e293b; max-width: 500px; margin: auto; line-height: 1.6;">
          <h2 style="color: #3b82f6; margin-top: 0; font-size: 18px; border-bottom: 1px solid #1e293b; padding-bottom: 10px; text-align: center;">🎉 Welcome to Sansah Innovations!</h2>
          <p>Thank you for choosing Sansah Innovations. We are delighted to have you with us and truly appreciate the trust you've placed in our team.</p>
          <p>At Sansah Innovations, we are committed to delivering innovative solutions, exceptional service, and a seamless experience tailored to your needs. We look forward to working with you and helping you achieve your goals.</p>
          <p>To keep you informed, we will send important alerts, updates, notifications, and relevant information regarding our services. Please keep an eye on your messages to stay up to date.</p>
          <p>If you have any questions or need assistance, our team is always here to help.</p>
          <p>Thank you once again for choosing Sansah Innovations. We are excited to begin this journey with you!</p>
          <p style="margin-top: 20px; border-top: 1px solid #1e293b; padding-top: 10px; font-weight: bold; color: #3b82f6;">Warm regards,<br/>Team Sansah Innovations</p>
        </div>`,
        userId: user.id,
        alertId: `sys_welcome_login_${Date.now()}`
      }).catch(err => {
        console.error('Login welcome email dispatch crash:', err.message);
      });

      // Welcome SMS
      if (user.phone && user.phone !== 'N/A') {
        const sendSMS = async () => {
          let status = 'sent';
          let errorMessage = null;
          try {
            const settings = await getSystemSettingsMap();
            await sendSMSMessage(user.phone, welcomeMessage, settings);
          } catch (err) {
            status = 'failed';
            errorMessage = err.message;
          }

          const notifId = `notif_sms_${Date.now()}_${Math.floor(Math.random()*100)}`;
          const welcomeAlertId = `sys_welcome_sms_${Date.now()}`;
          try {
            await db.query(
              "INSERT INTO alerts (id, device_id, message, level, status) VALUES ($1, 'SYSTEM', $2, 'low', 'resolved')",
              [welcomeAlertId, `Welcome SMS sent to login phone ${user.phone}`]
            );
            await db.query(
              'INSERT INTO notifications (id, user_id, alert_id, channel, status, error_message) VALUES ($1, $2, $3, $4, $5, $6)',
              [notifId, user.id, welcomeAlertId, 'sms', status, errorMessage]
            );
            await firebaseService.syncFirestoreNotification(notifId, {
              id: notifId,
              user_id: user.id,
              alert_id: welcomeAlertId,
              channel: 'sms',
              status: status,
              error_message: errorMessage,
              sent_at: new Date().toISOString()
            });
          } catch (dbErr) {
            console.error('Failed to save welcome SMS notification to DB:', dbErr.message);
          }
        };
        sendSMS().catch(err => console.error('SMS sending outer error:', err));
      }
    }

    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        preferences: prefs,
        organization: user.organization,
        created_at: user.created_at
      }
    });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get Profile Details
router.get('/auth/profile', authenticateToken, async (req, res) => {
  try {
    const result = await db.query('SELECT id, name, email, phone, role, preferences, organization, created_at FROM users WHERE id = $1', [req.user.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = result.rows[0];
    let prefs = {};
    try {
      prefs = typeof user.preferences === 'string' ? JSON.parse(user.preferences) : user.preferences;
    } catch (e) {
      prefs = { dashboard: true, email: true, whatsapp: false, sms: false };
    }
    user.preferences = prefs;
    res.json(user);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Preferences
router.put('/auth/preferences', authenticateToken, async (req, res) => {
  const { whatsapp, email, dashboard, sms, push, theme } = req.body;

  try {
    const updatedPrefs = JSON.stringify({ 
      whatsapp: !!whatsapp, 
      email: !!email, 
      dashboard: !!dashboard,
      sms: !!sms,
      push: !!push,
      theme: theme || 'dark'
    });
    await db.query('UPDATE users SET preferences = $1 WHERE id = $2', [updatedPrefs, req.user.id]);
    await logAudit(req.user.id, 'Update Preferences', `Preferences updated: ${updatedPrefs}`);
    res.json({ message: 'Notification preferences updated successfully' });
  } catch (err) {
    console.error('Update preferences error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Profile Details (Name & Phone)
router.put('/auth/profile', authenticateToken, async (req, res) => {
  const { name, phone } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Name is mandatory' });
  }

  let formattedPhone = 'N/A';
  if (phone && phone !== 'N/A' && phone.trim() !== '') {
    const clean = formatE164(phone);
    if (!clean) {
      return res.status(400).json({ error: 'Phone number must be in valid international E.164 format (e.g., +14155552671)' });
    }
    formattedPhone = clean;
  }

  try {
    await db.query(
      'UPDATE users SET name = $1, phone = $2 WHERE id = $3',
      [name, formattedPhone, req.user.id]
    );
    await logAudit(req.user.id, 'Update Profile', `Profile updated: Name=${name}, Phone=${formattedPhone}`);
    res.json({ message: 'Profile details updated successfully', phone: formattedPhone });
  } catch (err) {
    console.error('Update profile error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register/Update FCM Token
router.post('/auth/fcm-token', authenticateToken, async (req, res) => {
  const { fcm_token } = req.body;
  try {
    await db.query('UPDATE users SET fcm_token = $1 WHERE id = $2', [fcm_token || null, req.user.id]);
    res.json({ success: true, message: 'FCM token registered successfully' });
  } catch (err) {
    console.error('Register FCM token error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin list users
router.get('/auth/users', authenticateToken, isAdmin, async (req, res) => {
  try {
    const result = await db.query('SELECT id, name, email, phone, role, preferences, created_at FROM users ORDER BY role ASC, id DESC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------------------------------------------
// DEVICE MANAGEMENT APIs
// ----------------------------------------------------

// Get all devices
router.get('/devices', authenticateToken, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query('SELECT * FROM devices ORDER BY id ASC');
    } else {
      result = await db.query('SELECT * FROM devices WHERE created_by = $1 ORDER BY id ASC', [req.user.id]);
    }
    
    // Attach sensors list to each device
    const devices = result.rows;
    for (const d of devices) {
      const sensors = await db.query('SELECT * FROM sensors WHERE device_id = $1', [d.id]);
      d.sensors = sensors.rows;
      // SQLite returns boolean as 0/1, convert back
      d.connected = !!d.connected;
      d.gps_enabled = !!d.gps_enabled;

      if (d.gps_enabled) {
        const gpsHist = await db.query(
          'SELECT lat, lng, speed, distance, timestamp FROM gps_tracking WHERE device_id = $1 ORDER BY id DESC LIMIT 1',
          [d.id]
        );
        d.gpsData = gpsHist.rows.length > 0 ? gpsHist.rows[0] : null;
      } else {
        d.gpsData = null;
      }
    }
    
    res.json(devices);
  } catch (err) {
    console.error('Get devices error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Register new device
router.post('/devices', authenticateToken, async (req, res) => {
  const { 
    id, 
    name, 
    hardware_type, 
    location, 
    communication_protocol, 
    max_sensor_value, 
    gps_enabled, 
    sensor_type, 
    current_sensor_value,
    remarks,
    category,
    lifecycle_status
  } = req.body;

  if (req.user.role === 'admin') {
    // Admin creates core device record
    if (!id || !name || !hardware_type || !location) {
      return res.status(400).json({ error: 'Device ID, Name, Hardware Type, and Location are required' });
    }

    try {
      const existing = await db.query('SELECT id FROM devices WHERE id = $1', [id]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Device ID is already registered' });
      }

      if (sensor_type && max_sensor_value !== undefined) {
        const errorMsg = validatePhysicalLimits(sensor_type, max_sensor_value);
        if (errorMsg) {
          return res.status(400).json({ error: errorMsg });
        }
      }

      await db.query(
        'INSERT INTO devices (id, name, hardware_type, location, communication_protocol, max_sensor_value, gps_enabled, created_by, remarks, category, lifecycle_status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
        [id, name, hardware_type, location, communication_protocol || 'HTTP', max_sensor_value || 100.0, !!gps_enabled, req.user.id, remarks || null, category || null, lifecycle_status || null]
      );

      // Create primary sensor automatically based on type
      if (sensor_type) {
        const sensorId = `${id}_${sensor_type.toLowerCase().replace(/\s+/g, '_')}`;
        const unit = getSensorUnit(sensor_type);

        await db.query(
          'INSERT INTO sensors (id, device_id, type, name, unit, max_value, current_value) VALUES ($1, $2, $3, $4, $5, $6, $7)',
          [sensorId, id, sensor_type, `${sensor_type} Sensor`, unit, max_sensor_value || 100.0, 0.0]
        );
        await firebaseService.syncFirestoreSensor(sensorId, {
          id: sensorId,
          device_id: id,
          type: sensor_type,
          name: `${sensor_type} Sensor`,
          unit,
          max_value: max_sensor_value || 100.0,
          current_value: 0.0
        });
      }

      await logAudit(req.user.id, 'Register Device', `Admin registered device ${id}: ${name}`);
      firebaseService.updateFirestoreDeviceStatus(id, {
        id,
        name,
        hardware_type,
        location,
        communication_protocol: communication_protocol || 'HTTP',
        max_sensor_value: max_sensor_value || 100.0,
        gps_enabled: !!gps_enabled,
        created_by: req.user.id,
        remarks: remarks || null,
        category: category || null,
        lifecycle_status: lifecycle_status || null,
        connected: true,
        battery: 100,
        health_score: 100.0,
        uptime_percent: 100.0,
        sensors: sensor_type ? [{
          id: `${id}_${sensor_type.toLowerCase().replace(/\s+/g, '_')}`,
          device_id: id,
          type: sensor_type,
          name: `${sensor_type} Sensor`,
          unit: getSensorUnit(sensor_type),
          max_value: max_sensor_value || 100.0,
          current_value: 0.0,
          status: 'online'
        }] : []
      }).catch(err => console.error('Admin create device Firestore sync error:', err.message));
      res.status(201).json({ message: 'Device registered successfully by Admin' });
    } catch (err) {
      console.error('Admin create device error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  } else {
    // User claims an existing admin-registered device or configures own subscription
    if (!id || !sensor_type) {
      return res.status(400).json({ error: 'Device Selection and Sensor Type are required' });
    }

    try {
      // Check if device exists
      let devCheck = await db.query('SELECT * FROM devices WHERE id = $1', [id]);
      if (devCheck.rows.length === 0) {
        // Dynamically register custom device for standard users.
        const nameToUse = name || id;
        const maxValToUse = parseFloat(max_sensor_value) || 100.0;
        const commProtocolToUse = communication_protocol || 'HTTP';
        const isGpsEnabled = !!gps_enabled || (sensor_type === 'GPS Tracker');
        
        await db.query(
          'INSERT INTO devices (id, name, hardware_type, location, communication_protocol, max_sensor_value, gps_enabled, created_by, remarks, category, lifecycle_status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)',
          [id, nameToUse, 'ESP32', 'Default Field Location', commProtocolToUse, maxValToUse, isGpsEnabled, req.user.id, remarks || null, category || null, lifecycle_status || null]
        );
        devCheck = await db.query('SELECT * FROM devices WHERE id = $1', [id]);
      }

      const adminDevice = devCheck.rows[0];

      // Claim ownership by setting created_by to User
      await db.query(
        'UPDATE devices SET created_by = $1, communication_protocol = $2, remarks = $3, category = $4, lifecycle_status = $5 WHERE id = $6',
        [req.user.id, communication_protocol || adminDevice.communication_protocol, remarks || adminDevice.remarks, category || adminDevice.category, lifecycle_status || adminDevice.lifecycle_status, id]
      );
 
       // Check if sensor is already created, else create it
       const sensorId = `${id}_${sensor_type.toLowerCase().replace(/\s+/g, '_')}`;
       const sensCheck = await db.query('SELECT * FROM sensors WHERE id = $1', [sensorId]);
       
       const unit = getSensorUnit(sensor_type);
       const currentVal = parseFloat(current_sensor_value) || 0.0;
 
       if (currentVal > adminDevice.max_sensor_value) {
         await triggerInstantAlertForExceededValue(req.user.id, id, sensorId, sensor_type, `${sensor_type} Sensor`, unit, adminDevice.max_sensor_value, currentVal);
         return res.status(400).json({ error: 'You cannot exceed the maximum allowed value.' });
       }

       const errorMsg = validatePhysicalLimits(sensor_type, currentVal);
       if (errorMsg) {
         return res.status(400).json({ error: errorMsg });
       }

       if (sensCheck.rows.length === 0) {
         await db.query(
           'INSERT INTO sensors (id, device_id, type, name, unit, max_value, current_value) VALUES ($1, $2, $3, $4, $5, $6, $7)',
           [sensorId, id, sensor_type, `${sensor_type} Sensor`, unit, adminDevice.max_sensor_value, currentVal]
         );
         await firebaseService.syncFirestoreSensor(sensorId, {
           id: sensorId,
           device_id: id,
           type: sensor_type,
           name: `${sensor_type} Sensor`,
           unit,
           max_value: adminDevice.max_sensor_value,
           current_value: currentVal
         });
       } else {
         // User updates telemetry value
         await db.query(
           'UPDATE sensors SET current_value = $1, last_updated = CURRENT_TIMESTAMP WHERE id = $2',
           [currentVal, sensorId]
         );
         await firebaseService.syncFirestoreSensor(sensorId, {
           current_value: currentVal
         });
       }
 
       // Log historical reading
       await db.query('INSERT INTO sensor_readings (sensor_id, value) VALUES ($1, $2)', [sensorId, currentVal]);
 
       // Check threshold immediately
       await checkSensorThreshold(sensorId, id, sensor_type, `${sensor_type} Sensor`, unit, adminDevice.max_sensor_value, currentVal, req.user.id);
       
       // Global broadcast
       if (global.broadcastTelemetryData) {
         global.broadcastTelemetryData(sensorId, { current_value: currentVal });
       }
 
       await logAudit(req.user.id, 'Register User Device', `User claimed device ${id} and set sensor ${sensor_type} to ${currentVal}`);
        
        // Fetch all sensors and device settings to update Firestore fully
        (async () => {
          const devRes = await db.query('SELECT * FROM devices WHERE id = $1', [id]);
          const devObj = devRes.rows[0];
          const sensRes = await db.query('SELECT * FROM sensors WHERE device_id = $1', [id]);
          const sensorsList = sensRes.rows.map(s => ({
            id: s.id,
            name: s.name,
            type: s.type,
            unit: s.unit,
            current_value: s.current_value,
            max_value: s.max_value,
            status: s.status
          }));
          await firebaseService.updateFirestoreDeviceStatus(id, {
            id,
            name: devObj.name,
            hardware_type: devObj.hardware_type,
            location: devObj.location,
            communication_protocol: devObj.communication_protocol,
            max_sensor_value: devObj.max_sensor_value,
            gps_enabled: !!devObj.gps_enabled,
            created_by: req.user.id,
            remarks: devObj.remarks,
            category: devObj.category,
            lifecycle_status: devObj.lifecycle_status,
            connected: !!devObj.connected,
            battery: devObj.battery,
            health_score: devObj.health_score,
            uptime_percent: devObj.uptime_percent,
            sensors: sensorsList
          });
        })().catch(err => console.error('User register device Firestore sync error:', err.message));

        res.json({ message: 'Device configuration linked and telemetry updated' });
     } catch (err) {
      console.error('User register device error:', err.message);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
});

// Update device
router.put('/devices/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, location, communication_protocol, max_sensor_value, connected, battery, current_sensor_value, sensor_type } = req.body;

  try {
    const devCheck = await db.query('SELECT * FROM devices WHERE id = $1', [id]);
    if (devCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Device not found' });
    }

    const device = devCheck.rows[0];

    // User check: cannot edit others devices
    if (req.user.role !== 'admin' && device.created_by !== req.user.id) {
      return res.status(403).json({ error: 'Access denied to this device' });
    }

    // Role restrictions: User cannot modify Maximum Value
    if (req.user.role === 'admin') {
      if (max_sensor_value !== undefined) {
        const sensors = await db.query('SELECT type FROM sensors WHERE device_id = $1', [id]);
        for (const s of sensors.rows) {
          const errorMsg = validatePhysicalLimits(s.type, max_sensor_value);
          if (errorMsg) {
            return res.status(400).json({ error: errorMsg });
          }
        }
      }

      await db.query(
        'UPDATE devices SET name = $1, location = $2, communication_protocol = $3, max_sensor_value = $4, connected = $5, battery = $6 WHERE id = $7',
        [
          name || device.name,
          location || device.location,
          communication_protocol || device.communication_protocol,
          max_sensor_value !== undefined ? parseFloat(max_sensor_value) : device.max_sensor_value,
          connected !== undefined ? !!connected : device.connected,
          battery !== undefined ? parseInt(battery) : device.battery,
          id
        ]
      );
      
      // Update max thresholds for sensors on this device
      if (max_sensor_value !== undefined) {
        await db.query('UPDATE sensors SET max_value = $1 WHERE device_id = $2', [parseFloat(max_sensor_value), id]);
      }
    } else {
      // User editing own device settings
      await db.query(
        'UPDATE devices SET communication_protocol = $1 WHERE id = $2',
        [communication_protocol || device.communication_protocol, id]
      );
    }

    // Update sensor readings if current value provided
    if (current_sensor_value !== undefined && sensor_type) {
      const sensorId = `${id}_${sensor_type.toLowerCase().replace(/\s+/g, '_')}`;
      const parsedVal = parseFloat(current_sensor_value);
      
      if (parsedVal > device.max_sensor_value) {
        await triggerInstantAlertForExceededValue(req.user.id, id, sensorId, sensor_type, `${sensor_type} Sensor`, getSensorUnit(sensor_type), device.max_sensor_value, parsedVal);
        return res.status(400).json({ error: 'You cannot exceed the maximum allowed value.' });
      }

      const errorMsg = validatePhysicalLimits(sensor_type, parsedVal);
      if (errorMsg) {
        return res.status(400).json({ error: errorMsg });
      }

      // Update sensor table
      await db.query(
        'UPDATE sensors SET current_value = $1, last_updated = CURRENT_TIMESTAMP WHERE id = $2',
        [parsedVal, sensorId]
      );

      // Add to historical readings table
      await db.query(
        'INSERT INTO sensor_readings (sensor_id, value) VALUES ($1, $2)',
        [sensorId, parsedVal]
      );

      // Check threshold immediately
      const sensRes = await db.query('SELECT * FROM sensors WHERE id = $1', [sensorId]);
      if (sensRes.rows.length > 0) {
        const sensData = sensRes.rows[0];
        await checkSensorThreshold(sensorId, id, sensData.type, sensData.name, sensData.unit, sensData.max_value, parsedVal, req.user.id);
      }
    }

    await logAudit(req.user.id, 'Update Device', `Device ${id} settings updated.`);
    
    // Sync updated device details and all its sensors to Firestore
    (async () => {
      const devRes = await db.query('SELECT * FROM devices WHERE id = $1', [id]);
      const devObj = devRes.rows[0];
      const sensRes = await db.query('SELECT * FROM sensors WHERE device_id = $1', [id]);
      const sensorsList = sensRes.rows.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        unit: s.unit,
        current_value: s.current_value,
        max_value: s.max_value,
        status: s.status
      }));
      await firebaseService.updateFirestoreDeviceStatus(id, {
        id,
        name: devObj.name,
        hardware_type: devObj.hardware_type,
        location: devObj.location,
        communication_protocol: devObj.communication_protocol,
        max_sensor_value: devObj.max_sensor_value,
        gps_enabled: !!devObj.gps_enabled,
        created_by: devObj.created_by,
        remarks: devObj.remarks,
        category: devObj.category,
        lifecycle_status: devObj.lifecycle_status,
        connected: !!devObj.connected,
        battery: devObj.battery,
        health_score: devObj.health_score,
        uptime_percent: devObj.uptime_percent,
        sensors: sensorsList
      });
    })().catch(err => console.error('Device PUT update Firestore sync error:', err.message));

    res.json({ message: 'Device settings updated successfully' });
  } catch (err) {
    console.error('Update device error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Admin Delete Device
router.delete('/devices/:id', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    await db.query('DELETE FROM sensors WHERE device_id = $1', [id]);
    await db.query('DELETE FROM devices WHERE id = $1', [id]);
    await firebaseService.deleteFirestoreDevice(id).catch(e => {});
    await logAudit(req.user.id, 'Delete Device', `Device ${id} deleted by Admin.`);
    res.json({ message: 'Device deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------------------------------------------
// SENSOR & TELEMETRY APIs
// ----------------------------------------------------

// Get sensors list
router.get('/sensors', authenticateToken, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query('SELECT s.*, d.name as device_name FROM sensors s JOIN devices d ON s.device_id = d.id');
    } else {
      result = await db.query(
        'SELECT s.*, d.name as device_name FROM sensors s JOIN devices d ON s.device_id = d.id WHERE d.created_by = $1',
        [req.user.id]
      );
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get sensor trend history readings
router.get('/sensors/readings/:sensorId', authenticateToken, async (req, res) => {
  const { sensorId } = req.params;
  try {
    if (req.user.role !== 'admin') {
      const sensCheck = await db.query(
        'SELECT d.created_by FROM sensors s JOIN devices d ON s.device_id = d.id WHERE s.id = $1',
        [sensorId]
      );
      if (sensCheck.rows.length === 0 || sensCheck.rows[0].created_by !== req.user.id) {
        return res.status(403).json({ error: 'Access denied to this sensor' });
      }
    }
    // Select last 15 readings
    const result = await db.query(
      'SELECT value, timestamp FROM sensor_readings WHERE sensor_id = $1 ORDER BY id DESC LIMIT 15',
      [sensorId]
    );
    // Reverse to show chronologically
    res.json(result.rows.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Edit sensor details & configurations
router.put('/sensors/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { name, unit, max_value, current_value } = req.body;

  try {
    const sensorCheck = await db.query('SELECT * FROM sensors WHERE id = $1', [id]);
    if (sensorCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Sensor not found' });
    }
    const sensor = sensorCheck.rows[0];

    // Check permissions: admins can do anything, users can only edit their own devices' sensors
    if (req.user.role !== 'admin') {
      const devCheck = await db.query('SELECT created_by FROM devices WHERE id = $1', [sensor.device_id]);
      if (devCheck.rows.length === 0 || devCheck.rows[0].created_by !== req.user.id) {
        return res.status(403).json({ error: 'Access denied to this sensor' });
      }
    }

    // Validate physical limits for max_value (threshold) if provided
    if (max_value !== undefined) {
      const errorMsg = validatePhysicalLimits(sensor.type, max_value);
      if (errorMsg) {
        return res.status(400).json({ error: errorMsg });
      }
    }

    // Validate physical limits for current_value if provided
    if (current_value !== undefined) {
      const errorMsg = validatePhysicalLimits(sensor.type, current_value);
      if (errorMsg) {
        return res.status(400).json({ error: errorMsg });
      }
    }

    const updatedName = name || sensor.name;
    const updatedUnit = unit || sensor.unit;
    const updatedMax = max_value !== undefined ? parseFloat(max_value) : sensor.max_value;
    const updatedCurr = current_value !== undefined ? parseFloat(current_value) : sensor.current_value;

    if (updatedCurr > updatedMax) {
      const devRes = await db.query('SELECT created_by FROM devices WHERE id = $1', [sensor.device_id]);
      const createdBy = devRes.rows[0]?.created_by || 1;
      await triggerInstantAlertForExceededValue(createdBy, sensor.device_id, id, sensor.type, updatedName, updatedUnit, updatedMax, updatedCurr);
      return res.status(400).json({ error: 'You cannot exceed the maximum allowed value.' });
    }

    await db.query(
      'UPDATE sensors SET name = $1, unit = $2, max_value = $3, current_value = $4, last_updated = CURRENT_TIMESTAMP WHERE id = $5',
      [updatedName, updatedUnit, updatedMax, updatedCurr, id]
    );
    await firebaseService.syncFirestoreSensor(id, {
      id,
      name: updatedName,
      unit: updatedUnit,
      max_value: updatedMax,
      current_value: updatedCurr
    });
    if (global.broadcastTelemetryData) {
      global.broadcastTelemetryData();
    }

    // If current value changed, log reading and re-evaluate threshold
    if (current_value !== undefined) {
      await db.query('INSERT INTO sensor_readings (sensor_id, value) VALUES ($1, $2)', [id, updatedCurr]);
      
      // Get device details to pass to threshold checker
      const devRes = await db.query('SELECT created_by FROM devices WHERE id = $1', [sensor.device_id]);
      const createdBy = devRes.rows[0]?.created_by || 1;
      
      await checkSensorThreshold(
        id, 
        sensor.device_id, 
        sensor.type, 
        updatedName, 
        updatedUnit, 
        updatedMax, 
        updatedCurr, 
        createdBy
      );
    }

    await logAudit(req.user.id, 'Update Sensor', `Sensor ${id} settings updated.`);
    res.json({ message: 'Sensor settings updated successfully' });
  } catch (err) {
    console.error('Update sensor error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Remove sensor
router.delete('/sensors/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const sensorCheck = await db.query('SELECT * FROM sensors WHERE id = $1', [id]);
    if (sensorCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Sensor not found' });
    }
    const sensor = sensorCheck.rows[0];

    // Check permissions: admins can do anything, users can only delete their own devices' sensors
    if (req.user.role !== 'admin') {
      const devCheck = await db.query('SELECT created_by FROM devices WHERE id = $1', [sensor.device_id]);
      if (devCheck.rows.length === 0 || devCheck.rows[0].created_by !== req.user.id) {
        return res.status(403).json({ error: 'Access denied to this sensor' });
      }
    }

    // Cascade delete sensor readings
    await db.query('DELETE FROM sensor_readings WHERE sensor_id = $1', [id]);
    // Cascade delete active alerts for this sensor
    await db.query('DELETE FROM alerts WHERE sensor_id = $1', [id]);
    // Delete the sensor itself
    await db.query('DELETE FROM sensors WHERE id = $1', [id]);

    await logAudit(req.user.id, 'Delete Sensor', `Sensor ${id} deleted.`);
    res.json({ message: 'Sensor deleted successfully' });
  } catch (err) {
    console.error('Delete sensor error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------------------------------------------
// ALERTS SYSTEM
// ----------------------------------------------------


// Get Alert Logs
router.get('/alerts', authenticateToken, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query(
        'SELECT a.*, d.name as device_name, d.id as device_id, u.name as resolved_by_name FROM alerts a JOIN devices d ON a.device_id = d.id LEFT JOIN users u ON a.resolved_by = u.id ORDER BY a.timestamp DESC LIMIT 100'
      );
    } else {
      result = await db.query(
        'SELECT a.*, d.name as device_name, d.id as device_id, u.name as resolved_by_name FROM alerts a JOIN devices d ON a.device_id = d.id LEFT JOIN users u ON a.resolved_by = u.id WHERE d.created_by = $1 ORDER BY a.timestamp DESC LIMIT 100',
        [req.user.id]
      );
    }
    const alerts = result.rows.map(row => {
      const diagnostics = emailService.getDiagnosticsForAlert(row.message || '');
      return {
        ...row,
        possible_causes: diagnostics.cause,
        recommended_actions: diagnostics.recommendation
      };
    });
    res.json(alerts);
  } catch (err) {
    console.error('Fetch alerts error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Acknowledge Alert
router.put('/alerts/:id/acknowledge', authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    // Check ownership
    const alertResult = await db.query('SELECT * FROM alerts WHERE id = $1', [id]);
    if (alertResult.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    const alert = alertResult.rows[0];

    if (req.user.role !== 'admin') {
      const devCheck = await db.query('SELECT created_by FROM devices WHERE id = $1', [alert.device_id]);
      if (devCheck.rows[0].created_by !== req.user.id) {
        return res.status(403).json({ error: 'Permission denied to acknowledge this alert' });
      }
    }

    await db.query(
      "UPDATE alerts SET status = 'resolved', resolved_at = CURRENT_TIMESTAMP WHERE id = $1",
      [id]
    );

    await logAudit(req.user.id, 'Acknowledge Alert', `Alert ID ${id} resolved.`);
    res.json({ message: 'Alert acknowledged successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Resolve Alert with Notes and Email Dispatch
router.put('/alerts/:id/resolve', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { resolution_notes: reqNotes } = req.body;

  const resolution_notes = reqNotes || `Resolved by ${req.user.name || 'User'}`;
  const notes = resolution_notes;

  try {
    const alertResult = await db.query(
      'SELECT a.*, d.name as device_name, d.created_by as device_owner, s.type as sensor_type, s.name as sensor_name FROM alerts a JOIN devices d ON a.device_id = d.id LEFT JOIN sensors s ON a.sensor_id = s.id WHERE a.id = $1',
      [id]
    );
    if (alertResult.rows.length === 0) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    const alert = alertResult.rows[0];

    if (req.user.role !== 'admin') {
      if (alert.device_owner !== req.user.id) {
        return res.status(403).json({ error: 'Permission denied to resolve this alert' });
      }
    }

    const resolvedTime = new Date();

    // Update alerts status, resolved_by, resolved_at and resolution_notes
    await db.query(
      "UPDATE alerts SET status = 'resolved', resolved_at = $1, resolved_by = $2, resolution_notes = $3 WHERE id = $4",
      [resolvedTime, req.user.id, notes, id]
    );
    await firebaseService.syncFirestoreAlert(id, {
      status: 'resolved',
      resolved_at: resolvedTime.toISOString(),
      resolved_by: req.user.id,
      resolution_notes: notes
    });

    // Record resolution notes in timeline history logs
    await db.query(
      'INSERT INTO alert_notes (alert_id, user_id, user_name, note) VALUES ($1, $2, $3, $4)',
      [id, req.user.id, req.user.name || 'User', `Alert resolved. Notes: ${notes}`]
    );

    // Save resolving notification to Notification History with Resolved status
    const histId = `hist_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    const resolvedByName = req.user.name || 'Authenticated User';
    await db.query(
      `INSERT INTO notification_history (id, user_id, device_name, sensor_name, timestamp, alert_type, status, resolved_at, resolved_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        histId, 
        alert.device_owner || req.user.id, 
        alert.device_name || 'SYSTEM', 
        alert.sensor_name || alert.sensor_type || 'N/A', 
        resolvedTime.toISOString(), 
        alert.level || 'warning', 
        'resolved',
        resolvedTime.toISOString(),
        resolvedByName
      ]
    );

    await logAudit(req.user.id, 'Resolve Alert', `Alert ID ${id} resolved. Notes: ${resolution_notes}`);

    // Fetch email of device owner to notify them
    const deviceOwnerId = alert.device_owner || req.user.id;
    const ownerRes = await db.query('SELECT email, name, fcm_token FROM users WHERE id = $1', [deviceOwnerId]);
    const owner = ownerRes.rows[0];
    const ownerEmail = owner ? owner.email : req.user.email;
    const ownerName = owner ? owner.name : req.user.name;

    const resolutionSubject = 'Sansah Innovations: Issue Resolved Successfully';
    const resolutionMsg = `Hello ${ownerName},

This is to notify you that the active alert on device "${alert.device_name || 'SYSTEM'}" has been successfully resolved.

Alert Details:
- Device Name: ${alert.device_name || 'SYSTEM'}
- Device ID: ${alert.device_id}
- Sensor Name: ${alert.sensor_name || alert.sensor_type || 'N/A'}
- Problem: ${alert.message}
- Resolution: ${resolution_notes}
- Resolution Time: ${resolvedTime.toLocaleString()}

If you have any further issues, please check the dashboard settings or contact our support team.

Best regards,
Sansah Innovations Team`;

    emailService.sendResolutionEmail(ownerEmail, {
      deviceName: alert.device_name,
      sensorName: alert.sensor_name || alert.sensor_type,
      resolutionNotes: resolution_notes,
      resolvedBy: req.user.name || 'Admin',
      resolvedTime: resolvedTime.toLocaleString()
    }, deviceOwnerId, id).catch(err => {
      console.error('Resolution email dispatch crash:', err.message);
    });

    // Send FCM notification on alert resolution
    if (owner && owner.fcm_token) {
      const resolutionBody = `The active alert on device "${alert.device_name || 'SYSTEM'}" has been resolved by ${req.user.name || 'Admin'}.`;
      firebaseService.sendFcmNotification(
        owner.fcm_token,
        'Sansah Alert: Issue Resolved',
        resolutionBody,
        {
          alertId: id,
          status: 'resolved'
        }
      ).catch(err => {
        console.error('Resolution FCM dispatch error:', err.message);
      });
    }

    res.json({ message: 'Alert resolved successfully and resolution email dispatched' });
  } catch (err) {
    console.error('Alert resolution route error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------------------------------------------
// GPS & GEOFENCING APIs
// ----------------------------------------------------

// Get all geofences
router.get('/geofences', authenticateToken, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM geofences ORDER BY id ASC');
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create geofence
router.post('/geofences', authenticateToken, async (req, res) => {
  const { id, name, lat, lng, radius, color } = req.body;

  if (!name || !lat || !lng || !radius) {
    return res.status(400).json({ error: 'Name, Latitude, Longitude, and Radius are required' });
  }

  const generatedId = id || `fence_${Date.now()}`;

  try {
    await db.query(
      'INSERT INTO geofences (id, name, lat, lng, radius, color, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [generatedId, name, parseFloat(lat), parseFloat(lng), parseFloat(radius), color || '#00b0ff', req.user.id]
    );
    await logAudit(req.user.id, 'Create Geofence', `Geofence created: ${name} (R:${radius}m)`);
    res.status(201).json({ message: 'Geofence created successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete geofence
router.delete('/geofences/:id', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query('DELETE FROM geofences WHERE id = $1', [id]);
    await logAudit(req.user.id, 'Delete Geofence', `Geofence ${id} deleted.`);
    res.json({ message: 'Geofence deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get device GPS trail history
router.get('/gps/history/:deviceId', authenticateToken, async (req, res) => {
  const { deviceId } = req.params;
  try {
    if (req.user.role !== 'admin') {
      const devCheck = await db.query('SELECT created_by FROM devices WHERE id = $1', [deviceId]);
      if (devCheck.rows.length === 0 || devCheck.rows[0].created_by !== req.user.id) {
        return res.status(403).json({ error: 'Access denied to this device' });
      }
    }
    const result = await db.query(
      'SELECT lat, lng, speed, distance, timestamp FROM gps_tracking WHERE device_id = $1 ORDER BY id DESC LIMIT 30',
      [deviceId]
    );
    res.json(result.rows.reverse());
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get notification Logs
router.get('/notifications', authenticateToken, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query(
        'SELECT n.*, a.message, u.name as user_name FROM notifications n JOIN alerts a ON n.alert_id = a.id LEFT JOIN users u ON n.user_id = u.id ORDER BY n.sent_at DESC LIMIT 100'
      );
    } else {
      result = await db.query(
        'SELECT n.*, a.message, u.name as user_name FROM notifications n JOIN alerts a ON n.alert_id = a.id LEFT JOIN users u ON n.user_id = u.id WHERE n.user_id = $1 ORDER BY n.sent_at DESC LIMIT 100',
        [req.user.id]
      );
    }
    const notifications = result.rows.map(row => {
      const diagnostics = emailService.getDiagnosticsForAlert(row.message || '');
      return {
        ...row,
        possible_causes: diagnostics.cause,
        recommended_actions: diagnostics.recommendation
      };
    });
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ----------------------------------------------------
// REPORTS EXPORT (PDF & CSV)
// ----------------------------------------------------

// Export CSV Report
router.get('/reports/export/csv', authenticateToken, async (req, res) => {
  const { reportType } = req.query;
  try {
    let csv = '';
    let filename = `sansah_report_${reportType || 'alerts'}_${Date.now()}.csv`;
    
    if (reportType === 'device_performance') {
      csv = 'Device ID,Name,Hardware,Location,Category,Status,Uptime %,Health Score,Signal Strength (dBm),Battery,Last Communication\r\n';
      const q = req.user.role === 'admin' ? 
        'SELECT * FROM devices ORDER BY id ASC' : 
        'SELECT * FROM devices WHERE created_by = $1 ORDER BY id ASC';
      const params = req.user.role === 'admin' ? [] : [req.user.id];
      const result = await db.query(q, params);
      result.rows.forEach(r => {
        csv += `"${r.id}","${r.name}","${r.hardware_type}","${r.location}","${r.category || 'N/A'}","${r.connected ? 'ONLINE' : 'OFFLINE'}","${r.uptime_percent || 100.0}%","${r.health_score || 100.0}","${r.signal_strength || -70}dBm","${r.battery}%","${r.last_communication || 'N/A'}"\r\n`;
      });
    } else if (reportType === 'user_activity') {
      csv = 'Log ID,Timestamp,User ID,Action,Details\r\n';
      const q = req.user.role === 'admin' ?
        'SELECT * FROM audit_logs ORDER BY timestamp DESC' :
        'SELECT * FROM audit_logs WHERE user_id = $1 ORDER BY timestamp DESC';
      const params = req.user.role === 'admin' ? [] : [req.user.id];
      const result = await db.query(q, params);
      result.rows.forEach(r => {
        csv += `"${r.id}","${r.timestamp}","${r.user_id}","${r.action}","${(r.details || '').replace(/"/g, '""')}"\r\n`;
      });
    } else if (reportType === 'sensor_analytics') {
      csv = 'Sensor ID,Device ID,Type,Name,Unit,Threshold Max,Current Value,Status,Last Updated\r\n';
      const q = req.user.role === 'admin' ?
        'SELECT s.* FROM sensors s' :
        'SELECT s.* FROM sensors s JOIN devices d ON s.device_id = d.id WHERE d.created_by = $1';
      const params = req.user.role === 'admin' ? [] : [req.user.id];
      const result = await db.query(q, params);
      result.rows.forEach(r => {
        csv += `"${r.id}","${r.device_id}","${r.type}","${r.name}","${r.unit}","${r.max_value}","${r.current_value}","${r.status}","${r.last_updated}"\r\n`;
      });
    } else if (reportType === 'system_health') {
      csv = 'Metric,Value\r\n';
      const statsQ = await db.query(`
        SELECT 
          (SELECT COUNT(*) FROM devices) as total_devices,
          (SELECT COUNT(*) FROM devices WHERE connected = 1 OR connected = true) as online_devices,
          (SELECT COUNT(*) FROM devices WHERE connected = 0 OR connected = false) as offline_devices,
          (SELECT AVG(health_score) FROM devices) as avg_health
      `);
      const s = statsQ.rows[0];
      csv += `"Total Devices","${s.total_devices}"\r\n`;
      csv += `"Online Devices","${s.online_devices}"\r\n`;
      csv += `"Offline Devices","${s.offline_devices}"\r\n`;
      csv += `"Average Health Score","${parseFloat(s.avg_health || 0).toFixed(1)}%"\r\n`;
    } else if (reportType === 'monthly_operations') {
      csv = 'Operational Item,Count\r\n';
      const statsQ = await db.query(`
        SELECT 
          (SELECT COUNT(*) FROM alerts) as total_alerts,
          (SELECT COUNT(*) FROM alerts WHERE status = 'active') as active_alerts,
          (SELECT COUNT(*) FROM alerts WHERE status = 'resolved') as resolved_alerts,
          (SELECT COUNT(*) FROM notifications) as total_notifs,
          (SELECT COUNT(*) FROM notifications WHERE status = 'failed') as failed_notifs
      `);
      const s = statsQ.rows[0];
      csv += `"Total Incidents Logged","${s.total_alerts}"\r\n`;
      csv += `"Active Incidents","${s.active_alerts}"\r\n`;
      csv += `"Resolved Incidents","${s.resolved_alerts}"\r\n`;
      csv += `"Notifications Sent","${s.total_notifs}"\r\n`;
      csv += `"Failed Notifications","${s.failed_notifs}"\r\n`;
    } else { 
      csv = 'Timestamp,Device ID,Device Name,Source/Sensor,Severity,Message,Status,Assigned To,Possible Causes,Recommended Actions\r\n';
      const q = req.user.role === 'admin' ?
        'SELECT a.*, d.name as device_name, COALESCE(a.sensor_id, a.geofence_id, \'System\') AS source_name FROM alerts a JOIN devices d ON a.device_id = d.id ORDER BY a.timestamp DESC' :
        'SELECT a.*, d.name as device_name, COALESCE(a.sensor_id, a.geofence_id, \'System\') AS source_name FROM alerts a JOIN devices d ON a.device_id = d.id WHERE d.created_by = $1 ORDER BY a.timestamp DESC';
      const params = req.user.role === 'admin' ? [] : [req.user.id];
      const result = await db.query(q, params);
      result.rows.forEach(r => {
        const diagnostics = emailService.getDiagnosticsForAlert(r.message || '');
        csv += `"${r.timestamp}","${r.device_id}","${r.device_name}","${r.source_name}","${r.level.toUpperCase()}","${r.message.replace(/"/g, '""')}","${r.status}","${r.assigned_to_name || 'Unassigned'}","${diagnostics.cause.replace(/"/g, '""')}","${diagnostics.recommendation.replace(/"/g, '""')}"\r\n`;
      });
    }

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    res.status(200).send(csv);
    await logAudit(req.user.id, 'Export CSV Report', `Exported CSV report for type: ${reportType || 'alerts'}`);
  } catch (err) {
    console.error('CSV export failed:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Export Professional PDF Report
router.get('/reports/export/pdf', authenticateToken, async (req, res) => {
  const { reportType } = req.query;
  try {
    let reportTitle = 'Incident History Log';
    let dataRows = [];
    
    if (reportType === 'device_performance') {
      reportTitle = 'Device Performance Report';
      const q = req.user.role === 'admin' ? 
        'SELECT * FROM devices ORDER BY id ASC' : 
        'SELECT * FROM devices WHERE created_by = $1 ORDER BY id ASC';
      const params = req.user.role === 'admin' ? [] : [req.user.id];
      const dbRes = await db.query(q, params);
      dataRows = dbRes.rows;
    } else if (reportType === 'user_activity') {
      reportTitle = 'User Activity Audit Report';
      const q = req.user.role === 'admin' ?
        'SELECT a.*, u.name as user_name FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.timestamp DESC LIMIT 50' :
        'SELECT a.*, u.name as user_name FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id WHERE a.user_id = $1 ORDER BY a.timestamp DESC LIMIT 50';
      const params = req.user.role === 'admin' ? [] : [req.user.id];
      const dbRes = await db.query(q, params);
      dataRows = dbRes.rows;
    } else if (reportType === 'sensor_analytics') {
      reportTitle = 'Sensor Analytics Report';
      const q = req.user.role === 'admin' ?
        'SELECT s.*, d.name as device_name FROM sensors s JOIN devices d ON s.device_id = d.id' :
        'SELECT s.*, d.name as device_name FROM sensors s JOIN devices d ON s.device_id = d.id WHERE d.created_by = $1';
      const params = req.user.role === 'admin' ? [] : [req.user.id];
      const dbRes = await db.query(q, params);
      dataRows = dbRes.rows;
    } else if (reportType === 'system_health') {
      reportTitle = 'System Health & Diagnostics Report';
      const q = req.user.role === 'admin' ? 
        'SELECT * FROM devices ORDER BY id ASC' : 
        'SELECT * FROM devices WHERE created_by = $1 ORDER BY id ASC';
      const params = req.user.role === 'admin' ? [] : [req.user.id];
      const dbRes = await db.query(q, params);
      dataRows = dbRes.rows;
    } else if (reportType === 'monthly_operations') {
      reportTitle = 'Monthly Operations Overview';
      const q = req.user.role === 'admin' ?
        'SELECT a.*, d.name as device_name FROM alerts a JOIN devices d ON a.device_id = d.id ORDER BY a.timestamp DESC LIMIT 50' :
        'SELECT a.*, d.name as device_name FROM alerts a JOIN devices d ON a.device_id = d.id WHERE d.created_by = $1 ORDER BY a.timestamp DESC LIMIT 50';
      const params = req.user.role === 'admin' ? [] : [req.user.id];
      const dbRes = await db.query(q, params);
      dataRows = dbRes.rows;
    } else { 
      reportTitle = 'Alert Summary & Incident Report';
      const q = req.user.role === 'admin' ?
        'SELECT a.*, d.name as device_name FROM alerts a JOIN devices d ON a.device_id = d.id ORDER BY a.timestamp DESC LIMIT 50' :
        'SELECT a.*, d.name as device_name FROM alerts a JOIN devices d ON a.device_id = d.id WHERE d.created_by = $1 ORDER BY a.timestamp DESC LIMIT 50';
      const params = req.user.role === 'admin' ? [] : [req.user.id];
      const dbRes = await db.query(q, params);
      dataRows = dbRes.rows;
    }

    const doc = new PDFDocument({ margin: 50, size: 'A4', bufferPages: true });
    const buffers = [];
    doc.on('data', chunk => buffers.push(chunk));
    doc.on('end', async () => {
      try {
        const pdfData = Buffer.concat(buffers);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', pdfData.length);
        res.setHeader('Content-Disposition', `attachment; filename=sansah_report_${reportType || 'alerts'}_${Date.now()}.pdf`);
        res.status(200).send(pdfData);
        await logAudit(req.user.id, 'Export PDF Report', `Exported PDF report for type: ${reportType || 'alerts'}`);
      } catch (err) {
        console.error('PDF response finalization failed:', err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Internal PDF engine error' });
        }
      }
    });
    
    doc.fillColor('#1a2530').fontSize(24).font('Helvetica-Bold').text('SANSAH INNOVATIONS');
    doc.fontSize(10).font('Helvetica').fillColor('#7f8c8d').text('Enterprise IoT Operations Control Platform', { lineGap: 15 });
    doc.rect(50, 95, 495, 4).fillColor('#00b0ff').fill();
    doc.moveDown(2);
    
    doc.fillColor('#2c3e50').fontSize(14).font('Helvetica-Bold').text(reportTitle);
    doc.fontSize(9).font('Helvetica').fillColor('#7f8c8d')
       .text(`Generated on: ${new Date().toLocaleString()}`)
       .text(`Requested by: ${req.user.name} (${req.user.email})`)
       .text(`Access Scope: ${req.user.role.toUpperCase()} LEVEL`);
    doc.moveDown(1.5);
    
    let currentY = 180;
    
    if (reportType === 'device_performance' || reportType === 'system_health') {
      doc.rect(50, currentY, 495, 20).fillColor('#2c3e50').fill();
      doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold');
      doc.text('Device ID', 55, currentY + 6);
      doc.text('Name', 140, currentY + 6);
      doc.text('Category', 280, currentY + 6);
      doc.text('Uptime', 350, currentY + 6);
      doc.text('Health', 410, currentY + 6);
      doc.text('Battery', 470, currentY + 6);
      currentY += 20;

      dataRows.forEach((r, idx) => {
        if (currentY > 750) {
          doc.addPage();
          currentY = 50;
          doc.rect(50, currentY, 495, 20).fillColor('#2c3e50').fill();
          doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold');
          doc.text('Device ID', 55, currentY + 6);
          doc.text('Name', 140, currentY + 6);
          doc.text('Category', 280, currentY + 6);
          doc.text('Uptime', 350, currentY + 6);
          doc.text('Health', 410, currentY + 6);
          doc.text('Battery', 470, currentY + 6);
          currentY += 20;
        }
        
        doc.rect(50, currentY, 495, 18).fillColor(idx % 2 === 0 ? '#fcfcfc' : '#f3f4f6').fill();
        doc.fillColor('#2c3e50').font('Helvetica').fontSize(8);
        doc.text(String(r.id || ''), 55, currentY + 5);
        doc.text(String(r.name || 'Unnamed Device').substring(0, 25), 140, currentY + 5);
        doc.text(String(r.category || 'N/A'), 280, currentY + 5);
        doc.text(`${r.uptime_percent !== undefined ? r.uptime_percent : 100.0}%`, 350, currentY + 5);
        doc.text(`${r.health_score !== undefined ? r.health_score : 100.0}%`, 410, currentY + 5);
        doc.text(`${r.battery !== undefined ? r.battery : 100}%`, 470, currentY + 5);
        currentY += 18;
      });
    } else if (reportType === 'user_activity') {
      doc.rect(50, currentY, 495, 20).fillColor('#2c3e50').fill();
      doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold');
      doc.text('Timestamp', 55, currentY + 6);
      doc.text('User', 160, currentY + 6);
      doc.text('Action', 240, currentY + 6);
      doc.text('Details', 340, currentY + 6);
      currentY += 20;

      dataRows.forEach((r, idx) => {
        if (currentY > 750) {
          doc.addPage();
          currentY = 50;
          doc.rect(50, currentY, 495, 20).fillColor('#2c3e50').fill();
          doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold');
          doc.text('Timestamp', 55, currentY + 6);
          doc.text('User', 160, currentY + 6);
          doc.text('Action', 240, currentY + 6);
          doc.text('Details', 340, currentY + 6);
          currentY += 20;
        }

        doc.rect(50, currentY, 495, 18).fillColor(idx % 2 === 0 ? '#fcfcfc' : '#f3f4f6').fill();
        doc.fillColor('#2c3e50').font('Helvetica').fontSize(8);
        doc.text(r.timestamp ? new Date(r.timestamp).toLocaleString() : 'N/A', 55, currentY + 5);
        doc.text(String(r.user_name || 'System'), 160, currentY + 5);
        doc.text(String(r.action || ''), 240, currentY + 5);
        doc.text(String(r.details || '').substring(0, 35), 340, currentY + 5);
        currentY += 18;
      });
    } else if (reportType === 'sensor_analytics') {
      doc.rect(50, currentY, 495, 20).fillColor('#2c3e50').fill();
      doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold');
      doc.text('Sensor ID', 55, currentY + 6);
      doc.text('Device Name', 160, currentY + 6);
      doc.text('Type', 280, currentY + 6);
      doc.text('Value', 380, currentY + 6);
      doc.text('Status', 450, currentY + 6);
      currentY += 20;

      dataRows.forEach((r, idx) => {
        if (currentY > 750) {
          doc.addPage();
          currentY = 50;
          doc.rect(50, currentY, 495, 20).fillColor('#2c3e50').fill();
          doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold');
          doc.text('Sensor ID', 55, currentY + 6);
          doc.text('Device Name', 160, currentY + 6);
          doc.text('Type', 280, currentY + 6);
          doc.text('Value', 380, currentY + 6);
          doc.text('Status', 450, currentY + 6);
          currentY += 20;
        }

        doc.rect(50, currentY, 495, 18).fillColor(idx % 2 === 0 ? '#fcfcfc' : '#f3f4f6').fill();
        doc.fillColor('#2c3e50').font('Helvetica').fontSize(8);
        doc.text(String(r.id || ''), 55, currentY + 5);
        doc.text(String(r.device_name || 'Unnamed').substring(0, 20), 160, currentY + 5);
        doc.text(String(r.type || ''), 280, currentY + 5);
        doc.text(`${r.current_value !== undefined ? r.current_value : 0} ${String(r.unit || '')}`, 380, currentY + 5);
        doc.text(String(r.status || 'ONLINE').toUpperCase(), 450, currentY + 5);
        currentY += 18;
      });
    } else { 
      doc.rect(50, currentY, 495, 20).fillColor('#2c3e50').fill();
      doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold');
      doc.text('Timestamp', 55, currentY + 6);
      doc.text('Device Name', 140, currentY + 6);
      doc.text('Severity', 250, currentY + 6);
      doc.text('Message & Diagnostics', 320, currentY + 6);
      currentY += 20;

      dataRows.forEach((r, idx) => {
        const messageText = r.message || '';
        const isThreshold = messageText.includes('reading:') || messageText.includes('exceeded threshold');
        const diagnostics = emailService.getDiagnosticsForAlert(messageText);
        
        const rowHeight = isThreshold ? 32 : 18;

        if (currentY + rowHeight > 750) {
          doc.addPage();
          currentY = 50;
          doc.rect(50, currentY, 495, 20).fillColor('#2c3e50').fill();
          doc.fillColor('#ffffff').fontSize(8.5).font('Helvetica-Bold');
          doc.text('Timestamp', 55, currentY + 6);
          doc.text('Device Name', 140, currentY + 6);
          doc.text('Severity', 250, currentY + 6);
          doc.text('Message & Diagnostics', 320, currentY + 6);
          currentY += 20;
        }

        doc.rect(50, currentY, 495, rowHeight).fillColor(idx % 2 === 0 ? '#fcfcfc' : '#f3f4f6').fill();
        doc.fillColor('#2c3e50').font('Helvetica').fontSize(8);
        doc.text(r.timestamp ? new Date(r.timestamp).toLocaleString() : 'N/A', 55, currentY + 5);
        doc.text(String(r.device_name || 'Unnamed').substring(0, 20), 140, currentY + 5);
        doc.text(String(r.level || 'WARNING').toUpperCase(), 250, currentY + 5);
        doc.text(String(messageText).substring(0, 50), 320, currentY + 5);
        
        if (isThreshold) {
          doc.fillColor('#7f8c8d').fontSize(7);
          doc.text(`Diag: ${diagnostics.cause} | Actions: ${diagnostics.recommendation}`, 320, currentY + 16, { width: 220, height: 14 });
        }
        currentY += rowHeight;
      });
    }

    const pageCount = doc.bufferedPageRange().count;
    for (let i = 0; i < pageCount; i++) {
      doc.switchToPage(i);
      doc.rect(50, 790, 495, 1).fillColor('#bdc3c7').fill();
      doc.fillColor('#7f8c8d').fontSize(7.5).font('Helvetica');
      doc.text('Sansah Innovations IoT System Report | Confidential', 50, 800);
      doc.text(`Page ${i + 1} of ${pageCount}`, 500, 800);
    }

    doc.end();
  } catch (err) {
    console.error('PDF export failed:', err.message);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal PDF engine error' });
    }
  }
});

// ----------------------------------------------------
// NEW ENTERPRISE APIs
// ----------------------------------------------------

// 1. Alert Notes APIs
router.post('/alerts/:id/notes', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { note } = req.body;
  if (!note) {
    return res.status(400).json({ error: 'Note content is required' });
  }
  try {
    if (req.user.role !== 'admin') {
      const alertCheck = await db.query(
        'SELECT d.created_by FROM alerts a JOIN devices d ON a.device_id = d.id WHERE a.id = $1',
        [id]
      );
      if (alertCheck.rows.length === 0 || alertCheck.rows[0].created_by !== req.user.id) {
        return res.status(403).json({ error: 'Access denied to this alert' });
      }
    }
    await db.query(
      'INSERT INTO alert_notes (alert_id, user_id, user_name, note) VALUES ($1, $2, $3, $4)',
      [id, req.user.id, req.user.name || 'User', note]
    );
    await logAudit(req.user.id, 'Add Alert Note', `Added note to alert ${id}.`);
    res.status(201).json({ message: 'Note added successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/alerts/:id/notes', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    if (req.user.role !== 'admin') {
      const alertCheck = await db.query(
        'SELECT d.created_by FROM alerts a JOIN devices d ON a.device_id = d.id WHERE a.id = $1',
        [id]
      );
      if (alertCheck.rows.length === 0 || alertCheck.rows[0].created_by !== req.user.id) {
        return res.status(403).json({ error: 'Access denied to this alert' });
      }
    }
    const notes = await db.query('SELECT * FROM alert_notes WHERE alert_id = $1 ORDER BY created_at ASC', [id]);
    res.json(notes.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 2. Alert Assignment API
router.put('/alerts/:id/assign', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { assigned_to, assigned_to_name } = req.body;
  try {
    if (req.user.role !== 'admin') {
      const alertCheck = await db.query(
        'SELECT d.created_by FROM alerts a JOIN devices d ON a.device_id = d.id WHERE a.id = $1',
        [id]
      );
      if (alertCheck.rows.length === 0 || alertCheck.rows[0].created_by !== req.user.id) {
        return res.status(403).json({ error: 'Access denied to this alert' });
      }
    }
    await db.query(
      'UPDATE alerts SET assigned_to = $1, assigned_to_name = $2 WHERE id = $3',
      [assigned_to, assigned_to_name, id]
    );
    await db.query(
      'INSERT INTO alert_notes (alert_id, user_id, user_name, note) VALUES ($1, $2, $3, $4)',
      [id, 1, 'System', `Alert assigned to ${assigned_to_name || 'user ID ' + assigned_to}.`]
    );
    await logAudit(req.user.id, 'Assign Alert', `Assigned alert ${id} to ${assigned_to_name}.`);
    res.json({ message: 'Alert assigned successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 3. Notification Center APIs
router.put('/notifications/:id/read', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    await db.query("UPDATE notifications SET read_status = 1, status = 'opened' WHERE id = $1", [id]);
    res.json({ message: 'Notification marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/notifications/read-all', authenticateToken, async (req, res) => {
  try {
    await db.query("UPDATE notifications SET read_status = 1, status = 'opened' WHERE user_id = $1", [req.user.id]);
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notifications/history (Permanent archived notification history)
router.get('/notifications/history', authenticateToken, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query('SELECT * FROM notification_history ORDER BY timestamp DESC LIMIT 100');
    } else {
      result = await db.query('SELECT * FROM notification_history WHERE user_id = $1 ORDER BY timestamp DESC LIMIT 100', [req.user.id]);
    }
    res.json(result.rows);
  } catch (err) {
    console.error('Fetch notification history error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/notifications/history/:id (Delete archived notification history entry)
router.delete('/notifications/history/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { force } = req.query;
  try {
    const histCheck = await db.query('SELECT * FROM notification_history WHERE id = $1', [id]);
    if (histCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Notification history record not found' });
    }
    const record = histCheck.rows[0];
    if (req.user.role !== 'admin' && record.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    if (force === 'true' || record.status === 'deleted') {
      await db.query('DELETE FROM notification_history WHERE id = $1', [id]);
      await logAudit(req.user.id, 'Delete Notification History', `Permanently deleted archived notification history record ${id}`);
      res.json({ message: 'Notification history record permanently deleted' });
    } else {
      await db.query("UPDATE notification_history SET status = 'deleted' WHERE id = $1", [id]);
      await logAudit(req.user.id, 'Soft Delete Notification History', `Soft deleted archived notification history record ${id}`);
      res.json({ message: 'Notification history record deleted successfully' });
    }
  } catch (err) {
    console.error('Delete notification history error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/notifications/history/:id/restore (Restore soft deleted notification history entry)
router.put('/notifications/history/:id/restore', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const histCheck = await db.query('SELECT * FROM notification_history WHERE id = $1', [id]);
    if (histCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Notification history record not found' });
    }
    const record = histCheck.rows[0];
    if (req.user.role !== 'admin' && record.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Access denied' });
    }
    await db.query("UPDATE notification_history SET status = 'sent' WHERE id = $1", [id]);
    await logAudit(req.user.id, 'Restore Notification History', `Restored soft deleted notification history record ${id}`);
    res.json({ message: 'Notification history record restored successfully' });
  } catch (err) {
    console.error('Restore notification history error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/notifications/:id/track-open (Tracking Pixel)
router.get('/notifications/:id/track-open', async (req, res) => {
  try {
    await db.query("UPDATE notifications SET status = 'opened' WHERE id = $1", [req.params.id]);
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, {
      'Content-Type': 'image/gif',
      'Content-Length': pixel.length,
      'Cache-Control': 'no-store, no-cache, must-revalidate, private'
    });
    res.end(pixel);
  } catch (err) {
    console.error('Tracking pixel error:', err.message);
    const pixel = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
    res.writeHead(200, { 'Content-Type': 'image/gif' });
    res.end(pixel);
  }
});

// DELETE /api/notifications/:id (Archive active notification)
router.delete('/notifications/:id', authenticateToken, async (req, res) => {
  try {
    const notifRes = await db.query('SELECT * FROM notifications WHERE id = $1', [req.params.id]);
    const notif = notifRes.rows[0];
    if (!notif) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    if (req.user.role !== 'admin' && notif.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const alertDetailsRes = await db.query(
      `SELECT a.message, a.level, a.timestamp, d.name AS device_name, s.name AS sensor_name
       FROM alerts a
       LEFT JOIN devices d ON a.device_id = d.id
       LEFT JOIN sensors s ON a.sensor_id = s.id
       WHERE a.id = $1`,
      [notif.alert_id]
    );
    const details = alertDetailsRes.rows[0] || {};

    const deviceName = details.device_name || 'N/A';
    const sensorName = details.sensor_name || 'N/A';
    const timestamp = notif.sent_at || new Date().toISOString();
    const alertType = details.level || 'warning';
    const status = notif.status || 'sent';

    const histId = `hist_${Date.now()}_${Math.floor(Math.random()*1000)}`;
    await db.query(
      `INSERT INTO notification_history (id, user_id, device_name, sensor_name, timestamp, alert_type, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [histId, notif.user_id, deviceName, sensorName, timestamp, alertType, status]
    );

    await db.query('DELETE FROM notifications WHERE id = $1', [req.params.id]);

    res.json({ message: 'Notification archived successfully', archiveId: histId });
  } catch (err) {
    console.error('Delete notification archive error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Test Notification Channel Dispatch
router.post('/notifications/test', authenticateToken, async (req, res) => {
  try {
    const userResult = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = userResult.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    let prefs = { dashboard: true, email: true, whatsapp: false, sms: false };
    try {
      if (user.preferences) {
        prefs = typeof user.preferences === 'string' ? JSON.parse(user.preferences) : user.preferences;
      }
    } catch (e) {}

    const testAlertId = `test_alert_${Date.now()}`;
    const testMessage = `TEST ALERTER: Channel verification alert triggered. Connection channels nominal for client profile: ${user.name}.`;

    // 1. Create a system alert record
    await db.query(
      "INSERT INTO alerts (id, device_id, message, level, status) VALUES ($1, 'SYSTEM', $2, 'low', 'resolved')",
      [testAlertId, testMessage]
    );

    // 2. Dispatch through enabled channels
    let sentChannels = [];

    // Dashboard channel
    if (prefs.dashboard) {
      const notifId = `notif_db_${Date.now()}_${Math.floor(Math.random()*100)}`;
      await db.query(
        'INSERT INTO notifications (id, user_id, alert_id, channel, status) VALUES ($1, $2, $3, $4, $5)',
        [notifId, user.id, testAlertId, 'dashboard', 'delivered']
      );
      sentChannels.push('Dashboard');
    }

    // Email channel
    if (prefs.email && user.email) {
      let emailStatus = 'sent';
      let errorMessage = null;
      try {
        const settings = await getSystemSettingsMap();
        const transporter = await createMailTransporter(settings);
        if (transporter) {
          const fromEmail = settings.smtp_from || process.env.SMTP_FROM || settings.smtp_user || process.env.SMTP_USER || 'support@sansah.com';
          const info = await transporter.sendMail({
            from: `"Sansah Innovations Test" <${fromEmail}>`,
            to: user.email,
            subject: 'Sansah Innovations Alert Channel Verification',
            text: testMessage
          });
          const testUrl = nodemailer.getTestMessageUrl(info);
          if (testUrl) {
            console.log(`Test notification email sent via Ethereal. Preview URL: ${testUrl}`);
          }
        } else {
          emailStatus = 'simulated';
        }
      } catch (err) {
        emailStatus = 'failed';
        errorMessage = err.message;
      }
      await db.query(
        'INSERT INTO notifications (id, user_id, alert_id, channel, status, error_message) VALUES ($1, $2, $3, $4, $5, $6)',
        [`notif_em_${Date.now()}_${Math.floor(Math.random()*100)}`, user.id, testAlertId, 'email', emailStatus, errorMessage]
      );
      if (emailStatus !== 'failed') {
        sentChannels.push('Email');
      }
    }

    // WhatsApp channel
    if (prefs.whatsapp && user.phone) {
      let waStatus = 'sent';
      let errorMessage = null;
      try {
        const settings = await getSystemSettingsMap();
        await sendWhatsAppMessage(user.phone, testMessage, settings);
      } catch (err) {
        waStatus = 'failed';
        errorMessage = err.message;
      }

      await db.query(
        'INSERT INTO notifications (id, user_id, alert_id, channel, status, error_message) VALUES ($1, $2, $3, $4, $5, $6)',
        [`notif_wa_${Date.now()}_${Math.floor(Math.random()*100)}`, user.id, testAlertId, 'whatsapp', waStatus, errorMessage]
      );
      if (waStatus === 'sent') {
        sentChannels.push('WhatsApp');
      }
    }

    // SMS channel
    if (prefs.sms && user.phone) {
      let smsStatus = 'sent';
      let errorMessage = null;
      try {
        const settings = await getSystemSettingsMap();
        await sendSMSMessage(user.phone, testMessage, settings);
      } catch (err) {
        smsStatus = 'failed';
        errorMessage = err.message;
      }

      await db.query(
        'INSERT INTO notifications (id, user_id, alert_id, channel, status, error_message) VALUES ($1, $2, $3, $4, $5, $6)',
        [`notif_sms_${Date.now()}_${Math.floor(Math.random()*100)}`, user.id, testAlertId, 'sms', smsStatus, errorMessage]
      );
      if (smsStatus === 'sent') {
        sentChannels.push('SMS');
      }
    }

    res.json({
      success: true,
      message: `Verification alerts dispatched successfully to: ${sentChannels.join(', ') || 'No channels selected'}.`
    });
  } catch (err) {
    console.error('Test notification fail:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/notifications/:id/retry', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    const result = await db.query('SELECT * FROM notifications WHERE id = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }
    const notif = result.rows[0];
    
    // Simulate retry success (90% success rate)
    const isSuccess = Math.random() > 0.1;
    if (isSuccess) {
      await db.query("UPDATE notifications SET status = 'sent', error_message = NULL WHERE id = $1", [id]);
      await logAudit(req.user.id, 'Retry Notification Success', `Successfully retried dispatching notification ${id}.`);
      res.json({ success: true, message: 'Notification resent successfully!' });
    } else {
      await db.query("UPDATE notifications SET status = 'failed', error_message = 'SMTP transport timeout on retry' WHERE id = $1", [id]);
      await logAudit(req.user.id, 'Retry Notification Failed', `Failed resending notification ${id}.`);
      res.json({ success: false, error: 'Resend dispatch failed again. Server SMTP error.' });
    }
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 4. Asset Management & Maintenance APIs
router.put('/devices/:id/asset', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { serial_number, owner_name, category, lifecycle_status, installation_date, warranty_expiry, simulated_fault } = req.body;
  try {
    if (req.user.role !== 'admin') {
      const devCheck = await db.query('SELECT created_by FROM devices WHERE id = $1', [id]);
      if (devCheck.rows.length === 0 || devCheck.rows[0].created_by !== req.user.id) {
        return res.status(403).json({ error: 'Access denied to this device' });
      }
    }
    await db.query(
      `UPDATE devices SET 
        serial_number = $1, 
        owner_name = $2, 
        category = $3, 
        lifecycle_status = $4, 
        installation_date = $5, 
        warranty_expiry = $6,
        simulated_fault = $7
       WHERE id = $8`,
      [serial_number, owner_name, category, lifecycle_status, installation_date, warranty_expiry, simulated_fault !== undefined ? parseInt(simulated_fault) : 0, id]
    );
    await logAudit(req.user.id, 'Update Asset', `Updated asset metadata for device ${id}.`);
    
    // Sync updated device details and all its sensors to Firestore
    (async () => {
      const devRes = await db.query('SELECT * FROM devices WHERE id = $1', [id]);
      const devObj = devRes.rows[0];
      const sensRes = await db.query('SELECT * FROM sensors WHERE device_id = $1', [id]);
      const sensorsList = sensRes.rows.map(s => ({
        id: s.id,
        name: s.name,
        type: s.type,
        unit: s.unit,
        current_value: s.current_value,
        max_value: s.max_value,
        status: s.status
      }));
      await firebaseService.updateFirestoreDeviceStatus(id, {
        id,
        name: devObj.name,
        hardware_type: devObj.hardware_type,
        location: devObj.location,
        communication_protocol: devObj.communication_protocol,
        max_sensor_value: devObj.max_sensor_value,
        gps_enabled: !!devObj.gps_enabled,
        created_by: devObj.created_by,
        remarks: devObj.remarks,
        category: devObj.category,
        lifecycle_status: devObj.lifecycle_status,
        connected: !!devObj.connected,
        battery: devObj.battery,
        health_score: devObj.health_score,
        uptime_percent: devObj.uptime_percent,
        serial_number: devObj.serial_number,
        owner_name: devObj.owner_name,
        installation_date: devObj.installation_date,
        warranty_expiry: devObj.warranty_expiry,
        simulated_fault: devObj.simulated_fault,
        sensors: sensorsList
      });
    })().catch(err => console.error('Device asset PUT update Firestore sync error:', err.message));

    res.json({ message: 'Asset details updated successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/devices/:id/maintenance', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { performed_by, description, cost, maintenance_date } = req.body;
  try {
    if (req.user.role !== 'admin') {
      const devCheck = await db.query('SELECT created_by FROM devices WHERE id = $1', [id]);
      if (devCheck.rows.length === 0 || devCheck.rows[0].created_by !== req.user.id) {
        return res.status(403).json({ error: 'Access denied to this device' });
      }
    }
    await db.query(
      'INSERT INTO device_maintenance (device_id, performed_by, description, cost, maintenance_date) VALUES ($1, $2, $3, $4, $5)',
      [id, performed_by, description, parseFloat(cost) || 0.0, maintenance_date]
    );
    await logAudit(req.user.id, 'Log Maintenance', `Logged maintenance log for device ${id}.`);
    res.status(201).json({ message: 'Maintenance record logged successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/devices/:id/maintenance', authenticateToken, async (req, res) => {
  const { id } = req.params;
  try {
    if (req.user.role !== 'admin') {
      const devCheck = await db.query('SELECT created_by FROM devices WHERE id = $1', [id]);
      if (devCheck.rows.length === 0 || devCheck.rows[0].created_by !== req.user.id) {
        return res.status(403).json({ error: 'Access denied to this device' });
      }
    }
    const logs = await db.query('SELECT * FROM device_maintenance WHERE device_id = $1 ORDER BY id DESC', [id]);
    res.json(logs.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 5. Audit Trail API
router.get('/audit-logs', authenticateToken, async (req, res) => {
  try {
    let result;
    if (req.user.role === 'admin') {
      result = await db.query('SELECT a.*, u.name as user_name, u.email as user_email FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.timestamp DESC LIMIT 100');
    } else {
      result = await db.query('SELECT a.*, u.name as user_name, u.email as user_email FROM audit_logs a LEFT JOIN users u ON a.user_id = u.id WHERE a.user_id = $1 ORDER BY a.timestamp DESC LIMIT 100', [req.user.id]);
    }
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 6. Global System Settings APIs
router.get('/settings', authenticateToken, async (req, res) => {
  try {
    const result = await db.query('SELECT * FROM system_settings');
    const settings = {};
    result.rows.forEach(r => { settings[r.key] = r.value; });
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/settings', authenticateToken, isAdmin, async (req, res) => {
  const settings = req.body;
  try {
    for (const [key, val] of Object.entries(settings)) {
      const check = await db.query('SELECT key FROM system_settings WHERE key = $1', [key]);
      if (check.rows.length > 0) {
        await db.query('UPDATE system_settings SET value = $1 WHERE key = $2', [String(val), key]);
      } else {
        await db.query('INSERT INTO system_settings (key, value) VALUES ($1, $2)', [key, String(val)]);
      }
    }
    await logAudit(req.user.id, 'Update System Settings', 'Modified global system setting preferences.');
    res.json({ message: 'Settings saved successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 7. Password Reset API
router.post('/auth/reset-password', async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email address is required' });
  }
  try {
    const check = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'No user registered with this email address' });
    }
    const user = check.rows[0];
    const resetToken = jwt.sign({ email }, JWT_SECRET, { expiresIn: '15m' });
    const resetLink = `http://localhost:3000/?token=${resetToken}`;
    console.log(`\n============== [PASSWORD RESET LINK] ==============`);
    console.log(`Email: ${email}`);
    console.log(`Reset Link: ${resetLink}`);
    console.log(`====================================================\n`);
    
    await logAudit(user.id, 'Password Reset Request', `Requested secure reset token for ${email}.`);
    
    // Dispatch actual email using Resend/fallback SMTP
    await emailService.sendPasswordResetEmail(email, resetLink, user.id);
    
    res.json({ 
      message: 'Password reset instructions have been sent to your email.',
      token: resetToken
    });
  } catch (err) {
    console.error('Password reset request error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 8. Password Reset Confirm API
router.post('/auth/reset-password-confirm', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) {
    return res.status(400).json({ error: 'Token and new password are required' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const email = decoded.email;
    
    const check = await db.query('SELECT id FROM users WHERE email = $1', [email]);
    if (check.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    const user = check.rows[0];
    
    const passwordHash = await bcrypt.hash(password, 10);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [passwordHash, user.id]);
    
    await logAudit(user.id, 'Confirm Password Reset', `Password reset successfully for ${email}.`);
    res.json({ message: 'Password has been reset successfully' });
  } catch (err) {
    console.error('Password reset confirm error:', err.message);
    res.status(400).json({ error: 'Invalid or expired password reset token' });
  }
});


// 9. Change Password API
router.post('/auth/change-password', authenticateToken, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required' });
  }
  try {
    const userRes = await db.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const user = userRes.rows[0];
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    const isValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isValid) {
      return res.status(400).json({ error: 'Incorrect current password' });
    }
    const newHash = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [newHash, req.user.id]);
    await logAudit(req.user.id, 'Change Password', 'User changed their password successfully.');
    res.json({ message: 'Password changed successfully' });
  } catch (err) {
    console.error('Change password error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 10. Unified Portal Search API
router.get('/search', authenticateToken, async (req, res) => {
  const q = req.query.q || '';
  if (!q) {
    return res.json({ devices: [], sensors: [], alerts: [], notifications: [], users: [] });
  }
  try {
    const isSQLite = db.getIsSQLite();
    const likeOp = isSQLite ? 'LIKE' : 'ILIKE';
    const searchParam = `%${q}%`;

    // Query Devices
    const deviceSql = req.user.role === 'admin'
      ? `SELECT * FROM devices WHERE name ${likeOp} $1 OR location ${likeOp} $1 OR id ${likeOp} $1`
      : `SELECT * FROM devices WHERE (name ${likeOp} $1 OR location ${likeOp} $1 OR id ${likeOp} $1) AND created_by = $2`;
    const deviceParams = req.user.role === 'admin' ? [searchParam] : [searchParam, req.user.id];
    const devicesRes = await db.query(deviceSql, deviceParams);

    // Query Sensors
    const sensorSql = req.user.role === 'admin'
      ? `SELECT s.* FROM sensors s WHERE s.name ${likeOp} $1 OR s.type ${likeOp} $1 OR s.id ${likeOp} $1`
      : `SELECT s.* FROM sensors s JOIN devices d ON s.device_id = d.id WHERE (s.name ${likeOp} $1 OR s.type ${likeOp} $1 OR s.id ${likeOp} $1) AND d.created_by = $2`;
    const sensorParams = req.user.role === 'admin' ? [searchParam] : [searchParam, req.user.id];
    const sensorsRes = await db.query(sensorSql, sensorParams);

    // Query Alerts
    const alertSql = req.user.role === 'admin'
      ? `SELECT a.*, d.name as device_name FROM alerts a JOIN devices d ON a.device_id = d.id WHERE a.message ${likeOp} $1 OR a.level ${likeOp} $1`
      : `SELECT a.*, d.name as device_name FROM alerts a JOIN devices d ON a.device_id = d.id WHERE (a.message ${likeOp} $1 OR a.level ${likeOp} $1) AND d.created_by = $2`;
    const alertParams = req.user.role === 'admin' ? [searchParam] : [searchParam, req.user.id];
    const alertsRes = await db.query(alertSql, alertParams);

    // Query Notifications
    const notifSql = req.user.role === 'admin'
      ? `SELECT n.*, a.message, u.name as user_name, d.name as device_name FROM notifications n LEFT JOIN alerts a ON n.alert_id = a.id LEFT JOIN devices d ON a.device_id = d.id LEFT JOIN users u ON n.user_id = u.id WHERE n.channel ${likeOp} $1 OR n.status ${likeOp} $1 OR a.message ${likeOp} $1`
      : `SELECT n.*, a.message, u.name as user_name, d.name as device_name FROM notifications n LEFT JOIN alerts a ON n.alert_id = a.id LEFT JOIN devices d ON a.device_id = d.id LEFT JOIN users u ON n.user_id = u.id WHERE (n.channel ${likeOp} $1 OR n.status ${likeOp} $1 OR a.message ${likeOp} $1) AND n.user_id = $2`;
    const notifParams = req.user.role === 'admin' ? [searchParam] : [searchParam, req.user.id];
    const notificationsRes = await db.query(notifSql, notifParams);

    // Query Users (Admin only)
    let users = [];
    if (req.user.role === 'admin') {
      const usersRes = await db.query(`SELECT id, name, email, phone, role FROM users WHERE name ${likeOp} $1 OR email ${likeOp} $1 OR phone ${likeOp} $1`, [searchParam]);
      users = usersRes.rows;
    }

    // Query Reports
    const reportSql = req.user.role === 'admin'
      ? `SELECT * FROM reports WHERE file_path ${likeOp} $1 OR file_type ${likeOp} $1`
      : `SELECT * FROM reports WHERE (file_path ${likeOp} $1 OR file_type ${likeOp} $1) AND user_id = $2`;
    const reportParams = req.user.role === 'admin' ? [searchParam] : [searchParam, req.user.id];
    const reportsRes = await db.query(reportSql, reportParams);

    // Query GPS Assets
    const gpsSql = req.user.role === 'admin'
      ? `SELECT * FROM devices WHERE (gps_enabled = 1 OR gps_enabled = true) AND (name ${likeOp} $1 OR id ${likeOp} $1 OR location ${likeOp} $1)`
      : `SELECT * FROM devices WHERE (gps_enabled = 1 OR gps_enabled = true) AND (name ${likeOp} $1 OR id ${likeOp} $1 OR location ${likeOp} $1) AND created_by = $2`;
    const gpsParams = req.user.role === 'admin' ? [searchParam] : [searchParam, req.user.id];
    const gpsRes = await db.query(gpsSql, gpsParams);

    res.json({
      devices: devicesRes.rows,
      sensors: sensorsRes.rows,
      alerts: alertsRes.rows,
      notifications: notificationsRes.rows,
      users,
      reports: reportsRes.rows,
      gpsAssets: gpsRes.rows
    });
  } catch (err) {
    console.error('Search API error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

const aiService = require('../services/aiService');

// 11. Stateful Conversational AI Chat Endpoint
router.post('/ai/chat', authenticateToken, async (req, res) => {
  const { message, history } = req.body;
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  try {
    const reply = await aiService.generateChatResponse(message, history || [], req.user);
    res.json({ reply });
  } catch (err) {
    console.error('AI Chat error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
module.exports.authenticateToken = authenticateToken;
module.exports.isAdmin = isAdmin;

