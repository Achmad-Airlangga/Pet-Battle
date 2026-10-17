import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, resolve, sep } from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';
import { PET_ROSTER } from '../data/petRepository.ts';
import type { ServerMessage } from './protocol.ts';
import type { ClientConnection } from './Room.ts';
import { RoomManager, type RoomManagerOptions } from './RoomManager.ts';

export interface GameServerOptions {
  port?: number;
  host?: string;
  /** WebSocket endpoint path. */
  path?: string;
  manager?: RoomManager;
  managerOptions?: RoomManagerOptions;
  /** Transport ping interval used to measure RTT (default 2s). */
  pingIntervalMs?: number;
  /** Drop a client that has not answered a ping for this long (default 15s). */
  heartbeatMs?: number;
  maxPayloadBytes?: number;
  /** Close a client whose unsent backlog exceeds this (slow consumer). */
  maxBufferedBytes?: number;
  rateLimit?: { capacity: number; refillPerSec: number };
  /** Built web client to serve at "/" (default dist/client); null disables it. */
  staticDir?: string | null;
}

const DEFAULT_STATIC_DIR = resolve(import.meta.dirname, '../../dist/client');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

/** Token bucket: `capacity` burst, refilled continuously. */
class RateLimiter {
  private tokens: number;
  private last = performance.now();
  private readonly capacity: number;
  private readonly refillPerMs: number;

  constructor(capacity: number, refillPerSec: number) {
    this.capacity = capacity;
    this.tokens = capacity;
    this.refillPerMs = refillPerSec / 1000;
  }

  take(): boolean {
    const now = performance.now();
    this.tokens = Math.min(this.capacity, this.tokens + (now - this.last) * this.refillPerMs);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}

let connectionCounter = 0;

class WsConnection implements ClientConnection {
  readonly id = `conn_${++connectionCounter}`;
  readonly ws: WebSocket;
  readonly limiter: RateLimiter;
  lastPongAt = performance.now();
  /** Smoothed round-trip time from transport-level ping/pong (not spoofable by app code). */
  rttMs: number | null = null;
  private readonly maxBufferedBytes: number;

  constructor(ws: WebSocket, limiter: RateLimiter, maxBufferedBytes: number) {
    this.ws = ws;
    this.limiter = limiter;
    this.maxBufferedBytes = maxBufferedBytes;
  }

  send(message: ServerMessage): void {
    if (this.ws.readyState !== WebSocket.OPEN) return;
    if (this.ws.bufferedAmount > this.maxBufferedBytes) {
      this.ws.close(4008, 'Client too slow');
      return;
    }
    this.ws.send(JSON.stringify(message));
  }
}

/**
 * HTTP + WebSocket front door.
 *   ws://host:port/ws   game protocol (see protocol.ts)
 *   GET /health         server stats
 *   GET /pets           full pet roster for lobby / pet picker
 */
export class GameServer {
  readonly http: Server;
  readonly wss: WebSocketServer;
  readonly manager: RoomManager;
  private readonly options: GameServerOptions;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private readonly connections = new Map<WebSocket, WsConnection>();

  constructor(options: GameServerOptions = {}) {
    this.options = options;
    this.manager = options.manager ?? new RoomManager(options.managerOptions);
    this.http = createServer((req, res) => this.handleHttp(req, res));
    this.wss = new WebSocketServer({ server: this.http, path: options.path ?? '/ws', maxPayload: options.maxPayloadBytes ?? 4096 });
    this.wss.on('connection', (ws) => this.handleConnection(ws));
  }

  listen(): Promise<{ port: number }> {
    return new Promise((resolve, reject) => {
      this.http.once('error', reject);
      this.http.listen(this.options.port ?? 8080, this.options.host, () => {
        this.http.off('error', reject);
        this.manager.start();
        this.heartbeat = setInterval(() => this.probe(), this.options.pingIntervalMs ?? 2_000);
        resolve({ port: (this.http.address() as AddressInfo).port });
      });
    });
  }

  async close(): Promise<void> {
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.manager.stop();
    for (const ws of this.wss.clients) ws.terminate();
    await new Promise<void>((resolve) => this.wss.close(() => resolve()));
    await new Promise<void>((resolve, reject) => this.http.close((err) => (err ? reject(err) : resolve())));
  }

  private handleConnection(ws: WebSocket): void {
    const limit = this.options.rateLimit ?? { capacity: 40, refillPerSec: 20 };
    const conn = new WsConnection(ws, new RateLimiter(limit.capacity, limit.refillPerSec), this.options.maxBufferedBytes ?? 1_000_000);
    this.connections.set(ws, conn);
    this.manager.connect(conn);

    ws.on('pong', (data) => {
      const now = performance.now();
      conn.lastPongAt = now;
      const sent = Number(data.toString());
      if (Number.isFinite(sent) && sent > 0 && sent <= now) {
        const sample = now - sent;
        conn.rttMs = conn.rttMs === null ? sample : conn.rttMs * 0.7 + sample * 0.3;
      }
    });
    this.ping(ws);
    ws.on('message', (data, isBinary) => {
      if (!conn.limiter.take()) {
        conn.send({ event: 'ERROR', code: 'RATE_LIMITED', message: 'Too many messages' });
        return;
      }
      if (isBinary) {
        conn.send({ event: 'ERROR', code: 'BAD_MESSAGE', message: 'Binary frames are not supported' });
        return;
      }
      this.manager.handleRaw(conn, data.toString());
    });
    ws.on('close', () => {
      this.connections.delete(ws);
      this.manager.disconnect(conn);
    });
    ws.on('error', () => ws.terminate());
  }

  /** Measures RTT and drops clients that stopped answering. */
  private probe(): void {
    const timeout = this.options.heartbeatMs ?? 15_000;
    for (const [ws, conn] of this.connections) {
      if (performance.now() - conn.lastPongAt > timeout) ws.terminate();
      else this.ping(ws);
    }
  }

  private ping(ws: WebSocket): void {
    if (ws.readyState === WebSocket.OPEN) ws.ping(String(performance.now()));
  }

  private handleHttp(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const json = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
      res.end(JSON.stringify(body));
    };
    if (req.method !== 'GET') return json(405, { error: 'Method not allowed' });
    if (url.pathname === '/health') return json(200, { ok: true, ...this.manager.stats() });
    if (url.pathname === '/pets') return json(200, { count: PET_ROSTER.length, pets: PET_ROSTER });
    if (this.serveStatic(url.pathname, res)) return;
    json(404, { error: 'Not found' });
  }

  /** Serves the built client; unknown paths without an extension fall back to index.html. */
  private serveStatic(pathname: string, res: ServerResponse): boolean {
    const root = this.options.staticDir === undefined ? DEFAULT_STATIC_DIR : this.options.staticDir;
    if (!root || !existsSync(root)) return false;
    let file: string;
    try {
      file = resolve(join(root, decodeURIComponent(pathname)));
    } catch {
      return false;
    }
    if (file !== root && !file.startsWith(root + sep)) return false; // path traversal
    if (!existsSync(file) || statSync(file).isDirectory()) {
      if (extname(pathname)) return false;
      file = join(root, 'index.html');
      if (!existsSync(file)) return false;
    }
    const type = CONTENT_TYPES[extname(file)] ?? 'application/octet-stream';
    const cache = file.includes(`${sep}assets${sep}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
    res.writeHead(200, { 'content-type': type, 'cache-control': cache });
    res.end(readFileSync(file));
    return true;
  }
}
