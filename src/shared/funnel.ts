// The funnel, from rows. Pure, so the routes, the page and the tests share
// one set of rules:
//
//   set aside     an account the app says to leave out (invited staff, a test
//                 account) is counted apart and is in no bar
//   reached       the furthest step with any proof: the app's own data says it
//                 is done, or a report that went through. A later step proves
//                 the earlier ones (nobody reaches the goal without the steps
//                 before it), which keeps the bars falling and lets accounts
//                 older than the reporting still be placed
//   went wrong    the last report that did not go through, whichever step it
//                 was for. It does not move the account forward
//   phone or      what the app gave, else Traffic's sign-up row, else the
//   computer      first report; a tablet counts as a phone (it cannot install
//                 a desktop app either)
//
// The rules come from OFManager's sign-up funnel (2026-11-10), where they
// were first worked out against real sign-ups.

export const FUNNEL_RANGES = ['7d', '30d', '90d'] as const;
export type FunnelRange = (typeof FUNNEL_RANGES)[number];
export const FUNNEL_RANGE_LABELS: Record<FunnelRange, string> = { '7d': '7 days', '30d': '30 days', '90d': '90 days' };
export const FUNNEL_RANGE_DAYS: Record<FunnelRange, number> = { '7d': 7, '30d': 30, '90d': 90 };
export const DEFAULT_FUNNEL_RANGE: FunnelRange = '30d';

export function isFunnelRange(value: unknown): value is FunnelRange {
  return typeof value === 'string' && (FUNNEL_RANGES as readonly string[]).includes(value);
}

/** The first bar: the account being made. Every account has it, so no app lists it and no step may use its key. */
export const MADE_KEY = 'account_made';
export const MADE_LABEL = 'Made an account';
const MADE_STOPPED = 'Made an account, then nothing';

/** Accounts read for one answer; a longer stretch says it was cut. */
export const FUNNEL_ACCOUNTS_MAX = 2000;
/** People listed as stuck in one answer, newest first. */
export const FUNNEL_STUCK_MAX = 300;
const PROBLEMS_MAX = 8;
const SOURCES_MAX = 50;

export type FunnelDevice = 'phone' | 'computer' | 'unknown';

export type FunnelStep = Readonly<{ key: string; label: string; stopped?: string }>;

/** An account as the reducer takes it: the app's answer, with the time as ISO text. */
export type FunnelAccountFacts = Readonly<{
  id: string;
  createdAt: string;
  name: string | null;
  email: string | null;
  done: readonly string[];
  setAside: string | null;
  kind: string | null;
  device: 'phone' | 'computer' | null;
  source: string | null;
  contact: string | null;
}>;

/** One reported step, as the table keeps it. */
export type FunnelStepRow = Readonly<{
  userId: string;
  step: string;
  ok: boolean;
  reason: string | null;
  device: string | null;
  occurredAt: string;
}>;

/** What Traffic's sign-up row says about an account, when the app has Traffic. */
export type FunnelSignupFact = Readonly<{ userId: string; device: string | null; source: string | null }>;

export type FunnelBar = {
  key: string;
  label: string;
  /** Accounts that got this far or further. */
  count: number;
  /** How many reached the bar before and not this one. */
  dropped: number;
  phone: number;
  computer: number;
  unknown: number;
};

export type FunnelProblem = { step: string; label: string; reason: string | null; at: string };

export type FunnelPerson = {
  id: string;
  name: string | null;
  email: string | null;
  createdAt: string;
  kind: string | null;
  device: FunnelDevice;
  source: string | null;
  contact: string | null;
  /** The key of the furthest bar they reached. */
  reached: string;
  /** Where they stopped, in the app's words. */
  stopped: string;
  /** The last report of any kind. */
  lastSeenAt: string | null;
  problem: FunnelProblem | null;
};

export type FunnelCounts = {
  /** Every account made in the stretch. */
  accounts: number;
  /** Left out of the bars, by the app's reason. */
  setAside: { reason: string; count: number }[];
  /** Accounts in the bars: made, and not set aside. */
  counted: number;
  reachedGoal: number;
  goal: { key: string; label: string };
  bars: FunnelBar[];
  devices: { device: 'phone' | 'computer'; accounts: number; reachedGoal: number }[];
  sources: { source: string; accounts: number; reachedGoal: number }[];
  /** What went wrong, by how many people it happened to. */
  problems: { step: string; label: string; reason: string; people: number }[];
  /** Counted accounts that have not reached the goal, newest first. */
  stuck: FunnelPerson[];
  stuckTotal: number;
};

export type FunnelSummary = FunnelCounts & {
  range: FunnelRange;
  from: string;
  to: string;
  generatedAt: string;
  /** The first report ever kept, or null while there is none: before it, accounts are placed by the app's own data alone. */
  recordingSince: string | null;
  /** More accounts in the stretch than one answer reads: the newest were kept. */
  truncated: boolean;
};

/** A phone, a computer, or unknown. A tablet counts as a phone. */
export function funnelDevice(value: string | null | undefined): FunnelDevice {
  if (value === 'phone' || value === 'tablet' || value === 'mobile') return 'phone';
  if (value === 'computer' || value === 'desktop') return 'computer';
  return 'unknown';
}

