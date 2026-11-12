/**
 * The funnel's rules, from rows (src/shared/funnel.ts), and the small checks
 * around them: who is set aside, how far an account got, what went wrong,
 * phone or computer, where they came from, and what an app's list of steps
 * must look like.
 */
import { describe, expect, test } from 'bun:test';
import { funnelsProblem, normalizeConfig, stepsProblem, type FunnelDef } from '../src/config';
import { deviceOf } from '../src/index';
import { cleanReason, onceKeyFor } from '../src/server/steps';
import { accountFacts } from '../src/server/summary';
import { buildFunnel, funnelDevice, isFunnelRange, MADE_KEY, reasonGroup, type FunnelAccountFacts, type FunnelStepRow } from '../src/shared/funnel';
import { fakeConfig, STEPS } from './fake-app';

const facts = (id: string, extra: Partial<FunnelAccountFacts> = {}): FunnelAccountFacts => ({
  id,
  createdAt: '2026-11-05T10:00:00.000Z',
  name: `Sample ${id}`,
  email: `${id}@example.test`,
  done: [],
  setAside: null,
  kind: null,
  device: null,
  source: null,
  contact: null,
  problems: [],
  lastSeenAt: null,
  ...extra,
});
const row = (userId: string, step: string, minute: number, extra: Partial<FunnelStepRow> = {}): FunnelStepRow => ({
  userId,
  step,
  ok: true,
  reason: null,
  device: 'computer',
  occurredAt: `2026-11-05T10:${String(minute).padStart(2, '0')}:00.000Z`,
  ...extra,
});

