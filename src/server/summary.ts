// What the Sign-up funnel page shows for one stretch of time: the accounts
// the app says were made in it, the steps kept for them, Traffic's sign-up
// rows when the app has Traffic, and the rules in ../shared/funnel.
import type { FunnelAccount, FunnelSql, FunnelUser, ResolvedFunnelConfig } from '../config';
import {
  buildFunnel,
  FUNNEL_ACCOUNTS_MAX,
  FUNNEL_RANGE_DAYS,
  type FunnelAccountFacts,
  type FunnelRange,
  type FunnelSignupFact,
  type FunnelSummary,
} from '../shared/funnel';
import { recordingSince, stepsFor, trafficSignups } from './steps';

const DAY = 24 * 60 * 60 * 1000;

const text = (value: unknown, max: number): string | null => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

/** An account from the app as the rules take it, or null for one with no id or no time it was made. */
export function accountFacts(account: FunnelAccount, stepKeys: ReadonlySet<string>): FunnelAccountFacts | null {
  if (!account || typeof account.id !== 'string' || !account.id) return null;
  const made = account.createdAt instanceof Date ? account.createdAt : new Date(String(account.createdAt));
  if (!Number.isFinite(made.getTime())) return null;
  return {
    id: account.id,
    createdAt: made.toISOString(),
    name: text(account.name, 120),
    email: text(account.email, 254),
    done: Array.isArray(account.done) ? account.done.filter((key): key is string => typeof key === 'string' && stepKeys.has(key)) : [],
    setAside: text(account.setAside, 60),
    kind: text(account.kind, 40),
    device: account.device === 'phone' || account.device === 'computer' ? account.device : null,
    source: text(account.source, 80),
    contact: text(account.contact, 80),
  };
}

/**
 * The page's numbers for accounts made in the last `range`, or null when the
 * app could not look its accounts up right now.
 */
export async function funnelSummary<User extends FunnelUser>(
  sql: FunnelSql,
  config: ResolvedFunnelConfig<User>,
  range: FunnelRange,
  now: Date = new Date(),
): Promise<FunnelSummary | null> {
  const from = new Date(now.getTime() - FUNNEL_RANGE_DAYS[range] * DAY);
  const found = await config.accounts({ from, to: now, limit: FUNNEL_ACCOUNTS_MAX + 1 });
  if (found === null) return null;
  const stepKeys = new Set(config.steps.map((step) => step.key));
  const accounts = found
    .slice(0, FUNNEL_ACCOUNTS_MAX)
    .map((account) => accountFacts(account, stepKeys))
    .filter((account): account is FunnelAccountFacts => account !== null);
  const ids = accounts.filter((account) => !account.setAside).map((account) => account.id);

  const rows = ids.length ? await stepsFor(sql, ids) : [];
  let signups: FunnelSignupFact[] = [];
  if (config.traffic && ids.length) {
    try {
      signups = await trafficSignups(sql, ids);
    } catch (error) {
      // Traffic's table is not here after all: the funnel still answers, without its two columns.
      config.log("[Sign-up funnel] Traffic's sign-up rows were not read", error);
    }
  }

  return {
    range,
    from: from.toISOString(),
    to: now.toISOString(),
    generatedAt: now.toISOString(),
    ...buildFunnel({ steps: config.steps, accounts, rows, signups }),
    recordingSince: await recordingSince(sql),
    truncated: found.length > FUNNEL_ACCOUNTS_MAX,
  };
}
