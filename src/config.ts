// The contract between the package and the app that installs it. Everything
// that differs from app to app comes in through here: the database, who is
// signed in and who may see the page, the app's own steps, and the accounts
// made in a stretch of time with what the app already knows about each.
//
// normalizeConfig reads it once, in createSignupFunnel. It imports nothing
// that needs Node, so a page that imports a type from here stays a browser
// bundle.
import type postgres from 'postgres';
import { MADE_KEY } from './shared/funnel';

/**
 * A postgres.js client for the app's database, with the package's table
 * (migrations/). Give it one nothing wraps with drizzle: drizzle(sql) changes
 * how a shared client reads dates and JSON.
 */
export type FunnelSql = postgres.Sql;

/** The person signed in, as the app's auth knows them on this request. */
export type FunnelUser = Readonly<{
  id: string;
  email?: string | null;
  /** True in a staff member's view-as session: someone else is looking, so nothing is written for it. */
  viewedAs?: boolean;
}>;

/** One step on the way from a new account to the goal. The account being made is not a step: every account has that. */
export type FunnelStepDef = Readonly<{
  /** Stored with each report: lower case letters, digits and underscores, at most 40. Never rename one that has rows. */
  key: string;
  /** On the chart: "Confirmed the email". */
  label: string;
  /** In the stuck list, for someone who got this far and no further. Default: the label, then ", then nothing". */
  stopped?: string;
  /** True when a signed-in browser may report it with noteStep(). Default false: only the app's server may, with recordStep(). */
  fromBrowser?: boolean;
}>;

/** An account made in the range, as the app knows it now. */
export type FunnelAccount = Readonly<{
  id: string;
  /** When the account was made: a Date or ISO 8601. */
  createdAt: Date | string;
  name?: string | null;
  email?: string | null;
  /** Steps the app's own data already shows as done (keys from `steps`), so they need no report. */
  done?: readonly string[];
  /** A reason to leave this account out of the funnel, in a few words ("Invited staff", "Test account"). Counted apart. */
  setAside?: string | null;
  /** The kind of account, when the app has kinds ("Agency", "Creator"). Shown in the stuck list. */
  kind?: string | null;
  /** Where the account was made, when the app knows. Else Traffic's sign-up row (`traffic`), else the first report. */
  device?: 'phone' | 'computer' | null;
  /** Where they came from, in the words to show ("Google Ads", "reddit.com"). Else Traffic's sign-up row (`traffic`). */
  source?: string | null;
  /** How to reach them, when the sign-up asked for it ("@handle"). Only people who may see the page get it. */
  contact?: string | null;
}>;

export type FunnelLog = (line: string, error?: unknown) => void;

export type FunnelConfig<User extends FunnelUser = FunnelUser> = Readonly<{
  /** The database, or null when it is not set up (the routes answer 503). A function, so nothing connects at build time. */
  db: () => Promise<FunnelSql | null> | FunnelSql | null;
  /** Who is signed in, asked on every call that needs it. */
  signedInUser: (request: Request, options: Readonly<{ fresh: boolean }>) => Promise<User | null>;
  /** True for the people who may open the page (Mass Access). Everyone else gets not found. */
  canView: (user: User) => boolean | Promise<boolean>;
  /** The app's steps after the account is made, in order. The last one is the goal. At least one. */
  steps: readonly FunnelStepDef[];
  /**
   * The accounts made between two times, newest first, at most `limit`, each
   * with what the app's own data shows. Resolve to null when they cannot be
   * looked up right now (the page then says so).
   */
  accounts: (range: Readonly<{ from: Date; to: Date; limit: number }>) => Promise<readonly FunnelAccount[] | null>;
  /** The site's own hosts: only pages on them may report a step from the browser. */
  siteHosts: readonly string[];
  /**
   * True when the app also has @arvo/traffic's tables in the same database:
   * phone or computer and "came from" are then read from its sign-up rows for
   * any account the app did not give them for. Default false.
   */
  traffic?: boolean;
  /** Where routeHandlers are mounted. Default /api/signup-funnel. */
  basePath?: string;
  /** Where errors are written. Default console.error. */
  log?: FunnelLog;
}>;

/** The config as the routes use it: defaults filled in, hosts in lower case. */
export type ResolvedFunnelConfig<User extends FunnelUser = FunnelUser> = Readonly<{
  db: () => Promise<FunnelSql | null>;
  signedInUser: (request: Request, options: Readonly<{ fresh: boolean }>) => Promise<User | null>;
  canView: (user: User) => Promise<boolean>;
  steps: readonly FunnelStepDef[];
  accounts: FunnelConfig<User>['accounts'];
  siteHosts: readonly string[];
  traffic: boolean;
  /** With no slash at the end; empty when mounted at the root. */
  basePath: string;
  log: FunnelLog;
  /** What is wrong with the app's list of steps, or null. While it is set, `steps` is empty and nothing is kept. */
  problem: string | null;
}>;

export const FUNNEL_BASE_PATH = '/api/signup-funnel';
/** What a step's key must look like; the table holds it too. */
export const STEP_KEY = /^[a-z][a-z0-9_]{0,39}$/;

const defaultLog: FunnelLog = (line, error) => {
  if (error === undefined) console.error(line);
  else console.error(line, error);
};

/** What is wrong with the app's list of steps, in one sentence, or null. Exported, so an app can check its list in a test of its own. */
export function stepsProblem(steps: readonly FunnelStepDef[]): string | null {
  if (!Array.isArray(steps) || steps.length === 0) return 'Give at least one step: the last one is the goal.';
  const seen = new Set<string>();
  for (const step of steps) {
    if (!step || typeof step.key !== 'string' || !STEP_KEY.test(step.key)) {
      return `A step key must be lower case letters, digits and underscores, at most 40: ${JSON.stringify(step?.key)}.`;
    }
    if (step.key === MADE_KEY) return `The key ${MADE_KEY} is the first bar (every account has it): give the steps after it.`;
    if (seen.has(step.key)) return `Two steps share the key ${step.key}.`;
    seen.add(step.key);
    if (typeof step.label !== 'string' || !step.label.trim()) return `The step ${step.key} needs a label.`;
  }
  return null;
}

/**
 * Reads the app's config once. It never throws: the app calls this from the
 * same place it reports a sign-up's steps, and a typo in the list of steps
 * must not be able to break a sign-up. A list that cannot work is logged
 * here, kept as `problem` (the page shows it to the people who may see it),
 * and read as no steps at all, so nothing is kept until it is fixed.
 */
export function normalizeConfig<User extends FunnelUser>(input: FunnelConfig<User>): ResolvedFunnelConfig<User> {
  const log = input.log ?? defaultLog;
  const problem = stepsProblem(input.steps);
  if (problem) log(`[Sign-up funnel] The list of steps cannot be used, so no step is kept until it is fixed. ${problem}`);
  return {
    db: async () => input.db(),
    signedInUser: input.signedInUser,
    canView: async (user) => input.canView(user),
    steps: problem ? [] : input.steps.map((step) => ({ ...step, label: step.label.trim() })),
    accounts: input.accounts,
    siteHosts: (Array.isArray(input.siteHosts) ? input.siteHosts : []).map((host) => String(host).trim().toLowerCase()).filter(Boolean),
    traffic: input.traffic === true,
    basePath: (input.basePath ?? FUNNEL_BASE_PATH).replace(/\/+$/, ''),
    log,
    problem,
  };
}
