'use client';

// Vendored from betterfanslink components/ui/segmented.tsx (main d4138f9): Segmented, on the package's color names, with the pressed outline drawn as a ring.
import { ToggleGroup } from '@base-ui/react/toggle-group';
import { Toggle } from '@base-ui/react/toggle';
import type { ReactNode } from 'react';
import { cn } from './cn';

/** A small single-choice control for ranges and views. */
export function Segmented<V extends string>({
  value,
  onValueChange,
  items,
  label,
  className,
}: {
  value: V;
  onValueChange: (value: V) => void;
  items: { value: V; label: ReactNode }[];
  label: string;
  className?: string;
}) {
  return (
    <ToggleGroup
      value={[value]}
      onValueChange={(next) => {
        const v = next[0] as V | undefined;
        if (v) onValueChange(v);
      }}
      aria-label={label}
      className={cn('inline-flex h-8 shrink-0 items-center gap-0.5 rounded-lg border border-input bg-background p-0.5 max-sm:h-10', className)}
    >
      {items.map((item) => (
        <Toggle
          key={item.value}
          value={item.value}
          className={cn(
            'inline-flex h-full cursor-pointer items-center rounded-md px-2.5 text-xs font-medium whitespace-nowrap text-muted-foreground',
            'outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring',
            'data-[pressed]:bg-card data-[pressed]:text-foreground data-[pressed]:shadow-[0_1px_2px_#0000001f] data-[pressed]:ring-1 data-[pressed]:ring-input',
          )}
        >
          {item.label}
        </Toggle>
      ))}
    </ToggleGroup>
  );
}
