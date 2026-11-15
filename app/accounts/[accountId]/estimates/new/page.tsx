import { notFound } from 'next/navigation';
import { loadEstimateContext } from '@/lib/estimates-page';
import { EstimateEditor } from '@/components/estimates/estimate-editor';

export const metadata = { title: 'New estimate' };

export default async function NewEstimatePage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  const { admin, access } = await loadEstimateContext(accountId);
  if (!access.canManage) notFound();

  const { data: projects } = await admin
    .from('projects').select('id, name').eq('account_id', accountId).order('name');

  return (
    <div className="container mx-auto max-w-4xl p-6">
      <h1 className="text-foreground mb-6 text-2xl font-bold">New estimate</h1>
      <EstimateEditor accountId={accountId} projects={projects ?? []} />
    </div>
  );
}