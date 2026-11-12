// The contract between the package and the app that installs it. Everything
// that differs from app to app comes in through here: the database, who is
// signed in and who may see the page, the app's own steps, and the accounts
// made in a stretch of time with what the app already knows about each. An
// app with more than one kind of sign-up (fans and advertisers) gives each
// its own steps and accounts under `funnels`.
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
  /**
   * True when the app's own data shows this step (the accounts hook lists it
   * in `done`), so an account is placed right whether or not it was ever
   * reported. When every step is, the page does not say since when steps
   * are reported, since no bar depends on it. Default false.
   */
  fromData?: boolean;
}>;

/** Something that went wrong which the app's own data shows: a sign-in link that failed, say. */
export type FunnelAccountProblem = Readonly<{
  /** The step it belongs to, one of the app's step keys. */
  step: string;
  /** What the person was told, in one line. Never what they typed. */
  reason: string;
  /** When it happened: a Date or ISO 8601. */
  at: Date | string;
}>;

/** An account made in the range, as the app knows it now. */
export type FunnelAccount = Readonly<{
  id: string;
  /** When the account was made: a Date or ISO 8601. */
  createdAt: Date | string;
  name?: string | null;
  email?: string | null;
  /** Steps the app's own data already shows as done (keys from `steps` or `sideSteps`), so they need no report. */
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
  /**
   * What went wrong that the app's own data shows, when its tables keep
   * failures (a sign-in link that failed). Counted with the reported ones
   * and, like them, it moves nobody forward. The newest 20 are read.
   */
  problems?: readonly FunnelAccountProblem[] | null;
  /** When the app last saw the account (its last sign-in or request). The page shows the later of this and the last report. */
  lastSeenAt?: Date | string | null;
}>;

/**
 * The accounts made between two times, newest first, at most `limit`, each
 * with what the app's own data shows. Resolve to null when they cannot be
 * looked up right now (the page then says so).
 */
export type FunnelAccountsHook = (range: Readonly<{ from: Date; to: Date; limit: number }>) => Promise<readonly FunnelAccount[] | null>;

/**
 * One kind of sign-up, for an app with more than one (fans and advertisers,
 * say): each has its own steps, goal and accounts, and the page has a switch
 * between them. An account belongs to the kind the app's hook lists it under.
 */
export type FunnelDef = Readonly<{
  /** In the page's address as ?funnel=: lower case letters, digits, dashes and underscores, at most 40. Never rename one: a shared link names it. */
  key: string;
  /** On the page's switch: "Fans". */
  label: string;
  /** One line under the switch: who counts in it ("Accounts made on the site, not on the advertiser dashboard"). */
  description?: string;
  /** This kind's steps after the account is made, in order. The last one is its goal. At least one. */
  steps: readonly FunnelStepDef[];
  /**
   * Things people may do on the way that are not steps, because the steps
   * after them do not need them (liking a post before voting, say). They move
   * nobody forward; the page shows how many did each and how many of those
   * reached the goal, against everyone else. Same keys and rules as steps.
   */
  sideSteps?: readonly FunnelStepDef[];
  /** The accounts of this kind made in a stretch of time. */
  accounts: FunnelAccountsHook;
}>;

export type FunnelLog = (line: string, error?: unknown) => void;

