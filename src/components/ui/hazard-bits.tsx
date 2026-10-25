import { formatDistanceToNow, format } from 'date-fns';
import { AlertTriangle, AlertOctagon, Info, ShieldCheck, CircleDot } from 'lucide-react';
import { cn } from '@/components/ui/card';
import type { HazardStatus, Severity } from '@/lib/types';

export const SEVERITY_META: Record<
  Severity,
  { label: string; symbol: string; hex: string; icon: typeof AlertTriangle; description: string }
> = {
  critical: {
    label: 'Critical',
    symbol: '◆',
    hex: '#EF4444',
    icon: AlertOctagon,
    description: 'Immediate danger — act now',
  },
  high: { label: 'High', symbol: '▲', hex: '#F97316', icon: AlertTriangle, description: 'Act within 24 hours' },
  medium: { label: 'Medium', symbol: '●', hex: '#FACC15', icon: CircleDot, description: 'Act within 7 days' },
  low: { label: 'Low', symbol: '■', hex: '#22C55E', icon: ShieldCheck, description: 'Routine correction' },
  info: { label: 'Info', symbol: 'ℹ', hex: '#3B82F6', icon: Info, description: 'Advisory only' },
};

export const STATUS_META: Record<HazardStatus, { label: string; className: string }> = {
  new: { label: 'New', className: 'border-info/30 bg-info/10 text-info' },
  pending_review: {
    label: 'Pending review',
    className: 'border-warning/30 bg-warning/10 text-warning',
  },
  verified: { label: 'Verified', className: 'border-danger/30 bg-danger/10 text-danger' },
  in_progress: { label: 'In progress', className: 'border-accent-border bg-accent text-accent-foreground' },
  resolved: { label: 'Resolved', className: 'border-success/30 bg-success/10 text-success' },
};

export function SeverityBadge({
  severity,
  showLabel = true,
  className,
}: {
  severity: Severity;
  showLabel?: boolean;
  className?: string;
}) {
  const meta = SEVERITY_META[severity] ?? SEVERITY_META.info;
  const Icon = meta.icon;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-5',
        className,
      )}
      style={{
        color: meta.hex,
        borderColor: `${meta.hex}55`,
        backgroundColor: `${meta.hex}18`,
      }}
      title={meta.description}
    >
      <Icon aria-hidden="true" className="h-3 w-3" />
      {showLabel ? meta.label : <span className="sr-only">{meta.label}</span>}
    </span>
  );
}

export function SeverityDot({ severity, className }: { severity: Severity; className?: string }) {
  const meta = SEVERITY_META[severity] ?? SEVERITY_META.info;
  return (
    <span
      className={cn('inline-block h-2.5 w-2.5 rounded-full border border-white/40', className)}
      style={{ backgroundColor: meta.hex }}
      title={meta.label}
      aria-label={`${meta.label} severity`}
    />
  );
}

export function StatusBadge({ status, className }: { status: HazardStatus; className?: string }) {
  const meta = STATUS_META[status] ?? STATUS_META.new;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold capitalize leading-5',
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

export function relativeTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return formatDistanceToNow(date, { addSuffix: true });
}

export function absoluteTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'd MMM yyyy, HH:mm');
}

export function shortDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return format(date, 'd MMM yyyy');
}
