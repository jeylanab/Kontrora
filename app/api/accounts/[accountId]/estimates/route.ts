import { NextResponse } from 'next/server';
import { withApiRoute } from '@/lib/server-guards';
import { createAdminSupabaseClient } from '@/lib/supabase-server';
import { logger } from '@/lib/debug-logger';
import {
  LIST_COLS, listQuerySchema, createEstimateSchema, getEstimateAccess, fetchEstimate,
  hashBody, notFound, forbidden, serverError, conflict, badRequest,
} from '@/lib/estimates';

export const GET = withApiRoute(async (req, { user, supabase, params }) => {
  const admin = createAdminSupabaseClient();
  if (!admin) return serverError();

  const access = await getEstimateAccess(user, params.accountId, admin, supabase);
  if (!access) return notFound();
  if (!access.canView) return forbidden();

  const parsed = listQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!parsed.success) return badRequest(parsed.error);
  const { status, project_id, search, page, limit } = parsed.data;

  let q = admin
    .from('estimates')
    .select(LIST_COLS, { count: 'exact' })
    .eq('account_id', params.accountId); // tenancy filter is always applied

  if (access.isClient) q = q.neq('status', 'draft'); // clients never see drafts
  if (status) q = q.eq('status', status);
  if (project_id) q = q.eq('project_id', project_id);
  if (search) q = q.ilike('title', `%${search.replace(/[%_\\]/g, '\\$&')}%`);

  const from = (page - 1) * limit;
  const { data, count, error } = await q
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(from, from + limit - 1);

  if (error) {
    logger.error('List estimates failed', { accountId: params.accountId }, error as any);
    return serverError();
  }
  return NextResponse.json({ data, page, limit, total: count ?? 0 });
});

export const POST = withApiRoute(async (req, { user, supabase, params }) => {
  const admin = createAdminSupabaseClient();
  if (!admin) return serverError();

  const access = await getEstimateAccess(user, params.accountId, admin, supabase);
  if (!access) return notFound();
  if (!access.canManage) return forbidden();

  const key = req.headers.get('idempotency-key')?.trim();
  if (!key || key.length < 8 || key.length > 128) {
    return NextResponse.json(
      { error: 'Idempotency-Key header is required (8-128 chars)' },
      { status: 400 },
    );
  }

  let json: unknown;
  try { json = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const parsed = createEstimateSchema.safeParse(json);
  if (!parsed.success) return badRequest(parsed.error);
  const body = parsed.data;

  // A linked project must belong to THIS account
  if (body.project_id) {
    const { data: p } = await admin
      .from('projects').select('id')
      .eq('id', body.project_id).eq('account_id', params.accountId).maybeSingle();
    if (!p) return NextResponse.json({ error: 'Project not found in this account' }, { status: 422 });
  }

  const { data: result, error } = await admin.rpc('create_estimate_with_items', {
    p_account: params.accountId,
    p_project: body.project_id ?? null,
    p_title: body.title,
    p_description: body.description ?? null,
    p_currency: body.currency,
    p_user: user.id,
    p_key: key,
    p_hash: hashBody(body),
    p_items: body.line_items,
  });
  if (error || !result) {
    logger.error('Create estimate failed', { accountId: params.accountId }, error as any);
    return serverError();
  }
  if (result.conflict) return conflict('Idempotency-Key was already used with a different request');

  const estimate = await fetchEstimate(admin, params.accountId, result.id);
  return NextResponse.json({ data: estimate }, { status: result.replayed ? 200 : 201 });
});