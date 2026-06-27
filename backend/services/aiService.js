const db = require('../config/db');
require('dotenv').config();

// Recommended industry limits
const SENSOR_RECOMMENDED_DEFAULTS = {
  'Soil Moisture': 60,
  'Soil Temperature': 35,
  'Air Temperature': 40,
  'Humidity': 80,
  'Wind Speed': 15,
  'Rainfall': 50,
  'Water Level': 10,
  'Water Flow': 120,
  'Soil pH': 8.5,
  'Light Intensity': 50000,
  'CO₂': 1000,
  'Pressure': 1100,
  'NPK Sensor': 200,
  'EC Sensor': 4
};

// Diagnostic playbooks for sensors
const SENSOR_DIAGNOSTICS = {
  'Temperature': {
    cause: 'Inadequate cooling ventilation, high solar heat radiation load, or HVAC failure.',
    recommendation: 'Check climate control settings, verify air-flow vents are unblocked, and inspect thermal fans.'
  },
  'Humidity': {
    cause: 'Ventilation seal leaks, heavy external rainfall infiltration, or humidifier calibration drift.',
    recommendation: 'Inspect casing seal rings, activate dehumidifier relays, and recalibrate humidity probe.'
  },
  'Soil Moisture': {
    cause: 'Irrigation valve blockage, pipe puncture, or dry soil evaporation.',
    recommendation: 'Audit solenoid water valves, test cellular water flow, and check soil depth sensors.'
  },
  'Water Level': {
    cause: 'Inflow blockage, structural tank leakage, or sump pump relay failure.',
    recommendation: 'Clear sump screen filters, audit drain pumps, and verify liquid pressure sensors.'
  },
  'Motion': {
    cause: 'PIR sensor lens dust, field animal intrusions, or physical wind vibration.',
    recommendation: 'Wipe camera/PIR lens, check secure brackets, and adjust sensitivity parameters.'
  }
};

/**
 * Stateful AI Chatbot service
 */
