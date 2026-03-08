/**
 * Plaid PFC labels — derived from content/categories.json taxonomy.
 */
import content from '@/content/categories.json';

const taxonomy = content.pfcTaxonomy;

export const PLAID_PFC_OPTIONS = Object.entries(taxonomy).map(([value, entry]) => ({
  label: entry.label,
  value,
}));

export const PFC_LABEL_MAP = Object.fromEntries(
  PLAID_PFC_OPTIONS.map(o => [o.value, o.label])
);

// Build a flat map of all detailed codes → human labels
const detailedLabelMap = {};
for (const entry of Object.values(taxonomy)) {
  if (entry.detailed) {
    for (const [code, label] of Object.entries(entry.detailed)) {
      detailedLabelMap[code] = label;
    }
  }
}

/**
 * Humanize a Plaid detailed PFC string.
 * Looks up the label from the taxonomy; falls back to title-casing the suffix.
 */
export function humanizeDetailedPfc(detailed, primary) {
  if (!detailed) return 'Other';
  if (detailedLabelMap[detailed]) return detailedLabelMap[detailed];
  // Fallback: strip primary prefix and title-case
  let suffix = detailed;
  if (primary && detailed.startsWith(primary + '_')) {
    suffix = detailed.slice(primary.length + 1);
  }
  return suffix
    .split('_')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}