describe('buildFunnel', () => {
  const out = buildFunnel({
    steps: STEPS,
    accounts: [
      facts('staff', { setAside: 'Invited staff' }),
      facts('test', { setAside: 'Test account' }),
      facts('staff2', { setAside: 'Invited staff' }),
      facts('nothing', { createdAt: '2026-11-01T10:00:00.000Z' }),
      facts('refused', { createdAt: '2026-11-02T10:00:00.000Z' }),
      facts('confirmed', { done: ['email_confirmed'], createdAt: '2026-11-03T10:00:00.000Z' }),
      facts('welcomed', { done: ['email_confirmed'], createdAt: '2026-11-04T10:00:00.000Z', contact: '@welcomed' }),
      facts('keyed', { done: ['email_confirmed', 'key_made'], kind: 'Agency', device: 'computer' }),
      facts('skipped', { done: ['key_made'] }),
      facts('linked', { done: ['account_linked'], source: 'reddit.com' }),
      facts('linked2', { done: ['email_confirmed'] }),
    ],
    rows: [
      row('refused', 'email_confirmed', 1, { ok: false, reason: 'The code was not right', device: 'phone' }),
      row('refused', 'email_confirmed', 5, { ok: false, reason: 'The code expired', device: 'phone' }),
      row('welcomed', 'welcome_seen', 2, { device: 'tablet' }),
      row('keyed', 'account_linked', 9, { ok: false, reason: 'Link session 4012 timed out', device: 'phone' }),
      row('skipped', 'account_linked', 9, { ok: false, reason: 'Link session 4013 timed out' }),
      row('linked2', 'welcome_seen', 2),
      row('linked2', 'account_linked', 20),
      // A step this app no longer has: read, and never counted or shown.
      row('nothing', 'old_step', 3),
      row('nothing', 'older_step', 4, { ok: false, reason: 'gone' }),
    ],
    signups: [
      { userId: 'nothing', device: 'phone', source: 'Google Ads' },
      { userId: 'linked2', device: 'computer', source: 'Google Ads' },
      { userId: 'linked', device: null, source: 'Direct' },
    ],
  });
  const person = (id: string) => out.stuck.find((p) => p.id === id);

  test('set-aside accounts are counted apart and are in no bar', () => {
    expect(out.accounts).toBe(11);
    expect(out.setAside).toEqual([
      { reason: 'Invited staff', count: 2 },
      { reason: 'Test account', count: 1 },
    ]);
    expect(out.counted).toBe(8);
    expect(out.bars[0]).toMatchObject({ key: MADE_KEY, label: 'Made an account', count: 8, dropped: 0 });
    expect(person('staff')).toBeUndefined();
  });

  test('the bars are the app’s steps in order, after the account being made, and only fall', () => {
    expect(out.bars.map((b) => [b.key, b.count, b.dropped])).toEqual([
      ['account_made', 8, 0],
      ['email_confirmed', 6, 2],
      ['welcome_seen', 5, 1],
      ['key_made', 4, 1],
      ['account_linked', 2, 2],
    ]);
    expect(out.goal).toEqual({ key: 'account_linked', label: 'Linked an account' });
    expect(out.reachedGoal).toBe(2);
  });

  test('how far: the app’s own data or a report that went through, and a later step proves the earlier ones', () => {
    expect(person('nothing')).toMatchObject({ reached: MADE_KEY, stopped: 'Made an account, then nothing' });
    expect(person('confirmed')).toMatchObject({ reached: 'email_confirmed', stopped: 'Confirmed the email, then nothing' });
    expect(person('welcomed')).toMatchObject({ reached: 'welcome_seen', contact: '@welcomed' });
    // Made a key with no email step on record: still past the email step.
    expect(person('skipped')).toMatchObject({ reached: 'key_made', stopped: 'Made a key, never used it' });
    // At the goal: not stuck.
    expect(person('linked')).toBeUndefined();
    expect(person('linked2')).toBeUndefined();
    expect(out.stuckTotal).toBe(6);
  });

  test('a report that did not go through moves nobody forward, and is the last thing that went wrong', () => {
    expect(person('refused')).toMatchObject({
      reached: MADE_KEY,
      problem: { step: 'email_confirmed', label: 'Confirmed the email', reason: 'The code expired', at: '2026-11-05T10:05:00.000Z' },
      lastSeenAt: '2026-11-05T10:05:00.000Z',
    });
    expect(person('keyed')?.problem).toMatchObject({ step: 'account_linked', reason: 'Link session 4012 timed out' });
    expect(person('confirmed')).toMatchObject({ problem: null, lastSeenAt: null });
  });

  test('what went wrong is counted by people, with numbers and ids grouped', () => {
    expect(out.problems).toEqual([
      { step: 'account_linked', label: 'Linked an account', reason: 'Link session 4012 timed out', people: 2 },
      { step: 'email_confirmed', label: 'Confirmed the email', reason: 'The code expired', people: 1 },
      { step: 'email_confirmed', label: 'Confirmed the email', reason: 'The code was not right', people: 1 },
    ]);
  });

  test('phone or computer: what the app gave, else Traffic’s sign-up row, else the first report; a tablet is a phone', () => {
    expect(person('keyed')?.device).toBe('computer'); // the app said so, whatever the report came from
    expect(person('nothing')?.device).toBe('phone'); // Traffic's sign-up row
    expect(person('welcomed')?.device).toBe('phone'); // a tablet's report
    expect(person('refused')?.device).toBe('phone'); // the first report
    expect(person('confirmed')?.device).toBe('unknown');
    expect(out.devices).toEqual([
      { device: 'phone', accounts: 3, reachedGoal: 0 },
      { device: 'computer', accounts: 3, reachedGoal: 1 },
    ]);
    expect(out.bars[0]).toMatchObject({ phone: 3, computer: 3, unknown: 2 });
  });

  test('by where they came from: the app’s word first, else Traffic’s', () => {
    expect(out.sources).toEqual([
      { source: 'Google Ads', accounts: 2, reachedGoal: 1 },
      { source: 'reddit.com', accounts: 1, reachedGoal: 1 },
    ]);
    expect(person('nothing')?.source).toBe('Google Ads');
  });

  test('the stuck list is newest first', () => {
    expect(out.stuck.map((p) => p.id)).toEqual(['keyed', 'skipped', 'welcomed', 'confirmed', 'refused', 'nothing']);
  });

  test('a step the app no longer lists is not counted and not shown', () => {
    expect(person('nothing')).toMatchObject({ reached: MADE_KEY, problem: null });
    expect(out.problems.some((p) => p.step === 'older_step')).toBe(false);
  });

  test('nobody at all is an empty funnel, not an error', () => {
    const empty = buildFunnel({ steps: STEPS, accounts: [], rows: [] });
    expect(empty).toMatchObject({ accounts: 0, counted: 0, reachedGoal: 0, stuckTotal: 0, stuck: [], problems: [], sources: [] });
    expect(empty.bars.map((b) => b.count)).toEqual([0, 0, 0, 0, 0]);
  });
});

