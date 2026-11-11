// A pretend app for the tests: a product where a new account confirms its
// email, sees a welcome page, makes a key and links an outside account (the
// goal). Its sign-in reads a `session=<who>` cookie, and anyone on
// MASS_ACCESS may see the page. Its accounts are a list the test fills.
import type { FunnelAccount, FunnelConfig, FunnelStepDef, FunnelUser } from '../src/config';

export const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1';
export const CHROME = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36';

export const SITE_HOSTS = ['example.com', 'www.example.com'];

export const STEPS: readonly FunnelStepDef[] = [
  { key: 'email_confirmed', label: 'Confirmed the email' },
  { key: 'welcome_seen', label: 'Saw the welcome page', fromBrowser: true },
  { key: 'key_made', label: 'Made a key', stopped: 'Made a key, never used it' },
  { key: 'account_linked', label: 'Linked an account' },
];

export type Person = FunnelUser & { email: string };

export const MASS_ACCESS = new Set(['admin@example.com']);

export const PEOPLE: Record<string, Person> = {
  admin: { id: 'usr_admin', email: 'admin@example.com' },
  owner: { id: 'usr_owner', email: 'owner@example.test' },
  other: { id: 'usr_other', email: 'other@example.test' },
};

export const cookieFor = (who: string) => `theme=dark; session=${who}`;

/** The fake app's config. `db` answers null (no database) and it has no accounts unless the test gives them. */
export function fakeConfig(overrides: Partial<FunnelConfig<Person>> = {}): FunnelConfig<Person> {
  return {
    db: () => null,
    signedInUser: async (request) => {
      const who = /(?:^|;\s*)session=([a-z]+)/.exec(request.headers.get('cookie') ?? '')?.[1];
      if (!who) return null;
      if (who === 'broken') throw new Error('sign-in is down');
      // A staff member viewing as the owner's account.
      if (who === 'viewedas') return { ...PEOPLE.owner!, viewedAs: true };
      return PEOPLE[who] ?? null;
    },
    canView: (user) => !user.viewedAs && MASS_ACCESS.has(user.email.toLowerCase()),
    steps: STEPS,
    accounts: async () => [],
    siteHosts: SITE_HOSTS,
    log: () => undefined,
    ...overrides,
  };
}

export type RequestInitLike = {
  method?: string;
  body?: unknown;
  cookie?: string;
  agent?: string | null;
  origin?: string | null;
  site?: string;
};

export function request(path: string, init: RequestInitLike = {}): Request {
  const headers = new Headers({ 'content-type': 'application/json' });
  if (init.agent !== null) headers.set('user-agent', init.agent ?? CHROME);
  if (init.origin !== null) headers.set('origin', init.origin ?? 'https://example.com');
  if (init.cookie) headers.set('cookie', init.cookie);
  if (init.site) headers.set('sec-fetch-site', init.site);
  const method = init.method ?? 'POST';
  const body = init.body === undefined || method === 'GET' ? undefined : typeof init.body === 'string' ? init.body : JSON.stringify(init.body);
  return new Request(`https://example.com${path}`, { method, headers, body });
}

const DAY = 24 * 60 * 60 * 1000;
/** An account made `daysAgo` days ago. */
export function account(id: string, daysAgo: number, extra: Partial<FunnelAccount> = {}): FunnelAccount {
  return { id, createdAt: new Date(Date.now() - daysAgo * DAY), name: `Sample ${id}`, email: `${id}@example.test`, ...extra };
}

/** The app's accounts as its `accounts` hook answers them: those made in the range, newest first, up to the limit. */
export function accountsHook(all: readonly FunnelAccount[]): FunnelConfig<Person>['accounts'] {
  return async ({ from, to, limit }) =>
    all
      .filter((a) => new Date(a.createdAt).getTime() >= from.getTime() && new Date(a.createdAt).getTime() <= to.getTime())
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, limit);
}
