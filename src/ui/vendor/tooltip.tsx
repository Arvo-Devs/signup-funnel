'use client';

// Vendored from betterfanslink components/ui/tooltip.tsx (main d4138f9): Tip, on the package's color names, without TooltipProvider.
import { Tooltip as BaseTooltip } from '@base-ui/react/tooltip';
import type { ReactElement, ReactNode } from 'react';

/**
 * Supplementary hover text. Never the only place important information
 * lives: tooltips do not open on touch screens.
 */
export function Tip({ content, children, side = 'top' }: { content: ReactNode; children: ReactElement; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger delay={250} render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner side={side} sideOffset={6} className="z-[60]">
          <BaseTooltip.Popup className="max-w-72 origin-[var(--transform-origin)] rounded-md border border-input bg-muted px-2 py-1 text-xs text-foreground shadow-lg transition-[transform,opacity] duration-100 data-[ending-style]:scale-95 data-[ending-style]:opacity-0 data-[starting-style]:scale-95 data-[starting-style]:opacity-0">
            {content}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
