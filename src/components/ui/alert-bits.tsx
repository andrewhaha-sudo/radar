import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import type { AlertLevel, AlertState } from '@/lib/types';
import { cn } from '@/components/ui/card';

export const ALERT_LEVEL_META: Record<
  AlertLevel,
  {
    label: string;
    short: string;
    hex: string;
    icon: typeof Info;
    symbol: string;
    description: string;
  }
> = {
  green: {
    label: 'Green — Normal',
    short: 'Normal',
    hex: '#22C55E',
    icon: CheckCircle2,
    symbol: '●',
    description: 'Routine monitoring and normal school operations.',
  },
  yellow: {
    label: 'Yellow — Advisory',
    short: 'Advisory',
    hex: '#FACC15',
    icon: Info,
    symbol: '▲',
    description: 'Increased monitoring, preparedness reminders, or minor hazards.',
  },
  orange: {
    label: 'Orange — High alert',
    short: 'High alert',
    hex: '#F97316',
    icon: AlertTriangle,
    symbol: '◆',
    description: 'Urgent preparation, restricted areas, or authorized protective actions.',
  },
  red: {
    label: 'Red — Emergency',
    short: 'Emergency',
    hex: '#EF4444',
    icon: AlertOctagon,
    symbol: '■',
    description: 'Active emergency procedures and coordinated response.',
  },
};

export const ALERT_STATE_META: Record<AlertState, { label: string; className: string }> = {
  active: { label: 'Active', className: 'border-success/30 bg-success/10 text-success' },
  scheduled: { label: 'Scheduled', className: 'border-info/30 bg-info/10 text-info' },
  expired: { label: 'Expired', className: 'border-border bg-muted text-muted-foreground' },
  archived: { label: 'Archived', className: 'border-border bg-muted text-muted-foreground' },
};

export function AlertLevelBadge({
  level,
  showLabel = true,
  className,
}: {
  level: AlertLevel;
  showLabel?: boolean;
  className?: string;
}) {
  const meta = ALERT_LEVEL_META[level] ?? ALERT_LEVEL_META.green;
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
      <Icon className="h-3 w-3" aria-hidden="true" />
      {showLabel ? meta.label : <span className="sr-only">{meta.label}</span>}
    </span>
  );
}

export function AlertStateBadge({ state, className }: { state: AlertState; className?: string }) {
  const meta = ALERT_STATE_META[state] ?? ALERT_STATE_META.active;
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold leading-5',
        meta.className,
        className,
      )}
    >
      {meta.label}
    </span>
  );
}

export function alertLevelColor(level: AlertLevel | null | undefined) {
  return level ? ALERT_LEVEL_META[level].hex : '#22C55E';
}
