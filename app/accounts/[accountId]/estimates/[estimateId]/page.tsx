import Link from 'next/link';
import { notFound } from 'next/navigation';
import { loadEstimateContext } from '@/lib/estimates-page';
import { fetchEstimate } from '@/lib/estimates';
import { formatMoney } from '@/lib/money';
import { EstimateEditor } from '@/components/estimates/estimate-editor';
import { EstimateActions } from '@/components/estimates/estimate-actions';
import { StatusBadge } from '@/components/estimates/status-badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export default async function EstimatePage({
  params,
}: { params: Promise<{ accountId: string; estimateId: string }> }) {
  const { accountId, estimateId } = await params;
  const { admin, access } = await loadEstimateContext(accountId);

  const est: any = await fetchEstimate(admin, accountId, estimateId);
  if (!est || (access.isClient && est.status === 'draft')) notFound();

  const back = (
    <Link href={`/accounts/${accountId}/estimates`} className="text-muted-foreground text-sm hover:underline">
      ← Estimates
    </Link>
  );

  if (est.status === 'draft' && access.canManage) {
    const { data: projects } = await admin
      .from('projects').select('id, name').eq('account_id', accountId).order('name');
    return (
      <div className="container mx-auto max-w-4xl space-y-4 p-6">
        {back}
        <div className="flex items-center gap-3">
          <h1 className="text-foreground text-2xl font-bold">Edit draft</h1>
          <StatusBadge status="draft" />
        </div>
        <EstimateEditor accountId={accountId} projects={projects ?? []} estimate={est} />
      </div>
    );
  }

  return (
    <div className="container mx-auto max-w-4xl space-y-6 p-6">
      {back}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-foreground text-2xl font-bold">{est.title}</h1>
            <StatusBadge status={est.status} />
          </div>
          {est.description && <p className="text-muted-foreground mt-2 whitespace-pre-wrap">{est.description}</p>}
        </div>
        <EstimateActions
          accountId={accountId} estimateId={est.id} status={est.status}
          canManage={access.canManage} isClient={access.isClient}
        />
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Description</TableHead>
            <TableHead className="text-right">Qty</TableHead>
            <TableHead className="text-right">Unit price</TableHead>
            <TableHead className="text-right">Total</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {est.line_items.map((i: any) => (
            <TableRow key={i.id}>
              <TableCell>{i.description}</TableCell>
              <TableCell className="text-right tabular-nums">{i.quantity}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(i.unit_price_minor, est.currency)}</TableCell>
              <TableCell className="text-right tabular-nums">{formatMoney(i.line_total_minor, est.currency)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <div className="text-right text-lg font-semibold">
        Total: <span className="tabular-nums">{formatMoney(est.total_minor, est.currency)}</span>
      </div>
    </div>
  );
}