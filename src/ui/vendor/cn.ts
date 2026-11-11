// Vendored from betterfanslink lib/cn.ts (main d4138f9), unchanged.
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * The class helper. Every conditional or merged className goes through cn().
 * Never concatenate class strings by hand; tailwind-merge resolves conflicts
 * (so "p-2 p-4" becomes "p-4") and clsx handles the conditionals.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
