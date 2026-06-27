const admin = require('firebase-admin');
const firebaseService = require('../services/firebaseService');
require('dotenv').config();

console.log('====================================================');
console.log('FIRESTORE OPERATION SYNC VERIFICATION');
console.log('====================================================');

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  console.error('FAIL: Firebase Admin SDK credentials are missing in .env');
  process.exit(1);
}

const runTest = async () => {
  try {
    const { getFirestore } = require('firebase-admin/firestore');
    const db = getFirestore();

    const testUserId = `test_user_sync_${Date.now()}`;
    const testDeviceId = `test_device_sync_${Date.now()}`;
    const testAlertId = `test_alert_sync_${Date.now()}`;

    let userPass = 'FAIL';
    let devicePass = 'FAIL';
    let alertPass = 'FAIL';

    console.log(`Checking Firebase enabled in service: ${firebaseService.isFirebaseEnabled()}`);

    // 1. Verify User Sync
    console.log(`Syncing user ${testUserId}...`);
    await firebaseService.syncFirestoreUser(testUserId, {
      name: 'Verification User',
      email: 'verification_user@example.com',
      role: 'user'
    });
    
    // Fetch document from Firestore
    console.log('Fetching user document from Firestore...');
    const userDoc = await db.collection('users').doc(testUserId).get();
    if (userDoc.exists) {
      console.log('User document found in Firestore:', userDoc.data());
      userPass = 'PASS';
      // clean up
      await db.collection('users').doc(testUserId).delete();
    } else {
      console.log('User document not found in Firestore!');
    }

    // 2. Verify Device Sync
    console.log(`Syncing device ${testDeviceId}...`);
    await firebaseService.updateFirestoreDeviceStatus(testDeviceId, {
      name: 'Verification Device',
      status: 'online',
      ip_address: '192.168.1.50'
    });

    console.log('Fetching device document from Firestore...');
    const deviceDoc = await db.collection('devices').doc(testDeviceId).get();
    if (deviceDoc.exists) {
      console.log('Device document found in Firestore:', deviceDoc.data());
      devicePass = 'PASS';
      // clean up
      await db.collection('devices').doc(testDeviceId).delete();
    } else {
      console.log('Device document not found in Firestore!');
    }

    // 3. Verify Alert Sync
    console.log(`Syncing alert ${testAlertId}...`);
    await firebaseService.syncFirestoreAlert(testAlertId, {
      device_id: testDeviceId,
      type: 'critical',
      message: 'Temperature threshold exceeded'
    });

    console.log('Fetching alert document from Firestore...');
    const alertDoc = await db.collection('alerts').doc(testAlertId).get();
    if (alertDoc.exists) {
      console.log('Alert document found in Firestore:', alertDoc.data());
      alertPass = 'PASS';
      // clean up
      await db.collection('alerts').doc(testAlertId).delete();
    } else {
      console.log('Alert document not found in Firestore!');
    }

    console.log('\n====================================================');
    console.log('VERIFICATION RESULTS');
    console.log('====================================================');
    console.log(`Creating user creates a Firestore document: ${userPass}`);
    console.log(`Registering a device creates a Firestore document: ${devicePass}`);
    console.log(`Generating an alert creates a Firestore document: ${alertPass}`);
    console.log('====================================================');

  } catch (err) {
    console.error('Test execution failed with error:', err);
  }
};

runTest();
