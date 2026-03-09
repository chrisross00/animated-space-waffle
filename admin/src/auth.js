import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const app = firebase.initializeApp(firebaseConfig);
export const auth = app.auth();
export const GoogleAuthProvider = new firebase.auth.GoogleAuthProvider();

let _authReadyResolve;
export const authReady = new Promise(resolve => { _authReadyResolve = resolve; });
auth.onAuthStateChanged(() => { _authReadyResolve(); });

export async function getAuthHeaders() {
  if (import.meta.env.VITE_DEV_AUTH_BYPASS === 'true') {
    return { Authorization: 'Bearer dev-bypass' };
  }
  const user = auth.currentUser;
  if (!user) return null;
  const idToken = await user.getIdToken();
  return { Authorization: `Bearer ${idToken}` };
}

export async function signInWithGoogle() {
  return auth.signInWithPopup(GoogleAuthProvider);
}

export function signOut() {
  return auth.signOut();
}
