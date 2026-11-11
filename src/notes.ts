// What a screen tells the funnel routes: the signed-in person reached a step
// here, or it went wrong. Fire and forget, so a screen never waits for it and
// never shows an error for it. Screens import this file, so it has no React
// and nothing else: it must not pull the page into a sign-up screen's bundle.

/** Where the funnel routes are mounted unless the app says otherwise. */
export const FUNNEL_BASE_PATH = '/api/signup-funnel';

export type StepNote = Readonly<{
  /** False when the step went wrong. Default true. */
  ok?: boolean;
  /** For a step that went wrong: what the person was told, in one line. */
  reason?: string;
  /** Where the app mounted the routes. Default /api/signup-funnel. */
  basePath?: string;
}>;

/**
 * Tells the Sign-up funnel page the signed-in person reached a step (one the
 * app marked `fromBrowser`). The server keeps a step that went through once
 * per account, so calling it on every visit is fine.
 */
export function noteStep(step: string, note: StepNote = {}): void {
  const base = (note.basePath ?? FUNNEL_BASE_PATH).replace(/\/+$/, '');
  try {
    void fetch(`${base}/step`, {
      method: 'POST',
      keepalive: true,
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ step, ...(note.ok === false ? { ok: false } : {}), ...(note.reason ? { reason: note.reason.slice(0, 300) } : {}) }),
    }).catch(() => undefined);
  } catch {
    // No fetch here (an old browser, a test): the step is simply not reported.
  }
}
