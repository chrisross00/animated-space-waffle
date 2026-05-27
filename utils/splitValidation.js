// utils/splitValidation.js
//
// Pure validator + sign-applier for transaction splits.
//
// Encapsulates the gate checks, sum-balance validation, and parent-sign
// application that the POST /api/split route needs. Extracting this from the
// route lets us unit-test the logic directly without supertest/DB scaffolding.
//
// Sign convention recap:
//   - Basil stores expenses as positive amounts, income as negative.
//   - The split editor always takes positive entries (UX hides the sign).
//   - This function validates entries against |parent.amount|, then multiplies
//     each entry by Math.sign(parent.amount) so children inherit the parent's
//     sign at persistence time (income children stay negative, expense
//     children stay positive, refund children stay negative inside expense
//     categories — where freeCashFlow then nets per-category before abs).

/**
 * @param {object} parent — the parent transaction row with fields:
 *   { amount, pending, parentTransactionId, isSplitParent }
 * @param {Array<{ amount: number, categoryName: string, note?: string|null }>} splits
 *   — split rows as submitted by the client (amounts always positive).
 *
 * @returns {{ ok: true, signedSplits: Array }
 *         | { ok: false, status: number, message: string }}
 */
function validateAndSignSplits(parent, splits) {
  // Shape checks
  if (!Array.isArray(splits) || splits.length < 2) {
    return { ok: false, status: 400, message: 'At least 2 splits required' };
  }
  if (splits.length > 20) {
    return { ok: false, status: 400, message: 'Maximum 20 splits allowed' };
  }

  // Parent gates
  if (parent.pending) {
    return { ok: false, status: 400, message: 'Cannot split pending transactions' };
  }
  if (parent.parentTransactionId) {
    return { ok: false, status: 400, message: 'Cannot split a split child' };
  }
  if (parent.isSplitParent) {
    return { ok: false, status: 400, message: 'Transaction is already split. Unsplit first.' };
  }

  // Per-row validation
  for (const s of splits) {
    if (typeof s.amount !== 'number' || s.amount <= 0) {
      return { ok: false, status: 400, message: 'All split amounts must be positive numbers' };
    }
    if (!s.categoryName || typeof s.categoryName !== 'string') {
      return { ok: false, status: 400, message: 'All splits must have a categoryName' };
    }
  }

  // Sum must match |parent.amount| (sign-agnostic — see header comment).
  const splitSum = splits.reduce((sum, s) => sum + s.amount, 0);
  const parentMagnitude = Math.abs(Number(parent.amount));
  if (Math.abs(splitSum - parentMagnitude) > 0.01) {
    return {
      ok: false,
      status: 400,
      message: `Split amounts ($${splitSum.toFixed(2)}) must equal transaction amount ($${parentMagnitude.toFixed(2)})`,
    };
  }

  // Apply parent sign to each child. Defaults to +1 for amount 0 (which the
  // positive-sum check above rules out in practice).
  const sign = Math.sign(Number(parent.amount)) || 1;
  const signedSplits = splits.map((s) => ({
    amount: s.amount * sign,
    categoryName: s.categoryName,
    note: s.note === undefined ? null : s.note,
  }));

  return { ok: true, signedSplits };
}

module.exports = { validateAndSignSplits };
