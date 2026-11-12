/**
 * The funnel routes with no database behind them: who may read the page,
 * what a page may report, and that nothing an app hook throws reaches the
 * caller as a crash. What they write and read is proven on Postgres in
 * funnel.pg.test.ts.
 */
import { describe, expect, test } from 'bun:test';
import { createSignupFunnel } from '../src/index';
import { cookieFor, fakeConfig, request } from './fake-app';

const funnel = (overrides = {}) => createSignupFunnel(fakeConfig(overrides));
const body = async (response: Response) => (await response.json()) as { error: { type: string; code: string; message: string; param?: string }; requestId: string };

describe('GET the page’s numbers', () => {
  const get = (path: string, cookie?: string, overrides = {}) => funnel(overrides).routeHandlers.GET(request(path, { method: 'GET', cookie }));

  test('signed out: sign in', async () => {
    const response = await get('/api/signup-funnel');
    expect(response.status).toBe(401);
    expect((await body(response)).error.code).toBe('not_signed_in');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  test('without Mass Access, or viewing as someone: the page does not exist', async () => {
    expect((await get('/api/signup-funnel', cookieFor('owner'))).status).toBe(404);
    expect((await get('/api/signup-funnel', cookieFor('viewedas'))).status).toBe(404);
  });

  test('with Mass Access and no database yet: says what is missing', async () => {
    const response = await get('/api/signup-funnel', cookieFor('admin'));
    expect(response.status).toBe(503);
    expect((await body(response)).error.message).toContain('no database yet');
  });

  test('a sign-in that is down is a plain answer, not a crash', async () => {
    expect((await get('/api/signup-funnel', cookieFor('broken'))).status).toBe(503);
  });

  test('anything else under the base path, and anything outside it, is not found', async () => {
    expect((await get('/api/signup-funnel/steps', cookieFor('admin'))).status).toBe(404);
    expect((await get('/api/other', cookieFor('admin'))).status).toBe(404);
    expect((await get('/api/funnel', cookieFor('admin'), { basePath: '/api/funnel' })).status).toBe(503);
  });
});

describe('POST a step from a page', () => {
  const post = (init: Parameters<typeof request>[1], overrides = {}) => funnel(overrides).routeHandlers.POST(request('/api/signup-funnel/step', init));

  test('only from the site’s own pages', async () => {
    const response = await post({ cookie: cookieFor('owner'), origin: 'https://elsewhere.example', body: { step: 'welcome_seen' } });
    expect(response.status).toBe(403);
    expect((await post({ cookie: cookieFor('owner'), origin: null, site: 'cross-site', body: { step: 'welcome_seen' } })).status).toBe(403);
  });

  test('only signed in', async () => {
    expect((await post({ body: { step: 'welcome_seen' } })).status).toBe(401);
  });

  test('only a step the app marked for pages', async () => {
    for (const step of ['key_made', 'account_linked', 'account_made', 'nope', '', 42, null]) {
      const response = await post({ cookie: cookieFor('owner'), body: { step } });
      expect(response.status).toBe(400);
      expect((await body(response)).error.param).toBe('step');
    }
  });

  test('a body that is not JSON, or too long, is refused', async () => {
    expect((await post({ cookie: cookieFor('owner'), body: 'not json' })).status).toBe(400);
    expect((await post({ cookie: cookieFor('owner'), body: { step: 'welcome_seen', reason: 'x'.repeat(5000) } })).status).toBe(400);
  });

  test('a view-as session writes nothing and is told nothing', async () => {
    let asked = 0;
    const response = await post(
      { cookie: cookieFor('viewedas'), body: { step: 'welcome_seen' } },
      {
        db: () => {
          asked++;
          return null;
        },
      },
    );
    expect(response.status).toBe(204);
    expect(asked).toBe(0);
  });

  test('one account cannot flood it', async () => {
    const one = funnel();
    const send = () => one.routeHandlers.POST(request('/api/signup-funnel/step', { cookie: cookieFor('owner'), body: { step: 'nope' } }));
    const statuses: number[] = [];
    for (let i = 0; i < 62; i++) statuses.push((await send()).status);
    expect(statuses.slice(0, 60).every((s) => s === 400)).toBe(true);
    expect(statuses.slice(60)).toEqual([429, 429]);
  });
});

describe('recordStep, from the app’s own code', () => {
  test('never throws, and says false when nothing was kept', async () => {
    const logs: string[] = [];
    const one = funnel({ log: (line: string) => logs.push(line) });
    // No database.
    expect(await one.recordStep({ userId: 'usr_owner', step: 'key_made' })).toBe(false);
    // Not one of the app's steps.
    expect(await one.recordStep({ userId: 'usr_owner', step: 'made_a_key' })).toBe(false);
    expect(logs.at(-1)).toContain('"made_a_key" is not one of this app\'s steps');
    // Someone else is looking.
    expect(await one.recordStep({ userId: 'usr_owner', step: 'key_made', viewedAs: true })).toBe(false);
    // No account.
    expect(await one.recordStep({ userId: '', step: 'key_made' })).toBe(false);
    // A database that throws.
    const broken = funnel({
      db: () => {
        throw new Error('down');
      },
      log: (line: string) => logs.push(line),
    });
    expect(await broken.recordStep({ userId: 'usr_owner', step: 'key_made' })).toBe(false);
    expect(logs.at(-1)).toContain('a step was not kept');
  });
});

describe('forgetAccount, from the app’s delete-account code', () => {
  test('never throws: null when it could not be done, so the app can try again', async () => {
    const logs: string[] = [];
    // No database.
    expect(await funnel().forgetAccount('usr_owner')).toBeNull();
    // No account to remove is nothing removed, not a failure.
    expect(await funnel().forgetAccount('')).toBe(0);
    const broken = funnel({
      db: () => {
        throw new Error('down');
      },
      log: (line: string) => logs.push(line),
    });
    expect(await broken.forgetAccount('usr_owner')).toBeNull();
    expect(logs.at(-1)).toContain("an account's steps were not removed");
  });
});

describe('a list of steps that cannot be used', () => {
  // A database that fails the test if anything touches it: with a bad list nothing may be read or written.
  const untouchable = new Proxy(function () {}, {
    get: (_target, prop) => {
      if (prop === 'then') return undefined; // awaiting it is not using it
      throw new Error('the database was used');
    },
    apply: () => {
      throw new Error('the database was used');
    },
  }) as never;
  const logs: string[] = [];
  const bad = () => funnel({ steps: [{ key: 'Made A Key', label: 'Made a key' }], db: () => untouchable, log: (line: string) => logs.push(line) });

  test('never breaks the app: making the funnel does not throw, and a step is simply not kept', async () => {
    logs.length = 0;
    const one = bad();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toContain('The list of steps cannot be used');
    expect(logs[0]).toContain('"Made A Key"');
    expect(await one.recordStep({ userId: 'usr_owner', step: 'Made A Key' })).toBe(false);
    expect(await one.recordStep({ userId: 'usr_owner', step: 'key_made' })).toBe(false);
    // Said once, when the config was read, not on every sign-up.
    expect(logs).toHaveLength(1);
  });

  test('the page says what to fix, to the people who may see it and nobody else', async () => {
    const get = (cookie?: string) => bad().routeHandlers.GET(request('/api/signup-funnel', { method: 'GET', cookie }));
    const response = await get(cookieFor('admin'));
    expect(response.status).toBe(503);
    const { error } = (await response.json()) as { error: { code: string; message: string; hint: string } };
    expect(error.code).toBe('not_set_up');
    expect(error.message).toBe('The sign-up funnel is not set up right, so no step is being kept.');
    expect(error.hint).toContain('lower case letters, digits and underscores');
    expect((await get(cookieFor('owner'))).status).toBe(404);
    expect((await get()).status).toBe(401);
  });

  test('a page that reports a step is told it is not one, and nothing is written', async () => {
    const response = await bad().routeHandlers.POST(request('/api/signup-funnel/step', { cookie: cookieFor('owner'), body: { step: 'welcome_seen' } }));
    expect(response.status).toBe(400);
  });
});

describe('an app with several kinds of sign-up', () => {
  const several = (log?: (line: string) => void) =>
    funnel({
      funnels: [
        { key: 'fans', label: 'Fans', steps: [{ key: 'email_confirmed', label: 'Confirmed the email' }, { key: 'voted', label: 'Voted' }], sideSteps: [{ key: 'liked', label: 'Liked a post', fromBrowser: true }], accounts: async () => [] },
        { key: 'advertisers', label: 'Advertisers', steps: [{ key: 'topped_up', label: 'Topped up', fromBrowser: true }, { key: 'campaign_started', label: 'Started a campaign' }], accounts: async () => [] },
      ],
      ...(log ? { log } : {}),
    });

  test('a page may report a step or side step any kind marked for pages, and nothing else', async () => {
    const post = (step: unknown) => several().routeHandlers.POST(request('/api/signup-funnel/step', { cookie: cookieFor('owner'), body: { step } }));
    // Marked for pages: past the check, to the missing database.
    expect((await post('liked')).status).toBe(503);
    expect((await post('topped_up')).status).toBe(503);
    for (const step of ['voted', 'campaign_started', 'email_confirmed', 'nope']) expect((await post(step)).status).toBe(400);
  });

  test('recordStep knows every kind’s steps and side steps', async () => {
    const logs: string[] = [];
    const one = several((line) => logs.push(line));
    for (const step of ['email_confirmed', 'voted', 'liked', 'topped_up', 'campaign_started']) {
      expect(await one.recordStep({ userId: 'usr_owner', step })).toBe(false);
    }
    expect(logs).toEqual([]);
    expect(await one.recordStep({ userId: 'usr_owner', step: 'key_made' })).toBe(false);
    expect(logs.at(-1)).toContain('"key_made" is not one of this app\'s steps');
  });

  test('the page’s numbers still need Mass Access, whichever kind is asked for', async () => {
    const get = (cookie?: string) => several().routeHandlers.GET(request('/api/signup-funnel?funnel=advertisers', { method: 'GET', cookie }));
    expect((await get()).status).toBe(401);
    expect((await get(cookieFor('owner'))).status).toBe(404);
    expect((await get(cookieFor('admin'))).status).toBe(503);
  });
});
