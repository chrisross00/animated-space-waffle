import { describe, it, expect } from 'vitest'

// ---------------------------------------------------------------------------
// Pure helpers that mirror BudgetView's categoryTypeMap computed and the
// amount cell template logic. Tests serve as a spec — if the component
// template changes, these should change too.
// ---------------------------------------------------------------------------

function buildCategoryTypeMap(categories) {
  const map = {};
  for (const c of categories) map[c.category] = c.type;
  return map;
}

function txnAmountClass(type) {
  return `basil-txn-amount--${type || 'expense'}`;
}

function txnAmountDisplay(amount, type) {
  const prefix = type === 'income' ? '+' : '';
  return `${prefix}$${Math.abs(amount).toFixed(2)}`;
}

// ---------------------------------------------------------------------------
// categoryTypeMap
// ---------------------------------------------------------------------------

describe('buildCategoryTypeMap', () => {
  it('maps category names to their types', () => {
    const cats = [
      { category: 'Salary', type: 'income' },
      { category: 'Groceries', type: 'expense' },
      { category: 'Rent', type: 'payment' },
      { category: 'Vanguard', type: 'savings' },
    ];
    const map = buildCategoryTypeMap(cats);
    expect(map['Salary']).toBe('income');
    expect(map['Groceries']).toBe('expense');
    expect(map['Rent']).toBe('payment');
    expect(map['Vanguard']).toBe('savings');
  });

  it('returns empty map for no categories', () => {
    expect(buildCategoryTypeMap([])).toEqual({});
  });

  it('unknown category name returns undefined (falls back to expense in template)', () => {
    const map = buildCategoryTypeMap([{ category: 'Groceries', type: 'expense' }]);
    expect(map['Nonexistent']).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// txnAmountClass
// ---------------------------------------------------------------------------

describe('txnAmountClass', () => {
  it('returns income class for income type', () => {
    expect(txnAmountClass('income')).toBe('basil-txn-amount--income');
  });

  it('returns expense class for expense type', () => {
    expect(txnAmountClass('expense')).toBe('basil-txn-amount--expense');
  });

  it('returns payment class for payment type', () => {
    expect(txnAmountClass('payment')).toBe('basil-txn-amount--payment');
  });

  it('returns savings class for savings type', () => {
    expect(txnAmountClass('savings')).toBe('basil-txn-amount--savings');
  });

  it('falls back to expense for undefined/unknown type', () => {
    expect(txnAmountClass(undefined)).toBe('basil-txn-amount--expense');
    expect(txnAmountClass(null)).toBe('basil-txn-amount--expense');
  });
});

// ---------------------------------------------------------------------------
// txnAmountDisplay
// ---------------------------------------------------------------------------

describe('txnAmountDisplay', () => {
  it('prefixes income with +', () => {
    expect(txnAmountDisplay(-500, 'income')).toBe('+$500.00');
  });

  it('uses Math.abs — income Plaid amount is negative', () => {
    expect(txnAmountDisplay(-1234.56, 'income')).toBe('+$1234.56');
  });

  it('no prefix for expense', () => {
    expect(txnAmountDisplay(49.99, 'expense')).toBe('$49.99');
  });

  it('no prefix for payment', () => {
    expect(txnAmountDisplay(300, 'payment')).toBe('$300.00');
  });

  it('no prefix for savings', () => {
    expect(txnAmountDisplay(200, 'savings')).toBe('$200.00');
  });

  it('no prefix for unknown type', () => {
    expect(txnAmountDisplay(50, undefined)).toBe('$50.00');
  });

  it('always shows two decimal places', () => {
    expect(txnAmountDisplay(10, 'expense')).toBe('$10.00');
    expect(txnAmountDisplay(9.9, 'income')).toBe('+$9.90');
  });
});