describe('the small rules', () => {
  test('a device is a phone, a computer or unknown', () => {
    expect(['phone', 'tablet', 'mobile'].map(funnelDevice)).toEqual(['phone', 'phone', 'phone']);
    expect(['computer', 'desktop'].map(funnelDevice)).toEqual(['computer', 'computer']);
    expect([null, undefined, '', 'tv'].map(funnelDevice)).toEqual(['unknown', 'unknown', 'unknown', 'unknown']);
  });

  test('reasons group without their addresses, ids and numbers', () => {
    expect(reasonGroup('Too many links in progress (4); try again in a minute.')).toBe('Too many links in progress (N); try again in a minute.');
    expect(reasonGroup('No login for who@example.com in session abcdefghijklmnopqrstuvwxyz')).toBe('No login for an email in session …');
  });

  test('a reason is one clean line, cut to length', () => {
    expect(cleanReason(undefined)).toBeNull();
    expect(cleanReason('   ')).toBeNull();
    expect(cleanReason(' a\u0000b\n c ')).toBe('a b c');
    expect(cleanReason('x'.repeat(400))).toHaveLength(300);
  });

  test('ranges', () => {
    expect(['7d', '30d', '90d'].every(isFunnelRange)).toBe(true);
    expect(['today', '365d', '', null, 30].some(isFunnelRange)).toBe(false);
  });

  test('what keeps a repeat out', () => {
    const at = (time: string) => new Date(time);
    // Went through: once per account, ever.
    expect(onceKeyFor({ userId: 'u1', step: 'key_made' }, at('2026-11-05T10:00:00Z'))).toBe('u1:key_made');
    expect(onceKeyFor({ userId: 'u1', step: 'key_made' }, at('2027-01-01T00:00:00Z'))).toBe('u1:key_made');
    // Went wrong: once per ten minutes.
    const failed = (time: string) => onceKeyFor({ userId: 'u1', step: 'key_made', ok: false }, at(time));
    expect(failed('2026-11-05T10:00:00Z')).toBe(failed('2026-11-05T10:09:59Z'));
    expect(failed('2026-11-05T10:00:00Z')).not.toBe(failed('2026-11-05T10:10:00Z'));
    // The caller's own key.
    expect(onceKeyFor({ userId: 'u1', step: 'account_linked', ok: false, onceKey: 'session-9' }, at('2026-11-05T10:00:00Z'))).toBe('u1:account_linked:session-9');
  });

  test('an account from the app: only steps it lists, a real time, short text', () => {
    const keys = new Set(STEPS.map((s) => s.key));
    expect(accountFacts({ id: 'a1', createdAt: '2026-11-05T10:00:00Z', done: ['key_made', 'nope'], device: 'phone', name: '  Sam  ', setAside: ' ' }, keys)).toEqual({
      id: 'a1',
      createdAt: '2026-11-05T10:00:00.000Z',
      name: 'Sam',
      email: null,
      done: ['key_made'],
      setAside: null,
      kind: null,
      device: 'phone',
      source: null,
      contact: null,
      problems: [],
      lastSeenAt: null,
    });
    expect(accountFacts({ id: '', createdAt: new Date() }, keys)).toBeNull();
    expect(accountFacts({ id: 'a2', createdAt: 'not a time' }, keys)).toBeNull();
    expect(accountFacts({ id: 'a3', createdAt: new Date('2026-11-05T10:00:00Z'), device: 'tablet' as never }, keys)?.device).toBeNull();
  });
});

