import { describe, it, expect } from 'vitest';
import { formatMoney, parseMoneyToMinor, minorToInput } from '@/lib/money';

describe('parseMoneyToMinor', () => {
  it('parses whole and decimal amounts to minor units', () => {
    expect(parseMoneyToMinor('12')).toBe(1200);
    expect(parseMoneyToMinor('12.5')).toBe(1250);
    expect(parseMoneyToMinor('0.99')).toBe(99);
    expect(parseMoneyToMinor(' 3.05 ')).toBe(305);
  });

  it('avoids float errors', () => {
    expect(parseMoneyToMinor('19.99')).toBe(1999);
    expect(parseMoneyToMinor('0.07')).toBe(7);
  });

  it('rejects bad input', () => {
    for (const bad of ['', 'abc', '-1', '1.234', '1,000', '1e3', '.5']) {
      expect(parseMoneyToMinor(bad)).toBeNull();
    }
  });
});

describe('formatting', () => {
  it('formats minor units', () => {
    expect(formatMoney(1250, 'USD')).toBe('$12.50');
    expect(minorToInput(1250)).toBe('12.50');
  });
});