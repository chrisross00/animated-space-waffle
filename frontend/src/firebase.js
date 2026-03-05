import firebase from 'firebase/compat/app';
import 'firebase/compat/auth';
import 'firebase/compat/firestore';
import { getAuth } from '@firebase/auth'
import { Notify } from 'quasar'

const _notify = (opts) => {
  const isMobile = window.innerWidth < 600;
  const navHeight = isMobile
    ? parseInt(getComputedStyle(document.documentElement).getPropertyValue('--basil-bottom-nav-height')) || 72
    : 0;
  Notify.create({ position: 'bottom', ...(navHeight ? { offset: [0, navHeight] } : {}), ...opts });
}
// import 'firebase/GoogleAuthProvider'
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);

// Export the Firebase authentication and Firestore objects
export const auth = app.auth()
export const firestore = firebase.firestore()
export const GoogleAuthProvider = new firebase.auth.GoogleAuthProvider();

export async function getAuthHeaders() {
  // Dev auth bypass — skip Firebase entirely when flag is set
  if (import.meta.env.VITE_DEV_AUTH_BYPASS === 'true') {
    return { Authorization: 'Bearer dev-bypass' };
  }

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
      const transactions = await response.json();
      return transactions;
    } else {
      _notify({ type: 'negative', message: `Failed to fetch transactions (${response.status})` });
    }
  } else {
    // User is not signed in
    console.log('headers are null, therefore user is not logged in');
  }
}

export async function fetchCategories() {
  const headers = await getAuthHeaders();
  if (headers) {
    const response = await fetch('/api/getcategories', { headers });
    if (response.ok) {
      const categories = await response.json();
      return categories;
    } else {
      _notify({ type: 'negative', message: `Failed to fetch categories (${response.status})` });
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
      _notify({ type: 'negative', message: `Failed to load user (${response.status})` });
    }
  } else {
    // User is not signed in
    console.log('headers are null, therefore user is not logged in');
  }
}

export async function getOrAddUserAccount(publicToken, metadata) {
  console.log("getOrAddUserAccount(): current auth is", auth)
  console.log("getOrAddUserAccount(): current publicToken is", publicToken)
  console.log("getOrAddUserAccount(): current metadata is", metadata)
  const headers = await getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    const response = await fetch('/plaid-api/exchange_public_token', { 
      method: 'POST',
      headers: headers, 
      body: JSON.stringify({ 
      public_token: publicToken,
      metadata: metadata
    })});
    if (response.ok) {
      return response.json();
    } else {
      _notify({ type: 'negative', message: `Failed to link account (${response.status})` });
    }
  } else {
    // User is not signed in
    console.log('headers are null, therefore user is not logged in');
  }
}

export async function handleDialogSubmit(dialogBody) {
  console.log("(): current auth is", auth)
  const headers = await getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    console.log('firebase.handleDialogSubmit(): dialog body is', dialogBody);
    const response = await fetch('/api/handleDialogSubmit', {
      method: 'POST',
      headers: headers,
      body: dialogBody,
    });
    // const data = await response;
    if (response.ok) {
      // console.log('data is', data);
      return response.json();
    } else {
      _notify({ type: 'negative', message: `Failed to save changes (${response.status})` });
    }
  } else {
    console.log('headers are null, therefore user is not logged in');
  }
}

export async function removeAccount(institution) {
  const headers = await getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    const response = await fetch('/plaid-api/remove_account', {
      method: 'POST',
      headers,
      body: JSON.stringify({ institution }),
    });
    if (response.ok) {
      return response.json();
    } else {
      _notify({ type: 'negative', message: `Failed to remove account (${response.status})` });
    }
  }
}

export async function addPlaidPfc() {
  const headers = await getAuthHeaders();
  if (headers) {
    const response = await fetch('/api/addplaidpfc', { headers });
    if (response.ok) return response.text();
    else _notify({ type: 'negative', message: `Failed to add Plaid PFC (${response.status})` });
  }
}

export async function dedupe() {
  const headers = await getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/dedupe', { method: 'POST', headers });
    if (response.ok) return response.text();
    else _notify({ type: 'negative', message: `Dedupe failed (${response.status})` });
  }
}

export async function seedCategories() {
  const headers = await getAuthHeaders();
  if (headers) {
    const response = await fetch('/api/seedcategories', { headers });
    if (response.ok) return response.text();
    else _notify({ type: 'negative', message: `Failed to seed categories (${response.status})` });
  }
}

