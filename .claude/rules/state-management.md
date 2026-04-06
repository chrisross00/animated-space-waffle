---
paths: frontend/src/store.js, frontend/src/views/**, frontend/src/components/**
---
# State Management Rules

1. **All state changes go through store mutations.** Use existing mutations or add
   a new named mutation. Direct mutation of `store.state.*` properties is not allowed.

2. **`store.state.transactionsByMonth` is the source of truth for transactions.**
   `store.state.transactions` is a derived flat array rebuilt on every month update.

3. **`fetchTransactionsForMonth()` returns `{ transactions, total }`.** Always unwrap
   `.transactions` before committing to store.
