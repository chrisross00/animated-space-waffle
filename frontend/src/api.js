import { Notify } from 'quasar'

const _notify = (opts) => {
  const isMobile = window.innerWidth < 600;
  const navHeight = isMobile
    ? parseInt(getComputedStyle(document.documentElement).getPropertyValue('--basil-bottom-nav-height')) || 72
    : 0;
  Notify.create({ position: 'bottom', ...(navHeight ? { offset: [0, navHeight] } : {}), ...opts });
}

// --- Auth helpers ---

export function getAuthHeaders() {
  // Impersonation token from admin portal "Login As" flow
  const impersonateToken = sessionStorage.getItem('impersonate-token');
  if (impersonateToken) {
    return { Authorization: `Bearer impersonate:${impersonateToken}` };
  }
  if (import.meta.env.VITE_DEV_AUTH_BYPASS === 'true') {
    return { Authorization: 'Bearer dev-bypass' };
  }
  const token = localStorage.getItem('basil-token');
  if (!token) return null;
  return { Authorization: `Bearer ${token}` };
}

export function signOut() {
  localStorage.removeItem('basil-token');
  localStorage.removeItem('basil-store');
  sessionStorage.removeItem('impersonate-token');
}

/**
 * Consume ?token= from URL after OAuth callback redirect.
 * Stores the JWT and strips the param from the URL.
 * @returns {boolean} true if a token was consumed
 */
export function consumeAuthToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (!token) return false;

  localStorage.setItem('basil-token', token);

  // Strip token from URL without reload
  params.delete('token');
  const clean = params.toString();
  const url = window.location.pathname + (clean ? `?${clean}` : '');
  window.history.replaceState({}, '', url);
  return true;
}

// ---- Data layer v2: separate sync from read ----

/** Trigger Plaid transaction sync (no transaction data returned). */
export async function triggerSync() {
  const headers = getAuthHeaders();
  if (!headers) return null;
  headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/sync', { method: 'POST', headers });
  if (response.ok) return response.json();
  // 403 = test user or unauthorized — don't show error toast (expected for test users)
  if (response.status !== 403) {
    _notify({ type: 'negative', message: `Sync failed (${response.status})` });
  }
  return null;
}

/** Create a Plaid Link token in update mode for reconnecting a stale institution. */
export async function createUpdateLinkToken(institution) {
  const headers = getAuthHeaders();
  if (!headers) return null;
  const response = await fetch(`/plaid-api/create_update_link_token?institution=${encodeURIComponent(institution)}`, { headers });
  if (response.ok) return response.json();
  _notify({ type: 'negative', message: `Failed to create reconnect token (${response.status})` });
  return null;
}

/** Clear a persisted item error after successful reconnect. */
export async function clearItemError(institution) {
  const headers = getAuthHeaders();
  if (!headers) return null;
  headers['Content-Type'] = 'application/json';
  const response = await fetch('/plaid-api/clear_item_error', {
    method: 'POST', headers,
    body: JSON.stringify({ institution }),
  });
  if (response.ok) return response.json();
  return null;
}

/** Fetch a single month's transactions from the database (no Plaid call). */
export async function fetchTransactionsForMonth(month) {
  const headers = getAuthHeaders();
  if (!headers) return null;
  const response = await fetch(`/api/transactions?month=${month}`, { headers });
  if (response.ok) return response.json();
  else _notify({ type: 'negative', message: `Failed to fetch transactions (${response.status})` });
  return null;
}

/**
 * Fetch a range of months, skipping any already cached in the store.
 * Fetches missing months in parallel for speed.
 */
export async function fetchMonthRange(store, startMonth, endMonth) {
  const months = [];
  let d = startMonth;
  while (d <= endMonth) {
    months.push(d);
    // Increment month string: "2026-01" → "2026-02"
    const [y, m] = d.split('-').map(Number);
    const next = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    d = next;
  }
  const missing = months.filter(m => !store.state.transactionsByMonth[m]);
  if (missing.length === 0) return;
  const results = await Promise.all(missing.map(m => fetchTransactionsForMonth(m)));
  for (let i = 0; i < missing.length; i++) {
    if (results[i]?.transactions?.length > 0) {
      store.commit('setMonthTransactions', { month: missing[i], transactions: results[i].transactions });
    }
  }
}

/** Search transactions server-side (for "Show all" table). */
export async function searchTransactions(search, page = 1, limit = 500) {
  const headers = getAuthHeaders();
  if (!headers) return null;
  const params = new URLSearchParams({ page, limit });
  if (search) params.set('search', search);
  const response = await fetch(`/api/transactions?${params}`, { headers });
  if (response.ok) return response.json();
  return null;
}

