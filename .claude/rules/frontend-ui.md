---
paths: frontend/src/**/*.vue, frontend/src/**/*.css
---
# Frontend UI Rules

1. **Read `DESIGN.md` before touching any component or view.** It is the single source
   of truth for tokens, typography, spacing, dark mode, and the new-component checklist.

2. **Use Basil components for all UI.** `BasilButton`, `BasilCard`, `BasilSelect`,
   `BasilToggle`, `BasilInput`, `BasilList`, `BasilTabs`, `BasilTable`.
   Full list in `frontend/src/components/basil/`. See DESIGN.md "Basil Component Library".

3. **Use `BasilInput` or variant wrappers for all inputs.** Variants: `amount`, `search`,
   `text`, `note`. See `BasilInput.vue` + `Basil{Amount,Search,Text,Note}.js`.

4. **Check existing shared components before creating new ones:**
   `RuleEditorDialog`, `EmptyState`, `SkeletonBudget`, `dialogs.css`,
   and all Basil components in `frontend/src/components/basil/`.

5. **All colors, fonts, and spacing use `var(--basil-*)` tokens.**
   `var(--basil-surface)` not `#ffffff`. `var(--basil-space-4)` not `16px`.

6. **CSS class names use `basil-` prefix + BEM:** `basil-[block]__[element]--[modifier]`.

7. **Dark mode is automatic** via `var(--basil-*)` tokens. Legacy overrides go in
   `App.vue` global style section.

8. **Vue Options API: imported functions used in templates must be in `methods`.**
   Template expressions can only access component instance properties. Add imported
   utilities to the `methods` block (e.g., `methods: { formatDollar, formatSignedDollar, ... }`).
