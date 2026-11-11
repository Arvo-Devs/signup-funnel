// Vendored from betterfanslink components/ui/skeleton.tsx (main d4138f9): Skeleton, on the package's color names, without SkeletonRows and SkeletonCards.
import { cn } from './cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-muted', className)} aria-hidden />;
}
