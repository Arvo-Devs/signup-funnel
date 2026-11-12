/**
 * The Sign-up funnel page's body renders each of its states without throwing,
 * with the words that state needs: loading, a failed load, a stretch with no
 * accounts and a full one. Rendered to a string with react-dom/server, with
 * the answer seeded into react-query's cache under the page's own key.
 */
import { describe, expect, test } from 'bun:test';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SearchParamsContext } from 'next/dist/shared/lib/hooks-client-context.shared-runtime';
import { renderToString } from 'react-dom/server';
import { SignupFunnelReport, SignupFunnelSkeleton } from '../src/client';
import { summaryKey } from '../src/client/api';
import { DEFAULT_FUNNEL_RANGE, FUNNEL_RANGES } from '../src/shared/funnel';
import { formatDate, FunnelError, pickParam } from '../src/ui/ui-deps';
import { sampleSummary } from './sample';

const BASE = '/api/signup-funnel';

// Without retryOnMount: false, a query that failed with nothing cached shows as loading again on its next render.
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
const key = () => summaryKey(BASE, '30d');
const clean = (html: string) => html.replaceAll('<!-- -->', '');
const render = (qc: QueryClient) =>
  clean(
    renderToString(
      <QueryClientProvider client={qc}>
        <SignupFunnelReport />
      </QueryClientProvider>,
    ),
  );
const seeded = (overrides: Parameters<typeof sampleSummary>[0] = {}) => {
  const qc = client();
  qc.setQueryData(key(), sampleSummary(overrides));
  return render(qc);
};
const headings = (html: string) => [...html.matchAll(/<h2[^>]*>([^<]*)<\/h2>/g)].map((m) => m[1]);
/** The text of the page, tags out, so a sentence split over elements can be read whole. */
const words = (html: string) =>
  html
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

