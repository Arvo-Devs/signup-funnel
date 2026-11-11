/**
 * The funnel against a real Postgres, through createSignupFunnel and a
 * pretend app (fake-app.ts): the table and what it refuses, what keeps a
 * repeat out, a step from a page and from the app's own code, and the page's
 * numbers read back, with and without @arvo/traffic's sign-up rows. Runs
 * only with FUNNEL_TEST_PG_URL (a Postgres the test may create databases
 * on): each run makes its own database from migrations/*.sql and drops it at
 * the end.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'bun:test';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import postgres from 'postgres';
import { createSignupFunnel, type SignupFunnel } from '../src/index';
import { insertStep } from '../src/server/steps';
import type { FunnelSummary } from '../src/shared/funnel';
import type { FunnelAccount } from '../src/config';
import { account, accountsHook, CHROME, cookieFor, fakeConfig, IPHONE, request } from './fake-app';

const ROOT_URL = process.env.FUNNEL_TEST_PG_URL ?? '';
const MIGRATIONS = join(import.meta.dir, '..', 'migrations');

async function migrate(sql: postgres.Sql) {
  const files = readdirSync(MIGRATIONS).filter((name) => name.endsWith('.sql')).sort();
  for (const file of files) await sql.unsafe(readFileSync(join(MIGRATIONS, file), 'utf8'));
}

describe.skipIf(!ROOT_URL)('sign-up funnel (pg)', () => {
  const database = `funnel_test_${process.pid}_${Date.now()}`;
  let admin: postgres.Sql;
  let sql: postgres.Sql;
  let funnel: SignupFunnel;
  let accounts: FunnelAccount[] = [];
  let lookupDown = false;
  let trafficOn = false;
  const logs: string[] = [];

  const make = () =>
    createSignupFunnel(
      fakeConfig({
        db: () => sql,
        accounts: async (range) => (lookupDown ? null : accountsHook(accounts)(range)),
        traffic: trafficOn,
        log: (line) => logs.push(line),
      }),
    );
  type Kept = { user_id: string; step: string; ok: boolean; reason: string | null; device: string | null; once_key: string };
  /** The table as plain rows, oldest first. */
  const steps = async (): Promise<Kept[]> => [
    ...(await sql<Kept[]>`select user_id, step, ok, reason, device, once_key from funnel_steps order by occurred_at, once_key`),
  ];
  const page = async (query = '') => {
    const response = await funnel.routeHandlers.GET(request(`/api/signup-funnel${query}`, { method: 'GET', cookie: cookieFor('admin') }));
    return { status: response.status, body: (await response.json()) as FunnelSummary };
  };
  const note = (who: string, body: unknown, agent = IPHONE) =>
    funnel.routeHandlers.POST(request('/api/signup-funnel/step', { cookie: cookieFor(who), body, agent }));

  beforeAll(async () => {
    admin = postgres(ROOT_URL, { max: 1, onnotice: () => {} });
    await admin.unsafe(`create database "${database}"`);
    const url = new URL(ROOT_URL);
    url.pathname = `/${database}`;
    sql = postgres(url.toString(), { max: 2, onnotice: () => {} });
    await migrate(sql);
  });

  afterAll(async () => {
    await sql?.end();
    await admin?.unsafe(`drop database if exists "${database}" with (force)`);
    await admin?.end();
  });

  beforeEach(async () => {
    await sql`truncate funnel_steps`;
    await sql`drop table if exists traffic_visits`;
    accounts = [];
    lookupDown = false;
    trafficOn = false;
    logs.length = 0;
    funnel = make();
  });

  test('the migration can run twice', async () => {
    await migrate(sql);
    expect(await steps()).toEqual([]);
  });

  test('the table refuses what the code never writes', async () => {
    // async, so each call is a started promise: a postgres.js query only runs once it is awaited.
    const insert = async (step: string, ok: boolean, reason: string | null, device: string | null) => {
      await sql`insert into funnel_steps (id, user_id, step, ok, reason, device, once_key) values (${crypto.randomUUID()}, 'u1', ${step}, ${ok}, ${reason}, ${device}, ${crypto.randomUUID()})`;
    };
    await expect(insert('Key Made', true, null, null)).rejects.toThrow('funnel_steps_step_check');
    await expect(insert('key_made', true, null, 'tv')).rejects.toThrow('funnel_steps_device_check');
    // A reason belongs to a step that went wrong.
    await expect(insert('key_made', true, 'why', null)).rejects.toThrow('funnel_steps_reason_check');
    await expect(insert('key_made', false, 'x'.repeat(301), null)).rejects.toThrow('funnel_steps_reason_check');
    await insert('key_made', false, 'It failed', 'phone');
    expect(await steps()).toHaveLength(1);
  });

  test('a step that went through is kept once per account, ever', async () => {
    expect(await funnel.recordStep({ userId: 'u1', step: 'key_made' })).toBe(true);
    expect(await funnel.recordStep({ userId: 'u1', step: 'key_made' })).toBe(false);
    expect(await funnel.recordStep({ userId: 'u2', step: 'key_made' })).toBe(true);
    expect((await steps()).map((r) => [r.user_id, r.step, r.ok, r.once_key])).toEqual([
      ['u1', 'key_made', true, 'u1:key_made'],
      ['u2', 'key_made', true, 'u2:key_made'],
    ]);
  });

  test('a step that went wrong is kept once per ten minutes, with one clean line of why', async () => {
    const at = (time: string) => new Date(time);
    const fail = (time: string, reason: string) => insertStep(sql, { userId: 'u1', step: 'account_linked', ok: false, reason }, at(time));
    expect(await fail('2026-11-05T10:00:00Z', ' Wrong\n password ')).toBe(true);
    expect(await fail('2026-11-05T10:09:00Z', 'Wrong password again')).toBe(false);
    expect(await fail('2026-11-05T10:10:00Z', '')).toBe(true);
    expect((await steps()).map((r) => [r.ok, r.reason])).toEqual([
      [false, 'Wrong password'],
      [false, 'No reason given'],
    ]);
  });

  test('the caller’s own key: one row per link session, say', async () => {
    const tried = (session: string) => funnel.recordStep({ userId: 'u1', step: 'account_linked', ok: false, reason: 'Timed out', onceKey: session });
    expect(await tried('session-1')).toBe(true);
    expect(await tried('session-1')).toBe(false);
    expect(await tried('session-2')).toBe(true);
    expect(await steps()).toHaveLength(2);
  });

  test('a deleted account: its steps go, and nobody else’s', async () => {
    await funnel.recordStep({ userId: 'u1', step: 'email_confirmed' });
    await funnel.recordStep({ userId: 'u1', step: 'account_linked', ok: false, reason: 'Timed out' });
    await funnel.recordStep({ userId: 'u2', step: 'email_confirmed' });
    expect(await funnel.forgetAccount('u1')).toBe(2);
    expect(await funnel.forgetAccount('u1')).toBe(0);
    expect(await funnel.forgetAccount('')).toBe(0);
    expect((await steps()).map((r) => r.user_id)).toEqual(['u2']);
    // A step that went through can be kept again for a new account that is given the same id.
    expect(await funnel.recordStep({ userId: 'u1', step: 'email_confirmed' })).toBe(true);
  });

  test('from the app’s own code: the person’s request says phone or computer, and nothing else is kept from it', async () => {
    await funnel.recordStep({ userId: 'u1', step: 'email_confirmed', request: request('/verify', { agent: IPHONE }) });
    await funnel.recordStep({ userId: 'u2', step: 'email_confirmed', request: request('/verify', { agent: CHROME }) });
    await funnel.recordStep({ userId: 'u3', step: 'email_confirmed' });
    expect((await steps()).map((r) => [r.user_id, r.device])).toEqual([
      ['u1', 'phone'],
      ['u2', 'computer'],
      ['u3', null],
    ]);
    const columns = await sql<{ column_name: string }[]>`select column_name from information_schema.columns where table_name = 'funnel_steps' order by 1`;
    expect(columns.map((c) => c.column_name)).toEqual(['device', 'id', 'occurred_at', 'ok', 'once_key', 'reason', 'step', 'user_id']);
  });

  test('from a page: the signed-in person’s own step, kept once', async () => {
    expect((await note('owner', { step: 'welcome_seen' })).status).toBe(204);
    expect((await note('owner', { step: 'welcome_seen' })).status).toBe(204);
    expect((await note('other', { step: 'welcome_seen' }, CHROME)).status).toBe(204);
    // By account, not by order: two rows written in the same millisecond have no order to rely on.
    const kept = await steps();
    expect(kept).toHaveLength(2);
    expect(Object.fromEntries(kept.map((r) => [r.user_id, [r.step, r.device]]))).toEqual({
      usr_owner: ['welcome_seen', 'phone'],
      usr_other: ['welcome_seen', 'computer'],
    });
  });

  test('from a page: a step that went wrong keeps what the person was told', async () => {
    expect((await note('owner', { step: 'welcome_seen', ok: false, reason: 'The page did not load' })).status).toBe(204);
    expect((await steps())[0]).toMatchObject({ ok: false, reason: 'The page did not load' });
  });

  test('from a page: a view-as session and a step for the server only write nothing', async () => {
    expect((await note('viewedas', { step: 'welcome_seen' })).status).toBe(204);
    expect((await note('owner', { step: 'key_made' })).status).toBe(400);
    expect(await steps()).toEqual([]);
  });

  test('the page: how far each account got, from the app’s own data and the steps kept', async () => {
    accounts = [
      account('staff', 2, { setAside: 'Invited staff' }),
      account('fresh', 1),
      account('confirmed', 3, { done: ['email_confirmed'], kind: 'Agency', contact: '@confirmed' }),
      account('welcomed', 4),
      account('linked', 5, { done: ['email_confirmed', 'key_made', 'account_linked'], device: 'computer' }),
      account('old', 45, { done: ['account_linked'] }),
    ];
    await funnel.recordStep({ userId: 'welcomed', step: 'welcome_seen', request: request('/welcome', { agent: IPHONE }) });
    await funnel.recordStep({ userId: 'welcomed', step: 'account_linked', ok: false, reason: 'Wrong email or password', request: request('/link', { agent: IPHONE }) });
    // A step kept for someone the app set aside is never read into a bar.
    await funnel.recordStep({ userId: 'staff', step: 'key_made' });

    const { status, body } = await page();
    expect(status).toBe(200);
    expect(body.range).toBe('30d');
    expect(body).toMatchObject({ accounts: 5, counted: 4, reachedGoal: 1, stuckTotal: 3, truncated: false });
    expect(body.setAside).toEqual([{ reason: 'Invited staff', count: 1 }]);
    expect(body.bars.map((b) => [b.key, b.count, b.dropped])).toEqual([
      ['account_made', 4, 0],
      ['email_confirmed', 3, 1],
      ['welcome_seen', 2, 1],
      ['key_made', 1, 1],
      ['account_linked', 1, 0],
    ]);
    expect(body.stuck.map((p) => [p.id, p.reached, p.device])).toEqual([
      ['fresh', 'account_made', 'unknown'],
      ['confirmed', 'email_confirmed', 'unknown'],
      ['welcomed', 'welcome_seen', 'phone'],
    ]);
    expect(body.stuck[1]).toMatchObject({ name: 'Sample confirmed', email: 'confirmed@example.test', kind: 'Agency', contact: '@confirmed', stopped: 'Confirmed the email, then nothing' });
    expect(body.stuck[2]?.problem).toMatchObject({ step: 'account_linked', label: 'Linked an account', reason: 'Wrong email or password' });
    expect(body.problems).toEqual([{ step: 'account_linked', label: 'Linked an account', reason: 'Wrong email or password', people: 1 }]);
    expect(body.devices).toEqual([
      { device: 'phone', accounts: 1, reachedGoal: 0 },
      { device: 'computer', accounts: 1, reachedGoal: 1 },
    ]);
    expect(typeof body.recordingSince).toBe('string');
    expect(Date.parse(body.to) - Date.parse(body.from)).toBe(30 * 24 * 60 * 60 * 1000);
  });

  test('the page: a longer stretch reaches older accounts, and an unknown one is refused', async () => {
    accounts = [account('new', 1), account('old', 45, { done: ['account_linked'] })];
    expect((await page('?range=7d')).body.accounts).toBe(1);
    expect((await page('?range=90d')).body).toMatchObject({ accounts: 2, reachedGoal: 1 });
    expect((await page('?range=365d')).status).toBe(400);
  });

  test('the page: with nothing kept yet it says so, and accounts are placed by the app’s data alone', async () => {
    accounts = [account('linked', 2, { done: ['account_linked'] })];
    const { body } = await page();
    expect(body.recordingSince).toBeNull();
    expect(body.reachedGoal).toBe(1);
  });

  test('the page: when the app cannot look its accounts up, it says so', async () => {
    lookupDown = true;
    const { status, body } = await page();
    expect(status).toBe(503);
    expect((body as unknown as { error: { message: string } }).error.message).toContain('could not be looked up');
  });

  test('with Traffic in the same database: phone or computer and came from are read from its sign-up rows', async () => {
    // The columns the funnel reads, as @arvo/traffic's migration makes them.
    await sql`create table traffic_visits (id uuid primary key, kind text not null, user_id text, device text, source text)`;
    await sql`insert into traffic_visits (id, kind, user_id, device, source) values
      (${crypto.randomUUID()}, 'signup', 'ads', 'phone', 'Google Ads'),
      (${crypto.randomUUID()}, 'signup', 'friend', 'computer', 'Direct'),
      (${crypto.randomUUID()}, 'view', 'ads', 'computer', 'Somewhere else')`;
    accounts = [account('ads', 1), account('friend', 2, { done: ['account_linked'], source: 'A friend' }), account('none', 3)];
    trafficOn = true;
    funnel = make();
    const { body } = await page();
    expect(body.stuck.map((p) => [p.id, p.device, p.source])).toEqual([
      ['ads', 'phone', 'Google Ads'],
      ['none', 'unknown', null],
    ]);
    // The app's own word for the source wins.
    expect(body.sources).toEqual([
      { source: 'A friend', accounts: 1, reachedGoal: 1 },
      { source: 'Google Ads', accounts: 1, reachedGoal: 0 },
    ]);
    expect(body.devices).toEqual([
      { device: 'phone', accounts: 1, reachedGoal: 0 },
      { device: 'computer', accounts: 1, reachedGoal: 1 },
    ]);
  });

  test('told there is Traffic when its table is not there: the page still answers, without those two columns', async () => {
    accounts = [account('a', 1)];
    trafficOn = true;
    funnel = make();
    const { status, body } = await page();
    expect(status).toBe(200);
    expect(body.stuck[0]).toMatchObject({ device: 'unknown', source: null });
    expect(logs.some((line) => line.includes("Traffic's sign-up rows were not read"))).toBe(true);
  });
});
