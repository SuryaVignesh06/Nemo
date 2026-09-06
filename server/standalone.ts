/**
 * NEMO — standalone API server.
 *
 * `npm run dev` already mounts the backend inside Vite, which is the documented
 * demo path. This entry exists for running the API on its own port (`npm run
 * api`), for smoke tests and for serving a production build behind a separate
 * process.
 *
 * Run with Node 22.6+ (native TypeScript stripping): `node server/standalone.ts`
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { loadEnv } from './env.ts';
import { handleApiRequest } from './app.ts';

const PORT = Number(process.env.PORT ?? 8787);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

loadEnv();

const server = createServer(async (req, res) => {
  // The browser talks to Vite on 5173; allow it to reach this port directly.
  res.setHeader('Access-Control-Allow-Origin', process.env.NEMO_CORS_ORIGIN ?? '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const handled = await handleApiRequest(req, res);
  if (!handled) {
    // Serve static frontend assets from dist/ if built for production
    const distDir = join(ROOT, 'dist');
    let filePath = join(distDir, req.url === '/' ? 'index.html' : req.url ?? '');
    try {
      let content = await readFile(filePath);
      const ext = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html; charset=utf-8',
        '.js': 'application/javascript; charset=utf-8',
        '.css': 'text/css; charset=utf-8',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
        '.woff2': 'font/woff2',
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] ?? 'application/octet-stream' });
      res.end(content);
      return;
    } catch {
      // Fallback to index.html for SPA routing if dist exists
      try {
        const indexHtml = await readFile(join(distDir, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(indexHtml);
        return;
      } catch {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'UNSUPPORTED', message: 'Not found' } }));
      }
    }
  }
});

server.listen(PORT, () => {
  console.log(`[nemo] API listening on http://localhost:${PORT}`);
});
