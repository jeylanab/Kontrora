export function formatMoney(minor: number, currency = 'USD') {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
}

/** "12.5" -> 1250. Returns null if invalid. Assumes 2-decimal currencies. */
export function parseMoneyToMinor(input: string): number | null {
  const s = input.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const [whole, frac = ''] = s.split('.');
  return Number(whole) * 100 + Number(frac.padEnd(2, '0'));
}

export const minorToInput = (minor: number) => (minor / 100).toFixed(2);
