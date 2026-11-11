// How often one subject (an address, a person, a workspace) may call, and
// how often everyone together may, held in this process. Abuse friction for
// routes anyone can reach, not a quota: a restart forgets it.
//
// The window rolls: a call counts against the limit until windowMs after it
// was let through. With a window that starts over (BetterFans Link's first
// copy), one address could send its whole cap at the end of one window and
// again at the start of the next, twice the cap within a moment.

export type PublicLimitRule = Readonly<{ perSubject: number; total: number; windowMs: number }>;

/** Lets a call through (true) or not. `size()` is how many subjects it holds now. */
export type PublicLimiter = ((subject: string, now?: number) => boolean) & Readonly<{ size: () => number }>;

/** A rolling-window limit per subject and in total. Calls it refuses do not count. */
export function createPublicLimiter(rule: PublicLimitRule): PublicLimiter {
  // Every call let through in the window, oldest first, and how many each subject has.
  const times: number[] = [];
  const subjects: string[] = [];
  let head = 0;
  const bySubject = new Map<string, number>();

  function expire(now: number) {
    const edge = now - rule.windowMs;
    while (head < times.length && times[head] <= edge) {
      const subject = subjects[head];
      const left = (bySubject.get(subject) ?? 1) - 1;
      // A subject is dropped when its last call leaves the window, so memory
      // holds only the last window's callers, never every address ever seen.
      if (left > 0) bySubject.set(subject, left);
      else bySubject.delete(subject);
      head += 1;
    }
    if (head === times.length) {
      times.length = 0;
      subjects.length = 0;
      head = 0;
    } else if (head > 1024 && head * 2 > times.length) {
      times.splice(0, head);
      subjects.splice(0, head);
      head = 0;
    }
  }

  function admit(subject: string, now = Date.now()): boolean {
    expire(now);
    const mine = bySubject.get(subject) ?? 0;
    if (times.length - head >= rule.total || mine >= rule.perSubject) return false;
    times.push(now);
    subjects.push(subject);
    bySubject.set(subject, mine + 1);
    return true;
  }

  return Object.assign(admit, { size: () => bySubject.size });
}
