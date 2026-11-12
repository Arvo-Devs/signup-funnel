// @arvo/signup-funnel on the server. createSignupFunnel(config) reads the
// app's config once and gives back what the app wires up: the route handlers
// under basePath, recordStep for the app's own server code, and forgetAccount
// for its delete-account code. Keep one per
// process (README.md, "One server file"): the limit counts across requests.
//
// Server only: it uses Node's crypto. The page and the browser call are in
// ./client and ./notes.
import { allStepKeys, normalizeConfig, type FunnelConfig, type FunnelUser } from './config';
import { createRouteHandlers, type RouteHandler } from './server/routes';
import { forgetSteps, insertStep, reportDevice } from './server/steps';
import { deviceClass } from './shared/device';

export type RecordStepInput = Readonly<{
  /** The account the step is for. */
  userId: string;
  /** One of the app's step or side step keys, from any of its kinds of sign-up. */
  step: string;
  /** False when the step went wrong; `reason` says how, in one line a person can read. Default true. */
  ok?: boolean;
  reason?: string | null;
  /** The person's own request, when there is one: it says phone, tablet or computer. Nothing else is read from it. */
  request?: Request | null;
  /** True in a staff member's view-as session: nothing is kept. */
  viewedAs?: boolean;
  /** The same key is the same row, for a step that can happen more than once per account (one per link session, say). */
  onceKey?: string;
}>;

export type SignupFunnel = Readonly<{
  /** GET and POST for one catch-all route file at basePath. */
  routeHandlers: Readonly<{ GET: RouteHandler; POST: RouteHandler }>;
  /**
   * Keeps a step from the app's own server code: the email was confirmed, a
   * key was made, a link failed and why. A step that went through is kept
   * once per account; one that went wrong, once per ten minutes. True when
   * it wrote a row. Never throws: a failure is logged and answers false, so
   * it cannot break what it is reporting on.
   */
  recordStep: (input: RecordStepInput) => Promise<boolean>;
  /**
   * Removes every step kept for one account. Call it from the app's
   * delete-account code, so nothing about a removed account stays here.
   * Answers how many rows went. Never throws: a failure is logged and
   * answers null, so the caller can try again later.
   */
  forgetAccount: (userId: string) => Promise<number | null>;
}>;

/**
 * Never throws, whatever the config: a list of steps that cannot work is
 * logged, shown on the page to the people who may see it, and nothing is
 * kept until it is fixed.
 */
export function createSignupFunnel<User extends FunnelUser = FunnelUser>(input: FunnelConfig<User>): SignupFunnel {
  const config = normalizeConfig(input);
  const known = allStepKeys(config);
  return {
    routeHandlers: createRouteHandlers(config),
    recordStep: async (step) => {
      try {
        if (step.viewedAs) return false;
        // The list of steps cannot be used (said once, when the config was read): keep nothing, break nothing.
        if (config.problem) return false;
        if (!known.has(step.step)) {
          config.log(`[Sign-up funnel] ${JSON.stringify(step.step)} is not one of this app's steps, so it was not kept`);
          return false;
        }
        if (typeof step.userId !== 'string' || !step.userId) return false;
        const sql = await config.db();
        if (!sql) return false;
        return await insertStep(sql, {
          userId: step.userId,
          step: step.step,
          ok: step.ok,
          reason: step.reason,
          device: reportDevice(step.request),
          onceKey: step.onceKey,
        });
      } catch (error) {
        config.log('[Sign-up funnel] a step was not kept', error);
        return false;
      }
    },
    forgetAccount: async (userId) => {
      try {
        if (typeof userId !== 'string' || !userId) return 0;
        const sql = await config.db();
        if (!sql) return null;
        return await forgetSteps(sql, userId);
      } catch (error) {
        config.log("[Sign-up funnel] an account's steps were not removed", error);
        return null;
      }
    },
  };
}

export type {
  FunnelAccount,
  FunnelAccountProblem,
  FunnelAccountsHook,
  FunnelConfig,
  FunnelDef,
  FunnelLog,
  FunnelSql,
  FunnelStepDef,
  FunnelUser,
} from './config';
export { funnelsProblem, stepsProblem } from './config';
export type { FunnelBar, FunnelDevice, FunnelKind, FunnelPerson, FunnelProblem, FunnelRange, FunnelSideStep, FunnelSummary } from './shared/funnel';
export { buildFunnel, MADE_KEY } from './shared/funnel';

/**
 * Phone or computer from a browser's user agent, for an app that gives
 * `device` itself (the browser of an account's first session, say, for a
 * kind of sign-up Traffic does not see). A tablet counts as a phone. Null
 * when there is no user agent.
 */
export function deviceOf(userAgent: string | null | undefined): 'phone' | 'computer' | null {
  const agent = typeof userAgent === 'string' ? userAgent.trim() : '';
  if (!agent) return null;
  return deviceClass(agent) === 'computer' ? 'computer' : 'phone';
}
