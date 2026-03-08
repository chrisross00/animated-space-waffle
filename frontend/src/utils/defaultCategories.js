/**
 * Default categories — reads from content/categories.json (CMS-style).
 * The JSON file is the source of truth for category names, types, PFC mappings, and hints.
 * Code consumes this module; copy lives in the JSON.
 */
import content from '@/content/categories.json';

export const DEFAULT_CATEGORIES = content.defaultCategories.map(c => ({
  category: c.category,
  type: c.type,
  monthly_limit: 0,
  plaid_pfc: c.plaid_pfc,
}));

export const CATEGORY_HINTS = Object.fromEntries(
  content.defaultCategories.map(c => [c.category, c.hint])
);