async function generateChatResponse(message, history = [], user = {}) {
  const q = message.toLowerCase().trim();
  let responseText = '';
  let navigationToken = '';

  // 1. Fetch current database state for dynamic answers
  let devicesList = [];
  let activeAlerts = [];
  let totalSensors = 0;
  let notificationsCount = 0;
  
  try {
    const devRes = await db.query('SELECT * FROM devices');
    devicesList = devRes.rows;
    const sensRes = await db.query('SELECT * FROM sensors');
    const allSensors = sensRes.rows;
    const sensorsByDevice = {};
    allSensors.forEach(s => {
      if (!sensorsByDevice[s.device_id]) {
        sensorsByDevice[s.device_id] = [];
      }
      sensorsByDevice[s.device_id].push(s);
    });
    devicesList.forEach(d => {
      d.sensors = sensorsByDevice[d.id] || [];
    });
    totalSensors = allSensors.length;
    const alertsRes = await db.query("SELECT * FROM alerts WHERE status = 'active'");
    activeAlerts = alertsRes.rows;
    const notifsRes = await db.query('SELECT COUNT(*) as count FROM notifications');
    notificationsCount = parseInt(notifsRes.rows[0]?.count || 0);
  } catch (err) {
    console.error('[AI SERVICE] Database fetch error:', err.message);
  }

  const criticalAlerts = activeAlerts.filter(a => a.level === 'critical');
  const avgHealth = devicesList.length > 0
    ? (devicesList.reduce((acc, d) => acc + (d.health_score !== undefined ? d.health_score : 100), 0) / devicesList.length).toFixed(1)
    : 'N/A';

  // Helper: check keywords
  const matchAny = (...keywords) => keywords.some(k => q.includes(k));

  // 2. CONVERSATIONAL CONTEXT RESOLUTION (FOLLOW-UPs)
  // Scan history backwards to find what device or sensor the user was previously talking about
  let contextDevice = null;
  let contextSensor = null;

  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.sender === 'user') {
      const userTxt = h.text.toLowerCase();
      // Try to extract device from history
      const foundDev = devicesList.find(d => 
        userTxt.includes(d.id.toLowerCase()) || 
        userTxt.includes(d.name.toLowerCase())
      );
      if (foundDev) {
        contextDevice = foundDev;
        break;
      }
    }
  }

  // If follow-up keyword matches "it", "this", "that device", "online status", "battery" and we have a context device
  const isFollowUp = matchAny('is it', 'its status', 'is online', 'battery', 'health', 'where is', 'sensors it has', 'does it');
  const targetDevice = (isFollowUp && contextDevice) ? contextDevice : devicesList.find(d => 
    q.includes(d.id.toLowerCase()) || 
    q.includes(d.name.toLowerCase())
  );

  // ---- INTENT 1: NAVIGATION ----
  if (matchAny('go to', 'navigate to', 'switch to', 'show tab', 'open tab', 'take me to')) {
    if (matchAny('dashboard', 'ops center', 'operations center', 'home')) {
      navigationToken = '[NAVIGATE:dashboard]';
      responseText = "✅ Navigated to the **Operations Center Dashboard**. You can view live telemetry, active incidents, and device heartbeats here.";
    } else if (matchAny('map', 'gps', 'location', 'tracking', 'fleet')) {
      navigationToken = '[NAVIGATE:gps]';
      responseText = "✅ Navigated to the **GPS Movement Playback Map**. You can see live device positions, geofence boundaries, and route history.";
    } else if (matchAny('device', 'inventory', 'asset', 'hardware')) {
      navigationToken = '[NAVIGATE:devices]';
      responseText = "✅ Navigated to the **Asset Inventory Ledger**. You can register, edit, and manage all IoT hardware assets here.";
    } else if (matchAny('alert', 'incident', 'warning', 'board', 'alarm')) {
      navigationToken = '[NAVIGATE:alerts]';
      responseText = "✅ Navigated to the **Smart Alert Board**. You can acknowledge, resolve, assign and add notes to all incidents here.";
    } else if (matchAny('notification', 'inbox', 'messages')) {
      navigationToken = '[NAVIGATE:notifications]';
      responseText = "✅ Navigated to the **Notification History Center**. You can view all dispatched alerts across email, SMS, WhatsApp and dashboard channels.";
    } else if (matchAny('report', 'export', 'pdf', 'csv')) {
      navigationToken = '[NAVIGATE:reports]';
      responseText = "✅ Navigated to the **Reports Center**. You can export PDF and CSV reports for incidents, devices, sensors, and user activity here.";
    } else if (matchAny('analytics', 'hub', 'charts', 'graphs')) {
      navigationToken = '[NAVIGATE:analytics]';
      responseText = "✅ Navigated to the **Analytics Hub**. You can view notification delivery analytics, device health trends, and operational insights.";
    } else if (matchAny('audit', 'log', 'trail', 'history')) {
      navigationToken = '[NAVIGATE:audit]';
      responseText = "✅ Navigated to the **Audit Trail Ledger Logs**. Every system action is logged here for accountability and compliance.";
    } else if (matchAny('setting', 'global', 'configuration', 'config')) {
      if (user.role === 'admin') {
        navigationToken = '[NAVIGATE:settings]';
        responseText = "✅ Navigated to the **Global System Settings** panel. You can configure SMTP, Twilio, threshold values, and system-wide preferences here.";
      } else {
        responseText = "⛔ The Global Settings panel is restricted to **Administrators only**. Please contact your system administrator to adjust platform settings.";
      }
    } else if (matchAny('preference', 'notification pref', 'channel')) {
      navigationToken = '[NAVIGATE:preferences]';
      responseText = "✅ Navigated to your **User Preferences** panel. You can enable or disable Email, SMS, WhatsApp, Dashboard and Push notification channels here.";
    } else if (matchAny('sensor', 'predictive', 'analytics board')) {
      navigationToken = '[NAVIGATE:sensors]';
      responseText = "✅ Navigated to the **Predictive Analytics Board**. You can view all sensor readings, anomaly detections, and trend forecasts here.";
    } else {
      responseText = "I can navigate you to any section. Try: **'go to dashboard'**, **'go to GPS map'**, **'go to devices'**, **'go to alerts'**, **'go to notifications'**, **'go to reports'**, or **'go to settings'**.";
    }
  }

  // ---- INTENT 2: DEVICE DETAILS ----
  else if (targetDevice) {
    const isOnline = !!targetDevice.connected;
    const health = targetDevice.health_score !== undefined ? `${targetDevice.health_score}%` : '100%';
    const battery = targetDevice.battery !== undefined ? `${targetDevice.battery}%` : 'N/A';
    const sensorsList = targetDevice.sensors || [];
    const sensorDetailsStr = sensorsList.map(s => `- **${s.name}** (\`${s.id}\`): current ${s.current_value}${s.unit || ''} | max ${s.max_value}${s.unit || ''}`).join('\n');

    responseText = `## 📡 Device Telemetry: ${targetDevice.name}\n\n` +
      `* **Device ID**: \`${targetDevice.id}\`\n` +
      `* **Location**: ${targetDevice.location || 'N/A'}\n` +
      `* **Hardware Type**: ${targetDevice.hardware_type || 'ESP32'}\n` +
      `* **Connection Status**: ${isOnline ? '🟢 ONLINE' : '🔴 OFFLINE'}\n` +
      `* **Uptime score**: ${targetDevice.uptime_percent || 100}%\n` +
      `* **Operational Health**: ${health}\n` +
      `* **Battery Level**: ${battery}\n\n` +
      `### Monitored Sensors (${sensorsList.length}):\n${sensorDetailsStr || '*No active sensors linked.*'}\n\n` +
      `*Context: Discussing device **${targetDevice.name}**. You can ask follow-up questions like "is it online?" or "what is its battery?".*`;
  }

  // ---- INTENT 3: SYSTEM STATUS ----
  else if (matchAny('status', 'summary', 'summarize', 'system health', 'how is the system', 'overview', 'platform status', 'operational status')) {
    const statusStr = criticalAlerts.length > 0 ? '🔴 CRITICAL' : activeAlerts.length > 0 ? '🟡 WARNING' : '🟢 HEALTHY';
    const onlineCount = devicesList.filter(d => d.connected).length;
    const offlineCount = devicesList.filter(d => !d.connected).length;
    responseText = `## 📊 Sansah System Operations Summary\n\n` +
      `| Metric | Value |\n|--------|-------|\n` +
      `| **System Status** | ${statusStr} |\n` +
      `| **Platform Health Score** | ${avgHealth}% |\n` +
      `| **Registered Devices** | ${devicesList.length} total |\n` +
      `| **Online / Offline** | ${onlineCount} online, ${offlineCount} offline |\n` +
      `| **Active Sensors** | ${totalSensors} sensors monitored |\n` +
      `| **Active Incidents** | ${activeAlerts.length} (${criticalAlerts.length} critical) |\n` +
      `| **Notifications Sent** | ${notificationsCount} dispatched |\n\n` +
      (criticalAlerts.length > 0
        ? `⚠️ **${criticalAlerts.length} CRITICAL alert(s) require immediate attention.** Type **'show active alerts'** to see them.`
        : `✅ All channels streaming nominal. No critical incidents detected.`);
  }

  // ---- INTENT 4: ACTIVE ALERTS ----
  else if (matchAny('active alerts', 'show alerts', 'what is wrong', 'current problems', 'list alerts', 'any alerts', 'check alerts', 'incidents')) {
    if (activeAlerts.length === 0) {
      responseText = "✅ **All Clear!** There are currently **no active alert incidents** in the system. All monitored sensor readings are within safe threshold limits.";
    } else {
      responseText = `🚨 **${activeAlerts.length} Active Incident(s) Detected:**\n\n` + activeAlerts.map((a, idx) => {
        // Find diagnostic playbook for sensor type
        const diag = SENSOR_DIAGNOSTICS[a.sensor_id?.split('_').pop() || ''] || {
          cause: 'Sensor reading exceeded configured threshold.',
          recommendation: 'Inspect the hardware node, audit boundary limits, and reset threshold values.'
        };
        return `**${idx + 1}. [${a.level.toUpperCase()}]** — ${a.message}\n` +
          `   - 💥 *Cause:* ${diag.cause}\n` +
          `   - 🔧 *Action:* ${diag.recommendation}\n`;
      }).join('\n');
      responseText += `\nType **'go to alerts'** to open the incident timeline and resolve these alerts.`;
    }
  }

  // ---- INTENT 5: DEVICE LIST ----
  else if (matchAny('list device', 'show device', 'my assets', 'my devices', 'all devices', 'what devices', 'registered devices')) {
    if (devicesList.length === 0) {
      responseText = "📭 You don't have any devices registered yet. Go to the **Asset Inventory** tab and click **'Register New Asset'** to get started.";
    } else {
      const onlineCount = devicesList.filter(d => d.connected).length;
      responseText = `📡 **${devicesList.length} Registered Device(s)** (${onlineCount} Online):\n\n` +
        devicesList.map((d, idx) => {
          const health = d.health_score !== undefined ? `${d.health_score}%` : '100%';
          const battery = d.battery !== undefined ? `${d.battery}%` : 'N/A';
          const sensorTypes = d.sensors ? d.sensors.map(s => s.type).join(', ') : 'None';
          return `**${idx + 1}. ${d.name}** \`[${d.id}]\`\n` +
            `   - Status: ${d.connected ? '🟢 Online' : '🔴 Offline'} | Health: ${health} | Battery: ${battery}\n` +
            `   - Location: ${d.location || 'N/A'}\n` +
            `   - Sensors: ${sensorTypes}\n`;
        }).join('\n');
    }
  }

  // ---- INTENT 6: SENSOR THRESHOLDS ----
  else if (matchAny('threshold', 'max value', 'recommended limit', 'suggested value', 'sensor limit', 'default threshold')) {
    responseText = "📏 **Industry-Standard Recommended Maximum Thresholds:**\n\n" +
      Object.entries(SENSOR_RECOMMENDED_DEFAULTS).map(([sensor, maxVal]) => {
        const units = { 'Soil Moisture': '%', 'Humidity': '%', 'Soil Temperature': '°C', 'Air Temperature': '°C', 'Rainfall': 'mm', 'Water Level': 'cm', 'Water Flow': 'L/min', 'Soil pH': 'pH', 'Light Intensity': 'lux', 'CO₂': 'ppm', 'Pressure': 'hPa', 'NPK Sensor': 'mg/kg', 'EC Sensor': 'dS/m', 'Wind Speed': 'km/h' };
        return `- **${sensor}**: max ${maxVal}${units[sensor] || ''}`;
      }).join('\n');
    responseText += `\n\n💡 To update a sensor's threshold, go to the **Predictive Analytics** tab and click on any sensor card.`;
  }

  // ---- INTENT 7: TROUBLESHOOT SPECIFIC SENSOR ----
  else if (matchAny('troubleshoot', 'fix', 'repair', 'diagnose', 'root cause', 'why is', 'investigate')) {
    let matched = false;
    const sensorKeywords = [
      ['temperature', 'Temperature'], ['humidity', 'Humidity'], ['moisture', 'Soil Moisture'],
      ['water level', 'Water Level'], ['water flow', 'Water Flow'], ['ph', 'Soil pH'],
      ['co2', 'CO₂'], ['wind', 'Wind Speed'], ['pressure', 'Pressure'], ['npk', 'NPK Sensor'],
      ['light', 'Light Intensity'], ['rainfall', 'Rainfall']
    ];
    for (const [kw, label] of sensorKeywords) {
      if (q.includes(kw)) {
        const diag = SENSOR_DIAGNOSTICS[label] || {
          cause: 'Telemetry spikes, network drops, or physical casing degradation.',
          recommendation: 'Inspect node power supply, adjust threshold offsets, and verify hardware wiring integrity.'
        };
        responseText = `🔍 **Diagnostic Playbook: ${label}**\n\n` +
          `💥 **Root Cause:** ${diag.cause}\n\n` +
          `🔧 **Recommended Steps:**\n${diag.recommendation}\n\n` +
          `📊 To view live readings, type **'go to sensors'** and click on the relevant sensor card.`;
        matched = true;
        break;
      }
    }
    if (!matched) {
      responseText = "Please specify a sensor type (e.g. **'troubleshoot temperature'**, **'diagnose water level'**, **'fix humidity alert'**). I can provide root cause analysis and field repair steps.";
    }
  }

  // ---- INTENT 8: HELP / INSTRUCTIONS ----
  else if (matchAny('help', 'what can you do', 'commands', 'what to ask', 'options', 'menu', 'hello', 'hi')) {
    responseText = `🤖 **Sansah AI Assistant — Available Commands:**\n\n` +
      `* **System Status**: Ask **"show system health"** or **"summarize status"** for an operational dashboard summary.\n` +
      `* **Device Queries**: Ask **"list my devices"** or **"tell me about ESP32_01"** (gets live DB status, battery, location, and linked sensors).\n` +
      `* **Follow-Up Memory**: Ask a device question first, then ask **"is it online?"** or **"what is its health?"** — I'll remember which device you mean!\n` +
      `* **Active Incident Board**: Ask **"check active alerts"** or **"what is wrong?"** for a list of breaches and AI diagnostics.\n` +
      `* **Diagnostic Playbooks**: Ask **"troubleshoot temperature"** or **"how to fix water level"** for root-cause analysis.\n` +
      `* **Navigation Shortcuts**: Say **"take me to the GPS map"**, **"go to alerts"**, **"switch to preferences"**, etc., and I'll navigate your browser immediately!\n\n` +
      `*How can I help you troubleshoot or analyze your IoT infrastructure today?*`;
  }

  // ---- INTENT 9: GENERAL FALLBACK ----
  else {
    responseText = `I understand you're asking about: "${message}".\n\n` +
      `I can query live telemetry data, diagnose hardware, and navigate the portal. Try asking:\n` +
      `- **"List my devices"** (shows live SQLite statuses)\n` +
      `- **"Is Boiler Watchdog online?"** (queries specific device)\n` +
      `- **"Show active alerts"** (audits current incidents)\n` +
      `- **"Take me to the GPS map"** (changes browser view)\n\n` +
      `Or type **'help'** to view the full command directory.`;
  }

  // Append navigation token to response text if any
  if (navigationToken) {
    responseText += `\n\n${navigationToken}`;
  }

  return responseText;
}

module.exports = {
  generateChatResponse
};
