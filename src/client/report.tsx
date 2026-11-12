'use client';

// The Sign-up funnel page's body: how far the accounts made in a stretch of
// time got on the way to the app's goal, phone against computer, what else
// they did, what went wrong, where they came from, and the people who are
// stuck with where each one stopped. The app gives it the usual page header
// with <SignupFunnelRange /> on the right. An app with more than one kind of
// sign-up gets a switch between them at the top.
//
// Every number and every word about a step comes from the server (the app's
// own step labels), so this file knows nothing about any one app.
import { Monitor, Smartphone, Users } from 'lucide-react';
import { Suspense, useState } from 'react';
import { FUNNEL_RANGE_LABELS, MADE_KEY, type FunnelDevice, type FunnelPerson, type FunnelSideStep, type FunnelSummary } from '../shared/funnel';
import {
  Button,
  Card,
  CardBody,
  CardHeader,
  cn,
  EmptyState,
  ErrorState,
  formatDate,
  formatNumber,
  plural,
  RelativeTime,
  Segmented,
  Skeleton,
  Table,
  TBody,
  Td,
  Th,
  THead,
  Tr,
} from '../ui/ui-deps';
import { useFunnelSummary } from './api';
import { FunnelProvider } from './context';
import { useFunnelKind, useFunnelRange } from './range';

/** Stuck people shown at first, and added by "Show more". */
const PAGE = 25;

export type SignupFunnelReportProps = {
  /** Where the app mounted the funnel routes. Default /api/signup-funnel. */
  basePath?: string;
};

export function SignupFunnelReport({ basePath }: SignupFunnelReportProps = {}) {
  return (
    <FunnelProvider basePath={basePath}>
      {/* Reading the range from the address needs a Suspense boundary when the page is prerendered. */}
      <Suspense fallback={<SignupFunnelSkeleton />}>
        <Report />
      </Suspense>
    </FunnelProvider>
  );
}

