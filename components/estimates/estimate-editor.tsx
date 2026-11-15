'use client';

import { useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-config';
import { formatMoney, minorToInput, parseMoneyToMinor } from '@/lib/money';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type Item = { description: string; quantity: string; price: string };
export type EditorEstimate = {
  id: string;
  title: string;
  description: string | null;
  project_id: string | null;
  currency: string;
  line_items: { description: string; quantity: number; unit_price_minor: number }[];
};
type Props = {
  accountId: string;
  projects: { id: string; name: string }[];
  estimate?: EditorEstimate; // present = edit an existing draft
  canSend?: boolean;
};

const emptyItem = (): Item => ({ description: '', quantity: '1', price: '' });

export function EstimateEditor({ accountId, projects, estimate, canSend }: Props) {
  const router = useRouter();
  const [title, setTitle] = useState(estimate?.title ?? '');
  const [description, setDescription] = useState(estimate?.description ?? '');
  const [projectId, setProjectId] = useState(estimate?.project_id ?? '');
  const [currency, setCurrency] = useState(estimate?.currency ?? 'USD');
  const [items, setItems] = useState<Item[]>(
    estimate?.line_items.length
      ? estimate.line_items.map((i) => ({
          description: i.description,
          quantity: String(i.quantity),
          price: minorToInput(i.unit_price_minor),
        }))
      : [emptyItem()],
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Idempotency-Key is reused on retry of the SAME body, renewed if the body changed
  const keyRef = useRef<{ body: string; key: string } | null>(null);

  const total = useMemo(
    () =>
      items.reduce((sum, i) => {
        const p = parseMoneyToMinor(i.price);
        const q = Number(i.quantity);
        return p === null || !(q > 0) ? sum : sum + Math.round(q * p);
      }, 0),
    [items],
  );

  const update = (idx: number, patch: Partial<Item>) =>
    setItems((prev) => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));

  function buildBody() {
    if (!title.trim()) throw new Error('Title is required');
    const line_items = items
      .filter((i) => i.description.trim() || i.price.trim())
      .map((i, n) => {
        const unit_price_minor = parseMoneyToMinor(i.price);
        const quantity = Number(i.quantity);
        if (!i.description.trim()) throw new Error(`Line ${n + 1}: description is required`);
        if (unit_price_minor === null) throw new Error(`Line ${n + 1}: price must look like 12.50`);
        if (!(quantity > 0)) throw new Error(`Line ${n + 1}: quantity must be greater than 0`);
        return { description: i.description.trim(), quantity, unit_price_minor };
      });
    return {
      title: title.trim(),
      description: description.trim() || null,
      project_id: projectId || null,
      line_items,
      ...(estimate ? {} : { currency }),
    };
  }

  async function save(thenSend: boolean) {
    setError(null);
    setSaving(true);
    try {
      const body = buildBody();
      let id = estimate?.id;

      if (estimate) {
        const res = await apiFetch(`/api/accounts/${accountId}/estimates/${estimate.id}`, {
          method: 'PATCH',
          body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to save');
      } else {
        const serialized = JSON.stringify(body);
        if (keyRef.current?.body !== serialized) {
          keyRef.current = { body: serialized, key: crypto.randomUUID() };
        }
        const res = await apiFetch(`/api/accounts/${accountId}/estimates`, {
          method: 'POST',
          headers: { 'Idempotency-Key': keyRef.current.key },
          body: serialized,
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to create');
        id = json.data.id;
      }

      if (thenSend && id) {
        const res = await apiFetch(`/api/accounts/${accountId}/estimates/${id}/transition`, {
          method: 'POST',
          body: JSON.stringify({ to: 'sent' }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Saved, but could not send');
      }

      router.push(`/accounts/${accountId}/estimates/${id}`);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="title">Title</Label>
          <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="desc">Description</Label>
          <Textarea id="desc" value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="project">Project (optional)</Label>
          <select
            id="project"
            className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
          >
            <option value="">No project</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="currency">Currency</Label>
          <Input id="currency" value={currency} maxLength={3} disabled={!!estimate}
            onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-foreground text-lg font-semibold">Line items</h2>
        <div className="text-muted-foreground hidden grid-cols-[1fr_90px_130px_120px_40px] gap-2 text-xs md:grid">
          <span>Description</span><span>Qty</span><span>Unit price</span>
          <span className="text-right">Line total</span><span />
        </div>
        {items.map((it, idx) => {
          const p = parseMoneyToMinor(it.price);
          const q = Number(it.quantity);
          const lineTotal = p !== null && q > 0 ? Math.round(q * p) : 0;
          return (
            <div key={idx} className="grid grid-cols-1 items-center gap-2 md:grid-cols-[1fr_90px_130px_120px_40px]">
              <Input placeholder="Description" value={it.description}
                onChange={(e) => update(idx, { description: e.target.value })} />
              <Input inputMode="decimal" value={it.quantity}
                onChange={(e) => update(idx, { quantity: e.target.value })} />
              <Input inputMode="decimal" placeholder="0.00" value={it.price}
                onChange={(e) => update(idx, { price: e.target.value })} />
              <span className="text-right text-sm tabular-nums">{formatMoney(lineTotal, currency)}</span>
              <Button variant="ghost" size="sm" aria-label="Remove line"
                disabled={items.length === 1}
                onClick={() => setItems((prev) => prev.filter((_, i) => i !== idx))}>✕</Button>
            </div>
          );
        })}
        <Button variant="outline" size="sm" onClick={() => setItems((p) => [...p, emptyItem()])}>
          + Add line
        </Button>
      </div>

      <div className="flex justify-end text-lg font-semibold">
        Total: <span className="ml-2 tabular-nums">{formatMoney(total, currency)}</span>
      </div>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="outline" disabled={saving} onClick={() => router.back()}>Cancel</Button>
        <Button variant="secondary" disabled={saving} onClick={() => save(false)}>
          {saving ? 'Saving...' : 'Save draft'}
        </Button>
        {canSend !== false && (
          <Button disabled={saving || total <= 0} onClick={() => save(true)}>Save & send</Button>
        )}
      </div>
    </div>
  );
}