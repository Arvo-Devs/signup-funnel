# @arvo/signup-funnel

A Sign-up funnel page for your app's admin panel: of the accounts made in a
stretch of time, how many got to each step on the way to their first real
use, where each one stopped, and the last thing that went wrong for them.
Built like [@arvo/traffic](https://github.com/Arvo-Devs/traffic) and
[@arvo/support-inbox](https://github.com/Arvo-Devs/support-inbox): one
package, installed in each app pinned to a commit, with its page in the app's
Admin section.

**Every app lists its own steps.** One app's road is "confirmed the email,
made a key, sent a first request"; another's is "confirmed the email, voted".
The package knows nothing about either: the app gives it the steps in order,
and the page draws them. The last step in the list is the goal.

**Every app keeps its own rows in its own database.** Nothing goes to a
central server. The package brings the table, the routes, the rules and the
page; the app gives it a database connection, who is signed in, who has Mass
Access, its steps and its accounts.

## What it does

- **Places every new account at the furthest step it has proof for.** Proof
  is either the app's own data (the account has a key, so "Made a key" is
  done) or a step the app reported. A later step proves the earlier ones, so
  the bars only fall and accounts older than the reporting can still be
  placed.
- **Says who went on without a step.** A step marked `fromData` is one the
  app's own data answers, so it is never just assumed: when someone did a
  later step without it (topped up before confirming the email, say), its
  bar says how many went on without it and the stuck list says "Skipped:"
  with the step. They stay placed where their proof puts them.
- **Keeps what went wrong.** A step that failed is kept with one line of why
  ("The link window did not open"). It moves nobody forward, and it shows as
  the last thing that went wrong for that person and in a count of reasons by
  how many people each happened to.
- **Splits phone from computer.** Where the account was made: what the app
  says, else Traffic's sign-up row when the app has @arvo/traffic, else the
  first step reported. A tablet counts as a phone.
- **Lists the people who are stuck**, newest first: who, when, where they
  stopped in the app's own words, what went wrong, where they came from and
  how to reach them when the sign-up asked. A column nobody in the list has
  anything for is left out.
- **Leaves out the accounts the app sets aside** (invited staff, test
  accounts), counted apart so the totals still add up.
- **Side steps ("Also did").** Things people may do on the way that the
  steps after them do not need (liking a post before voting): how many did
  each, and how many of those got to the goal against everyone else. They
  move nobody forward.
- **More than one kind of sign-up.** An app whose fans and advertisers (say)
  sign up for different things gives each kind its own steps, goal and
  accounts, and the page has a switch between them.
- **The Sign-up funnel page**: one sentence that says it all, a bar per step
  with how many dropped off before it, phone against computer, what went
  wrong, the stuck list, and accounts by where they came from.

## Installing

Pin to a **commit SHA** (tags move; the SHA is the pin):

```jsonc
// package.json
"dependencies": {
  "@arvo/signup-funnel": "github:Arvo-Devs/signup-funnel#<full-commit-sha>"
}
```

```ts
// next.config.ts: the package ships TypeScript source, and the app compiles it
transpilePackages: ["@arvo/signup-funnel"],
```

Updating means reading `git diff <old-sha>..<new-sha>` in this repo, moving
the SHA, installing, and committing the lockfile. Install with a frozen
lockfile in builds.

## Requirements

The same as @arvo/traffic, so an app that has Traffic has them all:

- **Next.js (App Router) and React 19**, with **@tanstack/react-query v5**
  around the page (your `QueryClientProvider`). Route handlers are plain
  `(Request) => Response`.
- **Postgres, through a [postgres.js](https://github.com/porsager/postgres)
  client the package can use directly.** Give it a client nothing wraps with
  drizzle: `drizzle(sql)` changes how a shared client reads dates and JSON.
- **Tailwind CSS v4.** Add a source line so Tailwind sees the page's classes:

  ```css
  @source "../node_modules/@arvo/signup-funnel/src";
  ```

## Theming

The page uses the color names @arvo/traffic and @arvo/support-inbox use, the
shadcn way: `background`, `foreground`, `card`, `muted`, `muted-foreground`,
`border`, `input`, `primary`, `primary-foreground`, `accent`, `ring`, and the
`success`/`warning`/`danger` `-strong`, `-soft` and `-border` trios. An app
that already maps these for the Traffic page has nothing to add. Otherwise
import the defaults once:

```css
@import "@arvo/signup-funnel/styles/tokens.css";
```

Adapting to another design system means editing one file, `src/ui/ui-deps.ts`.

## Choosing the steps

Write down what a new account has to do, in order, before it is a real user
of the app, and stop at the first thing that makes it one. That last thing is
the goal. Four to seven steps reads well; a step nobody can fail at is not
worth a bar.

**A step is one the steps after it need.** The page counts a later step as
proof of the earlier ones (nobody votes without a confirmed email, when the
app asks for one), so a step people can skip on the way to the goal makes its
bar wrong. Put those in `sideSteps` instead: on a site where voting needs a
confirmed email but liking a post does not, "Confirmed the email" is a step
and "Liked a post" is a side step. The page then shows how many liked
something and how many of them voted, against everyone else.

```ts
// Side steps take the same keys, labels and fromData / fromBrowser as steps.
export const SIDE_STEPS = [{ key: "liked", label: "Liked, saved or commented", fromData: true }] as const;
```

For each step, decide how the page will know it happened:

| The step | How the page knows |
|---|---|
| Leaves something in the app's own tables (a key, a workspace, a linked account) | The `accounts` hook lists it in `done`. Nothing to report, and it works for accounts made before the package was installed. |
| Happens on the server and leaves nothing behind (the email was confirmed, a link failed) | The app's server calls `recordStep()`. |
| Is only something a screen saw (the welcome page was shown, a button was pressed, a window did not open) | The screen calls `noteStep()`, and the step is marked `fromBrowser`. |

A step can be known both ways. Mark a step the app's own data shows with
`fromData: true`: when every step is marked, no bar depends on reports, and
the page does not say since when they are kept. A `fromData` step is never
assumed from a later one: someone the data says skipped it is counted under
its bar as having gone on without it.

Two steps the goal needs in either order (topping up and confirming the
email, when a campaign needs both) both stay steps: list them in the order
most people take, and the page shows who took the other.

A failure is reported, or read from the app's own data when its tables keep
one (a sign-in link that failed, with the message the person saw): the
accounts hook gives those in `problems`. Either way it moves nobody forward.

```ts
// lib/funnel-steps.ts: an example
export const STEPS = [
  { key: "email_confirmed", label: "Confirmed the email", fromData: true },
  { key: "welcome_seen", label: "Saw the welcome page", fromBrowser: true },
  { key: "key_made", label: "Made a key", stopped: "Made a key, never used it", fromData: true },
  { key: "first_request", label: "Sent a first request", fromData: true }, // the goal
] as const;
```

`key` is what is stored: lower case letters, digits and underscores, at most
40. Never rename a key that has rows; change its `label` instead. `stopped`
is what the stuck list says for someone who got this far and no further
(default: the label, then ", then nothing"). The account being made is always
the first bar, so it is never in the list.

A list that cannot work (no steps, a key used twice, a bad key, a side step
that is also a step) never breaks a sign-up: nothing is kept, the server log says what is wrong in one
sentence, and so does the page. `stepsProblem(STEPS)` answers the same
sentence, or `null`, for a test of your own:

```ts
import { stepsProblem } from "@arvo/signup-funnel";
expect(stepsProblem(STEPS)).toBeNull();
```

## More than one kind of sign-up

Some apps sign up two kinds of people who want different things: fans who
vote and advertisers who pay, or agencies and creators. One list of steps
cannot hold both, so each kind gets its own, under `funnels`, in place of
`steps` and `accounts`:

```ts
createSignupFunnel({
  // db, signedInUser, canView, siteHosts, traffic: as for one kind
  funnels: [
    {
      key: "fans",                  // in the page's address: ?funnel=fans
      label: "Fans",                // on the switch
      description: "Accounts made on the site.",
      steps: FAN_STEPS,
      sideSteps: FAN_SIDE_STEPS,
      accounts: fanAccounts,        // only this kind's accounts
    },
    {
      key: "advertisers",
      label: "Advertisers",
      description: "Accounts that use the advertiser dashboard.",
      steps: ADVERTISER_STEPS,
      accounts: advertiserAccounts,
    },
  ],
});
```

- **The app decides who is which kind.** Each account should be in one
  kind's `accounts` and no other, by a rule the app's own data can answer (a
  flag on the account, where it was made). Say the rule in the kind's
  `description`, so the page says who counts.
- **An account that changes kind** (a fan who later starts advertising) moves
  with the rule. Its sign-up time stays when the account was made: say so in
  the description when it matters.
- **The first kind is the one the page opens on.** Keys go in the address and
  in shared links: never rename one. A link naming a kind that is gone opens
  on the first.
- **Two kinds may share a step key** ("email_confirmed"): it is the same step
  for the same account, kept once in the one table.
- **A second app on the same database** (an advertiser dashboard that signs
  its users up itself) needs nothing installed: read its steps from the
  shared tables in that kind's `accounts` hook. Install the package in the
  one app whose Admin shows the page.
- **Traffic's sign-up rows only cover sign-ups made where Traffic runs.** For
  a kind that signs up somewhere else, give `device` from what the app has
  (the browser of the account's first session, say: `deviceOf(userAgent)`
  answers phone, computer or null), or the page says it is not recorded.
- `funnelsProblem(FUNNELS)` answers what is wrong with the list, or `null`,
  for a test of your own. At most six kinds fit the switch.

## Setting it up

**1. The table.** Copy `migrations/0001_signup_funnel.sql` into your
migrations. It makes `funnel_steps`. Never edit it in place; a later version
adds new files. Until it has run, the page still answers from the app's own
data (nothing reported shows, and the server log says to run it), and
`recordStep` keeps nothing: an app can ship the page before its migration.

**2. One server file.** Lazy, so nothing connects at build time:

```ts
// lib/signup-funnel.server.ts
import { createSignupFunnel, type FunnelAccount } from "@arvo/signup-funnel";
import { STEPS } from "@/lib/funnel-steps";

let cached: ReturnType<typeof createSignupFunnel> | null = null;
export function signupFunnel() {
  cached ??= createSignupFunnel({
    db: siteDb,                    // () => Promise<postgres.Sql | null>; null answers 503
    signedInUser,                  // (request, { fresh }) => Promise<{ id, email?, viewedAs? } | null>
    canView: (user) => hasMassAccess(user), // who may open the page; everyone else gets 404
    steps: STEPS,                  // in order; the last one is the goal
    accounts,                      // the accounts made in a stretch of time, below
    siteHosts: ["example.com", "www.example.com"],
    traffic: true,                 // optional: the app has @arvo/traffic's tables in the same database
  });
  return cached;
}

// The accounts made between two times, newest first, with what the app's own data shows.
async function accounts({ from, to, limit }: { from: Date; to: Date; limit: number }): Promise<FunnelAccount[] | null> {
  const sql = await siteDb();
  if (!sql) return null; // could not look them up: the page says so
  const rows = await sql`
    select u.id, u.created_at, u.name, u.email, u.email_verified, u.invited_by is not null as invited,
           exists (select 1 from api_keys k where k.user_id = u.id) as has_key,
           exists (select 1 from requests r where r.user_id = u.id) as has_request
    from users u
    where u.created_at >= ${from} and u.created_at <= ${to}
    order by u.created_at desc
    limit ${limit}
  `;
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    name: row.name,
    email: row.email,
    done: [row.email_verified && "email_confirmed", row.has_key && "key_made", row.has_request && "first_request"].filter(Boolean),
    setAside: row.invited ? "Invited staff" : null,
  }));
}
```

An account can also carry `kind` ("Agency"), `device` (`"phone"` or
`"computer"`), `source` ("Google Ads") and `contact` ("@handle"), when the app
knows them, and two things its own tables may show:

- `problems`: what went wrong, as `{ step, reason, at }` (a sign-in link
  that failed, with the message the person saw). Counted with the reported
  failures; the newest 20 per account are read.
- `lastSeenAt`: when the app last saw the account (its last sign-in or
  request). The stuck list shows the later of this and the last report.

The full contract is `FunnelConfig` in `src/config.ts`.

**3. One route file.**

```ts
// app/api/signup-funnel/[[...route]]/route.ts
import { signupFunnel } from "@/lib/signup-funnel.server";
export const GET = (request: Request) => signupFunnel().routeHandlers.GET(request);
export const POST = (request: Request) => signupFunnel().routeHandlers.POST(request);
```

**4. Report the steps the app's tables do not show.** From the server, where
the thing happens:

```ts
await signupFunnel().recordStep({ userId: user.id, step: "email_confirmed", request });

// A step that went wrong, with what the person was told:
await signupFunnel().recordStep({ userId: user.id, step: "first_request", ok: false, reason: "The key was not accepted", request });
```

`recordStep` never throws and never slows the thing it reports on by more
than its one insert: a failure is logged and answers `false`. Pass the
person's own `request` when there is one; only "phone, tablet or computer" is
read from it. Pass `viewedAs: true` in a staff member's view-as session and
nothing is kept.

From a screen, for a step marked `fromBrowser`:

```ts
import { noteStep } from "@arvo/signup-funnel/notes";

noteStep("welcome_seen");
noteStep("welcome_seen", { ok: false, reason: "The page did not load" });
```

`noteStep` is fire and forget: a screen never waits for it and never shows an
error for it. It imports nothing, so it adds next to nothing to a sign-up
screen.

A step that went through is kept **once per account**, so reporting it on
every visit is fine. A step that went wrong is kept **once per account and
ten minutes**. For a step that can rightly happen many times (one per link
session, say), give `recordStep` your own `onceKey`.

**5. The page, called Sign-up funnel, in the Admin section** (Mass Access
only), with the app's usual top:

```tsx
import { SignupFunnelRange, SignupFunnelReport } from "@arvo/signup-funnel/client";

<PageHeader title="Sign-up funnel" description="How far new accounts get, and where they stop." actions={<SignupFunnelRange />} />
<SignupFunnelReport />
```

The stretch of time lives in the address (`?range=7d`, `30d` by default,
`90d`). Gate the page the way the app gates its other admin pages; the route
checks `canView` again on every call.

**6. Deleted accounts.** From the app's delete-account code:

```ts
await signupFunnel().forgetAccount(user.id);
```

It removes every step kept for that account and answers how many rows went,
or `null` when it could not be done (try again later).

## Routes

| Route | Who | What |
|---|---|---|
| `GET /api/signup-funnel?range=` | `canView` | The page's numbers (`FunnelSummary`). |
| `POST /api/signup-funnel/step` | Signed in, from the site's own pages | One step a screen saw: `{ step, ok?, reason? }`. 204 and no body. |

Errors come as `{ error: { type, code, message, hint?, param? }, requestId }`,
and every answer is `no-store`. Signed out is 401; without `canView` the page
route is 404, as if it were not there. A page may report only the steps
marked `fromBrowser`, at most 60 in ten minutes per account.

## What it cannot know

- **A step from before the package was installed**, unless the app's own
  data shows it (`done`). The page says since when steps are reported,
  unless every step is marked `fromData`.
- **More than 2,000 accounts in one answer.** A longer stretch keeps the
  newest 2,000 and says so. The stuck list shows the newest 300.
- **Why someone left without an error.** The stuck list says where they
  stopped and when they were last seen; the reason is a conversation.

## Privacy

- A row keeps the account's id, the step, whether it went through, one line
  of why not, and "phone", "tablet" or "computer". No name, no email, no
  address and no user agent.
- Names, emails and `problems` are never stored: the page reads them live
  through `accounts`, so a deleted account is not on it.
- `reason`, reported or in `problems`, is a line the app writes. Write what
  the person was told, never what they typed: no email, password, key or
  token.
- Only people `canView` allows get any of it, the stuck list's contact
  details included.

## Development

```sh
bun install
bun run typecheck
bun test
```

The database tests run when `FUNNEL_TEST_PG_URL` points at a Postgres they
may create databases on, and skip otherwise. CI runs them on every push. The
range control needs the app's router, so it is checked in a real browser, not
in `bun test`.
