const admin = require('firebase-admin');
require('dotenv').config();

console.log('====================================================');
console.log('FIREBASE FIRESTORE CONNECTION AUDIT & TEST');
console.log('====================================================');

const projectId = process.env.FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
let privateKey = process.env.FIREBASE_PRIVATE_KEY;

if (!projectId || !clientEmail || !privateKey) {
  console.error('FAIL: Firebase credentials are missing in .env!');
  console.error('Please configure:');
  console.error(`- FIREBASE_PROJECT_ID: "${projectId || 'MISSING'}"`);
  console.error(`- FIREBASE_CLIENT_EMAIL: "${clientEmail || 'MISSING'}"`);
  console.error(`- FIREBASE_PRIVATE_KEY: "${privateKey ? 'PRESENT' : 'MISSING'}"`);
  console.log('====================================================');
  console.log('RESULT: FAIL (Missing Credentials)');
  console.log('====================================================');
  process.exit(1);
}

console.log('Configuring Firebase Admin SDK...');
let firestoreDb = null;
try {
  privateKey = privateKey.replace(/\\n/g, '\n');
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey
    })
  });
  firestoreDb = admin.firestore();
  console.log('PASS: Firebase Admin SDK successfully initialized.');
} catch (err) {
  console.error('FAIL: Firebase Initialization failed:', err.message);
  console.log('====================================================');
  console.log('RESULT: FAIL (Initialization Error)');
  console.log('====================================================');
  process.exit(1);
}

const runTests = async () => {
  const testDocId = `verification_test_${Date.now()}`;
  const testCollection = 'firebase_test';
  const docRef = firestoreDb.collection(testCollection).doc(testDocId);
  
  const results = {
    write: 'FAIL',
    read: 'FAIL',
    update: 'FAIL',
    listener: 'FAIL',
    delete: 'FAIL'
  };

  console.log('\nRunning Firestore Verification Tests...\n');

  // 1. REALTIME LISTENER SETUP
  let listenerTriggered = false;
  let listenerData = null;
  const unsubscribe = docRef.onSnapshot((doc) => {
    if (doc.exists) {
      listenerTriggered = true;
      listenerData = doc.data();
      console.log('[LISTENER] Snapshot updated:', listenerData);
    }
  }, (err) => {
    console.error('[LISTENER] Subscription error:', err.message);
  });

  try {
    // 2. FIRESTORE WRITE
    console.log('[TEST 1/5] Writing document to Firestore...');
    const writePayload = {
      source: 'production verification',
      timestamp: new Date().toISOString(),
      status: 'pending'
    };
    await docRef.set(writePayload);
    console.log('PASS: Document written successfully.');
    results.write = 'PASS';

    // Wait short duration for listener to catch write
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 3. FIRESTORE READ
    console.log('[TEST 2/5] Reading document from Firestore...');
    const snapshot = await docRef.get();
    if (snapshot.exists) {
      const data = snapshot.data();
      console.log('Read Data:', data);
      if (data.source === 'production verification') {
        console.log('PASS: Document read and verified successfully.');
        results.read = 'PASS';
      } else {
        console.error('FAIL: Document read data does not match payload!');
      }
    } else {
      console.error('FAIL: Document does not exist in Firestore!');
    }

    // 4. FIRESTORE UPDATE
    console.log('[TEST 3/5] Updating document in Firestore...');
    await docRef.update({
      status: 'verified',
      updated_at: new Date().toISOString()
    });
    console.log('PASS: Document updated successfully.');
    results.update = 'PASS';

    // Wait short duration for listener to catch update
    await new Promise(resolve => setTimeout(resolve, 1000));

    // 5. VERIFY REALTIME LISTENER
    console.log('[TEST 4/5] Auditing Realtime Listener...');
    if (listenerTriggered && listenerData && listenerData.status === 'verified') {
      console.log('PASS: Realtime listener triggered and captured update.');
      results.listener = 'PASS';
    } else {
      console.error('FAIL: Realtime listener did not capture the update.');
    }

    // 6. FIRESTORE DELETE
    console.log('[TEST 5/5] Deleting document from Firestore...');
    await docRef.delete();
    console.log('PASS: Document deleted successfully.');
    results.delete = 'PASS';

    // Verify deletion
    const finalCheck = await docRef.get();
    if (!finalCheck.exists) {
      console.log('PASS: Verified document is deleted.');
    } else {
      console.error('FAIL: Document still exists after deletion!');
      results.delete = 'FAIL';
    }

  } catch (err) {
    console.error('Error during Firestore operations:', err.message);
  } finally {
    // Unsubscribe listener
    unsubscribe();
  }

  console.log('\n====================================================');
  console.log('FIREBASE AUDIT REPORT');
  console.log('====================================================');
  console.log(`Firestore Write:           ${results.write}`);
  console.log(`Firestore Read:            ${results.read}`);
  console.log(`Firestore Update:          ${results.update}`);
  console.log(`Firestore Realtime Sync:   ${results.listener}`);
  console.log(`Firestore Delete:          ${results.delete}`);
  console.log('====================================================');
  
  const allPassed = Object.values(results).every(r => r === 'PASS');
  console.log(`RESULT: ${allPassed ? 'PASS' : 'FAIL'}`);
  console.log('====================================================');
};

runTests();
