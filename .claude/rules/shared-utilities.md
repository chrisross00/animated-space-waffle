---
paths: frontend/src/utils/**, frontend/src/views/**, frontend/src/components/**, shared/**, utils/**
---
# Shared Utilities — Use Before Building

Before creating any new utility, function, or helper, check if one already exists:

| What you need | Use this | Location |
|---|---|---|
| Category type strings | `CATEGORY_TYPES` | `shared/categoryTypes.js` |
| P2P detection | `isP2PTransaction` | `shared/p2pDetection.js` |
| Dollar formatting | `formatDollar`, `formatSignedDollar` | `frontend/src/utils/formatDollar.js` |
| Transaction dates | `txnDate`, `txnDayjs`, `txnMonth`, `isInMonth` | `frontend/src/utils/transactionDate.js` |
| Free cash flow | `freeCashFlow` | `frontend/src/utils/budgetMath.js` |
| Condition matching | `matchesCondition` | `frontend/src/utils/ruleUtils.js` |
| Store sweep | `sweepStore` | `frontend/src/utils/ruleUtils.js` |
| Backend sweep | `sweepCompoundRule` | `api.js` |
| Similarity detection | `findSimilarTransactions` | `frontend/src/utils/ruleUtils.js` |
| Merchant display | `merchantInitials`, `merchantColor`, `merchantLogo` | `frontend/src/utils/merchantDisplay.js` |
| Breakpoints | `useScreen` | `frontend/src/composables/useScreen.js` |
| Gestures | `useGesture` | `frontend/src/composables/useGesture.js` |
| Toasts | `useToast` | `frontend/src/composables/useToast.js` |

**If an existing abstraction is close, extend it. Do not create a parallel implementation.**
