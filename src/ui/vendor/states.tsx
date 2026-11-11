'use client';

// Vendored from betterfanslink components/ui/states.tsx (main d4138f9): EmptyState, ErrorState and InlineError, on the package's color names, for FunnelError, without the billing, view-as and docs links.
import type { ComponentType, ReactNode } from 'react';
import { AlertTriangle, Lock, WifiOff } from 'lucide-react';
import { Button, Spinner } from './button';
import { cn } from './cn';
import { CopyButton } from './copy';
import { FunnelError } from './errors';

/**
 * What a list shows when it has nothing. `title` says what is missing,
 * `children` says how to get the first one, `action` is the button for it.
 */
export function EmptyState({
  icon: Icon,
  title,
  children,
  action,
  className,
  compact,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div className={cn('flex flex-col items-center px-6 text-center', compact ? 'py-8' : 'py-14', className)}>
      {Icon ? (
        <div className="mb-4 grid size-10 place-items-center rounded-xl border border-input bg-muted text-muted-foreground">
          <Icon className="size-5" />
        </div>
      ) : null}
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {children ? <div className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">{children}</div> : null}
      {action ? <div className="mt-5 flex flex-wrap items-center justify-center gap-2">{action}</div> : null}
    </div>
  );
}

function errorCopy(error: unknown): {
  title: string;
  message: string;
  hint: string | null;
  requestId: string | null;
  icon: ComponentType<{ className?: string }>;
} {
  if (error instanceof FunnelError) {
    if (error.status === 0) {
      return { title: 'Offline', message: error.message, hint: null, requestId: null, icon: WifiOff };
    }
    if (error.status === 403) {
      return { title: 'Not allowed', message: error.message, hint: error.hint, requestId: error.requestId, icon: Lock };
    }
    return {
      title: error.status >= 500 ? 'Something went wrong' : 'This did not load',
      message: error.message,
      hint: error.hint,
      requestId: error.requestId,
      icon: AlertTriangle,
    };
  }
  return {
    title: 'Something went wrong',
    message: error instanceof Error ? error.message : 'The page hit an error it did not expect.',
    hint: null,
    requestId: null,
    icon: AlertTriangle,
  };
}

/** A failed load. Shows the API's message, hint and request id, with a retry. */
export function ErrorState({
  error,
  onRetry,
  retrying,
  className,
  compact,
}: {
  error: unknown;
  onRetry?: () => void;
  retrying?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const e = errorCopy(error);
  const Icon = e.icon;
  return (
    <div role="alert" className={cn('flex flex-col items-center px-6 text-center', compact ? 'py-8' : 'py-14', className)}>
      <div className="mb-4 grid size-10 place-items-center rounded-xl border border-danger-border bg-danger-soft text-danger-strong">
        <Icon className="size-5" />
      </div>
      <p className="text-sm font-semibold text-foreground">{e.title}</p>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">{e.message}</p>
      {e.hint ? <p className="mt-1 max-w-md text-sm leading-relaxed text-muted-foreground/80">{e.hint}</p> : null}
      {onRetry ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Button size="sm" onClick={onRetry} disabled={retrying}>
            {retrying ? <Spinner /> : null}
            Try again
          </Button>
        </div>
      ) : null}
      {e.requestId ? (
        <p className="mt-4 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground/80">
          {e.requestId}
          <CopyButton value={e.requestId} label="Copy request id" size="xs" />
        </p>
      ) : null}
    </div>
  );
}

/** The inline version for forms and dialogs. */
export function InlineError({ error, className }: { error: unknown; className?: string }) {
  if (!error) return null;
  const e = errorCopy(error);
  return (
    <div role="alert" className={cn('rounded-lg border border-danger-border bg-danger-soft px-3 py-2.5 text-sm', className)}>
      <p className="font-medium text-danger-strong">{e.message}</p>
      {e.hint ? <p className="mt-0.5 text-muted-foreground">{e.hint}</p> : null}
      {e.requestId ? <p className="mt-1 font-mono text-xs text-muted-foreground/80">{e.requestId}</p> : null}
    </div>
  );
}
