import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin, type ViteDevServer } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';

type ApiHandler = (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;

/**
 * Mounts the NEMO backend inside the Vite dev server.
 *
 * This is a real Node backend — it holds the provider keys, calls Z.AI and
 * ElevenLabs, and streams SSE — it just shares a process with the dev server so
 * the demo starts with one command. Loading it through `ssrLoadModule` keeps
 * hot-reload working on the server code too.
 */
function nemoApi(): Plugin {
  return {
    name: 'nemo-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next();
        try {
          const mod = (await server.ssrLoadModule('/server/app.ts')) as {
            handleApiRequest: ApiHandler;
          };
          const handled = await mod.handleApiRequest(req, res);
          if (!handled) next();
        } catch (err) {
          server.ssrFixStacktrace(err as Error);
          console.error('[nemo-api] failed to handle request:', err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'application/json');
          }
          res.end(
            JSON.stringify({
              error: {
                code: 'UNAVAILABLE',
                message: 'The NEMO backend failed to start. Check the terminal running `npm run dev`.',
                details: [],
              },
            })
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), nemoApi()],
  server: {
    port: 5173,
    strictPort: false,
  },
});
