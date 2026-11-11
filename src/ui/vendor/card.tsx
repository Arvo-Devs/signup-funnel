// Vendored from betterfanslink components/ui/card.tsx (main d4138f9): Card, CardHeader, CardBody and Stat, on the package's color names.
import type { ReactNode } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import { cn } from './cn';

export function Card({ children, className, as: As = 'section' }: { children: ReactNode; className?: string; as?: 'section' | 'div' | 'article' }) {
  return <As className={cn('min-w-0 rounded-xl border border-border bg-card', className)}>{children}</As>;
}

export function CardHeader({
  title,
  description,
  action,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 pt-4 pb-3 sm:px-5', className)}>
      <div className="min-w-0 flex-1 basis-48">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {action ? <div className="flex shrink-0 items-center gap-2">{action}</div> : null}
    </div>
  );
}

export function CardBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-4 pb-4 sm:px-5 sm:pb-5', className)}>{children}</div>;
}

/** A headline number. `change` is a percent, positive is good unless `invert`. */
export function Stat({
  label,
  value,
  sub,
  change,
  invert,
  className,
  children,
}: {
  label: ReactNode;
  value: ReactNode;
  sub?: ReactNode;
  change?: number | null;
  invert?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  const good = change === null || change === undefined ? null : invert ? change < 0 : change >= 0;
  return (
    <div className={cn('min-w-0 rounded-xl border border-border bg-card p-4', className)}>
      {/* Label and sub wrap: on a phone two stats share a row and a cut label reads as a different one. */}
      <p className="text-[13px] text-pretty break-words text-muted-foreground">{label}</p>
      <p className="mt-1.5 truncate text-2xl font-semibold tracking-tight text-foreground tabular-nums">{value}</p>
      {change !== null && change !== undefined ? (
        <p className={cn('mt-1 inline-flex items-center gap-0.5 text-xs font-medium tabular-nums', good ? 'text-success-strong' : 'text-danger-strong')}>
          {change >= 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
          {Math.abs(change).toFixed(Math.abs(change) < 10 ? 1 : 0)}%
          <span className="font-normal text-muted-foreground/80">{sub ?? 'vs previous period'}</span>
        </p>
      ) : sub ? (
        <p className="mt-1 text-xs text-pretty break-words text-muted-foreground/80">{sub}</p>
      ) : null}
      {children}
    </div>
  );
}
