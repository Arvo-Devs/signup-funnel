'use client';

// The stretch of time the page shows, kept in the address as ?range= so a
// view can be shared and survives a reload. 30 days is the default and is
// left out of the address. SignupFunnelRange goes in the app's page header;
// SignupFunnelReport reads the same param.
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { DEFAULT_FUNNEL_RANGE, FUNNEL_RANGE_LABELS, FUNNEL_RANGES, type FunnelRange } from '../shared/funnel';
import { pickParam, Segmented, useUrlParams } from '../ui/ui-deps';

const ITEMS = FUNNEL_RANGES.map((value) => ({ value, label: FUNNEL_RANGE_LABELS[value] }));

/** The range in the address, or 30 days when it names none we know. */
export function useFunnelRange(): FunnelRange {
  const params = useSearchParams();
  return pickParam(params?.get('range') ?? null, FUNNEL_RANGES, DEFAULT_FUNNEL_RANGE);
}

/** The range control for the app's page header: accounts made in the last 7, 30 or 90 days. */
export function SignupFunnelRange() {
  // Reading the address needs a Suspense boundary when the page is prerendered.
  return (
    <Suspense fallback={null}>
      <RangeControl />
    </Suspense>
  );
}

function RangeControl() {
  const { params, set } = useUrlParams();
  const range = pickParam(params.get('range'), FUNNEL_RANGES, DEFAULT_FUNNEL_RANGE);
  return <Segmented label="Accounts made in the last" value={range} onValueChange={(v) => set({ range: v === DEFAULT_FUNNEL_RANGE ? null : v })} items={ITEMS} />;
}
