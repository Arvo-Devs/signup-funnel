// Answers for the funnel routes, in the error body @arvo/traffic and
// BetterFans Link's dashboard use ({ error: { type, code, message, hint?,
// param? }, requestId }), so a page that shows those errors shows these the
// same way. Every answer is no-store.
import { randomUUID } from 'node:crypto';
import type { FunnelSql, FunnelUser, ResolvedFunnelConfig } from '../config';

type ErrorType = 'invalid_request' | 'authentication' | 'permission' | 'not_found' | 'rate_limited' | 'internal';

const STATUS: Record<ErrorType, number> = {
  invalid_request: 400,
  authentication: 401,
  permission: 403,
  not_found: 404,
  rate_limited: 429,
  internal: 503,
};

export const NO_STORE = { 'cache-control': 'no-store' } as const;

export function json(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function apiError(type: ErrorType, code: string, message: string, extra: { hint?: string; param?: string } = {}): Response {
  const requestId = `req_${randomUUID().replaceAll('-', '').slice(0, 24)}`;
  return Response.json({ error: { type, code, message, ...extra }, requestId }, { status: STATUS[type], headers: NO_STORE });
}

export function noContent(): Response {
  return new Response(null, { status: 204, headers: NO_STORE });
}

/** The app's sign-in, its accounts or the database could not be reached. */
export function unavailable(): Response {
  return apiError('internal', 'internal_error', 'The sign-up funnel is not answering right now.', { hint: 'Try again in a minute.' });
}

export function notFound(): Response {
  return apiError('not_found', 'route_not_found', 'This page does not exist.');
}

/**
 * True when the request came from one of the site's own pages, or names no
 * origin and does not say it is cross-site, as some beacons do. `siteHosts`
 * are host names; the port is not compared.
 */
export function fromOwnPage(headers: Headers, siteHosts: readonly string[]): boolean {
  const origin = headers.get('origin');
  if (!origin) return headers.get('sec-fetch-site') !== 'cross-site';
  let host: string;
  try {
    host = new URL(origin).hostname.toLowerCase();
  } catch {
    return false;
  }
  return siteHosts.includes(host);
}

/** Reads the body up to `max` bytes; null when it is longer. */
export async function readTextUpTo(request: Request, max: number): Promise<string | null> {
  const declared = Number(request.headers.get('content-length') ?? '0');
  if (Number.isFinite(declared) && declared > max) return null;
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) {
      await reader.cancel().catch(() => undefined);
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/**
 * The person who may see the page and the database, or the answer to send
 * instead. Anyone else gets not found, so the page's address says nothing to
 * them.
 */
export async function viewerContext<User extends FunnelUser>(
  request: Request,
  config: ResolvedFunnelConfig<User>,
): Promise<Readonly<{ user: User; sql: FunnelSql }> | Response> {
  let user: User | null;
  try {
    user = await config.signedInUser(request, { fresh: false });
  } catch (error) {
    config.log('[Sign-up funnel] could not check the session', error);
    return unavailable();
  }
  if (!user) return apiError('authentication', 'not_signed_in', 'Sign in to see this page.');
  let allowed: boolean;
  try {
    allowed = await config.canView(user);
  } catch (error) {
    config.log('[Sign-up funnel] could not check who may see the page', error);
    return unavailable();
  }
  if (!allowed) return notFound();
  try {
    const sql = await config.db();
    if (!sql) {
      return apiError('internal', 'internal_error', 'The sign-up funnel has no database yet.', {
        hint: "Give createSignupFunnel a database (db in the config) with the table from the package's migrations folder.",
      });
    }
    return { user, sql };
  } catch (error) {
    config.log('[Sign-up funnel] the database did not answer', error);
    return unavailable();
  }
}
