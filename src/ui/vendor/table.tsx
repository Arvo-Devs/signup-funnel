// Vendored from betterfanslink components/ui/table.tsx (main d4138f9): Table, THead, Th, TBody, Tr and Td, on the package's color names, without the next/link RowLink.
import type { ReactNode } from 'react';
import { cn } from './cn';

/**
 * A wide table scrolls inside its own box. The box is positioned so an
 * sr-only heading (absolutely positioned) stays inside it instead of
 * widening the whole page on a phone.
 */
export function Table({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return (
    <div className={cn('relative min-w-0 overflow-x-auto', className)}>
      <table className="w-full border-collapse text-sm" aria-label={label}>
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return (
    <thead className="border-b border-border text-left text-xs font-medium text-muted-foreground/80">
      <tr>{children}</tr>
    </thead>
  );
}

export function Th({ children, className, align }: { children?: ReactNode; className?: string; align?: 'right' | 'center' }) {
  return (
    <th
      scope="col"
      className={cn(
        'h-9 px-3 font-medium whitespace-nowrap first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

/**
 * A row. Safari ignores `position: relative` on a table row, so a stretched
 * link inside would size itself to the page and swallow every click outside
 * the table. The no-op transform makes the row the box it stretches to in
 * every engine.
 */
export function Tr({ children, className, interactive }: { children: ReactNode; className?: string; interactive?: boolean }) {
  return (
    <tr className={cn('group/row relative [transform:translate(0)]', interactive && 'cursor-pointer hover:bg-accent focus-within:bg-accent', className)}>
      {children}
    </tr>
  );
}

export function Td({ children, className, align }: { children?: ReactNode; className?: string; align?: 'right' | 'center' }) {
  return (
    <td
      className={cn(
        'h-12 px-3 align-middle first:pl-4 last:pr-4 sm:first:pl-5 sm:last:pr-5',
        align === 'right' && 'text-right',
        align === 'center' && 'text-center',
        className,
      )}
    >
      {children}
    </td>
  );
}
