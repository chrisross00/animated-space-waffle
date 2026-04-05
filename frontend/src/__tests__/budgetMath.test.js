import { describe, it, expect } from 'vitest';
import { freeCashFlow } from '@/utils/budgetMath';

const categories = [
  { category: 'Income', type: 'income' },
  { category: 'Groceries', type: 'expense' },
  { category: 'Shopping', type: 'expense' },
  { category: 'Savings', type: 'savings' },
  { category: 'Payments & Transfers', type: 'payment' },
];

describe('freeCashFlow', () => {
  it('computes income - expenses - savings', () => {
    const txns = [
      { mappedCategory: 'Income', amount: -5000 },
      { mappedCategory: 'Groceries', amount: 800 },
      { mappedCategory: 'Shopping', amount: 200 },
      { mappedCategory: 'Savings', amount: 500 },
    ];
    const result = freeCashFlow(txns, categories);
    expect(result.income).toBe(5000);
    expect(result.expenses).toBe(1000);
    expect(result.savings).toBe(500);
    expect(result.net).toBe(3500);
  });

  it('refunds net against purchases within a category', () => {
    const txns = [
      { mappedCategory: 'Income', amount: -5000 },
      { mappedCategory: 'Shopping', amount: 100 },
      { mappedCategory: 'Shopping', amount: -40 }, // refund
    ];
    const result = freeCashFlow(txns, categories);
    expect(result.expenses).toBe(60); // 100 + (-40) = 60
    expect(result.net).toBe(4940);
  });

  it('skips excludeFromTotal transactions', () => {
    const txns = [
      { mappedCategory: 'Income', amount: -5000 },
      { mappedCategory: 'Groceries', amount: 300 },
      { mappedCategory: 'Groceries', amount: 9999, excludeFromTotal: true },
    ];
    const result = freeCashFlow(txns, categories);
    expect(result.expenses).toBe(300);
    expect(result.net).toBe(4700);
  });

  it('ignores payment-type transactions', () => {
    const txns = [
      { mappedCategory: 'Income', amount: -3000 },
      { mappedCategory: 'Groceries', amount: 500 },
      { mappedCategory: 'Payments & Transfers', amount: 1500 },
      { mappedCategory: 'Payments & Transfers', amount: -1500 },
    ];
    const result = freeCashFlow(txns, categories);
    expect(result.net).toBe(2500);
  });

  it('includes savings in the deduction', () => {
    const txns = [
      { mappedCategory: 'Income', amount: -5000 },
      { mappedCategory: 'Groceries', amount: 1000 },
      { mappedCategory: 'Savings', amount: 500 },
    ];
    const result = freeCashFlow(txns, categories);
    expect(result.net).toBe(3500);
  });

  it('handles empty transactions', () => {
    const result = freeCashFlow([], categories);
    expect(result).toEqual({ income: 0, expenses: 0, savings: 0, net: 0 });
  });

  it('ignores transactions with unknown categories', () => {
    const txns = [
      { mappedCategory: 'Income', amount: -3000 },
      { mappedCategory: 'UnknownCategory', amount: 500 },
    ];
    const result = freeCashFlow(txns, categories);
    expect(result.net).toBe(3000);
  });
});
