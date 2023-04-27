import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import { getAuth } from '@firebase/auth'
// import 'firebase/GoogleAuthProvider'
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: process.env.VUE_APP_FIREBASE_API_KEY,
  authDomain: process.env.VUE_APP_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VUE_APP_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VUE_APP_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VUE_APP_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VUE_APP_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);

// Export the Firebase authentication and Firestore objects
export const auth = app.auth()
export const firestore = firebase.firestore()
export const GoogleAuthProvider = new firebase.auth.GoogleAuthProvider();

async function getAuthHeaders() {
  const authInstance = getAuth();

  return new Promise((resolve, reject) => {
    const unsubscribe = authInstance.onAuthStateChanged(async (user) => {
      unsubscribe(); // Remove the listener after it's called once.
      
      if (user) {
        console.log('getAuthHeaders', user);
        const idToken = await user.getIdToken();
        resolve({
          Authorization: `Bearer ${idToken}`,
        });
      } else {
        resolve(null);
      }
    }, reject);
  });
}
export async function fetchTransactions() {
  const headers = await getAuthHeaders();
  if (headers) {
    const response = await fetch('/api/getNewAuth', { headers });
    if (response.ok) {
      const transactions = response.json();
      return transactions;
    } else {
      // Handle errors
      console.error(`Request failed with status ${response.status}`);
    }
  } else {
    // User is not signed in
    console.log('headers are null, therefore user is not logged in');
  }
}

export async function getOrAddUser() {
  console.log("getOrAddUser(): current auth is", auth)
  const headers = await getAuthHeaders();
  if (headers) {
    const response = await fetch('/api/getOrAddUser', { headers });
    const data = await response.json();
    if (response.ok) {
      const user = data
      return user;
    } else {
      // Handle errors
      console.error(`Request failed with status ${response.status}`);
    }
  } else {
    // User is not signed in
    console.log('headers are null, therefore user is not logged in');
  }
}

// export async function updateCategories() {} later...