export function SignupFunnelSkeleton() {
  return (
    <div className="grid gap-4 lg:grid-cols-5" aria-busy="true">
      <Card className="lg:col-span-3">
        <CardBody className="space-y-3 pt-4 sm:pt-5">
          {[0, 1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </CardBody>
      </Card>
      <Card className="lg:col-span-2">
        <CardBody className="space-y-3 pt-4 sm:pt-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </CardBody>
      </Card>
    </div>
  );
}

function Report() {
  const range = useFunnelRange();
  const kind = useFunnelKind();
  const { data, error, isPending, refetch, isFetching } = useFunnelSummary(range, kind);
  if (isPending) return <SignupFunnelSkeleton />;
  const failed = error ? (
    <Card>
      <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} />
    </Card>
  ) : null;
  if (!data) return failed;
  // The kind asked for when the app has it, else its first. Another kind's numbers still up while this one loads are never shown as this one's.
  const wanted = kind && data.funnels.some((funnel) => funnel.key === kind) ? kind : (data.funnels[0]?.key ?? data.funnel.key);
  const switching = data.funnel.key !== wanted;
  const stretch = `the last ${FUNNEL_RANGE_LABELS[data.range]}`;
  return (
    <div className="space-y-4">
      {data.funnels.length > 1 ? <KindSwitch data={data} value={wanted} description={switching ? null : data.funnel.description} /> : null}
      {switching ? (
        (failed ?? <SignupFunnelSkeleton />)
      ) : data.accounts === 0 ? (
        <Card>
          <EmptyState icon={Users} title={`No accounts were made in ${stretch}`}>
            Pick a longer stretch with the control at the top of the page.
          </EmptyState>
        </Card>
      ) : (
        <ReportBody data={data} stretch={stretch} />
      )}
    </div>
  );
}

/**
 * Moves the page to another kind of sign-up, kept in the address as
 * ?funnel= (the first kind is left out). Next follows the browser's own
 * history calls, so the page reads the new kind without its router, which
 * keeps the report drawable outside an app (its tests). The state must be
 * null: Next ignores a call that passes its own history state back.
 */
function showKind(next: string | null) {
  const url = new URL(window.location.href);
  if (next) url.searchParams.set('funnel', next);
  else url.searchParams.delete('funnel');
  window.history.replaceState(null, '', url);
}

function KindSwitch({ data, value, description }: { data: FunnelSummary; value: string; description: string | null }) {
  const first = data.funnels[0]?.key;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <Segmented
        label="Kind of sign-up"
        value={value}
        onValueChange={(next) => showKind(next === first ? null : next)}
        items={data.funnels.map((funnel) => ({ value: funnel.key, label: funnel.label }))}
      />
      {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function ReportBody({ data, stretch }: { data: FunnelSummary; stretch: string }) {
  // The app's own reasons, as it wrote them: one reason stands alone, several each carry their count.
  const asideTotal = data.setAside.reduce((sum, row) => sum + row.count, 0);
  const aside = data.setAside.length === 1 ? data.setAside[0]!.reason : data.setAside.map((row) => `${row.reason} ${formatNumber(row.count)}`).join(', ');
  const top = data.bars[0]?.count ?? 0;
  // Steps reported before the package was installed do not exist: say since when, unless the app's own data shows every step.
  const late = data.recordingSince && Date.parse(data.recordingSince) > Date.parse(data.from) ? data.recordingSince : null;
  const sinceNote = data.needsReports && (late || !data.recordingSince);
  // Accounts with no phone or computer on record: an app with no Traffic and nothing of its own to say.
  const notRecorded = Math.max(0, data.counted - data.devices.reduce((sum, row) => sum + row.accounts, 0));
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        {plural(data.accounts, 'account')} made in {stretch}
        {asideTotal > 0 ? `, ${formatNumber(asideTotal)} set aside (${aside})` : ''}. {formatNumber(data.reachedGoal)} of {formatNumber(data.counted)} got as far as “{data.goal.label}”.
        {data.truncated ? ' Only the newest 2,000 accounts were read: pick a shorter stretch.' : ''}
      </p>

      <div className="grid items-start gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <CardHeader title="Every step" description="How many accounts got this far, and how many dropped off before it." />
          <CardBody className="space-y-3">
            {data.bars.map((bar) => (
              <div key={bar.key}>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[13px]">
                  <span className="font-medium text-foreground">{bar.label}</span>
                  {bar.dropped > 0 ? <span className="font-semibold text-danger-strong">{formatNumber(bar.dropped)} dropped off</span> : null}
                  {bar.skipped > 0 ? <span className="text-xs text-warning-strong">{formatNumber(bar.skipped)} went on without it</span> : null}
                </div>
                <div className="mt-1 flex h-7 items-center rounded-md bg-background">
                  {bar.count > 0 ? (
                    <div
                      className={cn(
                        'flex h-7 min-w-10 items-center rounded-md px-2 text-[13px] font-semibold tabular-nums',
                        bar.key === data.goal.key ? 'border border-success-border bg-success-soft text-success-strong' : 'bg-primary text-primary-foreground',
                      )}
                      style={{ width: `${top > 0 ? Math.max(4, Math.round((bar.count / top) * 100)) : 0}%` }}
                    >
                      {formatNumber(bar.count)}
                    </div>
                  ) : (
                    <span className="px-2 text-[13px] font-semibold text-muted-foreground tabular-nums">0</span>
                  )}
                </div>
              </div>
            ))}
            {sinceNote ? (
              <p className="text-xs leading-relaxed text-muted-foreground/80">
                {late ? `Steps are reported since ${formatDate(late)}.` : 'No step has been reported yet.'} Accounts from before that are placed by what the app’s own data shows.
              </p>
            ) : null}
          </CardBody>
        </Card>

        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Phone or computer" description={`Where the account was made, and how many got as far as “${data.goal.label}”.`} />
            <CardBody className="space-y-4">
              {notRecorded === data.counted ? (
                <p className="text-[13px] text-muted-foreground">Not recorded for these accounts.</p>
              ) : null}
              {notRecorded === data.counted ? null : data.devices.map((row) => {
                const share = row.accounts > 0 ? Math.round((row.reachedGoal / row.accounts) * 100) : null;
                const Icon = row.device === 'phone' ? Smartphone : Monitor;
                return (
                  <div key={row.device}>
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
                      <span className="flex items-center gap-2 font-medium text-foreground">
                        <Icon className="size-4 text-muted-foreground" aria-hidden />
                        {row.device === 'phone' ? 'On a phone' : 'On a computer'}
                      </span>
                      <span className="text-muted-foreground tabular-nums">
                        {formatNumber(row.reachedGoal)} of {formatNumber(row.accounts)}
                        {share !== null ? ` · ${share}%` : ''}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 rounded-full bg-background">
                      <div className="h-2 rounded-full bg-success-strong" style={{ width: `${share ?? 0}%` }} />
                    </div>
                  </div>
                );
              })}
              {notRecorded > 0 && notRecorded < data.counted ? (
                <p className="text-xs text-muted-foreground/80">Not recorded for {plural(notRecorded, 'account')}.</p>
              ) : null}
            </CardBody>
          </Card>

          {data.sideSteps.length > 0 ? <AlsoDidCard data={data} /> : null}

          <Card>
            <CardHeader title="What went wrong" description="The reasons a step failed, by how many people it happened to." />
            <CardBody>
              {data.problems.length === 0 ? (
                <p className="text-[13px] text-muted-foreground">Nothing went wrong that the app knows of.</p>
              ) : (
                <ul className="space-y-2">
                  {data.problems.map((row) => (
                    <li key={`${row.step}:${row.reason}`} className="flex items-baseline gap-2.5 text-[13px]">
                      <span className="w-7 shrink-0 text-right font-semibold text-foreground tabular-nums">{formatNumber(row.people)}</span>
                      <span className="min-w-0">
                        <span className="break-words text-foreground">{row.reason}</span>
                        <span className="block text-xs text-muted-foreground/80">{row.label}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>

      <StuckCard data={data} />

      {data.sources.length > 0 ? (
        <Card>
          <CardHeader title="By where they came from" description={`Accounts that came with a source, and how many got as far as “${data.goal.label}”.`} />
          <CardBody>
            <Table label="Accounts by where they came from">
              <THead>
                <Th>Came from</Th>
                <Th align="right">Accounts</Th>
                <Th align="right">{data.goal.label}</Th>
              </THead>
              <TBody>
                {data.sources.map((row) => (
                  <Tr key={row.source}>
                    <Td className="break-words text-foreground">{row.source}</Td>
                    <Td align="right" className="tabular-nums">
                      {formatNumber(row.accounts)}
                    </Td>
                    <Td align="right" className="tabular-nums">
                      {formatNumber(row.reachedGoal)}
                    </Td>
                  </Tr>
                ))}
              </TBody>
            </Table>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}

/** How many of a group got to the goal, as a share, or null for an empty group. */
const shareOf = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);

/** Things done on the way that are not steps: how many did each, and how they did against everyone else. */
function AlsoDidCard({ data }: { data: FunnelSummary }) {
  return (
    <Card>
      <CardHeader title="Also did" description={`Not steps, so nobody needs them. How many got as far as “${data.goal.label}” when they did, and when they did not.`} />
      <CardBody className="space-y-4">
        {data.sideSteps.map((side) => (
          <SideStepRow key={side.key} side={side} data={data} />
        ))}
      </CardBody>
    </Card>
  );
}

function SideStepRow({ side, data }: { side: FunnelSideStep; data: FunnelSummary }) {
  const rest = { accounts: data.counted - side.accounts, reachedGoal: data.reachedGoal - side.reachedGoal };
  const lines = [
    { name: 'Did it', ...side },
    { name: 'Did not', ...rest },
  ];
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[13px]">
        <span className="font-medium text-foreground">{side.label}</span>
        <span className="text-muted-foreground tabular-nums">{plural(side.accounts, 'account')}</span>
      </div>
      <div className="mt-1.5 space-y-1">
        {lines.map((line) => {
          const share = shareOf(line.reachedGoal, line.accounts);
          return (
            <div key={line.name} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-xs">
              <span className="text-muted-foreground">{line.name}</span>
              <div className="h-2 rounded-full bg-background">
                <div className={cn('h-2 rounded-full', line.name === 'Did it' ? 'bg-success-strong' : 'bg-muted-foreground/40')} style={{ width: `${share ?? 0}%` }} />
              </div>
              <span className="text-muted-foreground tabular-nums">
                {formatNumber(line.reachedGoal)} of {formatNumber(line.accounts)}
                {share !== null ? ` · ${share}%` : ''}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const DEVICE_ITEMS: { value: FunnelDevice | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'phone', label: 'Phone' },
  { value: 'computer', label: 'Computer' },
];

const DEVICE_WORDS: Record<FunnelDevice, string> = { phone: 'Phone', computer: 'Computer', unknown: 'Not recorded' };

function StuckCard({ data }: { data: FunnelSummary }) {
  const [device, setDevice] = useState<FunnelDevice | 'all'>('all');
  const [shown, setShown] = useState(PAGE);
  const people = data.stuck.filter((p) => device === 'all' || p.device === device);
  // An app whose sign-up asks for no handle has nothing for Reach them, and a kind of sign-up no source is known for has nothing for
  // Came from: an empty column is left out, and its room goes to what went wrong.
  const reach = data.stuck.some((p) => p.contact);
  const came = data.stuck.some((p) => p.source);
  const wrongWidth = reach && came ? 'w-[20%]' : reach || came ? 'w-[30%]' : 'w-[45%]';
  return (
    <Card>
      <CardHeader
        title="Stuck sign-ups"
        description={`${plural(data.stuckTotal, 'account')} not yet at “${data.goal.label}”, newest first.`}
        action={
          <Segmented
            label="Where the account was made"
            value={device}
            onValueChange={(next) => {
              setDevice(next);
              setShown(PAGE);
            }}
            items={DEVICE_ITEMS}
          />
        }
      />
      {/* The card's own width decides, not the screen's: an app's side bar takes room a phone does not have. */}
      <CardBody className="@container space-y-3">
        {people.length === 0 ? (
          <p className="text-[13px] text-muted-foreground">
            {data.stuckTotal === 0 ? `Every account made in this stretch got as far as “${data.goal.label}”.` : 'Nobody stuck on this kind of device.'}
          </p>
        ) : (
          <>
            {/* Six columns need about 900px. Under that, each person is a short block, two across when they fit. */}
            <ul data-stuck="list" aria-label="Stuck sign-ups" className="grid gap-x-8 @2xl:grid-cols-2 @4xl:hidden">
              {people.slice(0, shown).map((person) => (
                <StuckItem key={person.id} person={person} />
              ))}
            </ul>
            <Table label="Stuck sign-ups" className="hidden @4xl:block">
              <THead>
                {/* Shares of the width, so the room goes to the columns with sentences in them; the least each needs adds up to under 900px. */}
                <Th className="w-[22%] min-w-40">Who</Th>
                <Th className="w-[10%] min-w-26">Signed up</Th>
                <Th className="w-[23%] min-w-58">Stopped at</Th>
                <Th className={cn(wrongWidth, 'min-w-44')}>What went wrong</Th>
                {came ? <Th className={reach ? 'w-[10%] min-w-26' : 'w-[15%] min-w-26'}>Came from</Th> : null}
                {reach ? <Th className="w-[15%] min-w-30">Reach them</Th> : null}
              </THead>
              <TBody>
                {people.slice(0, shown).map((person) => (
                  <StuckRow key={person.id} person={person} reach={reach} came={came} />
                ))}
              </TBody>
            </Table>
          </>
        )}
        {people.length > shown ? (
          <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + PAGE)}>
            Show {Math.min(PAGE, people.length - shown)} more
          </Button>
        ) : null}
        {data.stuckTotal > data.stuck.length && device === 'all' ? (
          <p className="text-xs text-muted-foreground/80">Showing the newest {formatNumber(data.stuck.length)}. Pick a shorter stretch to see the rest.</p>
        ) : null}
      </CardBody>
    </Card>
  );
}

function Who({ person }: { person: FunnelPerson }) {
  return (
    <>
      {/* overflow-wrap: anywhere, not break-words: a long email with no spaces must not set the least width its column can have. */}
      <div className="font-medium [overflow-wrap:anywhere] text-foreground">
        {person.name ?? person.email ?? 'Account removed'}
        {person.kind ? (
          <>
            {' '}
            <span className="ml-1 rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap text-muted-foreground">{person.kind}</span>
          </>
        ) : null}
      </div>
      {person.name && person.email ? <div className="text-xs break-all text-muted-foreground/80">{person.email}</div> : null}
    </>
  );
}

function Stopped({ person }: { person: FunnelPerson }) {
  // Stopped right at the start reads as an early stop; anything after it, as someone who was trying.
  const early = person.reached === MADE_KEY;
  return (
    <span className={cn('inline-block rounded-md px-2 py-0.5 text-xs font-semibold', early ? 'bg-danger-soft text-danger-strong' : 'bg-warning-soft text-warning-strong')}>
      {person.stopped}
    </span>
  );
}

/** The steps they went on without: what stopped them may be one of these, not the next one. */
function Skipped({ person }: { person: FunnelPerson }) {
  if (person.skipped.length === 0) return null;
  return <div className="mt-1 text-xs font-medium text-warning-strong">Skipped: {person.skipped.join(', ')}</div>;
}

function StuckRow({ person, reach, came }: { person: FunnelPerson; reach: boolean; came: boolean }) {
  return (
    <Tr className="align-top">
      <Td>
        <Who person={person} />
      </Td>
      <Td>
        <div className="whitespace-nowrap text-foreground">{formatDate(person.createdAt)}</div>
        <div className="text-xs whitespace-nowrap text-muted-foreground/80">{DEVICE_WORDS[person.device]}</div>
      </Td>
      <Td>
        <Stopped person={person} />
        <Skipped person={person} />
        {person.lastSeenAt ? (
          <div className="mt-1 text-xs text-muted-foreground/80">
            Last seen <RelativeTime iso={person.lastSeenAt} />
          </div>
        ) : null}
      </Td>
      <Td>
        {/* The reason and when, without its step's label: "Linked an account" above a failure reads as if it worked. */}
        {person.problem ? (
          <>
            <div className="[overflow-wrap:anywhere] text-foreground">{person.problem.reason ?? 'No reason given'}</div>
            <div className="text-xs text-muted-foreground/80">
              <RelativeTime iso={person.problem.at} />
            </div>
          </>
        ) : null}
      </Td>
      {/* An empty cell stays empty: no dash, which some apps' copy rules forbid, and the rows where something went wrong stand out. */}
      {came ? <Td className="[overflow-wrap:anywhere]">{person.source}</Td> : null}
      {reach ? <Td className="[overflow-wrap:anywhere]">{person.contact}</Td> : null}
    </Tr>
  );
}

/** The same person as a short block, for where the table has no room: nothing is left out, only what is empty. */
function StuckItem({ person }: { person: FunnelPerson }) {
  return (
    <li className="min-w-0 border-b border-border py-3 text-[13px]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Who person={person} />
        </div>
        <div className="shrink-0 text-right text-xs text-muted-foreground/80">
          <div className="whitespace-nowrap text-foreground">{formatDate(person.createdAt)}</div>
          {DEVICE_WORDS[person.device]}
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1">
        <Stopped person={person} />
        {person.lastSeenAt ? (
          <span className="text-xs text-muted-foreground/80">
            Last seen <RelativeTime iso={person.lastSeenAt} />
          </span>
        ) : null}
      </div>
      <Skipped person={person} />
      {person.problem ? (
        <p className="mt-2 [overflow-wrap:anywhere] text-muted-foreground">
          <span className="font-medium text-foreground">Went wrong:</span> {person.problem.reason ?? 'No reason given'}{' '}
          <span className="text-xs text-muted-foreground/80">
            (<RelativeTime iso={person.problem.at} />)
          </span>
        </p>
      ) : null}
      {person.source || person.contact ? (
        <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-0.5 text-xs [overflow-wrap:anywhere] text-muted-foreground">
          {person.source ? <span>Came from {person.source}</span> : null}
          {person.contact ? <span>Reach them: {person.contact}</span> : null}
        </p>
      ) : null}
    </li>
  );
}
