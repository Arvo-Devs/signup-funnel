'use client';

// Vendored from betterfanslink components/ui/time.tsx (main d4138f9): RelativeTime and useNow, on the package's color names.
import { useEffect, useState } from 'react';
import { cn } from './cn';
import { absoluteTime, relativeTime } from './format';
import { Tip } from './tooltip';

let listeners = new Set<() => void>();
let interval: ReturnType<typeof setInterval> | null = null;

function subscribe(fn: () => void) {
  listeners.add(fn);
  if (!interval) interval = setInterval(() => listeners.forEach((l) => l()), 30_000);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0 && interval) {
      clearInterval(interval);
      interval = null;
      listeners = new Set();
    }
  };
}

/** Rerenders every 30 s so relative times stay honest. */
export function useNow() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => subscribe(() => setNow(Date.now())), []);
  return now;
}

/** "4 min ago", with the absolute local time on hover and in dateTime. */
export function RelativeTime({ iso, className, fallback = 'Never' }: { iso: string | null | undefined; className?: string; fallback?: string }) {
  const now = useNow();
  if (!iso) return <span className={cn('text-muted-foreground/80', className)}>{fallback}</span>;
  return (
    <Tip content={absoluteTime(iso)}>
      <time dateTime={iso} className={cn('whitespace-nowrap tabular-nums', className)}>
        {relativeTime(iso, now)}
      </time>
    </Tip>
  );
}
