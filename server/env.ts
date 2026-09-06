/**
 * NEMO — environment loading.
 *
 * One loader, used by every entry point (Vite middleware, the standalone
 * server, the CLI). Before this existed each entry did its own thing and
 * `npm run health` reported "no key configured" on a machine whose .env was
 * perfectly good — the CLI simply never read it.
 *
 * Values already present in process.env always win, so a real environment
 * variable is never shadowed by a checked-in file.
 */

import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

let loaded = false;

/** Walk up from a starting directory looking for a .env. */
function findEnvFile(start: string): string | null {
  let dir = resolve(start);
  for (let i = 0; i < 6; i++) {
    const candidate = join(dir, '.env');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

/**
 * Load .env into process.env exactly once per process.
 *
 * Searched from the working directory first, then from this file's own
 * location, so it works whether the process was started from the repo root or
 * from a subdirectory.
 */
export function loadEnv(): void {
  if (loaded) return;
  loaded = true;

  const here = dirname(fileURLToPath(import.meta.url));
  const path = findEnvFile(process.cwd()) ?? findEnvFile(here);
  if (!path) return;

  try {
    for (const line of readFileSync(path, 'utf8').split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (!(key in process.env)) process.env[key] = value;
    }
  } catch {
    // A missing or unreadable .env is fine: keys can come from the config panel.
  }
}
