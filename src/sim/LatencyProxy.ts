import { connect, createServer, type Server, type Socket } from 'node:net';
import type { AddressInfo } from 'node:net';

export interface LatencyProfile {
  /** One-way delay added in each direction (ms). */
  latencyMs: number;
  /** Random extra delay 0..jitterMs per chunk; order is preserved like TCP. */
  jitterMs?: number;
}

/**
 * TCP proxy that delays every byte in both directions, so WebSocket frames
 * (including the server's transport pings used for RTT) see real latency.
 * Delivery order is preserved, as on a real TCP connection.
 */
export class LatencyProxy {
  private readonly server: Server;
  private readonly sockets = new Set<Socket>();
  private readonly targetPort: number;
  private readonly targetHost: string;
  private profile: LatencyProfile;

  constructor(targetPort: number, profile: LatencyProfile, targetHost = '127.0.0.1') {
    this.targetPort = targetPort;
    this.targetHost = targetHost;
    this.profile = profile;
    this.server = createServer((client) => this.handle(client));
  }

  /** Change latency on the fly (e.g. to simulate a lag spike). */
  setProfile(profile: LatencyProfile): void {
    this.profile = profile;
  }

  listen(): Promise<number> {
    return new Promise((resolve) => this.server.listen(0, '127.0.0.1', () => resolve((this.server.address() as AddressInfo).port)));
  }

  close(): Promise<void> {
    for (const s of this.sockets) s.destroy();
    return new Promise((resolve) => this.server.close(() => resolve()));
  }

  private handle(client: Socket): void {
    const upstream = connect(this.targetPort, this.targetHost);
    for (const s of [client, upstream]) {
      s.setNoDelay(true);
      this.sockets.add(s);
      s.on('close', () => this.sockets.delete(s));
      s.on('error', () => {
        client.destroy();
        upstream.destroy();
      });
    }
    this.pipe(client, upstream);
    this.pipe(upstream, client);
  }

  /**
   * One FIFO per direction drained by a single timer: separate setTimeouts with
   * close deadlines can fire out of order, which a TCP stream never does.
   */
  private pipe(from: Socket, to: Socket): void {
    const queue: { at: number; chunk: Buffer | null }[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const drain = () => {
      timer = null;
      const now = performance.now();
      while (queue.length && queue[0].at <= now) {
        const { chunk } = queue.shift()!;
        if (to.destroyed) continue;
        if (chunk) to.write(chunk);
        else to.end();
      }
      if (queue.length) timer = setTimeout(drain, Math.max(1, queue[0].at - now));
    };
    const enqueue = (chunk: Buffer | null) => {
      const now = performance.now();
      const delay = this.profile.latencyMs + Math.random() * (this.profile.jitterMs ?? 0);
      const last = queue.at(-1)?.at ?? 0;
      queue.push({ at: Math.max(last, now + delay), chunk });
      if (!timer) timer = setTimeout(drain, Math.max(1, queue[0].at - now));
    };
    from.on('data', (chunk: Buffer) => enqueue(chunk));
    from.on('end', () => enqueue(null));
  }
}
