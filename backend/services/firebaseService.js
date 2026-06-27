const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
require('dotenv').config();

let firebaseApp = null;
let firestoreDb = null;
let firebaseEnabled = false;

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (projectId && clientEmail && privateKey) {
  try {
    // Standard newline fix for private key in env
    privateKey = privateKey.replace(/\\n/g, '\n');
    
    const certConfig = {
      projectId,
      clientEmail,
      privateKey
    };
    firebaseApp = admin.initializeApp({
      credential: admin.credential ? admin.credential.cert(certConfig) : admin.cert(certConfig)
    });
    const { getFirestore } = require('firebase-admin/firestore');
    firestoreDb = getFirestore();
    firebaseEnabled = true;
    console.log('[FIREBASE] Server Admin SDK successfully initialized!');
  } catch (err) {
    console.error('[FIREBASE] Failed to initialize Admin SDK:', err.message);
  }
} else {
  console.log('[FIREBASE] Credentials missing in .env. Server running in Firebase Fallback/Mock Mode.');
}

// Helpers

/**
 * Sync device status details to Firestore collection 'devices'
 */
async function updateFirestoreDeviceStatus(deviceId, statusData) {
  if (!firebaseEnabled) {
    console.log(`[FIREBASE MOCK] Sync device status: ${deviceId}`, statusData);
    return;
  }
  try {
    const docRef = firestoreDb.collection('devices').doc(deviceId);
    await docRef.set({
      id: deviceId,
      ...statusData,
      last_updated: FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`[FIREBASE] Synced status for device: ${deviceId}`);
  } catch (err) {
    console.error(`[FIREBASE] Error syncing device status (${deviceId}):`, err.message);
  }
}

/**
 * Sync alerts details to Firestore collection 'alerts'
 */
async function syncFirestoreAlert(alertId, alertData) {
  if (!firebaseEnabled) {
    console.log(`[FIREBASE MOCK] Sync alert: ${alertId}`, alertData);
    return;
  }
  try {
    const docRef = firestoreDb.collection('alerts').doc(alertId);
    await docRef.set({
      id: alertId,
      ...alertData,
      last_updated: FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`[FIREBASE] Synced alert details: ${alertId}`);
  } catch (err) {
    console.error(`[FIREBASE] Error syncing alert (${alertId}):`, err.message);
  }
}

/**
 * Sync notifications details to Firestore collection 'notifications'
 */
async function syncFirestoreNotification(notifId, notifData) {
  if (!firebaseEnabled) {
    console.log(`[FIREBASE MOCK] Sync notification: ${notifId}`, notifData);
    return;
  }
  try {
    const docRef = firestoreDb.collection('notifications').doc(notifId);
    await docRef.set({
      id: notifId,
      ...notifData,
      last_updated: FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`[FIREBASE] Synced notification: ${notifId}`);
  } catch (err) {
    console.error(`[FIREBASE] Error syncing notification (${notifId}):`, err.message);
  }
}

/**
 * Dispatch an FCM message to a specific registration token
 */
async function sendFcmNotification(fcmToken, title, body, dataPayload = {}) {
  if (!fcmToken || fcmToken === 'N/A' || fcmToken === 'null' || fcmToken === 'undefined') {
    console.log(`[FIREBASE] Skip push notification: Recipient token not registered`);
    return;
  }
  if (!firebaseEnabled) {
    console.log(`\n============== [FCM PUSH MOCK DISPATCH] ==============`);
    console.log(`Token: ${fcmToken}`);
    console.log(`Title: ${title}`);
    console.log(`Body:  ${body}`);
    console.log(`Data:  `, dataPayload);
    console.log(`====================================================\n`);
    return;
  }
  try {
    const message = {
      token: fcmToken,
      notification: { title, body },
      data: dataPayload
    };
    const response = await admin.messaging().send(message);
    console.log(`[FIREBASE] FCM push notification sent successfully:`, response);
  } catch (err) {
    console.error('[FIREBASE] Failed to send FCM notification:', err.message);
  }
}

/**
 * Delete device details from Firestore collection 'devices'
 */
async function deleteFirestoreDevice(deviceId) {
  if (!firebaseEnabled) {
    console.log(`[FIREBASE MOCK] Delete device: ${deviceId}`);
    return;
  }
  try {
    const docRef = firestoreDb.collection('devices').doc(deviceId);
    await docRef.delete();
    console.log(`[FIREBASE] Deleted device: ${deviceId}`);
  } catch (err) {
    console.error(`[FIREBASE] Error deleting device (${deviceId}):`, err.message);
  }
}
/**
 * Sync user details to Firestore collection 'users'
 */
async function syncFirestoreUser(userId, userData) {
  if (!firebaseEnabled) {
    console.log(`[FIREBASE MOCK] Sync user: ${userId}`, userData);
    return;
  }
  try {
    const docRef = firestoreDb.collection('users').doc(String(userId));
    const { password_hash, ...safeData } = userData;
    await docRef.set({
      id: userId,
      ...safeData,
      last_updated: FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`[FIREBASE] Synced user details: ${userId}`);
  } catch (err) {
    console.error(`[FIREBASE] Error syncing user (${userId}):`, err.message);
  }
}

/**
 * Sync sensor details to Firestore collection 'sensors'
 */
async function syncFirestoreSensor(sensorId, sensorData) {
  if (!firebaseEnabled) {
    console.log(`[FIREBASE MOCK] Sync sensor: ${sensorId}`, sensorData);
    return;
  }
  try {
    const docRef = firestoreDb.collection('sensors').doc(sensorId);
    await docRef.set({
      id: sensorId,
      ...sensorData,
      last_updated: FieldValue.serverTimestamp()
    }, { merge: true });
    console.log(`[FIREBASE] Synced sensor details: ${sensorId}`);
  } catch (err) {
    console.error(`[FIREBASE] Error syncing sensor (${sensorId}):`, err.message);
  }
}

module.exports = {
  isFirebaseEnabled: () => firebaseEnabled,
  updateFirestoreDeviceStatus,
  syncFirestoreAlert,
  syncFirestoreNotification,
  sendFcmNotification,
  deleteFirestoreDevice,
  syncFirestoreUser,
  syncFirestoreSensor
};
