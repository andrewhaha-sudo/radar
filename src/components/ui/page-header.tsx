import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/components/ui/card';

export function PageHeader({
  eyebrow,
  title,
  description,
  icon: Icon,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between',
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {Icon && (
          <span className="mt-0.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border bg-card/80 text-accent-foreground shadow-sm backdrop-blur">
            <Icon className="h-5 w-5" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          {eyebrow && (
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              {eyebrow}
            </p>
          )}
          <h1 className="mt-1 text-balance text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-3xl text-sm leading-relaxed text-muted-foreground">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">{actions}</div>
      )}
    </div>
  );
}
