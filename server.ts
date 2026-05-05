/**
 * Custom Next.js server with Socket.IO bound to the same HTTP server.
 *
 * Architecture:
 *   - Single port (default 3000) handles HTTP + WebSocket upgrade
 *   - Socket.IO mounted on path /api/socket (avoids collision with Next routes)
 *   - Graceful shutdown on SIGINT/SIGTERM
 *
 * Run via: `pnpm dev` (uses tsx) or `pnpm start` (uses tsx in NODE_ENV=production)
 */

// IMPORTANT : charger .env avant tout autre import
// (lib/prisma.ts lit DATABASE_URL au top-level — sans ça Postgres reçoit
//  un mot de passe undefined → "SASL: client password must be a string")
import "dotenv/config";

import { createServer } from "node:http";
import { parse } from "node:url";
import next from "next";
import { createSocketServer } from "./server/socket";

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "0.0.0.0";
const port = Number(process.env.PORT || 3000);

async function main() {
  const app = next({ dev, hostname, port });
  const handle = app.getRequestHandler();

  await app.prepare();

  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url || "/", true);
    handle(req, res, parsedUrl);
  });

  // Mount Socket.IO on the same HTTP server
  const io = createSocketServer(httpServer);

  httpServer.listen(port, hostname, () => {
    console.log(`▲ Server ready on http://${hostname}:${port}`);
    console.log(`◆ Socket.IO mounted on /api/socket`);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`[server] received ${signal}, shutting down…`);
    io.close();
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[server] fatal error", err);
  process.exit(1);
});