describe('SignupFunnelReport', () => {
  test('loading: the skeleton, and no numbers yet', () => {
    const html = render(client());
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('animate-pulse');
    expect(headings(html)).toEqual([]);
    // The same skeleton the app can show in its own gate, inside the page's Suspense markers.
    expect(html.replace(/<!--\/?\$-->/g, '')).toBe(clean(renderToString(<SignupFunnelSkeleton />)));
  });

  test("a failed load: the route's message, hint and request id, with Try again", async () => {
    const qc = client();
    const error = new FunnelError(
      503,
      { type: 'internal', code: 'accounts_unavailable', message: 'The accounts could not be looked up right now.', hint: 'Try again in a minute.' },
      'req_abc123',
    );
    await qc.prefetchQuery({ queryKey: key(), queryFn: () => Promise.reject(error) });
    expect(qc.getQueryState(key())?.status).toBe('error');
    const html = render(qc);
    expect(html).toContain('role="alert"');
    expect(html).toContain('Something went wrong');
    expect(html).toContain('The accounts could not be looked up right now.');
    expect(html).toContain('Try again in a minute.');
    expect(html).toContain('req_abc123');
    expect(html).toContain('Try again');
    expect(headings(html)).toEqual([]);
  });

  test('a stretch with no accounts: says so, and what to do', () => {
    const html = seeded({ accounts: 0, counted: 0, reachedGoal: 0, setAside: [], bars: [], stuck: [], stuckTotal: 0, problems: [], sources: [] });
    expect(html).toContain('No accounts were made in the last 30 days');
    expect(html).toContain('Pick a longer stretch');
    expect(headings(html)).toEqual([]);
  });

  test('a full stretch: every card, in order, under one sentence that says it all', () => {
    const html = seeded();
    expect(headings(html)).toEqual(['Every step', 'Phone or computer', 'What went wrong', 'Stuck sign-ups', 'By where they came from']);
    expect(words(html)).toContain('13 accounts made in the last 30 days, 3 set aside (Invited staff 2, Test account 1). 3 of 10 got as far as “Linked an account”.');
    expect(html).not.toContain('Only the newest');
    // Nothing in the page names an app: every step's words come from the answer.
    expect(html).not.toMatch(/betterfans|ofmanager|onlysearch/i);
  });

  test('accounts set aside: one reason stands alone, several each carry their count, none says nothing', () => {
    expect(words(seeded({ setAside: [{ reason: 'Invited staff', count: 3 }] }))).toContain('13 accounts made in the last 30 days, 3 set aside (Invited staff). 3 of 10');
    expect(words(seeded({ setAside: [] }))).toContain('13 accounts made in the last 30 days. 3 of 10');
  });

  test('every step: the app’s own labels in order, how many got there and how many dropped off before it', () => {
    const html = seeded();
    const card = html.slice(html.indexOf('>Every step<'), html.indexOf('>Phone or computer<'));
    const labels = ['Made an account', 'Confirmed the email', 'Saw the welcome page', 'Made a key', 'Linked an account'];
    const places = labels.map((label) => card.indexOf(`>${label}</span>`));
    expect(places.every((at) => at > 0)).toBe(true);
    expect([...places].sort((a, b) => a - b)).toEqual(places);
    // 10 made an account, then 7, 6, 4 and 3: the bars only fall.
    expect([...card.matchAll(/tabular-nums[^>]*>(\d+)<\/div>/g)].map((m) => Number(m[1]))).toEqual([10, 7, 6, 4, 3]);
    expect([...card.matchAll(/>(\d+) dropped off</g)].map((m) => Number(m[1]))).toEqual([3, 1, 2, 1]);
    // The first bar is full width, the goal is drawn as the good one.
    expect(card).toContain('style="width:100%"');
    expect(card).toContain('style="width:30%"');
    expect([...card.matchAll(/bg-success-soft/g)]).toHaveLength(1);
  });

  test('since when steps are reported: said only when it is inside the stretch, or when there are none', () => {
    // Reported for longer than the stretch shown: nothing to say.
    const whole = seeded();
    expect(whole).not.toContain('Steps are reported since');
    expect(whole).not.toContain('No step has been reported yet.');
    expect(whole).not.toContain('Accounts from before that');
    const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const late = seeded({ recordingSince: since });
    expect(late).toContain(`Steps are reported since ${formatDate(since)}.`);
    expect(late).toContain('Accounts from before that are placed by what the app’s own data shows.');
    expect(seeded({ recordingSince: null })).toContain('No step has been reported yet.');
    // An app whose own data shows every step: no bar depends on reports, so there is nothing to say.
    const fromData = seeded({ recordingSince: null, needsReports: false });
    expect(fromData).not.toContain('No step has been reported yet.');
    expect(fromData).not.toContain('Accounts from before that');
    expect(seeded({ recordingSince: since, needsReports: false })).not.toContain('Steps are reported since');
  });

  test('phone or computer: how many of each got to the goal', () => {
    const text = words(seeded());
    expect(text).toContain('On a phone 1 of 3 · 33%');
    expect(text).toContain('On a computer 2 of 5 · 40%');
  });

  test('what went wrong: by people, with the step it belongs to, or that nothing did', () => {
    const html = seeded();
    const card = words(html.slice(html.indexOf('>What went wrong<'), html.indexOf('>Stuck sign-ups<')));
    expect(card).toContain('2 The link window did not open (code 4012) Linked an account');
    expect(card).toContain('1 That code has expired Confirmed the email');
    // Code 4013 is the same problem as 4012: one line, two people.
    expect(card).not.toContain('4013');
    expect(seeded({ problems: [] })).toContain('Nothing went wrong that the app knows of.');
  });

  /** The stuck list's two drawings: the table (where six columns fit) and the blocks (where they do not). */
  const stuckParts = (html: string) => {
    const tableAt = html.indexOf('<table');
    return { list: html.slice(html.indexOf('data-stuck="list"'), tableAt), table: html.slice(tableAt, html.indexOf('</table>', tableAt)) };
  };

  test('stuck sign-ups: who, where each stopped, the last thing that went wrong, and text as text', () => {
    const html = seeded();
    const { table } = stuckParts(html);
    expect(words(html)).toContain('7 accounts not yet at “Linked an account”, newest first.');
    expect(table).toContain('aria-label="Stuck sign-ups"');
    for (const column of ['Who', 'Signed up', 'Stopped at', 'What went wrong', 'Came from', 'Reach them']) expect(table).toContain(`>${column}</th>`);
    expect([...table.matchAll(/<tr /g)]).toHaveLength(7);
    // Newest first.
    expect(table.indexOf('Sample a3')).toBeLessThan(table.indexOf('Sample a4'));
    expect(table.indexOf('Sample a4')).toBeLessThan(table.indexOf('Sample a10'));
    // A name from the app is text, never markup.
    expect(table).toContain('Dana &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(table).not.toContain('<script>');
    expect(table).toContain('>Agency</span>');
    // No name: the email. Neither: the account is gone.
    expect(table).toContain('only-email@example.test');
    expect(table).toContain('Account removed');
    // Where each stopped, in the app's words, or the default.
    expect(table).toContain('Made an account, then nothing');
    expect(table).toContain('Made a key, never used it');
    expect(table).toContain('Saw the welcome page, then nothing');
    // The last thing that went wrong, with its own number this time.
    expect(table).toContain('The link window did not open (code 4013)');
    expect(table).toContain('That code has expired');
    // Its step's label is not above it: "Linked an account" over a failure would read as if it worked.
    expect(table).not.toContain('>Linked an account</div>');
    // Nothing went wrong: the cell stays empty, like any empty cell.
    expect(table).not.toContain('Nothing reported');
    // Never an em or en dash, anywhere on the page: some apps' copy rules forbid them.
    expect(html).not.toMatch(/[\u2013\u2014]/);
    expect(table).toContain('Last seen');
    expect(table).toContain('>Not recorded</div>');
    expect(table).toContain('@sample_handle');
    expect(table).toContain('Telegram');
    // People who reached the goal are not in it.
    expect(table).not.toContain('Sample a1<');
    expect(table).not.toContain('Sample a8');
  });

  test('stuck sign-ups: an app that asks for no handle has no Reach them column, and what went wrong gets its room', () => {
    const sample = sampleSummary();
    const html = seeded({ stuck: sample.stuck.map((person) => ({ ...person, contact: null })) });
    const { table, list } = stuckParts(html);
    expect(table).not.toContain('Reach them');
    expect(list).not.toContain('Reach them');
    expect(table).toContain('w-[30%] min-w-44');
    // Every row has one cell per column.
    const rows = [...table.matchAll(/<tr [^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1]!.matchAll(/<td /g)].length);
    expect(new Set(rows)).toEqual(new Set([5]));
    expect([...table.matchAll(/<th /g)]).toHaveLength(5);
  });

  test('stuck sign-ups: a kind no source is known for has no Came from column, and what went wrong gets its room', () => {
    const sample = sampleSummary();
    const noSource = seeded({ stuck: sample.stuck.map((person) => ({ ...person, source: null })), sources: [] });
    const { table, list } = stuckParts(noSource);
    expect(table).not.toContain('Came from');
    expect(list).not.toContain('Came from');
    expect(table).toContain('w-[30%] min-w-44');
    const rows = [...table.matchAll(/<tr [^>]*>([\s\S]*?)<\/tr>/g)].map((m) => [...m[1]!.matchAll(/<td /g)].length);
    expect(new Set(rows)).toEqual(new Set([5]));
    // Neither: what went wrong takes both columns' room.
    const neither = stuckParts(seeded({ stuck: sample.stuck.map((person) => ({ ...person, source: null, contact: null })), sources: [] })).table;
    expect(neither).toContain('w-[45%] min-w-44');
    expect([...neither.matchAll(/<th /g)]).toHaveLength(4);
  });

  test('stuck sign-ups where a table does not fit: the same people as short blocks, with only what there is to say', () => {
    const html = seeded();
    const { list, table } = stuckParts(html);
    expect(list).toContain('aria-label="Stuck sign-ups"');
    expect([...list.matchAll(/<li /g)]).toHaveLength(7);
    // The same people in the same order as the table.
    const order = (part: string) => [...part.matchAll(/Sample (a\d+)/g)].map((m) => m[1]);
    expect(order(list)).toEqual(order(table));
    expect(list).toContain('Dana &lt;script&gt;alert(1)&lt;/script&gt;');
    expect(list).not.toContain('<script>');
    expect(list).toContain('only-email@example.test');
    expect(list).toContain('Account removed');
    expect(list).toContain('Made a key, never used it');
    expect(list).toContain('Not recorded');
    const text = words(list);
    expect(text).toContain('Went wrong: The link window did not open (code 4013)');
    expect(text).toContain('Went wrong: That code has expired');
    expect(text).not.toContain('Linked an account:');
    expect(text).toContain('Came from Telegram');
    expect(text).toContain('Reach them: @sample_handle');
    // A block has no empty columns to fill.
    expect(list).not.toContain('Nothing reported');
    expect(list).not.toContain('—');
    // One is shown and the other hidden by the card's own width, never both.
    expect(list).toContain('@4xl:hidden');
    expect(html).toMatch(/class="[^"]*hidden @4xl:block[^"]*"><table/);
  });

  test('stuck sign-ups: 25 at first with a way to see more, and a word when the answer was cut', () => {
    const one = sampleSummary().stuck[0]!;
    const many = Array.from({ length: 60 }, (_, i) => ({ ...one, id: `m${i}`, name: `Many ${i}` }));
    const html = seeded({ stuck: many, stuckTotal: 400 });
    const { list, table } = stuckParts(html);
    expect([...table.matchAll(/<tr /g)]).toHaveLength(25);
    expect([...list.matchAll(/<li /g)]).toHaveLength(25);
    expect(html).toContain('Show 25 more');
    expect(html).toContain('Showing the newest 60. Pick a shorter stretch to see the rest.');
    expect(seeded({ truncated: true })).toContain('Only the newest 2,000 accounts were read: pick a shorter stretch.');
  });

  test('nobody stuck: says everyone got there', () => {
    const html = seeded({ stuck: [], stuckTotal: 0 });
    expect(html).toContain('Every account made in this stretch got as far as “Linked an account”.');
    expect(html).not.toContain('aria-label="Stuck sign-ups"');
  });

  test('by where they came from: only when an account came with a source', () => {
    const html = seeded();
    const table = words(html.slice(html.indexOf('aria-label="Accounts by where they came from"')));
    expect(table).toContain('Came from Accounts Linked an account Google 2 1 Telegram 2 1');
    expect(seeded({ sources: [] })).not.toContain('By where they came from');
  });

  test('a basePath prop moves the calls, so the page reads under its own key', () => {
    const qc = client();
    qc.setQueryData(summaryKey('/admin/funnel', '30d'), sampleSummary());
    const moved = renderToString(
      <QueryClientProvider client={qc}>
        <SignupFunnelReport basePath="/admin/funnel/" />
      </QueryClientProvider>,
    );
    expect(moved).toContain('Stuck sign-ups');
    expect(render(qc)).toContain('aria-busy="true"');
  });
});

describe('the stretch in the address', () => {
  // The control itself needs the app's router, so it is checked in a real browser (README, "Development"); this is its rule.
  test('a stretch we know is used; anything else, or none, is 30 days', () => {
    expect(pickParam('7d', FUNNEL_RANGES, DEFAULT_FUNNEL_RANGE)).toBe('7d');
    expect(pickParam('90d', FUNNEL_RANGES, DEFAULT_FUNNEL_RANGE)).toBe('90d');
    expect(pickParam('1y', FUNNEL_RANGES, DEFAULT_FUNNEL_RANGE)).toBe('30d');
    expect(pickParam(null, FUNNEL_RANGES, DEFAULT_FUNNEL_RANGE)).toBe('30d');
  });

  test('the page shows the stretch the answer is for', () => {
    const qc = client();
    qc.setQueryData(key(), sampleSummary({ range: '7d' }));
    expect(words(render(qc))).toContain('13 accounts made in the last 7 days');
  });
});

describe('an app with several kinds of sign-up', () => {
  const KINDS = [
    { key: 'fans', label: 'Fans' },
    { key: 'advertisers', label: 'Advertisers' },
  ];
  /** The page as it renders at an address with these search params. */
  const at = (search: string, qc: QueryClient) =>
    clean(
      renderToString(
        <SearchParamsContext value={new URLSearchParams(search)}>
          <QueryClientProvider client={qc}>
            <SignupFunnelReport />
          </QueryClientProvider>
        </SearchParamsContext>,
      ),
    );

  test('a switch between the kinds, on the one these numbers are for, with who counts in it', () => {
    const qc = client();
    qc.setQueryData(key(), sampleSummary({ funnel: { key: 'fans', label: 'Fans', description: 'Accounts made on the site' }, funnels: KINDS }));
    const html = render(qc);
    expect(html).toContain('aria-label="Kind of sign-up"');
    expect(words(html)).toContain('Fans Advertisers Accounts made on the site');
    expect(html).toMatch(/aria-pressed="true"[^>]*>Fans</);
    expect(html).toMatch(/aria-pressed="false"[^>]*>Advertisers</);
  });

  test('the kind in the address is read under its own key, and its switch is on it', () => {
    const qc = client();
    qc.setQueryData(summaryKey(BASE, '30d', 'advertisers'), sampleSummary({ funnel: { key: 'advertisers', label: 'Advertisers', description: null }, funnels: KINDS, range: '7d' }));
    const html = at('funnel=advertisers', qc);
    expect(html).toMatch(/aria-pressed="true"[^>]*>Advertisers</);
    expect(words(html)).toContain('13 accounts made in the last 7 days');
    // Nothing kept for it yet: still loading, never another kind's numbers.
    expect(at('funnel=fans', qc)).toContain('aria-busy="true"');
  });

  test('an app with one kind has no switch, and no kind has an empty stretch without one', () => {
    expect(seeded()).not.toContain('Kind of sign-up');
    const html = seeded({ funnels: KINDS, funnel: { key: 'fans', label: 'Fans', description: null }, accounts: 0 });
    expect(html).toContain('Kind of sign-up');
    expect(words(html)).toContain('No accounts were made in the last 30 days');
  });
});

describe('also did', () => {
  test('each side step: how many did it, and how they did against everyone else', () => {
    const html = seeded({ sideSteps: [{ key: 'liked', label: 'Liked, saved or commented', accounts: 4, reachedGoal: 2 }, { key: 'alerts_on', label: 'Turned on alerts', accounts: 0, reachedGoal: 0 }] });
    const card = words(html.slice(html.indexOf('>Also did<'), html.indexOf('>What went wrong<')));
    expect(card).toContain('Not steps, so nobody needs them. How many got as far as “Linked an account” when they did, and when they did not.');
    expect(card).toContain('Liked, saved or commented 4 accounts Did it 2 of 4 · 50% Did not 1 of 6 · 17%');
    expect(card).toContain('Turned on alerts 0 accounts Did it 0 of 0 Did not 3 of 10 · 30%');
    expect(seeded()).not.toContain('Also did');
  });
});

describe('phone or computer, when the app does not know', () => {
  test('says so for everyone, or counts the ones it does not know', () => {
    expect(words(seeded())).toContain('Not recorded for 2 accounts.');
    const none = seeded({ devices: [{ device: 'phone', accounts: 0, reachedGoal: 0 }, { device: 'computer', accounts: 0, reachedGoal: 0 }] });
    expect(words(none)).toContain('Not recorded for these accounts.');
    expect(words(none)).not.toContain('On a phone');
  });
});

describe('steps people went on without', () => {
  test('the bar says how many, and the stuck list says which steps', () => {
    const data = sampleSummary();
    data.bars[1]!.skipped = 3;
    data.stuck[0]!.skipped = ['Confirmed the email'];
    const qc = client();
    qc.setQueryData(key(), data);
    const text = words(render(qc));
    expect(text).toContain('Confirmed the email 3 dropped off 3 went on without it 7');
    expect(text).toContain('Skipped: Confirmed the email');
    expect(words(seeded())).not.toContain('went on without it');
    expect(words(seeded())).not.toContain('Skipped:');
  });
});