describe('what the app’s own data shows', () => {
  const keys = new Set(STEPS.map((s) => s.key));
  const at = (minute: number) => `2026-11-05T10:${String(minute).padStart(2, '0')}:00.000Z`;

  test('its failures are counted with the reported ones, by people, and move nobody forward', () => {
    const out = buildFunnel({
      steps: STEPS,
      accounts: [
        facts('one', { done: ['email_confirmed', 'key_made'], problems: [{ step: 'account_linked', reason: 'The creator’s sign-in failed', at: at(30) }] }),
        facts('two', { done: ['key_made'], problems: [{ step: 'account_linked', reason: 'The creator’s sign-in failed', at: at(31) }] }),
        facts('three', { done: ['email_confirmed'] }),
      ],
      rows: [row('three', 'account_linked', 32, { ok: false, reason: 'The creator’s sign-in failed' })],
    });
    expect(out.problems).toEqual([{ step: 'account_linked', label: 'Linked an account', reason: 'The creator’s sign-in failed', people: 3 }]);
    expect(out.reachedGoal).toBe(0);
    expect(out.stuck.find((p) => p.id === 'one')).toMatchObject({ reached: 'key_made', problem: { step: 'account_linked', reason: 'The creator’s sign-in failed', at: at(30) } });
  });

  test('the last thing that went wrong is the newest, reported or not', () => {
    const out = buildFunnel({
      steps: STEPS,
      accounts: [
        facts('own-newer', { problems: [{ step: 'account_linked', reason: 'The link expired', at: at(40) }] }),
        facts('report-newer', { problems: [{ step: 'account_linked', reason: 'The link expired', at: at(10) }] }),
      ],
      rows: [
        row('own-newer', 'email_confirmed', 20, { ok: false, reason: 'The code expired' }),
        row('report-newer', 'email_confirmed', 20, { ok: false, reason: 'The code expired' }),
      ],
    });
    const person = (id: string) => out.stuck.find((p) => p.id === id);
    expect(person('own-newer')?.problem).toMatchObject({ reason: 'The link expired', at: at(40) });
    expect(person('report-newer')?.problem).toMatchObject({ reason: 'The code expired', at: at(20) });
  });

  test('last seen is the later of the app’s own time and the last report', () => {
    const out = buildFunnel({
      steps: STEPS,
      accounts: [
        facts('own-later', { lastSeenAt: at(50) }),
        facts('report-later', { lastSeenAt: at(1) }),
        facts('own-only', { lastSeenAt: at(7) }),
        facts('neither'),
      ],
      rows: [row('own-later', 'email_confirmed', 10), row('report-later', 'email_confirmed', 10)],
    });
    const seen = Object.fromEntries(out.stuck.map((p) => [p.id, p.lastSeenAt]));
    expect(seen).toEqual({ 'own-later': at(50), 'report-later': at(10), 'own-only': at(7), neither: null });
  });

  test('an account’s failures from the app: only its steps, a real time, one clean line, the newest 20, oldest first', () => {
    const many = Array.from({ length: 25 }, (_, i) => ({ step: 'account_linked', reason: `Try ${i + 1}`, at: new Date(Date.UTC(2026, 10, 5, 10, i)) }));
    const read = accountFacts(
      {
        id: 'a1',
        createdAt: '2026-11-05T09:00:00Z',
        lastSeenAt: new Date('2026-11-06T08:00:00Z'),
        problems: [
          { step: 'nope', reason: 'Not a step', at: at(1) },
          { step: 'key_made', reason: 'No time', at: 'never' },
          { step: 'key_made', reason: '   ', at: at(2) },
          { step: 'key_made', reason: ' Two\nlines ', at: at(3) },
          ...many,
        ],
      },
      keys,
    );
    expect(read?.lastSeenAt).toBe('2026-11-06T08:00:00.000Z');
    expect(read?.problems).toHaveLength(20);
    expect(read?.problems[0]).toEqual({ step: 'account_linked', reason: 'Try 6', at: '2026-11-05T10:05:00.000Z' });
    expect(read?.problems.at(-1)).toEqual({ step: 'account_linked', reason: 'Try 25', at: '2026-11-05T10:24:00.000Z' });
    const few = accountFacts({ id: 'a2', createdAt: at(0), problems: [{ step: 'key_made', reason: ' Two\nlines ', at: at(3) }, { step: 'key_made', reason: 'x', at: at(2) }] }, keys);
    expect(few?.problems).toEqual([
      { step: 'key_made', reason: 'x', at: at(2) },
      { step: 'key_made', reason: 'Two lines', at: at(3) },
    ]);
    expect(accountFacts({ id: 'a3', createdAt: at(0), problems: 'nope' as never, lastSeenAt: 'never' }, keys)).toMatchObject({ problems: [], lastSeenAt: null });
  });
});

