import { z } from 'zod';
import { createHash } from 'node:crypto';
import { NextResponse } from 'next/server';
import { hasPermission, isSuperadmin, type UserWithRoles } from '@/lib/rbac';
import { Permission } from '@/lib/permissions';

export const ESTIMATE_COLS =
  'id, account_id, project_id, title, description, currency, status, total_minor, created_by, sent_at, responded_at, created_at, updated_at';
export const LIST_COLS =
  'id, title, status, currency, total_minor, project_id, created_at, sent_at, responded_at';
const ITEM_COLS = 'id, position, description, quantity, unit_price_minor, line_total_minor';

// ---------- validation (money is always integer minor units) ----------
export const lineItemSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.number().positive().max(1_000_000),
  unit_price_minor: z.number().int().min(0).max(100_000_000_000),
});

export const createEstimateSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).nullish(),
  project_id: z.guid().nullish(),
  currency: z.string().length(3).transform((s) => s.toUpperCase()).default('USD'),
  line_items: z.array(lineItemSchema).max(200).default([]),
});

// No defaults here: a PATCH must not inject line_items when they are not sent
export const updateEstimateSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    description: z.string().max(5000).nullish(),
    project_id: z.guid().nullish(),
    line_items: z.array(lineItemSchema).max(200),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const listQuerySchema = z.object({
  status: z.enum(['draft', 'sent', 'accepted', 'rejected']).optional(),
  project_id: z.guid().optional(),
  search: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const hashBody = (body: unknown) =>
  createHash('sha256').update(JSON.stringify(body)).digest('hex');

// ---------- responses ----------
export const notFound = () => NextResponse.json({ error: 'Not found' }, { status: 404 });
export const forbidden = () => NextResponse.json({ error: 'Forbidden' }, { status: 403 });
export const serverError = () =>
  NextResponse.json({ error: 'Internal server error' }, { status: 500 });
export const conflict = (error: string) => NextResponse.json({ error }, { status: 409 });
export const badRequest = (err: z.ZodError) =>
  NextResponse.json({ error: 'Invalid request', details: z.flattenError(err) }, { status: 400 });

// ---------- tenancy ----------
export type EstimateAccess = { canView: boolean; canManage: boolean; isClient: boolean };

/**
 * Account boundary + permission check. Runs on EVERY estimates route.
 * null  => no access to this account (route returns 404, so ids can't be probed)
 * flags => caller is in the account; routes check canView / canManage (403)
 */
export async function getEstimateAccess(
  user: UserWithRoles,
  accountId: string,
  admin: any, // service client: membership lookups
  userDb: any, // user client: role permission lookups
): Promise<EstimateAccess | null> {
  if (!z.guid().safeParse(accountId).success) return null;
  if (isSuperadmin(user)) return { canView: true, canManage: true, isClient: false };

  const u = user as UserWithRoles & { is_client?: boolean; client_account_id?: string | null };

  // Clients: own account only, read-only (+ respond to sent estimates)
  if (u.is_client) {
    return u.client_account_id === accountId
      ? { canView: true, canManage: false, isClient: true }
      : null;
  }

  // Staff must belong to the account: org-wide override, account manager, or active member
  let inAccount = await hasPermission(user, Permission.VIEW_ALL_ACCOUNTS, undefined, userDb);
  if (!inAccount) {
    const { data: acct } = await admin
      .from('accounts').select('account_manager_id').eq('id', accountId).maybeSingle();
    inAccount = acct?.account_manager_id === user.id;
  }
  if (!inAccount) {
    const { data: m } = await admin
      .from('account_members').select('id')
      .eq('account_id', accountId).eq('user_id', user.id).is('removed_at', null).limit(1);
    inAccount = !!m?.length;
  }
  if (!inAccount) return null;

  const canManage = await hasPermission(user, Permission.MANAGE_ESTIMATES, undefined, userDb);
  const canView =
    canManage || (await hasPermission(user, Permission.VIEW_ESTIMATES, undefined, userDb));
  return { canView, canManage, isClient: false };
}

// ---------- data ----------
export async function fetchEstimate(admin: any, accountId: string, id: string, withItems = true) {
  const cols = withItems
    ? `${ESTIMATE_COLS}, line_items:estimate_line_items(${ITEM_COLS})`
    : ESTIMATE_COLS;
  const q = admin.from('estimates').select(cols).eq('account_id', accountId).eq('id', id);
  const { data, error } = withItems
    ? await q.order('position', { referencedTable: 'estimate_line_items' }).maybeSingle()
    : await q.maybeSingle();
  if (error) throw error;
  return data;
}