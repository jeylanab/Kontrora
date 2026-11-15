import { Badge } from '@/components/ui/badge';

const STYLES: Record<string, string> = {
  draft: 'border-gray-400/40 text-gray-400',
  sent: 'border-blue-400/40 text-blue-400',
  accepted: 'border-green-500/40 text-green-500',
  rejected: 'border-red-500/40 text-red-500',
};

export function StatusBadge({ status }: { status: string }) {
  return (
    <Badge variant="outline" className={`capitalize ${STYLES[status] ?? ''}`}>
      {status}
    </Badge>
  );
}