/** Fetch historical category map (lightweight, for suggestion engine). */
export async function fetchHistoricalCategoryMap() {
  const headers = getAuthHeaders();
  if (!headers) return null;
  const response = await fetch('/api/historicalCategoryMap', { headers });
  if (response.ok) return response.json();
  return null;
}

export async function fetchCategories() {
  const headers = getAuthHeaders();
  if (headers) {
    const response = await fetch('/api/getcategories', { headers });
    if (response.ok) {
      const categories = await response.json();
      return categories;
    } else {
      _notify({ type: 'negative', message: `Failed to fetch categories (${response.status})` });
    }
  }
}

export async function getOrAddUser() {
  const headers = getAuthHeaders();
  if (headers) {
    const response = await fetch('/api/getOrAddUser', { headers });
    const data = await response.json();
    if (response.ok) {
      return data;
    } else {
      _notify({ type: 'negative', message: `Failed to load user (${response.status})` });
    }
  }
}

export async function getOrAddUserAccount(publicToken, metadata) {
  const headers = getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    const response = await fetch('/plaid-api/exchange_public_token', {
      method: 'POST',
      headers,
      body: JSON.stringify({
      public_token: publicToken,
      metadata,
    })});
    if (response.ok) {
      return response.json();
    } else {
      _notify({ type: 'negative', message: `Failed to link account (${response.status})` });
    }
  }
}

export async function handleDialogSubmit(dialogBody) {
  const headers = getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/handleDialogSubmit', {
      method: 'POST',
      headers,
      body: dialogBody,
    });
    if (response.ok) {
      return response.json();
    } else {
      _notify({ type: 'negative', message: `Failed to save changes (${response.status})` });
    }
  }
}

export async function removeAccount(institution) {
  const headers = getAuthHeaders();
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

export async function createManualAccount({ institution, accountName, accountType, balance }) {
  const headers = getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    const response = await fetch('/api/manualAccount', {
      method: 'POST',
      headers,
      body: JSON.stringify({ institution, accountName, accountType, balance }),
    });
    if (response.ok) return response.json();
    const err = await response.json().catch(() => ({}));
    _notify({ type: 'negative', message: err.message || `Failed to create account (${response.status})` });
  }
}

