// Import the functions you need from the SDKs you need
// import { initializeApp } from "firebase/compat/no-app";
import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
// require('dotenv').config()

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