describe('the app’s list of steps', () => {
  test('a good list', () => {
    expect(stepsProblem(STEPS)).toBeNull();
  });

  test('what is wrong with a bad one, in words', () => {
    expect(stepsProblem([])).toContain('at least one step');
    expect(stepsProblem([{ key: 'Email Confirmed', label: 'x' }])).toContain('lower case');
    expect(stepsProblem([{ key: 'a', label: 'A' }, { key: 'a', label: 'B' }])).toContain('share the key a');
    expect(stepsProblem([{ key: 'a', label: '  ' }])).toContain('needs a label');
    expect(stepsProblem([{ key: MADE_KEY, label: 'Made' }])).toContain('first bar');
  });

  test('a bad list is never thrown: it is logged once, kept as the problem, and read as no steps', () => {
    const logs: string[] = [];
    const config = normalizeConfig(fakeConfig({ steps: [{ key: 'a', label: 'A' }, { key: 'a', label: 'B' }], log: (line) => logs.push(line) }));
    expect(config.problem).toBe('Two steps share the key a.');
    expect(config.funnels).toEqual([]);
    expect(logs).toEqual(['[Sign-up funnel] The list of steps cannot be used, so no step is kept until it is fixed. Two steps share the key a.']);
    // A list that is not a list at all, as untyped code could pass.
    expect(normalizeConfig(fakeConfig({ steps: undefined as never, log: () => undefined })).problem).toContain('at least one step');
    expect(normalizeConfig(fakeConfig()).problem).toBeNull();
  });

  test('defaults: the base path, lower-case hosts, no Traffic', () => {
    const config = normalizeConfig(fakeConfig({ siteHosts: [' Example.COM ', ''], basePath: '/api/funnel/' }));
    expect(config.siteHosts).toEqual(['example.com']);
    expect(config.basePath).toBe('/api/funnel');
    expect(config.traffic).toBe(false);
    expect(normalizeConfig(fakeConfig()).basePath).toBe('/api/signup-funnel');
  });
});

