-- @arvo/signup-funnel 0001: the steps new accounts take after signing up.
--
-- funnel_steps has one row per step a person reached, or failed at, on the
-- way from a new account to the app's goal (the first thing that makes a
-- sign-up a real user). The app lists its steps in its own config; the
-- package only keeps what was reported.
--
-- A row keeps the account's id, never a name or an email (the page reads
-- those live from the app), and no address or user agent: only whether the
-- report came from a phone, a tablet or a computer. `reason` is one line the
-- app wrote, for a step that went wrong.
--
-- once_key is what keeps a repeat out: a step that went through is kept once
-- per account, a step that went wrong once per account and ten minutes.
-- Never edit this file once applied: a later version adds a new one.
create table if not exists funnel_steps (
  id uuid primary key,
  user_id text not null,
  step text not null,
  ok boolean not null default true,
  reason text,
  device text,
  once_key text not null,
  occurred_at timestamptz not null default now(),
  constraint funnel_steps_step_check check (step ~ '^[a-z][a-z0-9_]{0,39}$'),
  constraint funnel_steps_device_check check (device is null or device in ('phone', 'tablet', 'computer')),
  constraint funnel_steps_reason_check check (reason is null or (ok = false and char_length(reason) between 1 and 300))
);
create unique index if not exists funnel_steps_once_idx on funnel_steps (once_key);
create index if not exists funnel_steps_user_idx on funnel_steps (user_id, occurred_at);
create index if not exists funnel_steps_occurred_idx on funnel_steps (occurred_at);
