// Writing a step and reading steps back. One row per step a person reached
// or failed at (migrations/0001_signup_funnel.sql).
//
// What keeps a repeat out is the row's once_key:
//   a step that went through   once per account, ever: reaching it again
//                              says nothing new
//   a step that went wrong     once per account and ten minutes: enough to
//                              see it happened and when, and a bound on what
//                              one account can write
// A caller with a better key (one per link session, say) gives its own.
import { randomUUID } from 'node:crypto';
import type { FunnelSql } from '../config';
import { deviceClass } from '../shared/device';
import type { FunnelSignupFact, FunnelStepRow } from '../shared/funnel';

export const REASON_MAX = 300;
// oxlint-disable-next-line no-control-regex -- removing control characters is the point
const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

/** One line a person can read: no control characters, cut to length. Null when there is nothing to say. */
export function cleanReason(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(CONTROL_CHARACTERS, ' ').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, REASON_MAX) : null;
}

/** Phone, tablet or computer, from the user agent of the request that reported the step. Null when it has none. */
export function reportDevice(request: Request | null | undefined): 'phone' | 'tablet' | 'computer' | null {
  const userAgent = request?.headers.get('user-agent')?.trim();
  return userAgent ? deviceClass(userAgent) : null;
}

export type StepInput = Readonly<{
  userId: string;
  step: string;
  /** False when the step went wrong; `reason` says how. Default true. */
  ok?: boolean;
  reason?: string | null;
  device?: 'phone' | 'tablet' | 'computer' | null;
  /** The same key is the same row. Default: see the top of this file. */
  onceKey?: string;
  at?: Date;
}>;

/** The key a report is kept under. */
export function onceKeyFor(input: StepInput, now: Date): string {
  if (input.onceKey) return `${input.userId}:${input.step}:${input.onceKey}`.slice(0, 300);
  if (input.ok === false) return `${input.userId}:${input.step}:failed:${now.toISOString().slice(0, 15)}`;
  return `${input.userId}:${input.step}`;
}

/** Keeps one step. True when it wrote a row, false when that step was already kept. */
export async function insertStep(sql: FunnelSql, input: StepInput, now: Date = new Date()): Promise<boolean> {
  const failed = input.ok === false;
  const at = input.at ?? now;
  const rows = await sql`
    insert into funnel_steps (id, user_id, step, ok, reason, device, once_key, occurred_at)
    values (
      ${randomUUID()}, ${input.userId}, ${input.step}, ${!failed},
      ${failed ? (cleanReason(input.reason) ?? 'No reason given') : null},
      ${input.device ?? null}, ${onceKeyFor(input, at)}, ${at.toISOString()}
    )
    on conflict (once_key) do nothing
    returning id
  `;
  return rows.length > 0;
}

/** Removes every step kept for one account, for the app's delete-account code. Answers how many rows went. */
export async function forgetSteps(sql: FunnelSql, userId: string): Promise<number> {
  const rows = await sql`delete from funnel_steps where user_id = ${userId} returning id`;
  return rows.length;
}

const CHUNK = 500;

/** Every step kept for these accounts, oldest first. */
export async function stepsFor(sql: FunnelSql, userIds: readonly string[]): Promise<FunnelStepRow[]> {
  const out: FunnelStepRow[] = [];
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const rows = await sql<{ user_id: string; step: string; ok: boolean; reason: string | null; device: string | null; occurred_at: Date | string }[]>`
      select user_id, step, ok, reason, device, occurred_at
      from funnel_steps
      where user_id in ${sql(userIds.slice(i, i + CHUNK))}
      order by occurred_at, id
    `;
    for (const row of rows) {
      out.push({
        userId: row.user_id,
        step: row.step,
        ok: row.ok === true,
        reason: row.reason,
        device: row.device,
        occurredAt: new Date(row.occurred_at).toISOString(),
      });
    }
  }
  return out;
}

/** When the first step was ever kept, or null while the table is empty. */
export async function recordingSince(sql: FunnelSql): Promise<string | null> {
  const [row] = await sql<{ first: Date | string | null }[]>`select min(occurred_at) as first from funnel_steps`;
  return row?.first ? new Date(row.first).toISOString() : null;
}

/**
 * Phone or computer and "came from" for these accounts, from @arvo/traffic's
 * sign-up rows in the same database (config.traffic). Traffic keeps one such
 * row per account, with no address on it.
 */
export async function trafficSignups(sql: FunnelSql, userIds: readonly string[]): Promise<FunnelSignupFact[]> {
  const out: FunnelSignupFact[] = [];
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const rows = await sql<{ user_id: string; device: string | null; source: string | null }[]>`
      select user_id, device, source
      from traffic_visits
      where kind = 'signup' and user_id in ${sql(userIds.slice(i, i + CHUNK))}
    `;
    for (const row of rows) out.push({ userId: row.user_id, device: row.device, source: row.source });
  }
  return out;
}
