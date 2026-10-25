import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/components/ui/card';

type Tone = 'neutral' | 'accent' | 'danger' | 'warning' | 'success' | 'info';

const TONE: Record<Tone, { icon: string; value: string; bar: string }> = {
  neutral: { icon: 'bg-muted text-muted-foreground', value: 'text-foreground', bar: 'bg-muted-foreground/40' },
  accent: { icon: 'bg-accent text-accent-foreground', value: 'text-foreground', bar: 'bg-accent-solid' },
  danger: { icon: 'bg-danger/10 text-danger', value: 'text-danger', bar: 'bg-danger' },
  warning: { icon: 'bg-warning/10 text-warning', value: 'text-warning', bar: 'bg-warning' },
  success: { icon: 'bg-success/10 text-success', value: 'text-success', bar: 'bg-success' },
  info: { icon: 'bg-info/10 text-info', value: 'text-info', bar: 'bg-info' },
};

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'neutral',
  progress,
  onClick,
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  icon: LucideIcon;
  tone?: Tone;
  progress?: number;
  onClick?: () => void;
  className?: string;
}) {
  const styles = TONE[tone];
  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            {label}
          </p>
          <p className={cn('mt-1 text-2xl font-semibold tabular-nums tracking-tight', styles.value)}>
            {value}
          </p>
        </div>
        <span className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-lg', styles.icon)}>
          <Icon className="h-4 w-4" aria-hidden="true" />
        </span>
      </div>
      {hint && <p className="mt-1.5 text-xs leading-snug text-muted-foreground">{hint}</p>}
      {progress !== undefined && (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div
            className={cn('h-full rounded-full transition-all duration-500', styles.bar)}
            style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
          />
        </div>
      )}
    </>
  );

  const classes = cn(
    'rounded-xl border border-border bg-card/85 p-4 text-left shadow-sm backdrop-blur-sm transition-all',
    onClick && 'hover:-translate-y-0.5 hover:border-accent-border hover:shadow-md',
    className,
  );

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={classes}>
        {content}
      </button>
    );
  }
  return <div className={classes}>{content}</div>;
}