/** A reason as a group to count: addresses, ids and numbers out, so "code 4012" and "code 4013" are one line. */
export function reasonGroup(reason: string): string {
  return reason
    .replace(/[\w.+-]+@[\w.-]+/g, 'an email')
    .replace(/\b[0-9a-zA-Z_-]{20,}\b/g, '…')
    .replace(/\d+/g, 'N')
    .slice(0, 160);
}

export function buildFunnel(input: {
  steps: readonly FunnelStep[];
  accounts: readonly FunnelAccountFacts[];
  rows: readonly FunnelStepRow[];
  signups?: readonly FunnelSignupFact[];
}): FunnelCounts {
  const bars: { key: string; label: string; stopped: string }[] = [
    { key: MADE_KEY, label: MADE_LABEL, stopped: MADE_STOPPED },
    ...input.steps.map((step) => ({ key: step.key, label: step.label, stopped: step.stopped ?? `${step.label}, then nothing` })),
  ];
  const index = new Map(bars.map((bar, i) => [bar.key, i]));
  const goalIndex = bars.length - 1;
  const goal = bars[goalIndex]!;

  const rowsOf = new Map<string, FunnelStepRow[]>();
  for (const row of input.rows) {
    const list = rowsOf.get(row.userId);
    if (list) list.push(row);
    else rowsOf.set(row.userId, [row]);
  }
  const signupOf = new Map((input.signups ?? []).map((fact) => [fact.userId, fact]));

  const aside = new Map<string, number>();
  const people: (FunnelPerson & { at: number })[] = [];
  const problems = new Map<string, { step: string; label: string; reason: string; people: Set<string> }>();

  for (const account of input.accounts) {
    const reasonAside = account.setAside?.trim();
    if (reasonAside) {
      aside.set(reasonAside, (aside.get(reasonAside) ?? 0) + 1);
      continue;
    }
    const mine = [...(rowsOf.get(account.id) ?? [])].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
    let at = 0;
    for (const key of account.done) at = Math.max(at, index.get(key) ?? 0);
    for (const row of mine) if (row.ok) at = Math.max(at, index.get(row.step) ?? 0);

    const wrong = mine.filter((row) => !row.ok && index.has(row.step));
    for (const row of wrong) {
      const said = row.reason ?? 'No reason given';
      const key = `${row.step}\n${reasonGroup(said)}`;
      const entry = problems.get(key) ?? { step: row.step, label: bars[index.get(row.step)!]!.label, reason: said, people: new Set<string>() };
      entry.people.add(account.id);
      problems.set(key, entry);
    }
    const last = wrong.at(-1);
    const signup = signupOf.get(account.id);
    const device: FunnelDevice =
      account.device ?? (funnelDevice(signup?.device) !== 'unknown' ? funnelDevice(signup?.device) : funnelDevice(mine.find((row) => row.device)?.device));
    const bar = bars[at]!;

    people.push({
      id: account.id,
      name: account.name,
      email: account.email,
      createdAt: account.createdAt,
      kind: account.kind,
      device,
      source: account.source?.trim() || signup?.source?.trim() || null,
      contact: account.contact,
      reached: bar.key,
      stopped: bar.stopped,
      lastSeenAt: mine.at(-1)?.occurredAt ?? null,
      problem: last ? { step: last.step, label: bars[index.get(last.step)!]!.label, reason: last.reason, at: last.occurredAt } : null,
      at,
    });
  }

  const outBars: FunnelBar[] = bars.map((bar, i) => {
    const reached = people.filter((p) => p.at >= i);
    const before = i === 0 ? reached.length : people.filter((p) => p.at >= i - 1).length;
    const of = (device: FunnelDevice) => reached.filter((p) => p.device === device).length;
    return { key: bar.key, label: bar.label, count: reached.length, dropped: before - reached.length, phone: of('phone'), computer: of('computer'), unknown: of('unknown') };
  });

  const bySource = new Map<string, { source: string; accounts: number; reachedGoal: number }>();
  for (const p of people) {
    if (!p.source) continue;
    const row = bySource.get(p.source) ?? { source: p.source, accounts: 0, reachedGoal: 0 };
    row.accounts++;
    if (p.at >= goalIndex) row.reachedGoal++;
    bySource.set(p.source, row);
  }

  const stuck = people.filter((p) => p.at < goalIndex).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const strip = ({ at: _at, ...person }: FunnelPerson & { at: number }): FunnelPerson => person;

  return {
    accounts: input.accounts.length,
    setAside: [...aside].map(([reason, count]) => ({ reason, count })).sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason)),
    counted: people.length,
    reachedGoal: people.filter((p) => p.at >= goalIndex).length,
    goal: { key: goal.key, label: goal.label },
    bars: outBars,
    devices: (['phone', 'computer'] as const).map((device) => {
      const group = people.filter((p) => p.device === device);
      return { device, accounts: group.length, reachedGoal: group.filter((p) => p.at >= goalIndex).length };
    }),
    sources: [...bySource.values()].sort((a, b) => b.accounts - a.accounts || b.reachedGoal - a.reachedGoal || a.source.localeCompare(b.source)).slice(0, SOURCES_MAX),
    problems: [...problems.values()]
      .map((entry) => ({ step: entry.step, label: entry.label, reason: entry.reason, people: entry.people.size }))
      .sort((a, b) => b.people - a.people || a.reason.localeCompare(b.reason))
      .slice(0, PROBLEMS_MAX),
    stuck: stuck.slice(0, FUNNEL_STUCK_MAX).map(strip),
    stuckTotal: stuck.length,
  };
}
