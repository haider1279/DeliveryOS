import { describe, it, expect } from 'vitest';

describe('Invoice Math and Status Calculations', () => {
  it('correctly computes subtotal, tax, discount, and total', () => {
    const items = [
      { description: 'Frontend Development', quantity: 40, unitPrice: 100 },
      { description: 'QA Testing', quantity: 20, unitPrice: 75 },
    ];
    const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
    expect(subtotal).toBe(5500);

    const discount = 500;
    const tax = 500;
    const total = Math.max(0, subtotal - discount + tax);
    expect(total).toBe(5500);
  });

  it('determines correct invoice status transitions based on payment balance', () => {
    const total = 5000;

    // Test 1: No payment
    let payments: number[] = [];
    let paidSum = payments.reduce((a, b) => a + b, 0);
    let status = paidSum >= total ? 'PAID' : paidSum > 0 ? 'PARTIALLY_PAID' : 'ISSUED';
    expect(status).toBe('ISSUED');

    // Test 2: Partial payment
    payments = [2000];
    paidSum = payments.reduce((a, b) => a + b, 0);
    status = paidSum >= total ? 'PAID' : paidSum > 0 ? 'PARTIALLY_PAID' : 'ISSUED';
    expect(status).toBe('PARTIALLY_PAID');

    // Test 3: Multiple partial payments totaling full balance
    payments = [2000, 3000];
    paidSum = payments.reduce((a, b) => a + b, 0);
    status = paidSum >= total ? 'PAID' : paidSum > 0 ? 'PARTIALLY_PAID' : 'ISSUED';
    expect(status).toBe('PAID');

    // Test 4: Overpayment
    payments = [2000, 3500];
    paidSum = payments.reduce((a, b) => a + b, 0);
    status = paidSum >= total ? 'PAID' : paidSum > 0 ? 'PARTIALLY_PAID' : 'ISSUED';
    expect(status).toBe('PAID');
  });
});
