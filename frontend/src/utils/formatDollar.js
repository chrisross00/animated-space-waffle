/**
 * Format a number as a dollar display string (no $ prefix — templates add it).
 * @param {number} amount
 * @param {number} decimals — 0 for integer, 2 for cents
 * @returns {string} e.g. "1,234" or "1,234.50"
 */
export function formatDollar(amount, decimals = 0) {
  const num = Math.abs(Number(amount));
  if (isNaN(num)) return '0';
  return num.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a signed dollar amount with sign prefix and color class.
 * @param {number} amount — positive = good (green), negative = bad (red)
 * @param {number} decimals
 * @returns {{ text: string, colorClass: string }}
 */
export function formatSignedDollar(amount, decimals = 0) {
  const formatted = formatDollar(amount, decimals);
  const positive = amount >= 0;
  return {
    text: `${positive ? '+' : '\u2212'}$${formatted}`,
    colorClass: positive ? 'basil-positive' : 'basil-negative',
  };
}
