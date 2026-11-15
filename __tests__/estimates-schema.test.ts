import { describe, it, expect, vi } from 'vitest';

vi.mock('next/server', () => ({ NextResponse: { json: vi.fn() } }));
vi.mock('@/lib/rbac', () => ({ hasPermission: vi.fn(), isSuperadmin: vi.fn() }));
vi.mock('@/lib/permissions', () => ({ Permission: {} }));

import {
  createEstimateSchema,
  updateEstimateSchema,
  listQuerySchema,
  hashBody,
} from '@/lib/estimates';

const PROJECT = '3f2b8c1e-5d4a-4e6b-9a7c-1d2e3f4a5b6c';
const item = { description: 'Design work', quantity: 2, unit_price_minor: 5000 };

describe('createEstimateSchema', () => {
  it('accepts a valid body and applies defaults', () => {
    const r = createEstimateSchema.parse({ title: 'Website', line_items: [item] });
    expect(r.currency).toBe('USD');
    expect(r.line_items).toHaveLength(1);
  });

  it('uppercases currency', () => {
    expect(createEstimateSchema.parse({ title: 'x', currency: 'eur' }).currency).toBe('EUR');
  });

  it('rejects non-integer money', () => {
    const r = createEstimateSchema.safeParse({
      title: 'x', line_items: [{ ...item, unit_price_minor: 12.5 }],
    });
    expect(r.success).toBe(false);
  });

  it('rejects negative price, zero quantity, empty title, bad project id', () => {
    expect(createEstimateSchema.safeParse({ title: 'x', line_items: [{ ...item, unit_price_minor: -1 }] }).success).toBe(false);
    expect(createEstimateSchema.safeParse({ title: 'x', line_items: [{ ...item, quantity: 0 }] }).success).toBe(false);
    expect(createEstimateSchema.safeParse({ title: '   ' }).success).toBe(false);
    expect(createEstimateSchema.safeParse({ title: 'x', project_id: 'nope' }).success).toBe(false);
  });

  it('accepts a valid project id and rejects too many lines', () => {
    expect(createEstimateSchema.safeParse({ title: 'x', project_id: PROJECT }).success).toBe(true);
    const many = Array.from({ length: 201 }, () => item);
    expect(createEstimateSchema.safeParse({ title: 'x', line_items: many }).success).toBe(false);
  });
});

describe('updateEstimateSchema', () => {
  it('rejects an empty update and allows partial ones', () => {
    expect(updateEstimateSchema.safeParse({}).success).toBe(false);
    expect(updateEstimateSchema.safeParse({ title: 'New title' }).success).toBe(true);
  });
      it('does not inject line_items when they are not sent', () => {
    const r = updateEstimateSchema.parse({ title: 'New title' });
    expect(r).toEqual({ title: 'New title' });
      });
    
});

describe('listQuerySchema', () => {
  it('applies defaults and coerces numbers', () => {
    expect(listQuerySchema.parse({})).toMatchObject({ page: 1, limit: 25 });
    expect(listQuerySchema.parse({ page: '3', limit: '10' })).toMatchObject({ page: 3, limit: 10 });
  });

  it('rejects bad status and oversized limit', () => {
    expect(listQuerySchema.safeParse({ status: 'paid' }).success).toBe(false);
    expect(listQuerySchema.safeParse({ limit: '1000' }).success).toBe(false);
  });
});

describe('hashBody (idempotency)', () => {
  it('is stable for the same body and differs for a different one', () => {
    const a = { title: 'x', line_items: [item] };
    expect(hashBody(a)).toBe(hashBody({ ...a }));
    expect(hashBody(a)).not.toBe(hashBody({ ...a, title: 'y' }));
  });
});