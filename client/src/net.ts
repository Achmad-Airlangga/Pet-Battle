import type { ClientMessage, ServerMessage } from './types.ts';

export type NetStatus = 'connecting' | 'open' | 'closed';
type Handler = (message: ServerMessage) => void;

/**
 * WebSocket wrapper with automatic reconnect (exponential backoff) and an RTT
 * probe. Messages sent while disconnected are dropped on purpose: stale game
 * input must never be replayed after a reconnect.
 */
export class Net {
  status: NetStatus = 'closed';
  rttMs: number | null = null;
  /** server_time - local Date.now(), estimated from PONGs (NTP-style midpoint). */
  clockOffset = 0;
  private bestRtt = Infinity;
  private bestRttAt = 0;
  private ws: WebSocket | null = null;
  private readonly url: string;
  private readonly handlers = new Set<Handler>();
  private readonly statusHandlers = new Set<(s: NetStatus, reconnect: boolean) => void>();
  private retry = 0;
  private everOpened = false;
  private pingTimer: ReturnType<typeof setInterval> | undefined;

  constructor(url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`) {
    this.url = url;
  }

  connect(): void {
    this.setStatus('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      const reconnect = this.everOpened;
      this.everOpened = true;
      this.retry = 0;
      this.setStatus('open', reconnect);
      this.ping();
      clearInterval(this.pingTimer);
      this.pingTimer = setInterval(() => this.ping(), 2000);
    };
    ws.onmessage = (ev) => {
      let msg: ServerMessage;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (msg.event === 'PONG') {
        const now = Date.now();
        const rtt = now - msg.timestamp;
        this.rttMs = Math.round(rtt);
        // Keep the offset from the fastest round trip seen recently (least queuing noise).
        if (rtt <= this.bestRtt * 1.5 || performance.now() - this.bestRttAt > 30_000) {
          this.bestRtt = Math.min(rtt, this.bestRtt);
          this.bestRttAt = performance.now();
          this.clockOffset = msg.server_time - (msg.timestamp + now) / 2;
        }
      }
      for (const handler of this.handlers) handler(msg);
    };
    ws.onclose = () => {
      clearInterval(this.pingTimer);
      if (this.ws !== ws) return;
      this.setStatus('closed');
      const delay = Math.min(8000, 500 * 2 ** this.retry++);
      setTimeout(() => this.connect(), delay);
    };
  }

  send(message: ClientMessage): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    this.ws.send(JSON.stringify(message));
    return true;
  }

  on(handler: Handler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onStatus(handler: (status: NetStatus, reconnect: boolean) => void): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  /** Current server clock as estimated by this client; sent with every input for lag compensation. */
  serverNow(): number {
    return Math.round(Date.now() + this.clockOffset);
  }

  private ping(): void {
    this.send({ event: 'PING', timestamp: Date.now() });
  }

  private setStatus(status: NetStatus, reconnect = false): void {
    this.status = status;
    for (const handler of this.statusHandlers) handler(status, reconnect);
  }
}
