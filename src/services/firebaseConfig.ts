import { initializeApp, getApps, getApp, FirebaseApp } from 'firebase/app';
import { getAuth, Auth } from 'firebase/auth';
import { getFirestore, Firestore } from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider, AppCheck } from 'firebase/app-check';

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyBJ8-brW_T9zzeWjzZTAhXnlrxG3wDrwlI",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "online-store-fc218.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "online-store-fc218",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "online-store-fc218.appspot.com",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "307608454112",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:307608454112:web:0807aab2d9ce964ec46185",
};

export const app: FirebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth: Auth = getAuth(app);
export const db: Firestore = getFirestore(app);

let appCheck: AppCheck | null = null;
if (typeof window !== 'undefined' && import.meta.env.VITE_FIREBASE_APPCHECK_KEY) {
  try {
    appCheck = initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(import.meta.env.VITE_FIREBASE_APPCHECK_KEY),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.warn('Firebase App Check initialization skipped:', err);
  }
}

export { appCheck };
