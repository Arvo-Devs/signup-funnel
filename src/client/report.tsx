'use client';

// The Sign-up funnel page's body: how far the accounts made in a stretch of
// time got on the way to the app's goal, phone against computer, what went
// wrong, where they came from, and the people who are stuck with where each
// one stopped. The app gives it the usual page header with
// <SignupFunnelRange /> on the right.
//
// Every number and every word about a step comes from the server (the app's
// own step labels), so this file knows nothing about any one app.
import { Monitor, Smartphone, Users } from 'lucide-react';
import { Suspense, useState } from 'react';
import { FUNNEL_RANGE_LABELS, MADE_KEY, type FunnelDevice, type FunnelPerson, type FunnelSummary } from '../shared/funnel';
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
import { useFunnelRange } from './range';

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
  const { data, error, isPending, refetch, isFetching } = useFunnelSummary(range);
  if (isPending) return <SignupFunnelSkeleton />;
  if (error && !data) {
    return (
      <Card>
        <ErrorState error={error} onRetry={() => void refetch()} retrying={isFetching} />
      </Card>
    );
  }
  if (!data) return null;
  const stretch = `the last ${FUNNEL_RANGE_LABELS[data.range]}`;
  if (data.accounts === 0) {
    return (
      <Card>
        <EmptyState icon={Users} title={`No accounts were made in ${stretch}`}>
          Pick a longer stretch with the control at the top of the page.
        </EmptyState>
      </Card>
    );
  }
  return <ReportBody data={data} stretch={stretch} />;
}

function ReportBody({ data, stretch }: { data: FunnelSummary; stretch: string }) {
  // The app's own reasons, as it wrote them: one reason stands alone, several each carry their count.
  const asideTotal = data.setAside.reduce((sum, row) => sum + row.count, 0);
  const aside = data.setAside.length === 1 ? data.setAside[0]!.reason : data.setAside.map((row) => `${row.reason} ${formatNumber(row.count)}`).join(', ');
  const top = data.bars[0]?.count ?? 0;
  // Steps reported before the package was installed do not exist: say since when, unless the app's own data shows every step.
  const late = data.recordingSince && Date.parse(data.recordingSince) > Date.parse(data.from) ? data.recordingSince : null;
  const sinceNote = data.needsReports && (late || !data.recordingSince);
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
              {data.devices.map((row) => {
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
            </CardBody>
          </Card>

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
                <Th className="w-[20%] min-w-44">What went wrong</Th>
                <Th className="w-[10%] min-w-26">Came from</Th>
                <Th className="w-[15%] min-w-30">Reach them</Th>
              </THead>
              <TBody>
                {people.slice(0, shown).map((person) => (
                  <StuckRow key={person.id} person={person} />
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

function StuckRow({ person }: { person: FunnelPerson }) {
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
        {person.lastSeenAt ? (
          <div className="mt-1 text-xs text-muted-foreground/80">
            Last seen <RelativeTime iso={person.lastSeenAt} />
          </div>
        ) : null}
      </Td>
      <Td>
        {person.problem ? (
          <>
            <div className="font-medium text-foreground">{person.problem.label}</div>
            {person.problem.reason ? <div className="[overflow-wrap:anywhere] text-muted-foreground">{person.problem.reason}</div> : null}
            <div className="text-xs text-muted-foreground/80">
              <RelativeTime iso={person.problem.at} />
            </div>
          </>
        ) : (
          <span className="text-muted-foreground/80">Nothing reported</span>
        )}
      </Td>
      <Td className="[overflow-wrap:anywhere]">{person.source ?? <span className="text-muted-foreground/80">—</span>}</Td>
      <Td className="[overflow-wrap:anywhere]">{person.contact ?? <span className="text-muted-foreground/80">—</span>}</Td>
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
      {person.problem ? (
        <p className="mt-2 [overflow-wrap:anywhere] text-muted-foreground">
          <span className="font-medium text-foreground">{person.problem.label}:</span> {person.problem.reason ?? 'No reason given'}{' '}
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
