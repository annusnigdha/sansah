// Service Worker for Firebase Cloud Messaging background notifications
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.23.0/firebase-messaging-compat.js');

// Initialize the Firebase app in the service worker by passing in the messagingSenderId.
firebase.initializeApp({
  apiKey: 'placeholder-key',
  authDomain: 'placeholder-auth',
  projectId: 'placeholder-project',
  storageBucket: 'placeholder-storage',
  messagingSenderId: 'placeholder-sender-id',
  appId: 'placeholder-app-id',
  measurementId: 'placeholder-measurement-id'
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'Sansah IoT System Alert';
  const notificationOptions = {
    body: payload.notification?.body || 'A critical telemetry threshold breach has been detected.',
    icon: '/logo.png', // Fallback icon path
    data: payload.data
  };

  self.registration.showNotification(notificationTitle, notificationOptions);
});
