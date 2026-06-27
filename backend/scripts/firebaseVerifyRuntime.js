const admin = require('firebase-admin');
require('dotenv').config();

console.log('====================================================');
console.log('FIRESTORE RUNTIME VERIFICATION (PROMPT COMPLIANT)');
console.log('====================================================');

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

const results = {
  frontendEnabled: false,
  backendEnabled: false,
  write: 'FAIL',
  read: 'FAIL',
  update: 'FAIL',
  listener: 'FAIL',
  delete: 'FAIL'
};

// Check frontend env variables loaded in Node process env (if set globally or locally)
if (process.env.VITE_FIREBASE_API_KEY) {
  results.frontendEnabled = true;
}

if (!projectId || !clientEmail || !privateKey) {
  console.log('STATUS: Firebase Admin SDK credentials are missing in .env.');
} else {
  results.backendEnabled = true;
}

const runTest = async () => {
  if (!results.backendEnabled) {
    printReport();
    process.exit(0);
  }

  console.log('Initializing Firebase Admin SDK...');
  try {
    privateKey = privateKey.replace(/\\n/g, '\n');
    const certConfig = {
      projectId,
      clientEmail,
      privateKey
    };
    admin.initializeApp({
      credential: admin.credential ? admin.credential.cert(certConfig) : admin.cert(certConfig)
    });
    const { getFirestore } = require('firebase-admin/firestore');
    const db = getFirestore();
    const testDocId = `runtime_verif_${Date.now()}`;
    const docRef = db.collection('firebase_test').doc(testDocId);

    // 1. REALTIME LISTENER
    let listenerReceived = false;
    const unsubscribe = docRef.onSnapshot((snapshot) => {
      if (snapshot.exists) {
        listenerReceived = true;
      }
    });

    // 2. WRITE
    console.log('Testing Firestore Write...');
    await docRef.set({
      source: 'runtime verification',
      timestamp: new Date().toISOString()
    });
    results.write = 'PASS';

    // Wait for listener to catch write
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 3. READ
    console.log('Testing Firestore Read...');
    const snap = await docRef.get();
    if (snap.exists && snap.data().source === 'runtime verification') {
      results.read = 'PASS';
    }

    // 4. UPDATE
    console.log('Testing Firestore Update...');
    await docRef.update({
      updated: true
    });
    results.update = 'PASS';

    // Wait for listener to catch update
    await new Promise(resolve => setTimeout(resolve, 1000));

    if (listenerReceived) {
      results.listener = 'PASS';
    }

    // 5. DELETE
    console.log('Testing Firestore Delete...');
    await docRef.delete();
    const snapAfterDelete = await docRef.get();
    if (!snapAfterDelete.exists) {
      results.delete = 'PASS';
    }

    unsubscribe();
  } catch (err) {
    console.error('Error occurred during active test:', err.message);
  }

  printReport();
};

function printReport() {
  console.log('\n====================================================');
  console.log('FIREBASE RUNTIME VERIFICATION MATRIX');
  console.log('====================================================');
  console.log(`Firebase Frontend Status = ${results.frontendEnabled ? 'PASS' : 'FAIL'}`);
  console.log(`Firebase Backend Status  = ${results.backendEnabled ? 'PASS' : 'FAIL'}`);
  console.log(`Firestore Write          = ${results.write}`);
  console.log(`Firestore Read           = ${results.read}`);
  console.log(`Firestore Realtime Sync  = ${results.listener}`);
  console.log(`Firestore Delete         = ${results.delete}`);
  console.log('====================================================');
}

runTest();
