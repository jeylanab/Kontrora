import { NextResponse } from 'next/server';
import { withApiRoute } from '@/lib/server-guards';
import { createAdminSupabaseClient } from '@/lib/supabase-server';
import { logger } from '@/lib/debug-logger';
import {
  ESTIMATE_COLS, updateEstimateSchema, getEstimateAccess, fetchEstimate,
  notFound, forbidden, serverError, conflict, badRequest,
} from '@/lib/estimates';

export const GET = withApiRoute(async (_req, { user, supabase, params }) => {
  const admin = createAdminSupabaseClient();
  if (!admin) return serverError();

  const access = await getEstimateAccess(user, params.accountId, admin, supabase);
  if (!access) return notFound();
  if (!access.canView) return forbidden();

  const est = await fetchEstimate(admin, params.accountId, params.estimateId);
  if (!est || (access.isClient && est.status === 'draft')) return notFound();
  return NextResponse.json({ data: est });
});

export const PATCH = withApiRoute(async (req, { user, supabase, params }) => {
  const admin = createAdminSupabaseClient();
  if (!admin) return serverError();

  const access = await getEstimateAccess(user, params.accountId, admin, supabase);
  if (!access) return notFound();
  if (!access.canManage) return forbidden();

  let json: unknown;
  try { json = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = updateEstimateSchema.safeParse(json);
  if (!parsed.success) return badRequest(parsed.error);
  const { line_items, ...fields } = parsed.data;

  const current = await fetchEstimate(admin, params.accountId, params.estimateId, false);
  if (!current) return notFound();
  if (current.status !== 'draft') return conflict('Only draft estimates can be edited');

  if (fields.project_id) {
    const { data: p } = await admin
      .from('projects').select('id')
      .eq('id', fields.project_id).eq('account_id', params.accountId).maybeSingle();
    if (!p) return NextResponse.json({ error: 'Project not found in this account' }, { status: 422 });
  }

  if (Object.keys(fields).length) {
    const { data, error } = await admin
      .from('estimates').update(fields)
      .eq('id', params.estimateId).eq('account_id', params.accountId).eq('status', 'draft')
      .select('id').maybeSingle();
    if (error) { logger.error('Update estimate failed', {}, error as any); return serverError(); }
    if (!data) return conflict('Estimate is no longer a draft');
  }

  if (line_items) {
    const { error } = await admin.rpc('replace_estimate_items', {
      p_estimate: params.estimateId,
      p_account: params.accountId,
      p_items: line_items,
    });
    if (error) {
      // DB trigger rejects this if the estimate was sent in the meantime
      if (/locked|draft/i.test(error.message)) return conflict('Estimate is no longer a draft');
      logger.error('Replace line items failed', {}, error as any);
      return serverError();
    }
  }

  return NextResponse.json({ data: await fetchEstimate(admin, params.accountId, params.estimateId) });
});