describe('side steps', () => {
  const SIDES = [
    { key: 'liked', label: 'Liked a post' },
    { key: 'alerts_on', label: 'Turned on alerts' },
  ];
  const out = buildFunnel({
    steps: STEPS,
    sideSteps: SIDES,
    accounts: [
      facts('goal_and_liked', { done: ['account_linked', 'liked'] }),
      facts('liked_only', { done: ['liked'] }),
      facts('liked_by_report'),
      facts('confirmed', { done: ['email_confirmed'] }),
      facts('aside', { done: ['liked'], setAside: 'Test account' }),
    ],
    rows: [
      row('liked_by_report', 'liked', 1),
      row('confirmed', 'alerts_on', 2, { ok: false, reason: 'The alert email bounced' }),
    ],
  });

  test('counted for whoever did them, from the app’s data or a report, with how many of those got to the goal', () => {
    expect(out.sideSteps).toEqual([
      { key: 'liked', label: 'Liked a post', accounts: 3, reachedGoal: 1 },
      { key: 'alerts_on', label: 'Turned on alerts', accounts: 0, reachedGoal: 0 },
    ]);
  });

  test('they move nobody forward', () => {
    expect(out.bars.map((bar) => bar.count)).toEqual([4, 2, 1, 1, 1]);
    expect(out.stuck.find((p) => p.id === 'liked_only')?.reached).toBe(MADE_KEY);
    expect(out.stuck.find((p) => p.id === 'liked_by_report')?.reached).toBe(MADE_KEY);
  });

  test('one that went wrong is what went wrong, under its own label', () => {
    expect(out.problems).toEqual([{ step: 'alerts_on', label: 'Turned on alerts', reason: 'The alert email bounced', people: 1 }]);
    expect(out.stuck.find((p) => p.id === 'confirmed')?.problem).toMatchObject({ step: 'alerts_on', label: 'Turned on alerts' });
  });

  test('an app with none has an empty list, and a side step with a step’s key is that step', () => {
    expect(buildFunnel({ steps: STEPS, accounts: [facts('a')], rows: [] }).sideSteps).toEqual([]);
    const clash = buildFunnel({ steps: STEPS, sideSteps: [{ key: 'key_made', label: 'Made a key on the side' }], accounts: [facts('a', { done: ['key_made'] })], rows: [] });
    expect(clash.sideSteps).toEqual([]);
    expect(clash.bars.find((bar) => bar.key === 'key_made')?.count).toBe(1);
  });

  test('an account’s own data may name side steps, and anything else it names is dropped', () => {
    const keys = new Set(['email_confirmed', 'liked']);
    expect(accountFacts({ id: 'a', createdAt: '2026-11-05T10:00:00.000Z', done: ['liked', 'nope', 'email_confirmed'] }, keys)?.done).toEqual(['liked', 'email_confirmed']);
  });
});

describe('an app with several kinds of sign-up', () => {
  const hook = async () => [];
  const FANS: FunnelDef = { key: 'fans', label: 'Fans', description: '  Accounts made on the site  ', steps: [{ key: 'email_confirmed', label: ' Confirmed the email ' }, { key: 'voted', label: 'Voted' }], sideSteps: [{ key: 'liked', label: 'Liked a post' }], accounts: hook };
  const ADS: FunnelDef = { key: 'advertisers', label: 'Advertisers', steps: [{ key: 'email_confirmed', label: 'Confirmed the email' }, { key: 'topped_up', label: 'Topped up' }], accounts: hook };

  test('a good list, and two kinds may share a step', () => {
    expect(funnelsProblem([FANS, ADS])).toBeNull();
  });

  test('what is wrong with a bad one, in words, naming the kind', () => {
    expect(funnelsProblem([])).toContain('at least one kind');
    expect(funnelsProblem(Array.from({ length: 7 }, (_, i) => ({ ...ADS, key: `k${i}` })))).toContain('At most 6');
    expect(funnelsProblem([{ ...FANS, key: 'Fans' }])).toContain('lower case');
    expect(funnelsProblem([FANS, { ...ADS, key: 'fans' }])).toContain('share the key fans');
    expect(funnelsProblem([{ ...FANS, label: ' ' }])).toContain('needs a label');
    expect(funnelsProblem([{ ...FANS, accounts: undefined as never }])).toContain('needs an accounts hook');
    expect(funnelsProblem([FANS, { ...ADS, steps: [] }])).toBe('Advertisers: Give at least one step: the last one is the goal.');
    expect(funnelsProblem([{ ...FANS, sideSteps: [{ key: 'voted', label: 'Voted again' }] }])).toBe('Fans: voted is a step and a side step: it can only be one.');
    expect(funnelsProblem([{ ...FANS, sideSteps: [{ key: 'liked', label: 'A' }, { key: 'liked', label: 'B' }] }])).toContain('Two side steps share the key liked');
    expect(funnelsProblem([{ ...FANS, sideSteps: [{ key: MADE_KEY, label: 'Made' }] }])).toContain('cannot be a side step');
  });

  test('read once: each kind in its order, labels and descriptions trimmed, no description when it is blank', () => {
    const config = normalizeConfig(fakeConfig({ funnels: [FANS, ADS] }));
    expect(config.problem).toBeNull();
    expect(config.funnels.map((funnel) => [funnel.key, funnel.label, funnel.description])).toEqual([
      ['fans', 'Fans', 'Accounts made on the site'],
      ['advertisers', 'Advertisers', null],
    ]);
    expect(config.funnels[0]?.steps[0]?.label).toBe('Confirmed the email');
    expect(config.funnels[0]?.sideSteps.map((step) => step.key)).toEqual(['liked']);
    expect(config.funnels[1]?.sideSteps).toEqual([]);
  });

  test('an app with one kind is a list of one, under a key the page never shows', () => {
    const config = normalizeConfig(fakeConfig({ sideSteps: [{ key: 'liked', label: 'Liked a post' }] }));
    expect(config.funnels.map((funnel) => [funnel.key, funnel.label, funnel.steps.length, funnel.sideSteps.length])).toEqual([['signups', 'Sign-ups', STEPS.length, 1]]);
    expect(normalizeConfig(fakeConfig({ sideSteps: [{ key: 'key_made', label: 'Made a key' }], log: () => undefined })).problem).toContain('a step and a side step');
  });

  test('steps and funnels both, or a bad kind: never thrown, logged once, read as nothing to keep', () => {
    const logs: string[] = [];
    const both = normalizeConfig({ ...fakeConfig({ funnels: [FANS], log: (line) => logs.push(line) }), steps: STEPS } as never);
    expect(both.problem).toBe('Give either steps and accounts, or funnels: not both.');
    expect(both.funnels).toEqual([]);
    expect(logs).toHaveLength(1);
    expect(normalizeConfig(fakeConfig({ funnels: [{ ...FANS, key: '' }], log: () => undefined })).funnels).toEqual([]);
    expect(normalizeConfig(fakeConfig({ funnels: 'nope' as never, log: () => undefined })).problem).toContain('at least one kind');
  });
});

