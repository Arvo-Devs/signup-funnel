'use client';

// Where the funnel routes are mounted, for every call the page makes. The
// default is /api/signup-funnel; SignupFunnelReport's basePath prop moves it.
import { createContext, use, type ReactNode } from 'react';
import { FUNNEL_BASE_PATH } from '../notes';

const BasePathContext = createContext<string>(FUNNEL_BASE_PATH);

export function FunnelProvider({ basePath, children }: { basePath?: string; children: ReactNode }) {
  const outer = use(BasePathContext);
  // No slash at the end, so the calls can add theirs.
  const value = basePath === undefined ? outer : basePath.replace(/\/+$/, '') || FUNNEL_BASE_PATH;
  return <BasePathContext value={value}>{children}</BasePathContext>;
}

/** The base path in effect: the nearest provider's, or /api/signup-funnel. */
export function useFunnelBasePath(): string {
  return use(BasePathContext);
}
