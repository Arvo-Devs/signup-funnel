// Made-up accounts for the page's test: the fake app's steps, a few people at
// each stop, and the awkward cases the page has to draw (no name, no email, a
// name that is HTML, a reason with a number in it). Run through the real
// rules, so the page is tested on an answer the routes could give.
import { buildFunnel, type FunnelAccountFacts, type FunnelStepRow, type FunnelSummary } from '../src/shared/funnel';
import { STEPS } from './fake-app';

const DAY = 24 * 60 * 60 * 1000;

export function sampleSummary(overrides: Partial<FunnelSummary> = {}, now: number = Date.now()): FunnelSummary {
  const at = (daysAgo: number, minutes = 0) => new Date(now - daysAgo * DAY + minutes * 60_000).toISOString();
  const account = (id: string, daysAgo: number, extra: Partial<FunnelAccountFacts> = {}): FunnelAccountFacts => ({
    id,
    createdAt: at(daysAgo),
    name: `Sample ${id}`,
    email: `${id}@example.test`,
    done: [],
    setAside: null,
    kind: null,
    device: null,
    source: null,
    contact: null,
    ...extra,
  });
  const row = (userId: string, step: string, daysAgo: number, extra: Partial<FunnelStepRow> = {}): FunnelStepRow => ({
    userId,
    step,
    ok: true,
    reason: null,
    device: null,
    occurredAt: at(daysAgo, 5),
    ...extra,
  });

  const accounts: FunnelAccountFacts[] = [
    account('s1', 1, { setAside: 'Invited staff' }),
    account('s2', 2, { setAside: 'Invited staff' }),
    account('t1', 3, { setAside: 'Test account' }),
    // Got to the goal: by the app's own data, by a report, and on a phone.
    account('a1', 2, { device: 'computer', source: 'Google', done: ['account_linked'] }),
    account('a2', 4, { device: 'computer', done: ['key_made'] }),
    account('a8', 6, { device: 'phone', source: 'Telegram', done: ['account_linked'] }),
    // Stuck, each a different way.
    account('a3', 1, { device: 'phone', source: 'Telegram' }),
    account('a4', 3, { device: 'phone' }),
    account('a5', 5, { name: 'Dana <script>alert(1)</script>', device: 'computer', source: 'Google', kind: 'Agency', done: ['key_made'] }),
    account('a6', 7, { name: null, email: 'only-email@example.test', done: ['email_confirmed'] }),
    account('a7', 8, { name: null, email: null }),
    account('a9', 9, { device: 'computer' }),
    account('a10', 10, { device: 'computer', contact: '@sample_handle', done: ['welcome_seen'] }),
  ];
  const rows: FunnelStepRow[] = [
    row('a2', 'account_linked', 4),
    row('a3', 'welcome_seen', 1),
    row('a3', 'account_linked', 1, { ok: false, reason: 'The link window did not open (code 4012)', occurredAt: at(1, 9) }),
    row('a4', 'account_linked', 3, { ok: false, reason: 'The link window did not open (code 4013)' }),
    row('a9', 'email_confirmed', 9, { ok: false, reason: 'That code has expired' }),
  ];

  return {
    ...buildFunnel({ steps: STEPS, accounts, rows }),
    range: '30d',
    from: at(30),
    to: at(0),
    generatedAt: at(0),
    recordingSince: at(60),
    truncated: false,
    ...overrides,
  };
}
