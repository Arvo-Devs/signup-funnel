/**
 * What ships to a browser stays out of the server's files. The page and the
 * note are bundled for the browser, so nothing they import, however far down,
 * may be a server file, the database client or a Node built-in: one such
 * import would break the app's build, or worse, ship server code to a
 * browser. The server entry is checked the other way round: it never pulls
 * in React.
 */
import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), '../src');

/** Every module a file asks for at run time: static imports and re-exports, import(), require(). `import type` is erased, so it is left out. */
function specifiers(code: string): string[] {
  const found = new Set<string>();
  for (const match of code.matchAll(/^\s*(?:import|export)\s(?!type\s)[^;]*?\bfrom\s*['"]([^'"]+)['"]/gm)) found.add(match[1]!);
  for (const match of code.matchAll(/^\s*import\s*['"]([^'"]+)['"]/gm)) found.add(match[1]!);
  for (const match of code.matchAll(/\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g)) found.add(match[1]!);
  return [...found];
}

function fileOf(from: string, specifier: string): string {
  const base = resolve(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.ts')]) {
    if (existsSync(candidate) && !candidate.endsWith('/')) {
      try {
        readFileSync(candidate, 'utf8');
        return candidate;
      } catch {
        // A folder: try the next spelling.
      }
    }
  }
  throw new Error(`${relative(SRC, from)} imports ${specifier}, which is not a file`);
}

/** Everything reachable from one entry: the package's own files, and the outside modules they ask for. */
function reach(entry: string): { files: string[]; outside: string[] } {
  const files = new Set<string>();
  const outside = new Set<string>();
  const queue = [join(SRC, entry)];
  while (queue.length > 0) {
    const file = queue.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    for (const specifier of specifiers(readFileSync(file, 'utf8'))) {
      if (specifier.startsWith('.')) queue.push(fileOf(file, specifier));
      else outside.add(specifier);
    }
  }
  return { files: [...files].map((file) => relative(SRC, file)).sort(), outside: [...outside].sort() };
}

/** Every .ts and .tsx file under src. */
function everyFile(dir = SRC): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? everyFile(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [relative(SRC, join(dir, entry.name))] : [],
  );
}

describe('what ships to a browser', () => {
  test('the page: no server file, no database client, no Node built-in', () => {
    const { files, outside } = reach('client.ts');
    expect(files).toContain('client/report.tsx');
    expect(files).toContain('shared/funnel.ts');
    expect(files.filter((file) => file.startsWith('server/') || file === 'index.ts' || file === 'config.ts')).toEqual([]);
    expect(outside.filter((name) => name === 'postgres' || name.startsWith('node:') || name === 'crypto')).toEqual([]);
    // Exactly the outside modules the README lists as needed around the page.
    expect(outside).toEqual(['@base-ui/react/toggle', '@base-ui/react/toggle-group', '@base-ui/react/tooltip', '@tanstack/react-query', 'class-variance-authority', 'clsx', 'lucide-react', 'next/navigation', 'react', 'tailwind-merge']);
  });

  test('the note a screen sends: one file, nothing else', () => {
    expect(reach('notes.ts')).toEqual({ files: ['notes.ts'], outside: [] });
  });

  test('the server entry: no React and none of the page', () => {
    const { files, outside } = reach('index.ts');
    expect(files).toContain('server/routes.ts');
    expect(files.filter((file) => file.startsWith('client') || file.startsWith('ui/'))).toEqual([]);
    expect(outside.filter((name) => name === 'react' || name.startsWith('react-') || name.startsWith('next'))).toEqual([]);
  });

  test('every file a browser gets that uses state or the address says it is a client file', () => {
    const { files } = reach('client.ts');
    for (const file of files) {
      const code = readFileSync(join(SRC, file), 'utf8');
      const needs = /\buse(State|Effect|Query|SearchParams|Router|Pathname|Callback)\s*\(|\bcreateContext\s*[<(]/.test(code);
      if (needs) expect(`${file}: ${/^'use client';/m.test(code)}`).toBe(`${file}: true`);
    }
  });
});

describe('the package’s own files', () => {
  test('every file is used: reached from the server entry, the page or the note', () => {
    const used = new Set(['index.ts', 'client.ts', 'notes.ts'].flatMap((entry) => reach(entry).files));
    expect(everyFile().filter((file) => !used.has(file))).toEqual([]);
  });
});
