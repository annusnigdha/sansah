import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';
import { getMessaging, getToken, onMessage } from 'firebase/messaging';
import { getAnalytics, logEvent } from 'firebase/analytics';
import { getPerformance, trace } from 'firebase/performance';

let firebaseApp = null;
let firestoreDb = null;
let firebaseMessaging = null;
let firebaseAnalytics = null;
let firebasePerformance = null;
let firebaseEnabled = false;

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY || 'BF5Q3XfW04WvXm7K-t2734567890'; // placeholder

if (import.meta.env.VITE_FIREBASE_API_KEY) {
  try {
    firebaseApp = initializeApp(firebaseConfig);
    firestoreDb = getFirestore(firebaseApp);
    
    // Messaging only supported in HTTPS or localhost environments
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      firebaseMessaging = getMessaging(firebaseApp);
    }
    
    firebaseAnalytics = getAnalytics(firebaseApp);
    firebasePerformance = getPerformance(firebaseApp);
    firebaseEnabled = true;
    console.log('[FIREBASE] Web SDK successfully initialized!');
  } catch (err) {
    console.error('[FIREBASE] Failed to initialize Web SDK:', err.message);
  }
} else {
  console.log('[FIREBASE] Vite variables missing. Running in Fallback/Mock Mode.');
}

// FCM token getter helper
export async function getFcmToken() {
  if (!firebaseEnabled || !firebaseMessaging) {
    console.log('[FIREBASE MOCK] getFcmToken: Firebase not enabled');
    return 'MOCK_FCM_TOKEN_' + Date.now();
  }
  try {
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const currentToken = await getToken(firebaseMessaging, { vapidKey });
      if (currentToken) {
        return currentToken;
      } else {
        console.log('[FIREBASE] No registration token available. Request permission to generate one.');
        return null;
      }
    } else {
      console.log('[FIREBASE] Browser notification permission denied.');
      return null;
    }
  } catch (err) {
    console.error('[FIREBASE] Error retrieving FCM token:', err.message);
    return null;
  }
}

// onMessage foreground listener helper
export function onFcmMessage(callback) {
  if (!firebaseEnabled || !firebaseMessaging) {
    return () => {}; // return empty unsubscribe hook
  }
  return onMessage(firebaseMessaging, (payload) => {
    console.log('[FIREBASE] Foreground message received:', payload);
    callback(payload);
  });
}

// Analytics logger helper
export function logFirebaseEvent(eventName, params = {}) {
  if (!firebaseEnabled || !firebaseAnalytics) {
    console.log(`[FIREBASE ANALYTICS MOCK] Event: ${eventName}`, params);
    return;
  }
  try {
    logEvent(firebaseAnalytics, eventName, params);
    console.log(`[FIREBASE] Logged analytics event: ${eventName}`);
  } catch (err) {
    console.error(`[FIREBASE] Error logging analytics event (${eventName}):`, err.message);
  }
}

// Performance monitoring trace helper
export function tracePerformanceMetric(traceName, durationMs) {
  if (!firebaseEnabled || !firebasePerformance) {
    console.log(`[FIREBASE PERF MOCK] Performance Trace: ${traceName} - ${durationMs}ms`);
    return;
  }
  try {
    const t = trace(firebasePerformance, traceName);
    t.start();
    // Simulate duration by ending after timeout or logging directly if we are recording custom intervals
    setTimeout(() => {
      t.stop();
      console.log(`[FIREBASE] Stopped performance trace: ${traceName}`);
    }, durationMs);
  } catch (err) {
    console.error(`[FIREBASE] Error tracking performance trace (${traceName}):`, err.message);
  }
}

export {
  firebaseEnabled,
  firebaseApp,
  firestoreDb,
  firebaseMessaging,
  firebaseAnalytics,
  firebasePerformance
};
