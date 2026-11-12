'use client';

// The page's one read, against the package's route under the base path in
// effect (./context). Errors come back as { error: { message, hint },
// requestId } and are thrown as FunnelError, which ErrorState shows with the
// hint and the request id.
import { useQuery } from '@tanstack/react-query';
import type { FunnelRange, FunnelSummary } from '../shared/funnel';
import { errorFromBody, FunnelError } from '../ui/ui-deps';
import { useFunnelBasePath } from './context';

/** Every query this package keeps is under this key, then the base path. */
export const FUNNEL_QUERY_KEY = ['arvo-signup-funnel'] as const;

/** The key one answer is kept under. No kind named is the app's first kind (or its only one). */
export function summaryKey(basePath: string, range: FunnelRange, funnel: string | null = null) {
  return funnel ? ([...FUNNEL_QUERY_KEY, basePath, 'summary', range, funnel] as const) : ([...FUNNEL_QUERY_KEY, basePath, 'summary', range] as const);
}

async function call<T>(url: string, init: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, credentials: 'same-origin', headers: { accept: 'application/json' } });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') throw error;
    throw new FunnelError(0, { message: 'Could not reach the site. Check your connection and try again.' }, null);
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw errorFromBody(response.status, body);
  return body as T;
}

/**
 * The page's numbers for one range and one kind of sign-up (null: the first).
 * The last numbers stay up while new ones load; the page says when they are
 * another kind's, so they are never read as this one's.
 */
export function useFunnelSummary(range: FunnelRange, funnel: string | null = null) {
  const basePath = useFunnelBasePath();
  return useQuery<FunnelSummary, FunnelError>({
    queryKey: summaryKey(basePath, range, funnel),
    queryFn: ({ signal }) => call(`${basePath}?range=${range}${funnel ? `&funnel=${encodeURIComponent(funnel)}` : ''}`, { signal }),
    placeholderData: (previous) => previous,
  });
}
