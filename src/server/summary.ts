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
import { cleanReason, recordingSince, stepsFor, trafficSignups } from './steps';

const DAY = 24 * 60 * 60 * 1000;
/** Failures read per account from the app's own data: the newest. */
const PROBLEMS_PER_ACCOUNT = 20;

const text = (value: unknown, max: number): string | null => (typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null);

/** A time as ISO text, or null for anything that is not one. */
function isoTime(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  const time = value instanceof Date ? value : new Date(String(value));
  return Number.isFinite(time.getTime()) ? time.toISOString() : null;
}

/** The failures an account's own data shows, on the app's steps, oldest first, the newest 20. */
function ownProblems(value: unknown, stepKeys: ReadonlySet<string>): FunnelAccountFacts['problems'] {
  if (!Array.isArray(value)) return [];
  const found: { step: string; reason: string; at: string }[] = [];
  for (const problem of value as unknown[]) {
    if (!problem || typeof problem !== 'object') continue;
    const { step, reason, at } = problem as Record<string, unknown>;
    const when = isoTime(at);
    const said = cleanReason(reason);
    if (typeof step === 'string' && stepKeys.has(step) && when && said) found.push({ step, reason: said, at: when });
  }
  return found.sort((a, b) => a.at.localeCompare(b.at)).slice(-PROBLEMS_PER_ACCOUNT);
}

/** An account from the app as the rules take it, or null for one with no id or no time it was made. */
export function accountFacts(account: FunnelAccount, stepKeys: ReadonlySet<string>): FunnelAccountFacts | null {
  if (!account || typeof account.id !== 'string' || !account.id) return null;
  const made = isoTime(account.createdAt);
  if (!made) return null;
  return {
    id: account.id,
    createdAt: made,
    name: text(account.name, 120),
    email: text(account.email, 254),
    done: Array.isArray(account.done) ? account.done.filter((key): key is string => typeof key === 'string' && stepKeys.has(key)) : [],
    setAside: text(account.setAside, 60),
    kind: text(account.kind, 40),
    device: account.device === 'phone' || account.device === 'computer' ? account.device : null,
    source: text(account.source, 80),
    contact: text(account.contact, 80),
    problems: ownProblems(account.problems, stepKeys),
    lastSeenAt: isoTime(account.lastSeenAt),
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
    needsReports: config.steps.some((step) => step.fromData !== true),
    truncated: found.length > FUNNEL_ACCOUNTS_MAX,
  };
}
