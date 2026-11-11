/**
 * The funnel routes, mounted under basePath (default /api/signup-funnel) by
 * one catch-all route file in the app:
 *
 *   GET   ''      the page's numbers, for canView
 *   POST  'step'  a step the browser saw: signed in, from the site's own pages
 *
 * Anything else is not found. Every answer is no-store.
 */
import type { FunnelUser, ResolvedFunnelConfig } from '../config';
import { DEFAULT_FUNNEL_RANGE, isFunnelRange } from '../shared/funnel';
import { apiError, fromOwnPage, json, noContent, notFound, readTextUpTo, unavailable, viewerContext } from './http';
import { createPublicLimiter } from './limiter';
import { insertStep, reportDevice } from './steps';
import { funnelSummary } from './summary';

const TEN_MINUTES = 10 * 60 * 1000;

export type RouteHandler = (request: Request) => Promise<Response>;
export type FunnelRouteHandlers = Readonly<{ GET: RouteHandler; POST: RouteHandler }>;

/** One set per process (createSignupFunnel makes it once): the limit counts across calls. */
export function createRouteHandlers<User extends FunnelUser>(config: ResolvedFunnelConfig<User>): FunnelRouteHandlers {
  // A screen reports a handful of steps; anything near this is a loop or someone poking.
  const stepLimit = createPublicLimiter({ perSubject: 60, total: 5000, windowMs: TEN_MINUTES });
  const fromBrowser = new Set(config.steps.filter((step) => step.fromBrowser).map((step) => step.key));

  /** GET ?range=30d: what the Sign-up funnel page shows. */
  async function summary(request: Request): Promise<Response> {
    const ctx = await viewerContext(request, config);
    if (ctx instanceof Response) return ctx;
    // Said only to the people who may see the page: what to fix, in the app's code.
    if (config.problem) return apiError('internal', 'not_set_up', 'The sign-up funnel is not set up right, so no step is being kept.', { hint: config.problem });
    const range = new URL(request.url).searchParams.get('range') ?? DEFAULT_FUNNEL_RANGE;
    if (!isFunnelRange(range)) return apiError('invalid_request', 'invalid_parameter', 'Range must be 7d, 30d or 90d.', { param: 'range' });
    try {
      const out = await funnelSummary(ctx.sql, config, range);
      if (!out) {
        return apiError('internal', 'internal_error', 'The accounts could not be looked up right now.', { hint: 'Try again in a minute.' });
      }
      return json(out);
    } catch (error) {
      config.log('[Sign-up funnel] the page did not load', error);
      return unavailable();
    }
  }

  /**
   * POST { step, ok?, reason? }: a step the signed-in person's own screen
   * saw. Only steps the app marked `fromBrowser`. Answers 204 whether or not
   * a row was written (a repeat, or a view-as session, writes none), so a
   * screen never has to care.
   */
  async function step(request: Request): Promise<Response> {
    if (!fromOwnPage(request.headers, config.siteHosts)) {
      return apiError('permission', 'missing_permission', 'This request came from a page we do not trust.');
    }
    let user: User | null;
    try {
      user = await config.signedInUser(request, { fresh: false });
    } catch (error) {
      config.log('[Sign-up funnel] could not check the session', error);
      return unavailable();
    }
    if (!user) return apiError('authentication', 'not_signed_in', 'Sign in first.');
    if (!stepLimit(user.id)) return apiError('rate_limited', 'rate_limited', 'Too many steps at once.', { hint: 'Wait a few minutes.' });

    let body: { step?: unknown; ok?: unknown; reason?: unknown };
    try {
      const parsed: unknown = JSON.parse((await readTextUpTo(request, 2048)) ?? '');
      body = parsed && typeof parsed === 'object' ? (parsed as typeof body) : {};
    } catch {
      return apiError('invalid_request', 'invalid_parameter', 'The request body is not valid JSON.');
    }
    if (typeof body.step !== 'string' || !fromBrowser.has(body.step)) {
      return apiError('invalid_request', 'invalid_parameter', 'This is not a step a page may report.', { param: 'step' });
    }
    // Someone else is looking: their visit is not the customer's step.
    if (user.viewedAs) return noContent();
    try {
      const sql = await config.db();
      if (!sql) return unavailable();
      await insertStep(sql, {
        userId: user.id,
        step: body.step,
        ok: body.ok !== false,
        reason: typeof body.reason === 'string' ? body.reason : null,
        device: reportDevice(request),
      });
      return noContent();
    } catch (error) {
      config.log('[Sign-up funnel] a step was not kept', error);
      return unavailable();
    }
  }

  /** The route under basePath, without slashes at either end: '' is the page's numbers. Null outside basePath. */
  function routeOf(request: Request): string | null {
    const { pathname } = new URL(request.url);
    const base = config.basePath;
    if (base && pathname !== base && !pathname.startsWith(`${base}/`)) return null;
    return pathname.slice(base.length).replace(/^\/+|\/+$/g, '');
  }

  function handler(routes: Readonly<Record<string, RouteHandler>>): RouteHandler {
    return async (request: Request) => {
      try {
        const route = routeOf(request);
        const handle = route === null ? undefined : Object.hasOwn(routes, route) ? routes[route] : undefined;
        return handle ? await handle(request) : notFound();
      } catch (error) {
        // An app hook threw where nothing else caught it: still a plain answer, never a crash.
        config.log('[Sign-up funnel] a request was not answered', error);
        return unavailable();
      }
    };
  }

  return { GET: handler({ '': summary }), POST: handler({ step }) };
}
