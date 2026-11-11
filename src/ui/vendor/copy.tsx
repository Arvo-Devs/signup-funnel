'use client';

// Vendored from betterfanslink components/ui/copy.tsx (main d4138f9): useCopy and CopyButton, on the package's color names, with a failed copy shown on the button instead of a toast.
import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { copyText } from './clipboard';
import { cn } from './cn';

/** What a failed copy says, on the button that was pressed or under the value. */
export const COPY_FAILED = "Couldn't copy. Select the text and copy it manually.";

export function useCopy(timeout = 1600) {
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  const copy = async (value: string, source?: HTMLElement) => {
    if (timer.current) clearTimeout(timer.current);
    setCopied(false);
    setFailed(false);
    const success = await copyText(value, source);
    if (success) setCopied(true);
    else setFailed(true);
    // A failure stays up as long as a toast would, so there is time to read it.
    timer.current = setTimeout(
      () => {
        setCopied(false);
        setFailed(false);
      },
      success ? timeout : 4000,
    );
    return success;
  };
  return { copied, failed, copy };
}

export function CopyButton({
  value,
  label = 'Copy',
  size = 'sm',
  className,
}: {
  value: string;
  label?: string;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  const { copied, failed, copy } = useCopy();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        void copy(value, e.currentTarget);
      }}
      aria-label={copied ? 'Copied' : failed ? "Couldn't copy" : label}
      title={copied ? 'Copied' : failed ? COPY_FAILED : label}
      className={cn(
        'relative inline-grid shrink-0 cursor-pointer place-items-center rounded-md text-muted-foreground/80 transition-colors hover:bg-accent hover:text-foreground',
        'outline-none focus-visible:outline-2 focus-visible:outline-ring',
        'before:absolute before:-inset-1.5 before:content-[""] pointer-coarse:before:-inset-2.5',
        size === 'xs' && 'size-5 [&_svg]:size-3',
        size === 'sm' && 'size-7 [&_svg]:size-3.5',
        size === 'md' && 'size-9 [&_svg]:size-4',
        copied && 'text-success-strong hover:text-success-strong',
        failed && 'text-danger-strong hover:text-danger-strong',
        className,
      )}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      <span className="sr-only" aria-live="polite">
        {copied ? 'Copied' : failed ? COPY_FAILED : ''}
      </span>
    </button>
  );
}