export async function cleanPending() {
  const headers = await getAuthHeaders();
  if (headers) {
    const response = await fetch('/api/cleanPendingTransactions', { headers });
    if (response.ok) return response.text();
    else _notify({ type: 'negative', message: `Failed to clean pending transactions (${response.status})` });
  }
}

export async function mapUnmapped() {
  const headers = await getAuthHeaders();
  if (headers) {
    const response = await fetch('/api/mapunmapped', { headers });
    if (response.ok) return response.json();
    else _notify({ type: 'negative', message: `Failed to map unmapped transactions (${response.status})` });
  } else {
    console.log('headers are null, therefore user is not logged in');
  }
}

export async function fetchMerchantStats() {
  const headers = await getAuthHeaders();
  if (headers) {
    const response = await fetch('/api/merchantStats', { headers });
    if (response.ok) return response.json();
    else _notify({ type: 'negative', message: `Failed to fetch merchant stats (${response.status})` });
  }
}

export async function fetchMerchants() {
  const headers = await getAuthHeaders();
  if (headers) {
    const response = await fetch('/api/merchants', { headers });
    if (response.ok) return response.json();
    else _notify({ type: 'negative', message: `Failed to fetch merchants (${response.status})` });
  }
}

export async function saveRule(categoryId, categoryName, ruleType, ruleValue) {
  const headers = await getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/saveRule', {
      method: 'POST',
      headers,
      body: JSON.stringify({ categoryId, categoryName, ruleType, ruleValue }),
    });
    if (response.ok) return response.json();
    else _notify({ type: 'negative', message: `Failed to save rule (${response.status})` });
  }
}

export async function deleteRule(categoryId, ruleType, ruleValue) {
  const headers = await getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/deleteRule', {
      method: 'POST',
      headers,
      body: JSON.stringify({ categoryId, ruleType, ruleValue }),
    });
    if (response.ok) return response.json();
    else _notify({ type: 'negative', message: `Failed to delete rule (${response.status})` });
  }
}

export async function bulkCategorize(transaction_ids, mappedCategory) {
  const headers = await getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/bulkCategorize', {
      method: 'POST',
      headers,
      body: JSON.stringify({ transaction_ids, mappedCategory }),
    });
    if (response.ok) return response.json();
    else _notify({ type: 'negative', message: `Bulk categorize failed (${response.status})` });
  }
}

export async function deleteCategory(categoryId) {
  const headers = await getAuthHeaders();
  if (!headers) return;
  headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/deleteCategory', {
    method: 'POST',
    headers,
    body: JSON.stringify({ categoryId }),
  });
  if (!response.ok) _notify({ type: 'negative', message: `Failed to delete category (${response.status})` });
  return response.ok;
}

export async function updateBudgetLimit(categoryId, monthly_limit) {
  const headers = await getAuthHeaders();
  if (!headers) return;
  headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/updateBudgetLimit', {
    method: 'POST',
    headers,
    body: JSON.stringify({ categoryId, monthly_limit }),
  });
  if (!response.ok) _notify({ type: 'negative', message: `Failed to save limit (${response.status})` });
  return response.ok;
}

export async function nukeTransactions() {
  const headers = await getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/nukeTransactions', { method: 'POST', headers });
    if (response.ok) {
      const data = await response.json();
      return `Deleted ${data.deletedCount} transaction${data.deletedCount !== 1 ? 's' : ''}.`;
    } else {
      _notify({ type: 'negative', message: `Nuke failed (${response.status})` });
    }
  }
}

export async function nukeAllData() {
  const headers = await getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/nukeAllData', { method: 'POST', headers });
    if (response.ok) {
      const data = await response.json();
      return `Deleted ${data.transactions} transactions, ${data.categories} categories, ${data.accounts} accounts.`;
    } else {
      _notify({ type: 'negative', message: `Nuke failed (${response.status})` });
    }
  }
}

export async function addVenmoTransactions() {
  const headers = await getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/addVenmoTransactions', { method: 'POST', headers });
    if (response.ok) {
      const data = await response.json();
      return `Inserted ${data.inserted} transactions (5 historical seeded as "${data.foodCat}" / "${data.housingCat}", 5 current month in To Sort).`;
    } else {
      _notify({ type: 'negative', message: `Failed to add Venmo test transactions (${response.status})` });
    }
  }
}

export async function addTestTransactions() {
  const headers = await getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/addTestTransactions', { method: 'POST', headers });
    if (response.ok) {
      const data = await response.json();
      return `Inserted ${data.inserted} test transactions dated today.`;
    } else {
      _notify({ type: 'negative', message: `Failed to add test transactions (${response.status})` });
    }
  }
}

// export async function updateCategories() {} later...
