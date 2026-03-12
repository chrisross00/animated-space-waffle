import { describe, it, expect } from 'vitest';

// Pure function tests for db/database.js helpers.
// These don't need a running Postgres — they test SQL generation only.

const { buildSetClause, conditionsToSqlWhere, TXN_FIELD_MAP } = require('../db/database');

// ---------- buildSetClause ----------

describe('buildSetClause', () => {
  const fieldMap = {
    mappedCategory: 'mapped_category',
    note: 'note',
    excludeFromTotal: 'exclude_from_total',
  };

  it('maps JS keys to SQL columns', () => {
    const { setClauses, params } = buildSetClause(
      { mappedCategory: 'Food', note: 'lunch' }, fieldMap, 1
    );
    expect(setClauses).toEqual(['mapped_category = $1', 'note = $2']);
    expect(params).toEqual(['Food', 'lunch']);
  });

  it('skips fields not present in the input object', () => {
    const { setClauses, params } = buildSetClause(
      { note: 'test' }, fieldMap, 1
    );
    expect(setClauses).toEqual(['note = $1']);
    expect(params).toEqual(['test']);
  });

  it('skips fields not in the field map', () => {
    const { setClauses, params } = buildSetClause(
      { unknownField: 'x', note: 'y' }, fieldMap, 1
    );
    expect(setClauses).toEqual(['note = $1']);
    expect(params).toEqual(['y']);
  });

  it('returns empty arrays when no fields match', () => {
    const { setClauses, params } = buildSetClause({}, fieldMap, 1);
    expect(setClauses).toEqual([]);
    expect(params).toEqual([]);
  });

  it('respects startParam offset', () => {
    const { setClauses, params, nextParam } = buildSetClause(
      { mappedCategory: 'Food', note: 'x' }, fieldMap, 5
    );
    expect(setClauses).toEqual(['mapped_category = $5', 'note = $6']);
    expect(params).toEqual(['Food', 'x']);
    expect(nextParam).toBe(7);
  });

  it('handles null values', () => {
    const { setClauses, params } = buildSetClause(
      { note: null }, fieldMap, 1
    );
    expect(setClauses).toEqual(['note = $1']);
    expect(params).toEqual([null]);
  });

  it('handles boolean values', () => {
    const { setClauses, params } = buildSetClause(
      { excludeFromTotal: true }, fieldMap, 1
    );
    expect(setClauses).toEqual(['exclude_from_total = $1']);
    expect(params).toEqual([true]);
  });

  it('casts JSONB fields with ::jsonb', () => {
    // linkedTransaction maps to linked_transaction, which is in JSONB_FIELDS
    const { setClauses, params } = buildSetClause(
      { linkedTransaction: { id: '123', type: 'split' } }, TXN_FIELD_MAP, 1
    );
    expect(setClauses).toEqual(['linked_transaction = $1::jsonb']);
    expect(params).toEqual([JSON.stringify({ id: '123', type: 'split' })]);
  });

  it('does not cast JSONB fields when value is null', () => {
    const { setClauses, params } = buildSetClause(
      { linkedTransaction: null }, TXN_FIELD_MAP, 1
    );
    expect(setClauses).toEqual(['linked_transaction = $1']);
    expect(params).toEqual([null]);
  });
});

// ---------- conditionsToSqlWhere ----------

describe('conditionsToSqlWhere', () => {
  it('handles merchant_name eq', () => {
    const { clause, params } = conditionsToSqlWhere(
      [{ field: 'merchant_name', op: 'eq', value: 'Starbucks' }]
    );
    expect(clause).toBe('merchant_name = $1');
    expect(params).toEqual(['Starbucks']);
  });

  it('handles merchant_name contains (ILIKE)', () => {
    const { clause, params } = conditionsToSqlWhere(
      [{ field: 'merchant_name', op: 'contains', value: 'star' }]
    );
    expect(clause).toBe('merchant_name ILIKE $1');
    expect(params).toEqual(['%star%']);
  });

  it('handles name eq', () => {
    const { clause, params } = conditionsToSqlWhere(
      [{ field: 'name', op: 'eq', value: 'UBER TRIP' }]
    );
    expect(clause).toBe('name = $1');
    expect(params).toEqual(['UBER TRIP']);
  });

  it('handles name contains', () => {
    const { clause, params } = conditionsToSqlWhere(
      [{ field: 'name', op: 'contains', value: 'uber' }]
    );
    expect(clause).toBe('name ILIKE $1');
    expect(params).toEqual(['%uber%']);
  });

  it('handles amount eq with ABS', () => {
    const { clause, params } = conditionsToSqlWhere(
      [{ field: 'amount', op: 'eq', value: 50 }]
    );
    expect(clause).toBe('ABS(amount) = $1');
    expect(params).toEqual([50]);
  });

  it('handles amount gt', () => {
    const { clause, params } = conditionsToSqlWhere(
      [{ field: 'amount', op: 'gt', value: 100 }]
    );
    expect(clause).toBe('ABS(amount) > $1');
    expect(params).toEqual([100]);
  });

  it('handles amount lt', () => {
    const { clause, params } = conditionsToSqlWhere(
      [{ field: 'amount', op: 'lt', value: 25 }]
    );
    expect(clause).toBe('ABS(amount) < $1');
    expect(params).toEqual([25]);
  });

  it('handles amount range with two params', () => {
    const { clause, params } = conditionsToSqlWhere(
      [{ field: 'amount', op: 'range', value: { min: 10, max: 50 } }]
    );
    expect(clause).toBe('ABS(amount) >= $1 AND ABS(amount) <= $2');
    expect(params).toEqual([10, 50]);
  });

  it('handles account eq', () => {
    const { clause, params } = conditionsToSqlWhere(
      [{ field: 'account', op: 'eq', value: 'Chase' }]
    );
    expect(clause).toBe('account = $1');
    expect(params).toEqual(['Chase']);
  });

  it('combines multiple conditions with AND', () => {
    const { clause, params } = conditionsToSqlWhere([
      { field: 'merchant_name', op: 'contains', value: 'door' },
      { field: 'amount', op: 'lt', value: 30 },
    ]);
    expect(clause).toBe('merchant_name ILIKE $1 AND ABS(amount) < $2');
    expect(params).toEqual(['%door%', 30]);
  });

  it('respects startParam offset', () => {
    const { clause, params, nextParam } = conditionsToSqlWhere(
      [{ field: 'merchant_name', op: 'eq', value: 'X' }], 5
    );
    expect(clause).toBe('merchant_name = $5');
    expect(params).toEqual(['X']);
    expect(nextParam).toBe(6);
  });

  it('returns empty clause for empty conditions', () => {
    const { clause, params } = conditionsToSqlWhere([]);
    expect(clause).toBe('');
    expect(params).toEqual([]);
  });

  it('ignores unknown field/op combos', () => {
    const { clause, params } = conditionsToSqlWhere(
      [{ field: 'unknown', op: 'eq', value: 'x' }]
    );
    expect(clause).toBe('');
    expect(params).toEqual([]);
  });

  it('handles range consuming two param slots in multi-condition', () => {
    const { clause, params } = conditionsToSqlWhere([
      { field: 'merchant_name', op: 'eq', value: 'Target' },
      { field: 'amount', op: 'range', value: { min: 20, max: 100 } },
      { field: 'account', op: 'eq', value: 'Chase' },
    ], 3);
    expect(clause).toBe('merchant_name = $3 AND ABS(amount) >= $4 AND ABS(amount) <= $5 AND account = $6');
    expect(params).toEqual(['Target', 20, 100, 'Chase']);
  });
});
