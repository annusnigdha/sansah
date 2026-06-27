const db = require('./config/db');
const nodemailer = require('nodemailer');

async function createMailTransporter(settings) {
  const host = settings.smtp_host || process.env.SMTP_HOST;
  const user = settings.smtp_user || process.env.SMTP_USER;
  const pass = settings.smtp_pass || process.env.SMTP_PASS;
  const port = parseInt(settings.smtp_port || process.env.SMTP_PORT || '587');
  const secure = (settings.smtp_secure || process.env.SMTP_SECURE || 'false') === 'true';

  console.log('Values:', { host, user, pass, port, secure });

  if (host && user) {
    console.log('Returning REAL SMTP transporter');
    return nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass }
    });
  } else {
    try {
      console.log('Generating dynamic Ethereal test account for SMTP fallback...');
      const testAccount = await nodemailer.createTestAccount();
      console.log('Returning Ethereal fallback transporter');
      return nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false,
        auth: {
          user: testAccount.user,
          pass: testAccount.pass
        }
      });
    } catch (err) {
      console.error('Failed to create Ethereal test account:', err.message);
      console.log('Returning SIMULATED transporter');
      return nodemailer.createTransport({
        jsonTransport: true
      });
    }
  }
}

async function run() {
  await db.initDatabase();
  const res = await db.query('SELECT * FROM system_settings');
  const settings = {};
  res.rows.forEach(r => { settings[r.key] = r.value; });
  const transporter = await createMailTransporter(settings);
  console.log('Transporter object:', transporter.transporter.name);
}
run();
