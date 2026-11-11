// Vendored from betterfanslink components/ui/button.tsx (main d4138f9): Button and Spinner, on the package's color names, without the next/link LinkButton.
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from './cn';

export const focusRing = 'outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export const buttonVariants = cva(
  cn(
    'inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg font-medium whitespace-nowrap select-none',
    'transition-[background-color,border-color,color,box-shadow] duration-150',
    'disabled:cursor-not-allowed disabled:opacity-50 aria-disabled:cursor-not-allowed aria-disabled:opacity-50',
    '[&_svg]:size-4 [&_svg]:shrink-0',
    focusRing,
  ),
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-[inset_0_1px_0_#ffffff29,0_1px_2px_#0000002e] hover:bg-primary/90',
        secondary: 'border border-input bg-card text-foreground shadow-[0_1px_2px_#0000000d] hover:bg-accent',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-foreground',
        danger: 'border border-danger-border bg-danger-soft text-danger-strong hover:bg-danger-strong/15',
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-8 px-2.5 text-[13px]',
        md: 'h-9 px-3.5 text-sm',
        lg: 'h-11 px-5 text-[15px]',
        icon: 'size-9',
        'icon-sm': 'size-8',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;

export function Button({ className, variant, size, type = 'button', ...props }: ComponentProps<'button'> & ButtonVariantProps) {
  return <button type={type} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

/** A small spinner for pending buttons. */
export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={cn('size-4 animate-spin', className)} aria-hidden>
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14.5 8A6.5 6.5 0 0 0 8 1.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
