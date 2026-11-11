/**
 * The funnel's rules, from rows (src/shared/funnel.ts), and the small checks
 * around them: who is set aside, how far an account got, what went wrong,
 * phone or computer, where they came from, and what an app's list of steps
 * must look like.
 */
import { describe, expect, test } from 'bun:test';
import { normalizeConfig, stepsProblem } from '../src/config';
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
    });
    expect(accountFacts({ id: '', createdAt: new Date() }, keys)).toBeNull();
    expect(accountFacts({ id: 'a2', createdAt: 'not a time' }, keys)).toBeNull();
    expect(accountFacts({ id: 'a3', createdAt: new Date('2026-11-05T10:00:00Z'), device: 'tablet' as never }, keys)?.device).toBeNull();
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
    expect(config.steps).toEqual([]);
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
