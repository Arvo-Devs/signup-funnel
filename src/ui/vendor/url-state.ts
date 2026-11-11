'use client';

// Vendored from betterfanslink lib/url-state.ts (main d4138f9): useUrlParams and pickParam.
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

/**
 * Filters kept in the URL so a filtered view can be shared and survives a
 * reload. `set` merges into the current params; empty values are removed.
 */
export function useUrlParams() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const set = useCallback(
    (updates: Record<string, string | null | undefined>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(updates)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      const qs = next.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [params, router, pathname],
  );
  return { params, set };
}

/** An enum param: the URL value when it is allowed, else the fallback. */
export function pickParam<V extends string>(value: string | null, allowed: readonly V[], fallback: V): V {
  return value && (allowed as readonly string[]).includes(value) ? (value as V) : fallback;
}