type FunnelConfigShared<User extends FunnelUser> = Readonly<{
  /** The database, or null when it is not set up (the routes answer 503). A function, so nothing connects at build time. */
  db: () => Promise<FunnelSql | null> | FunnelSql | null;
  /** Who is signed in, asked on every call that needs it. */
  signedInUser: (request: Request, options: Readonly<{ fresh: boolean }>) => Promise<User | null>;
  /** True for the people who may open the page (Mass Access). Everyone else gets not found. */
  canView: (user: User) => boolean | Promise<boolean>;
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

/** An app with one kind of sign-up: its steps and accounts right here. */
type OneFunnel = Readonly<{
  /** The app's steps after the account is made, in order. The last one is the goal. At least one. */
  steps: readonly FunnelStepDef[];
  /** Things people may do that are not steps (FunnelDef.sideSteps). */
  sideSteps?: readonly FunnelStepDef[];
  /** The accounts made in a stretch of time (FunnelAccountsHook). */
  accounts: FunnelAccountsHook;
  funnels?: undefined;
}>;

/** An app with several kinds of sign-up: one FunnelDef each, the first is the one the page opens on. */
type SeveralFunnels = Readonly<{
  funnels: readonly FunnelDef[];
  steps?: undefined;
  sideSteps?: undefined;
  accounts?: undefined;
}>;

export type FunnelConfig<User extends FunnelUser = FunnelUser> = FunnelConfigShared<User> & (OneFunnel | SeveralFunnels);

/** One kind of sign-up as the routes use it. */
export type ResolvedFunnel = Readonly<{
  key: string;
  label: string;
  description: string | null;
  steps: readonly FunnelStepDef[];
  sideSteps: readonly FunnelStepDef[];
  accounts: FunnelAccountsHook;
}>;

/** The config as the routes use it: defaults filled in, hosts in lower case. */
export type ResolvedFunnelConfig<User extends FunnelUser = FunnelUser> = Readonly<{
  db: () => Promise<FunnelSql | null>;
  signedInUser: (request: Request, options: Readonly<{ fresh: boolean }>) => Promise<User | null>;
  canView: (user: User) => Promise<boolean>;
  /** Every kind of sign-up, the one the page opens on first. One for an app that gave `steps`. */
  funnels: readonly ResolvedFunnel[];
  siteHosts: readonly string[];
  traffic: boolean;
  /** With no slash at the end; empty when mounted at the root. */
  basePath: string;
  log: FunnelLog;
  /** What is wrong with the app's steps or kinds of sign-up, or null. While it is set, `funnels` is empty and nothing is kept. */
  problem: string | null;
}>;

export const FUNNEL_BASE_PATH = '/api/signup-funnel';
/** What a step's key must look like; the table holds it too. */
export const STEP_KEY = /^[a-z][a-z0-9_]{0,39}$/;
/** What a kind of sign-up's key must look like: it goes in the page's address. */
export const FUNNEL_KEY = /^[a-z][a-z0-9_-]{0,39}$/;
/** The key and label an app with one kind of sign-up gets. Never shown: the switch needs two. */
export const SINGLE_FUNNEL = { key: 'signups', label: 'Sign-ups' } as const;
/** Kinds of sign-up one page can switch between. */
export const FUNNELS_MAX = 6;

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

/** What is wrong with a list of side steps next to its steps, in one sentence, or null. */
function sideStepsProblem(sideSteps: readonly FunnelStepDef[] | undefined, steps: readonly FunnelStepDef[]): string | null {
  if (sideSteps === undefined) return null;
  if (!Array.isArray(sideSteps)) return 'Side steps must be a list.';
  const onTheWay = new Set(steps.map((step) => step.key));
  const seen = new Set<string>();
  for (const step of sideSteps) {
    if (!step || typeof step.key !== 'string' || !STEP_KEY.test(step.key)) {
      return `A side step key must be lower case letters, digits and underscores, at most 40: ${JSON.stringify(step?.key)}.`;
    }
    if (step.key === MADE_KEY) return `The key ${MADE_KEY} is the first bar: it cannot be a side step.`;
    if (onTheWay.has(step.key)) return `${step.key} is a step and a side step: it can only be one.`;
    if (seen.has(step.key)) return `Two side steps share the key ${step.key}.`;
    seen.add(step.key);
    if (typeof step.label !== 'string' || !step.label.trim()) return `The side step ${step.key} needs a label.`;
  }
  return null;
}

/**
 * What is wrong with an app's kinds of sign-up, in one sentence, or null.
 * Exported, so an app can check its list in a test of its own. Two kinds may
 * share a step key: it is the same step for the same account (a confirmed
 * email is confirmed for both).
 */
export function funnelsProblem(funnels: readonly FunnelDef[]): string | null {
  if (!Array.isArray(funnels) || funnels.length === 0) return 'Give at least one kind of sign-up.';
  if (funnels.length > FUNNELS_MAX) return `At most ${FUNNELS_MAX} kinds of sign-up fit the page's switch.`;
  const seen = new Set<string>();
  for (const funnel of funnels) {
    if (!funnel || typeof funnel.key !== 'string' || !FUNNEL_KEY.test(funnel.key)) {
      return `A kind of sign-up's key must be lower case letters, digits, dashes and underscores, at most 40: ${JSON.stringify(funnel?.key)}.`;
    }
    if (seen.has(funnel.key)) return `Two kinds of sign-up share the key ${funnel.key}.`;
    seen.add(funnel.key);
    if (typeof funnel.label !== 'string' || !funnel.label.trim()) return `The kind of sign-up ${funnel.key} needs a label.`;
    if (typeof funnel.accounts !== 'function') return `The kind of sign-up ${funnel.key} needs an accounts hook.`;
    const problem = stepsProblem(funnel.steps) ?? sideStepsProblem(funnel.sideSteps, funnel.steps);
    if (problem) return `${funnel.label.trim()}: ${problem}`;
  }
  return null;
}

const trimmed = (steps: readonly FunnelStepDef[] | undefined): FunnelStepDef[] => (steps ?? []).map((step) => ({ ...step, label: step.label.trim() }));

/**
 * Reads the app's config once. It never throws: the app calls this from the
 * same place it reports a sign-up's steps, and a typo in the list of steps
 * must not be able to break a sign-up. A list that cannot work is logged
 * here, kept as `problem` (the page shows it to the people who may see it),
 * and read as no kinds of sign-up at all, so nothing is kept until it is fixed.
 */
export function normalizeConfig<User extends FunnelUser>(input: FunnelConfig<User>): ResolvedFunnelConfig<User> {
  const log = input.log ?? defaultLog;
  // One kind of sign-up is the same as a list of one, under a key the page never shows.
  const defs: readonly FunnelDef[] =
    input.funnels !== undefined
      ? input.funnels
      : [{ key: SINGLE_FUNNEL.key, label: SINGLE_FUNNEL.label, steps: input.steps, sideSteps: input.sideSteps, accounts: input.accounts }];
  let problem: string | null;
  try {
    problem = input.funnels !== undefined && (input.steps !== undefined || input.accounts !== undefined)
      ? 'Give either steps and accounts, or funnels: not both.'
      : input.funnels !== undefined
        ? funnelsProblem(defs)
        : (stepsProblem(input.steps) ?? sideStepsProblem(input.sideSteps, input.steps) ?? (typeof input.accounts === 'function' ? null : 'Give an accounts hook.'));
  } catch {
    problem = 'The list of steps cannot be read.';
  }
  if (problem) log(`[Sign-up funnel] The list of steps cannot be used, so no step is kept until it is fixed. ${problem}`);
  return {
    db: async () => input.db(),
    signedInUser: input.signedInUser,
    canView: async (user) => input.canView(user),
    funnels: problem
      ? []
      : defs.map((funnel) => ({
          key: funnel.key,
          label: funnel.label.trim(),
          description: typeof funnel.description === 'string' && funnel.description.trim() ? funnel.description.trim() : null,
          steps: trimmed(funnel.steps),
          sideSteps: trimmed(funnel.sideSteps),
          accounts: funnel.accounts,
        })),
    siteHosts: (Array.isArray(input.siteHosts) ? input.siteHosts : []).map((host) => String(host).trim().toLowerCase()).filter(Boolean),
    traffic: input.traffic === true,
    basePath: (input.basePath ?? FUNNEL_BASE_PATH).replace(/\/+$/, ''),
    log,
    problem,
  };
}

/** Every step and side step key across the app's kinds of sign-up. */
export function allStepKeys(config: Pick<ResolvedFunnelConfig, 'funnels'>): Set<string> {
  return new Set(config.funnels.flatMap((funnel) => [...funnel.steps, ...funnel.sideSteps].map((step) => step.key)));
}
