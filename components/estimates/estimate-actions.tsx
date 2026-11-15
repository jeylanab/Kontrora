'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-config';
import { Button } from '@/components/ui/button';

export function EstimateActions({
  accountId, estimateId, status, canManage, isClient,
}: { accountId: string; estimateId: string; status: string; canManage: boolean; isClient: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go(to: 'sent' | 'accepted' | 'rejected') {
    setBusy(true);
    setError(null);
    const res = await apiFetch(`/api/accounts/${accountId}/estimates/${estimateId}/transition`, {
      method: 'POST',
      body: JSON.stringify({ to }),
    });
    const json = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(json.error || 'Action failed');
    router.refresh();
  }

  const canRespond = status === 'sent' && (canManage || isClient);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        {status === 'draft' && canManage && <Button disabled={busy} onClick={() => go('sent')}>Send</Button>}
        {canRespond && (
          <>
            <Button variant="outline" disabled={busy} onClick={() => go('rejected')}>Reject</Button>
            <Button disabled={busy} onClick={() => go('accepted')}>Accept</Button>
          </>
        )}
      </div>
      {error && <p className="text-sm text-red-500">{error}</p>}
    </div>
  );
}