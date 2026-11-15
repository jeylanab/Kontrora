import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('next/server', () => ({ NextResponse: { json: vi.fn() } }));
vi.mock('@/lib/rbac', () => ({ hasPermission: vi.fn(), isSuperadmin: vi.fn() }));
vi.mock('@/lib/permissions', () => ({
  Permission: {
    VIEW_ALL_ACCOUNTS: 'view_all_accounts',
    MANAGE_ESTIMATES: 'manage_estimates',
    VIEW_ESTIMATES: 'view_estimates',
  },
}));

import { hasPermission, isSuperadmin } from '@/lib/rbac';
import { getEstimateAccess } from '@/lib/estimates';

const ACCOUNT = '3f2b8c1e-5d4a-4e6b-9a7c-1d2e3f4a5b6c';
const OTHER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

function makeAdmin({ managerId = null as string | null, members = [] as { id: string }[] } = {}) {
  return {
    from(table: string) {
      const result =
        table === 'accounts'
          ? { data: managerId ? { account_manager_id: managerId } : null }
          : { data: members };
      const chain: any = {
        select: () => chain, eq: () => chain, is: () => chain, limit: () => chain,
        maybeSingle: () => Promise.resolve(result),
        then: (res: any, rej: any) => Promise.resolve(result).then(res, rej),
      };
      return chain;
    },
  };
}

function grant(...perms: string[]) {
  (hasPermission as any).mockImplementation((_u: any, p: string) => Promise.resolve(perms.includes(p)));
}

const staff = { id: 'u1', is_client: false } as any;

beforeEach(() => {
  vi.clearAllMocks();
  (isSuperadmin as any).mockReturnValue(false);
  grant();
});

describe('getEstimateAccess', () => {
  it('rejects malformed account ids', async () => {
    expect(await getEstimateAccess(staff, 'not-a-uuid', makeAdmin(), {})).toBeNull();
  });

  it('superadmin can view and manage', async () => {
    (isSuperadmin as any).mockReturnValue(true);
    expect(await getEstimateAccess(staff, ACCOUNT, makeAdmin(), {})).toEqual({
      canView: true, canManage: true, isClient: false,
    });
  });

  it('client: own account is read-only, other account is null', async () => {
    const client = { id: 'c1', is_client: true, client_account_id: ACCOUNT } as any;
    expect(await getEstimateAccess(client, ACCOUNT, makeAdmin(), {})).toEqual({
      canView: true, canManage: false, isClient: true,
    });
    expect(await getEstimateAccess(client, OTHER, makeAdmin(), {})).toBeNull();
  });

  it('staff outside the account get null, even with manage permission', async () => {
    grant('manage_estimates');
    expect(await getEstimateAccess(staff, ACCOUNT, makeAdmin(), {})).toBeNull();
  });

  it('member without estimate permissions cannot view or manage', async () => {
    const r = await getEstimateAccess(staff, ACCOUNT, makeAdmin({ members: [{ id: 'm1' }] }), {});
    expect(r).toEqual({ canView: false, canManage: false, isClient: false });
  });

  it('member with view permission is read-only', async () => {
    grant('view_estimates');
    const r = await getEstimateAccess(staff, ACCOUNT, makeAdmin({ members: [{ id: 'm1' }] }), {});
    expect(r).toMatchObject({ canView: true, canManage: false });
  });

  it('member with manage permission can view and manage', async () => {
    grant('manage_estimates');
    const r = await getEstimateAccess(staff, ACCOUNT, makeAdmin({ members: [{ id: 'm1' }] }), {});
    expect(r).toMatchObject({ canView: true, canManage: true });
  });

  it('account manager counts as in-account without a membership row', async () => {
    grant('manage_estimates');
    const r = await getEstimateAccess(staff, ACCOUNT, makeAdmin({ managerId: 'u1' }), {});
    expect(r).toMatchObject({ canView: true, canManage: true });
  });

  it('VIEW_ALL_ACCOUNTS holders are in-account', async () => {
    grant('view_all_accounts', 'view_estimates');
    const r = await getEstimateAccess(staff, ACCOUNT, makeAdmin(), {});
    expect(r).toMatchObject({ canView: true, canManage: false });
  });
});