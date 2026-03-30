import { getMerchantLogo } from './merchantLogos'

const MERCHANT_PALETTE = [
  '#b07d4a', '#4a8b6c', '#5a7fb5', '#8b5a4a',
  '#6b8b4a', '#7a5ab5', '#b54a6a', '#4a8b8b',
  '#b58b4a', '#6a7ab5',
]

const VENMO_PATTERN = /venmo/i

export function merchantInitials(row) {
  const key = (row.merchant_name || row.name || '?').trim()
  const words = key.split(/\s+/)
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase()
  return key.substring(0, 2).toUpperCase()
}

export function merchantColor(row) {
  const key = row.merchant_name || row.name || '?'
  let hash = 0
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i)
    hash |= 0
  }
  return MERCHANT_PALETTE[Math.abs(hash) % MERCHANT_PALETTE.length]
}

export function isVenmo(row) {
  return VENMO_PATTERN.test(row.merchant_name || '') || VENMO_PATTERN.test(row.name || '')
}

/**
 * Get brand logo for a transaction row.
 * Checks merchant_name first, falls back to transaction name.
 * @returns {{ paths: string, color: string } | null}
 */
export function merchantLogo(row) {
  return getMerchantLogo(row.merchant_name) || getMerchantLogo(row.name) || null
}

export { getMerchantLogo }
