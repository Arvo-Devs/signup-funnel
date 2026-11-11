/**
 * The note a screen sends stays small and never gets in the screen's way:
 * it imports nothing (sign-up screens bring it into their bundle), it is
 * fire and forget, and a browser with no fetch is not an error.
 */
import { afterEach, describe, expect, mock, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { noteStep } from '../src/notes';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('src/notes.ts', () => {
  test('imports nothing', () => {
    const code = readFileSync(new URL('../src/notes.ts', import.meta.url), 'utf8');
    expect(code).not.toMatch(/^\s*import\s/m);
    expect(code).not.toMatch(/\brequire\s*\(|\bimport\s*\(/);
  });

  test('a step that went through: one POST to the step route, kept alive past the page', () => {
    const calls: [string, RequestInit][] = [];
    globalThis.fetch = mock(async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    noteStep('welcome_seen');
    expect(calls).toHaveLength(1);
    expect(calls[0]![0]).toBe('/api/signup-funnel/step');
    expect(calls[0]![1]).toMatchObject({ method: 'POST', keepalive: true, credentials: 'same-origin' });
    expect(JSON.parse(String(calls[0]![1].body))).toEqual({ step: 'welcome_seen' });
  });

  test('a step that went wrong carries what the person was told, cut to length, to the app’s own base path', () => {
    const calls: [string, RequestInit][] = [];
    globalThis.fetch = mock(async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response(null, { status: 204 });
    }) as unknown as typeof fetch;
    noteStep('profile_done', { ok: false, reason: 'That name is taken. '.repeat(40), basePath: '/api/funnel/' });
    expect(calls[0]![0]).toBe('/api/funnel/step');
    const sent = JSON.parse(String(calls[0]![1].body)) as { step: string; ok: boolean; reason: string };
    expect(sent.ok).toBe(false);
    expect(sent.reason).toHaveLength(300);
  });

  test('a failed call, or no fetch at all, never reaches the screen', async () => {
    globalThis.fetch = mock(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(() => noteStep('welcome_seen')).not.toThrow();
    await new Promise((resolve) => setTimeout(resolve, 0));
    globalThis.fetch = undefined as unknown as typeof fetch;
    expect(() => noteStep('welcome_seen')).not.toThrow();
  });
});