export async function updateManualAccount(itemId, { balance, accountName }) {
  const headers = getAuthHeaders();
  if (headers) {
    headers['Content-Type'] = 'application/json';
    const response = await fetch(`/api/manualAccount/${itemId}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify({ balance, accountName }),
    });
    if (response.ok) return response.json();
    _notify({ type: 'negative', message: `Failed to update account (${response.status})` });
  }
}

export async function seedCategories(targetUserId) {
  const headers = getAuthHeaders();
  if (headers) {
    const url = targetUserId ? `/api/seedcategories?targetUserId=${targetUserId}` : '/api/seedcategories';
    const response = await fetch(url, { headers });
    if (response.ok) return response.text();
    else _notify({ type: 'negative', message: `Failed to seed categories (${response.status})` });
  }
}


export async function fetchMerchantStats() {
  const headers = getAuthHeaders();
  if (headers) {
    const response = await fetch('/api/merchantStats', { headers });
    if (response.ok) return response.json();
    else _notify({ type: 'negative', message: `Failed to fetch merchant stats (${response.status})` });
  }
}

export async function fetchMerchants() {
  const headers = getAuthHeaders();
  if (headers) {
    const response = await fetch('/api/merchants', { headers });
    if (response.ok) return response.json();
    else _notify({ type: 'negative', message: `Failed to fetch merchants (${response.status})` });
  }
}

export async function saveRule(categoryId, categoryName, ruleType, ruleValue) {
  const headers = getAuthHeaders();
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
  const headers = getAuthHeaders();
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
  const headers = getAuthHeaders();
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
  const headers = getAuthHeaders();
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
  const headers = getAuthHeaders();
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

export async function fetchRules() {
  const headers = getAuthHeaders();
  if (headers) {
    const response = await fetch('/api/rules', { headers });
    if (response.ok) return response.json();
    else _notify({ type: 'negative', message: `Failed to fetch rules (${response.status})` });
  }
}

export async function saveCompoundRule(rule) {
  const headers = getAuthHeaders();
  if (!headers) return;
  headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/saveCompoundRule', {
    method: 'POST',
    headers,
    body: JSON.stringify(rule),
  });
  if (response.ok) return response.json();
  if (response.status === 409) { _notify({ type: 'info', message: 'A rule with these conditions already exists.' }); return null; }
  else _notify({ type: 'negative', message: `Failed to save rule (${response.status})` });
}

export async function updateCompoundRule(ruleId, label, conditions, action, reapply = false) {
  const headers = getAuthHeaders();
  if (!headers) return;
  headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/updateCompoundRule', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ruleId, label, conditions, action, reapply }),
  });
  if (response.ok) return response.json();
  else _notify({ type: 'negative', message: `Failed to update rule (${response.status})` });
}

export async function deleteCompoundRule(ruleId) {
  const headers = getAuthHeaders();
  if (!headers) return;
  headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/deleteCompoundRule', {
    method: 'POST',
    headers,
    body: JSON.stringify({ ruleId }),
  });
  if (response.ok) return response.json();
  else _notify({ type: 'negative', message: `Failed to delete rule (${response.status})` });
}


export async function venmoEnrichmentPreview(csvText) {
  const headers = getAuthHeaders();
  if (!headers) return;
  headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/venmoEnrichment/preview', {
    method: 'POST',
    headers,
    body: JSON.stringify({ csvText }),
  });
  if (response.ok) return response.json();
  const data = await response.json().catch(() => ({}));
  _notify({ type: 'negative', message: data.message || `Venmo import failed (${response.status})` });
}

export async function venmoEnrichmentApply(enrichments) {
  const headers = getAuthHeaders();
  if (!headers) return;
  headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/venmoEnrichment/apply', {
    method: 'POST',
    headers,
    body: JSON.stringify({ enrichments }),
  });
  if (response.ok) return response.json();
  _notify({ type: 'negative', message: `Failed to update Venmo transactions (${response.status})` });
}

export async function linkTransactions(transactionId, partnerId, type, signals, effectiveDate, recategorize) {
  const headers = getAuthHeaders();
  if (!headers) return;
  headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/linkTransactions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ transactionId, partnerId, type, signals, ...(effectiveDate && { effectiveDate }), ...(recategorize && { recategorize }) }),
  });
  if (response.ok) return response.json();
  _notify({ type: 'negative', message: `Failed to link transactions (${response.status})` });
}

export async function dismissRelationship(transactionId, partnerId) {
  const headers = getAuthHeaders();
  if (!headers) return;
  headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/dismissRelationship', {
    method: 'POST',
    headers,
    body: JSON.stringify({ transactionId, ...(partnerId && { partnerId }) }),
  });
  if (response.ok) return response.json();
  _notify({ type: 'negative', message: `Failed to dismiss relationship (${response.status})` });
}

export async function unlinkTransactions(transactionId, partnerId, revertCategory) {
  const headers = getAuthHeaders();
  if (!headers) return;
  headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/unlinkTransactions', {
    method: 'POST',
    headers,
    body: JSON.stringify({ transactionId, partnerId, ...(revertCategory && { revertCategory }) }),
  });
  if (response.ok) return response.json();
  _notify({ type: 'negative', message: `Failed to unlink transactions (${response.status})` });
}

export async function undoDismissRelationship(transactionId, partnerId) {
  const headers = getAuthHeaders();
  if (!headers) return;
  headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/undoDismissRelationship', {
    method: 'POST',
    headers,
    body: JSON.stringify({ transactionId, ...(partnerId && { partnerId }) }),
  });
  if (response.ok) return response.json();
  _notify({ type: 'negative', message: `Failed to undo dismiss (${response.status})` });
}

export async function deleteAccount() {
  const headers = getAuthHeaders();
  if (!headers) return;
  headers['Content-Type'] = 'application/json';
  const response = await fetch('/api/nukeAllData', { method: 'POST', headers });
  if (response.ok) return response.json();
  _notify({ type: 'negative', message: `Failed to delete account (${response.status})` });
}

// ---------------------------------------------------------------------------
// App bootstrap — fetch all core data if the store is empty.
// Singleton promise prevents duplicate in-flight requests when multiple
// components call ensureAppData concurrently on the same page load.
// ---------------------------------------------------------------------------
let _bootstrapPromise = null;

export async function ensureAppData(store) {
  if (!store.state.user?.onboarded_at) return;       // not onboarded yet
  if (Object.keys(store.state.transactionsByMonth).length > 0) return; // already loaded
  if (_bootstrapPromise) return _bootstrapPromise;   // already in flight

  store.commit('setBootstrapping', true);
  const hasAccounts = store.state.user?.accounts?.length > 0;
  _bootstrapPromise = (async () => {
    try {
      // Fetch categories + rules (small, bounded data)
      const [categories, rules] = await Promise.all([
        fetchCategories(),
        fetchRules(),
      ]);
      if (categories) store.commit('setCategories', categories);
      if (rules)      store.commit('setRules', rules);

      // Fetch transactions month-by-month from DB (no Plaid call)
      if (hasAccounts) {
        const now = new Date();
        const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        // Load current month + 3 prior (for recurring detection + suggestions)
        const startDate = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        const startMonth = `${startDate.getFullYear()}-${String(startDate.getMonth() + 1).padStart(2, '0')}`;
        await fetchMonthRange(store, startMonth, currentMonth);
      }
    } finally {
      store.commit('setBootstrapping', false);
      _bootstrapPromise = null;
    }
  })();

  return _bootstrapPromise;
}
