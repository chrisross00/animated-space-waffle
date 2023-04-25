import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
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
console.log(app)


// Export the Firebase authentication and Firestore objects
export const auth = app.auth()
export const firestore = firebase.firestore()
export const GoogleAuthProvider = new firebase.auth.GoogleAuthProvider();
// export const SetPersistence = auth.Auth.setPersistence();
// export const browserSessionPersistence = firebase.auth().browserSessionPersistence;

async function getAuthHeaders() {
  const user = auth.currentUser;
  if (user) {
    const idToken = await user.getIdToken();
    return {
      Authorization: `Bearer ${idToken}`,
    };
  } else {
    return null;
  }
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

// export async function updateCategories() {} later...