describe('steps people went on without', () => {
  // The fake app's welcome page is only known from reports; mark the rest as the app's own data, as an app that reads its tables would.
  const DATA_STEPS = STEPS.map((step) => (step.key === 'welcome_seen' ? step : { ...step, fromData: true }));
  const out = buildFunnel({
    steps: DATA_STEPS,
    accounts: [
      facts('in_order', { done: ['email_confirmed', 'key_made'] }),
      facts('no_email', { done: ['key_made'] }),
      facts('no_email_goal', { done: ['account_linked'] }),
      facts('reported_email', { done: ['key_made'] }),
    ],
    rows: [row('reported_email', 'email_confirmed', 1), row('in_order', 'welcome_seen', 2)],
  });

  test('they stay placed by their proof, and each bar counts who went on without it', () => {
    expect(out.bars.map((bar) => [bar.key, bar.count, bar.skipped])).toEqual([
      ['account_made', 4, 0],
      ['email_confirmed', 4, 2],
      // Only known from reports, so a later step proves it: never skipped.
      ['welcome_seen', 4, 0],
      ['key_made', 4, 1],
      ['account_linked', 1, 0],
    ]);
  });

  test('the stuck list names the steps each one went on without', () => {
    expect(Object.fromEntries(out.stuck.map((p) => [p.id, p.skipped]))).toEqual({
      in_order: [],
      no_email: ['Confirmed the email'],
      reported_email: [],
    });
    expect(out.reachedGoal).toBe(1);
  });

  test('an app that marks no step as its own data skips nothing', () => {
    const plain = buildFunnel({ steps: STEPS, accounts: [facts('a', { done: ['account_linked'] })], rows: [] });
    expect(plain.bars.every((bar) => bar.skipped === 0)).toBe(true);
  });
});

describe('deviceOf, for an app that gives the device itself', () => {
  test('phone or computer from a user agent; a tablet is a phone; nothing is null', () => {
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')).toBe('phone');
    expect(deviceOf('Mozilla/5.0 (iPad; CPU OS 17_6 like Mac OS X) AppleWebKit/605.1.15')).toBe('phone');
    expect(deviceOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/129.0.0.0 Safari/537.36')).toBe('computer');
    expect(deviceOf('')).toBeNull();
    expect(deviceOf(null)).toBeNull();
  });
});
