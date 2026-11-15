import { notFound } from 'next/navigation';
import { getCurrentUserProfileServer } from '@/lib/auth-server';
import { createServerSupabase, createAdminSupabaseClient } from '@/lib/supabase-server';
import { getEstimateAccess } from '@/lib/estimates';

export async function loadEstimateContext(accountId: string) {
  const [user, supabase] = await Promise.all([
    getCurrentUserProfileServer(),
    createServerSupabase(),
  ]);
  const admin = createAdminSupabaseClient();
  if (!user || !supabase || !admin) notFound();

  const access = await getEstimateAccess(user as any, accountId, admin, supabase);
  if (!access || !access.canView) notFound();
  return { admin, access };
}