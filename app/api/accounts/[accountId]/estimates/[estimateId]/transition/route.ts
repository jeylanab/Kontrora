import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withApiRoute } from '@/lib/server-guards';
import { createAdminSupabaseClient } from '@/lib/supabase-server';
import {
  ESTIMATE_COLS, getEstimateAccess, fetchEstimate,
  notFound, forbidden, serverError, conflict, badRequest,
} from '@/lib/estimates';

const bodySchema = z.object({ to: z.enum(['sent', 'accepted', 'rejected']) });

export const POST = withApiRoute(async (req, { user, supabase, params }) => {
  const admin = createAdminSupabaseClient();
  if (!admin) return serverError();

  const access = await getEstimateAccess(user, params.accountId, admin, supabase);
  if (!access) return notFound();
  if (!access.canView) return forbidden();

  let json: unknown;
  try { json = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) return badRequest(parsed.error);
  const { to } = parsed.data;

  const est = await fetchEstimate(admin, params.accountId, params.estimateId, false);
  if (!est || (access.isClient && est.status === 'draft')) return notFound();

  // Who can do what: staff manage -> send; client (or staff manage) -> accept/reject
  if (to === 'sent' ? !access.canManage : !(access.canManage || access.isClient)) return forbidden();

  const from = to === 'sent' ? 'draft' : 'sent';
  if (est.status !== from) return conflict(`Cannot move estimate from ${est.status} to ${to}`);
  if (to === 'sent' && est.total_minor <= 0) {
    return NextResponse.json({ error: 'Add at least one priced line item before sending' }, { status: 422 });
  }

  // Compare-and-set on status: concurrent transitions can't both win
  const { data, error } = await admin
    .from('estimates').update({ status: to })
    .eq('id', params.estimateId).eq('account_id', params.accountId).eq('status', from)
    .select(ESTIMATE_COLS).maybeSingle();

  if (error) return serverError();
  if (!data) return conflict('Estimate was changed by someone else, refresh and retry');
  return NextResponse.json({ data });
});