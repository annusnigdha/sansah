const path = require('path');
// Load environment variables from local .env
require('dotenv').config();

const db = require('./config/db');
const emailService = require('./services/emailService');

async function testResend() {
  console.log('RESEND_API_KEY in verify script:', process.env.RESEND_API_KEY ? 'Present (length: ' + process.env.RESEND_API_KEY.length + ')' : 'Missing');

  console.log('Initializing database...');
  await db.initDatabase();

  const testEmail = 'angeljaison625@gmail.com';
  const userName = 'John Doe';
  const userId = 17; // Dummy user ID

  console.log('\n--- Test 1: Sending Welcome Email via Resend ---');
  try {
    await emailService.sendWelcomeEmail(testEmail, userName, userId);
    console.log('Welcome Email process completed successfully!');
  } catch (err) {
    console.error('Welcome Email failed:', err.message);
  }

  console.log('\n--- Test 2: Sending Threshold Alert Email via Resend ---');
  const alertData = {
    deviceName: 'Soil Moisture Node',
    sensorName: 'Soil Moisture Sensor',
    currentValue: 65,
    maxValue: 50,
    unit: '%',
    timestamp: new Date().toLocaleString(),
    level: 'critical',
    message: 'Soil Moisture Node Soil Moisture Sensor reading: 65% (exceeded threshold 50%).'
  };
  const alertId = 'alert_test_' + Date.now();
  try {
    await emailService.sendAlertEmail(testEmail, alertData, userId, alertId);
    console.log('Alert Email process completed successfully!');
  } catch (err) {
    console.error('Alert Email failed:', err.message);
  }

  console.log('\n--- Test 3: Sending Alert Resolution Email via Resend ---');
  const resolutionData = {
    deviceName: 'Soil Moisture Node',
    sensorName: 'Soil Moisture Sensor',
    resolutionNotes: 'Irrigation frequency updated and soil moisture levels stabilized.',
    resolvedBy: 'Admin User',
    resolvedTime: new Date().toLocaleString()
  };
  try {
    await emailService.sendResolutionEmail(testEmail, resolutionData, userId, alertId);
    console.log('Resolution Email process completed successfully!');
  } catch (err) {
    console.error('Resolution Email failed:', err.message);
  }

  console.log('\n--- Test 4: Sending Password Reset Email via Resend ---');
  const resetLink = `http://localhost:3000/?token=test_reset_token_12345`;
  try {
    await emailService.sendPasswordResetEmail(testEmail, resetLink, userId);
    console.log('Password Reset Email process completed successfully!');
  } catch (err) {
    console.error('Password Reset Email failed:', err.message);
  }

  console.log('\nVerification completed.');
}

testResend().catch(err => {
  console.error('General failure:', err);
});
