const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');
const db = require('../config/db');
require('dotenv').config();

let Resend = null;
try {
  Resend = require('resend').Resend;
} catch (e) {
  console.warn('[EMAIL SERVICE] resend package not loaded yet. Will fallback to Nodemailer.');
}

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

// Helper: Save mock email to backend/mailbox directory
function saveToMailbox(to, subject, text, html) {
  try {
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
Content-Type: text/html; charset=utf-8
Custom-Notification-Source: Enterprise-Resend-Service

${html || text}`;
    
    fs.writeFileSync(filepath, emlContent, 'utf8');
    console.log(`[MAILBOX] Eml saved to: ${filepath}`);
  } catch (err) {
    console.error('[MAILBOX] Error saving eml:', err.message);
  }
}

// Rule-based Diagnostics Helper
function getDiagnosticsForAlert(message) {
  if (message.includes('gone OFFLINE')) {
    return {
      cause: "Device missed communication heartbeat ticks. Likely due to power cell drainage or signal blockages.",
      recommendation: "Check power cables, inspect RF environment, or verify on-site device antenna alignment."
    };
  }
  if (message.includes('Temperature')) {
    return {
      cause: "Ambient environment temperature spike. Possible server AC failure or industrial room heat exhaust block.",
      recommendation: "Examine ventilation grid, reset cooling control panel, or spin down heavy machinery."
    };
  }
  if (message.includes('Humidity')) {
    return {
      cause: "Humidity levels breach. HVAC humidifier failure, condensation build-up, or moisture leakage.",
      recommendation: "Activate dehumidifier modules, check pipes for leaks, and inspect air circulation fans."
    };
  }
  if (message.includes('Moisture') || message.includes('Wetness')) {
    return {
      cause: "Insufficient irrigation, High temperature, Low rainfall",
      recommendation: "Increase irrigation, Check water supply, Monitor weather conditions"
    };
  }
  if (message.includes('Wind Speed') || message.includes('Wind')) {
    return {
      cause: "Storm conditions, Atmospheric pressure changes",
      recommendation: "Secure equipment, Monitor weather forecasts"
    };
  }
  if (message.includes('Water Level')) {
    return {
      cause: "Fluid height limits exceeded. Boiler cooling supply leak or utility room drainage sump block.",
      recommendation: "Trigger emergency mechanical sump discharge, inspect pump blades, or shut incoming supply."
    };
  }
  if (message.includes('geofence')) {
    return {
      cause: "Mobile tracker departed geofenced coordinates zone. Fleet driver off route or asset unpermitted movement.",
      recommendation: "Verify route dispatcher sheets, call field team device user, or check fleet logs."
    };
  }
  return {
    cause: "Sensor reading fluctuated beyond global threshold boundaries.",
    recommendation: "Inspect sensor probe, clean terminals, and reset default trigger parameters."
  };
}

// Main Email Sending Dispatcher
async function sendEmail({ to, subject, html, text, userId, alertId }) {
  console.log(`\n--- [ENTERPRISE EMAIL SERVICE] ---`);
  console.log(`To: ${to}`);
  console.log(`Subject: ${subject}`);
  console.log(`---------------------------------`);

  const notifId = `notif_em_${Date.now()}_${Math.floor(Math.random()*100)}`;
  let status = 'pending';
  let errorMessage = null;

  // 1. Write pending status to DB first
  try {
    await db.query(
      'INSERT INTO notifications (id, user_id, alert_id, channel, status) VALUES ($1, $2, $3, $4, $5)',
      [notifId, userId, alertId, 'email', status]
    );
    try {
      const firebaseService = require('./firebaseService');
      await firebaseService.syncFirestoreNotification(notifId, {
        id: notifId,
        user_id: userId,
        alert_id: alertId,
        channel: 'email',
        status: status,
        sent_at: new Date().toISOString()
      });
    } catch (firebaseErr) {
      console.error('[EMAIL SERVICE] Failed to sync pending notification to Firestore:', firebaseErr.message);
    }
  } catch (err) {
    console.error('[EMAIL SERVICE] Failed to log pending notification in DB:', err.message);
  }

  const resendApiKey = process.env.RESEND_API_KEY;

  if (resendApiKey && Resend) {
    // Primary Provider: Resend
    try {
      const resendInstance = new Resend(resendApiKey);
      const fromEmail = process.env.SMTP_FROM || 'onboarding@resend.dev';
      
      const res = await resendInstance.emails.send({
        from: `Sansah Innovations <${fromEmail}>`,
        to: [to],
        subject: subject,
        html: html,
        text: text
      });

      if (res.error) {
        throw new Error(res.error.message || JSON.stringify(res.error));
      }

      status = 'delivered';
      console.log(`[RESEND] Email successfully sent to ${to}. ID: ${res.data ? res.data.id : 'N/A'}`);
    } catch (err) {
      console.error(`[RESEND] API call failed: ${err.message}. Falling back...`);
      status = 'failed';
      errorMessage = err.message;
    }
  } else {
    console.log('[RESEND] API Key missing or SDK not loaded. Falling back to SMTP...');
  }

  // Fallback: SMTP / Nodemailer (Ethereal or Simulated)
  if (status !== 'delivered') {
    try {
      const settings = await getSystemSettingsMap();
      const host = settings.smtp_host || process.env.SMTP_HOST;
      const user = settings.smtp_user || process.env.SMTP_USER;
      const pass = settings.smtp_pass || process.env.SMTP_PASS;
      const port = parseInt(settings.smtp_port || process.env.SMTP_PORT || '587');
      const secure = (settings.smtp_secure || process.env.SMTP_SECURE || 'false') === 'true';

      let transporter;
      let isSimulated = false;
      let isEthereal = false;

      if (host && user) {
        transporter = nodemailer.createTransport({ host, port, secure, auth: { user, pass } });
      } else {
        try {
          const testAccount = await nodemailer.createTestAccount();
          transporter = nodemailer.createTransport({
            host: 'smtp.ethereal.email',
            port: 587,
            secure: false,
            auth: { user: testAccount.user, pass: testAccount.pass }
          });
          isEthereal = true;
        } catch (etherealErr) {
          transporter = nodemailer.createTransport({ jsonTransport: true });
          isSimulated = true;
        }
      }

      const fromEmail = settings.smtp_from || process.env.SMTP_FROM || settings.smtp_user || process.env.SMTP_USER || 'support@sansah.com';
      const info = await transporter.sendMail({
        from: `"Sansah Innovations Fallback" <${fromEmail}>`,
        to,
        subject,
        text,
        html
      });

      if (isSimulated || (transporter.options && transporter.options.jsonTransport)) {
        status = 'simulated';
        console.log('[SMTP FALLBACK] Simulated email dispatched locally.');
      } else if (isEthereal) {
        status = 'ethereal';
        const previewUrl = nodemailer.getTestMessageUrl(info);
        console.log(`[SMTP FALLBACK] Ethereal email dispatched. Preview URL: ${previewUrl}`);
      } else {
        status = 'delivered';
        console.log('[SMTP FALLBACK] Email successfully sent via custom SMTP.');
      }
      errorMessage = null;
    } catch (fallbackErr) {
      console.error('[SMTP FALLBACK] Failed to dispatch email:', fallbackErr.message);
      status = 'failed';
      errorMessage = fallbackErr.message;
    }
  }

  // Save copy locally to verify delivery offline
  saveToMailbox(to, subject, text, html);

  // Update notification status in DB
  try {
    const dbStatus = (status === 'ethereal' || status === 'simulated') ? 'sent' : status;
    await db.query(
      'UPDATE notifications SET status = $1, error_message = $2 WHERE id = $3',
      [dbStatus, errorMessage, notifId]
    );
    try {
      const firebaseService = require('./firebaseService');
      await firebaseService.syncFirestoreNotification(notifId, {
        status: dbStatus,
        error_message: errorMessage
      });
    } catch (firebaseErr) {
      console.error('[EMAIL SERVICE] Failed to sync updated notification to Firestore:', firebaseErr.message);
    }
  } catch (err) {
    console.error('[EMAIL SERVICE] Failed to update notification status in DB:', err.message);
  }
}

// Template 1: Welcome Email
async function sendWelcomeEmail(to, userName, userId) {
  const subject = '🎉 Welcome to the IoT Alert Notification System';
  const html = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0b131a; color: #f2f5f7; border-radius: 12px; border: 1px solid #1e293b;">
      <div style="text-align: center; border-bottom: 2px solid #00b0ff; padding-bottom: 20px; margin-bottom: 20px;">
        <h1 style="color: #00b0ff; margin: 0; font-size: 24px; text-transform: uppercase; letter-spacing: 1px;">Sansah Innovations</h1>
        <p style="color: #7f8c8d; margin: 5px 0 0 0; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">Operations Gateway</p>
      </div>
      <div style="line-height: 1.6; font-size: 14px; color: #cbd5e1;">
        <p style="font-size: 16px; font-weight: bold; color: #f8fafc;">Hello ${userName || 'User'},</p>
        <p>Welcome to Sansah Innovations! We are thrilled to have you join our platform.</p>
        <p>Sansah Innovations is an enterprise-grade IoT Alert Notification & SaaS Platform. Our system provides real-time device health scoring, smart alerts prioritizations, predictive sensor anomaly analytics, GPS routes playback, and highly custom notification settings.</p>
        
        <div style="background-color: #0f1c29; padding: 15px; border-radius: 8px; border: 1px solid #1e293b; margin: 20px 0;">
          <h3 style="color: #00b0ff; margin-top: 0; font-size: 14px; text-transform: uppercase;">Account Information:</h3>
          <p style="margin: 0 0 5px 0;"><strong>Name:</strong> ${userName || 'User'}</p>
          <p style="margin: 0 0 5px 0;"><strong>Registered Email:</strong> ${to}</p>
          <p style="margin: 0;"><strong>Access Level:</strong> Standard IoT Operations Profile</p>
        </div>

        <div style="background-color: #0f1c29; padding: 15px; border-radius: 8px; border: 1px solid #1e293b; margin: 20px 0;">
          <h3 style="color: #00b0ff; margin-top: 0; font-size: 14px; text-transform: uppercase;">Getting Started Instructions:</h3>
          <ol style="margin: 0; padding-left: 20px;">
            <li style="margin-bottom: 8px;">Log in to your portal gateway at <a href="${process.env.FRONTEND_URL || 'https://sansah.vercel.app'}" style="color: #00b0ff; text-decoration: none; font-weight: bold;">${process.env.FRONTEND_URL || 'https://sansah.vercel.app'}</a>.</li>
            <li style="margin-bottom: 8px;">Link your hardware nodes and telemetry sensors under the <strong>"Asset Inventory"</strong> panel.</li>
            <li style="margin-bottom: 8px;">Configure your alert channels (Dashboard, Email, WhatsApp, SMS) under the <strong>"Preferences"</strong> settings.</li>
            <li style="margin-bottom: 8px;">Set up Geofences in the GPS tab to monitor mobile hardware entry and exit actions.</li>
          </ol>
        </div>

        <p>If you have any questions or require assistance setting up your hardware, please reach out to our Support team:</p>
        <p style="margin: 0;"><strong>Email:</strong> support@sansah.com</p>
        <p style="margin: 0;"><strong>Phone:</strong> +1-800-555-0199</p>
      </div>
      <div style="margin-top: 30px; border-top: 1px solid #1e293b; padding-top: 20px; text-align: center; font-size: 11px; color: #64748b;">
        <p style="margin: 0;">This email was sent from an automated system. Please do not reply directly to this message.</p>
      </div>
    </div>
  `;

  const text = `Hello ${userName || 'User'},\n\nWelcome to Sansah Innovations! We are thrilled to have you join our platform.\n\nAccount Information:\nName: ${userName}\nEmail: ${to}\nAccess Level: Standard IoT Operations Profile\n\nGetting Started:\n1. Log in to your portal at ${process.env.FRONTEND_URL || 'https://sansah.vercel.app'}\n2. Link your hardware nodes under Asset Inventory.\n3. Configure channels in Preferences.\n\nSupport:\nEmail: support@sansah.com\nPhone: +1-800-555-0199`;

  const alertId = `sys_welcome_${Date.now()}`;
  try {
    await db.query(
      "INSERT INTO alerts (id, device_id, message, level, status) VALUES ($1, 'SYSTEM', $2, 'low', 'resolved')",
      [alertId, `Welcome email sent to ${to}`]
    );
  } catch (err) {
    console.error('Failed to log welcome alert in DB:', err.message);
  }

  await sendEmail({ to, subject, html, text, userId, alertId });
}

// Template 2: Threshold Alert Email
async function sendAlertEmail(to, alertData, userId, alertId) {
  const { deviceName, sensorName, currentValue, maxValue, unit, timestamp, level, message } = alertData;
  const subject = `🚨 Alert: Threshold Exceeded`;
  const diagnostics = getDiagnosticsForAlert(message || sensorName || '');

  const html = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0b131a; color: #f2f5f7; border-radius: 12px; border: 1px solid #ef4444;">
      <div style="text-align: center; border-bottom: 2px solid #ef4444; padding-bottom: 20px; margin-bottom: 20px;">
        <h1 style="color: #ef4444; margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: 1px;">🚨 Threshold Limit Breached 🚨</h1>
        <p style="color: #7f8c8d; margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">Severity: ${level ? level.toUpperCase() : 'WARNING'}</p>
      </div>
      <div style="line-height: 1.6; font-size: 14px; color: #cbd5e1;">
        <p>The Sansah IoT Alert System has detected an exceeded threshold on one of your telemetry sensors.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 13px;">
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 0; font-weight: bold; color: #94a3b8; width: 40%;">Device Name:</td>
            <td style="padding: 8px 0; color: #f8fafc;">${deviceName || 'N/A'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 0; font-weight: bold; color: #94a3b8;">Sensor Name:</td>
            <td style="padding: 8px 0; color: #f8fafc;">${sensorName || 'N/A'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 0; font-weight: bold; color: #94a3b8;">Current Value:</td>
            <td style="padding: 8px 0; color: #ef4444; font-weight: bold;">${currentValue !== undefined ? currentValue : 'N/A'}${unit || ''}</td>
          </tr>
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 0; font-weight: bold; color: #94a3b8;">Max Allowed:</td>
            <td style="padding: 8px 0; color: #f8fafc;">${maxValue !== undefined ? maxValue : 'N/A'}${unit || ''}</td>
          </tr>
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 0; font-weight: bold; color: #94a3b8;">Timestamp:</td>
            <td style="padding: 8px 0; color: #f8fafc;">${timestamp || new Date().toLocaleString()}</td>
          </tr>
        </table>

        <div style="background-color: #1c0e0e; padding: 15px; border-radius: 8px; border: 1px solid #ef4444/20; margin: 20px 0;">
          <h3 style="color: #fca5a5; margin-top: 0; font-size: 14px; text-transform: uppercase;">AI Diagnostics</h3>
          <p style="margin: 0 0 10px 0;"><strong>Possible Causes:</strong><br/>${diagnostics.cause}</p>
          <p style="margin: 0;"><strong>Recommended Actions:</strong><br/>${diagnostics.recommendation}</p>
        </div>

        <p>Please log in to your dashboard at <a href="${process.env.FRONTEND_URL || 'https://sansah.vercel.app'}" style="color: #00b0ff; text-decoration: none;">${process.env.FRONTEND_URL || 'https://sansah.vercel.app'}</a> immediately to resolve this incident.</p>
      </div>
      <div style="margin-top: 30px; border-top: 1px solid #1e293b; padding-top: 20px; text-align: center; font-size: 11px; color: #64748b;">
        <p style="margin: 0;">Sansah Innovations Security Operations Center</p>
      </div>
    </div>
  `;

  const text = `🚨 Threshold Limit Breached 🚨\n\nDevice Name: ${deviceName}\nSensor Name: ${sensorName}\nCurrent Value: ${currentValue}${unit}\nMax Value: ${maxValue}${unit}\nTimestamp: ${timestamp}\n\nAI Diagnostics:\nPossible Causes: ${diagnostics.cause}\nRecommended Actions: ${diagnostics.recommendation}\n\nLog in immediately: ${process.env.FRONTEND_URL || 'https://sansah.vercel.app'}`;

  await sendEmail({ to, subject, html, text, userId, alertId });
}

// Template 3: Alert Resolution Email
async function sendResolutionEmail(to, resolutionData, userId, alertId) {
  const { deviceName, sensorName, resolutionNotes, resolvedBy, resolvedTime } = resolutionData;
  const subject = `✅ Alert Resolved`;

  const html = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0b131a; color: #f2f5f7; border-radius: 12px; border: 1px solid #10b981;">
      <div style="text-align: center; border-bottom: 2px solid #10b981; padding-bottom: 20px; margin-bottom: 20px;">
        <h1 style="color: #10b981; margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: 1px;">✅ Incident Resolved ✅</h1>
        <p style="color: #7f8c8d; margin: 5px 0 0 0; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;">Normal Operations Restored</p>
      </div>
      <div style="line-height: 1.6; font-size: 14px; color: #cbd5e1;">
        <p>Good news! The active telemetry alert has been resolved successfully.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin: 15px 0; font-size: 13px;">
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 0; font-weight: bold; color: #94a3b8; width: 40%;">Device Name:</td>
            <td style="padding: 8px 0; color: #f8fafc;">${deviceName || 'SYSTEM'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 0; font-weight: bold; color: #94a3b8;">Sensor Name:</td>
            <td style="padding: 8px 0; color: #f8fafc;">${sensorName || 'N/A'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 0; font-weight: bold; color: #94a3b8;">Resolution Notes:</td>
            <td style="padding: 8px 0; color: #f8fafc; font-style: italic;">"${resolutionNotes}"</td>
          </tr>
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 0; font-weight: bold; color: #94a3b8;">Resolved By:</td>
            <td style="padding: 8px 0; color: #f8fafc;">${resolvedBy || 'Admin'}</td>
          </tr>
          <tr style="border-bottom: 1px solid #1e293b;">
            <td style="padding: 8px 0; font-weight: bold; color: #94a3b8;">Resolution Time:</td>
            <td style="padding: 8px 0; color: #f8fafc;">${resolvedTime || new Date().toLocaleString()}</td>
          </tr>
        </table>
      </div>
      <div style="margin-top: 30px; border-top: 1px solid #1e293b; padding-top: 20px; text-align: center; font-size: 11px; color: #64748b;">
        <p style="margin: 0;">Sansah Innovations Telemetry Operations</p>
      </div>
    </div>
  `;

  const text = `Incident Resolved!\n\nDevice Name: ${deviceName}\nSensor Name: ${sensorName}\nResolution Notes: ${resolutionNotes}\nResolved By: ${resolvedBy}\nResolution Time: ${resolvedTime}`;

  await sendEmail({ to, subject, html, text, userId, alertId });
}

// Template 4: Password Reset Email
async function sendPasswordResetEmail(to, resetLink, userId) {
  const subject = '🔒 Password Reset Request - Sansah Innovations';

  const html = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #0b131a; color: #f2f5f7; border-radius: 12px; border: 1px solid #3b82f6;">
      <div style="text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 20px; margin-bottom: 20px;">
        <h1 style="color: #3b82f6; margin: 0; font-size: 22px; text-transform: uppercase; letter-spacing: 1px;">Password Reset</h1>
      </div>
      <div style="line-height: 1.6; font-size: 14px; color: #cbd5e1;">
        <p>Hello,</p>
        <p>A request was received to reset the password associated with this email address. Please click the button below to configure a new credential password:</p>
        
        <div style="text-align: center; margin: 25px 0;">
          <a href="${resetLink}" style="background-color: #00b0ff; color: #070d12; text-decoration: none; padding: 12px 24px; font-weight: bold; border-radius: 8px; text-transform: uppercase; font-size: 12px; letter-spacing: 1px; display: inline-block;">Configure New Password</a>
        </div>

        <p><strong>Expiration:</strong> This reset link is single-use and will automatically expire in <strong>15 minutes</strong>.</p>
        
        <div style="background-color: #0f1c29; padding: 12px; border-radius: 8px; border: 1px solid #3b82f6/25; font-size: 12px; color: #94a3b8; margin: 20px 0;">
          <strong>Security Warning:</strong> If you did not initiate this reset request, no actions are required on your end. Simply ignore this message and ensure your current password remains secure.
        </div>
      </div>
      <div style="margin-top: 30px; border-top: 1px solid #1e293b; padding-top: 20px; text-align: center; font-size: 11px; color: #64748b;">
        <p style="margin: 0;">Sansah Innovations Identity Operations Center</p>
      </div>
    </div>
  `;

  const text = `Password Reset Request\n\nPlease reset your password using the following link (expires in 15 minutes):\n${resetLink}\n\nIf you did not make this request, you can safely ignore this email.`;

  const alertId = `sys_reset_${Date.now()}`;
  try {
    await db.query(
      "INSERT INTO alerts (id, device_id, message, level, status) VALUES ($1, 'SYSTEM', $2, 'low', 'resolved')",
      [alertId, `Password reset link sent to ${to}`]
    );
  } catch (err) {
    console.error('Failed to log password reset alert in DB:', err.message);
  }

  await sendEmail({ to, subject, html, text, userId, alertId });
}

module.exports = {
  sendWelcomeEmail,
  sendAlertEmail,
  sendResolutionEmail,
  sendPasswordResetEmail,
  getDiagnosticsForAlert,
  sendEmail
};
