import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { WebSocket } from 'ws';
import { GameServer } from '../../src/server/GameServer.ts';
import type { ServerMessage } from '../../src/server/protocol.ts';
import { AIR_TEAM, EARTH_TEAM, WATER_TEAM } from './helpers.ts';

type Msg<E extends ServerMessage['event']> = Extract<ServerMessage, { event: E }>;

class TestClient {
  readonly ws: WebSocket;
  readonly messages: ServerMessage[] = [];
  private waiters: (() => void)[] = [];

  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.on('message', (data) => {
      this.messages.push(JSON.parse(data.toString()));
      for (const w of this.waiters.splice(0)) w();
    });
  }

  opened(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws.once('open', () => resolve());
      this.ws.once('error', reject);
    });
  }

  send(message: object): void {
    this.ws.send(JSON.stringify(message));
  }

  async waitFor<E extends ServerMessage['event']>(event: E, match: (m: Msg<E>) => boolean = () => true, timeoutMs = 3000): Promise<Msg<E>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.messages.find((m): m is Msg<E> => m.event === event && match(m as Msg<E>));
      if (found) return found;
      const left = deadline - Date.now();
      if (left <= 0) throw new Error(`Timed out waiting for ${event}; got ${this.messages.map((m) => m.event).join(', ')}`);
      await new Promise<void>((resolve) => {
        const t = setTimeout(resolve, left);
        this.waiters.push(() => {
          clearTimeout(t);
          resolve();
        });
      });
    }
  }

  close(): void {
    this.ws.close();
  }
}

describe('GameServer over real WebSockets', () => {
  let server: GameServer;
  let base: string;
  const clients: TestClient[] = [];

  const client = async () => {
    const c = new TestClient(`ws://127.0.0.1:${new URL(base).port}/ws`);
    clients.push(c);
    await c.opened();
    return c;
  };

  before(async () => {
    server = new GameServer({ port: 0, host: '127.0.0.1', rateLimit: { capacity: 10, refillPerSec: 5 } });
    const { port } = await server.listen();
    base = `http://127.0.0.1:${port}`;
  });

  after(async () => {
    for (const c of clients) c.close();
    await server.close();
  });

  it('serves /health and /pets over HTTP', async () => {
    const health = (await (await fetch(`${base}/health`)).json()) as { ok: boolean };
    assert.equal(health.ok, true);
    const pets = (await (await fetch(`${base}/pets`)).json()) as { count: number; pets: { name: string }[] };
    assert.equal(pets.count, 172);
    assert.equal(pets.pets[7].name, 'Mid-Pacific Owl');
    assert.equal((await fetch(`${base}/nope.js`)).status, 404);
  });

  it('serves the built client with SPA fallback and blocks path traversal', async () => {
    const { mkdtempSync, writeFileSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'pb-static-'));
    writeFileSync(join(dir, 'index.html'), '<h1>pet battle</h1>');
    writeFileSync(join(dir, 'app.js'), 'console.log(1)');
    const s = new GameServer({ port: 0, host: '127.0.0.1', staticDir: dir });
    const { port } = await s.listen();
    try {
      const root = `http://127.0.0.1:${port}`;
      assert.equal(await (await fetch(`${root}/`)).text(), '<h1>pet battle</h1>');
      assert.equal(await (await fetch(`${root}/room/123456`)).text(), '<h1>pet battle</h1>');
      const js = await fetch(`${root}/app.js`);
      assert.match(js.headers.get('content-type') ?? '', /javascript/);
      assert.equal((await fetch(`${root}/%2e%2e/%2e%2e/package.json`)).status, 404);
    } finally {
      await s.close();
    }
  });

  it('plays a private room match end to end', async () => {
    const a = await client();
    const b = await client();
    a.send({ event: 'CREATE_ROOM', user_id: 'USER_A', pets: AIR_TEAM });
    const { room_code } = await a.waitFor('ROOM_JOINED');
    b.send({ event: 'JOIN_ROOM', room_code, user_id: 'USER_B', pets: WATER_TEAM });

    const start = await a.waitFor('MATCH_START');
    assert.equal((await b.waitFor('MATCH_START')).match_id, start.match_id);
    const tickA = await a.waitFor('STATE_TICK');
    assert.equal(tickA.match_id, start.match_id);
    await b.waitFor('STATE_TICK');

    b.send({ event: 'SWAP_PET', match_id: start.match_id, player_id: 'USER_B', timestamp: Date.now() });
    const swapped = await a.waitFor('STATE_TICK', (m) => m.state.players.p2.active_pet_index === 1);
    assert.ok(swapped.events.some((e) => e.type === 'SWAP'));

    a.send({ event: 'LEAVE_ROOM' });
    const end = await b.waitFor('MATCH_END');
    assert.equal(end.winner, 'p2');
    assert.equal(end.reason, 'FORFEIT');
  });

  it('closing the socket starts the reconnect grace period', async () => {
    const a = await client();
    const b = await client();
    a.send({ event: 'CREATE_ROOM', user_id: 'A', pets: EARTH_TEAM });
    const { room_code } = await a.waitFor('ROOM_JOINED');
    b.send({ event: 'JOIN_ROOM', room_code, user_id: 'B', pets: EARTH_TEAM });
    const joined = await b.waitFor('ROOM_JOINED');
    await b.waitFor('MATCH_START');
    b.close();
    assert.equal((await a.waitFor('PLAYER_DISCONNECTED')).player_id, 'p2');

    const b2 = await client();
    b2.send({ event: 'REJOIN_ROOM', room_code, player_token: joined.player_token });
    assert.equal((await b2.waitFor('MATCH_START')).you, 'p2');
    await a.waitFor('PLAYER_RECONNECTED');
  });

  it('rejects bad input and rate-limits floods', async () => {
    const c = await client();
    c.ws.send('garbage');
    assert.equal((await c.waitFor('ERROR')).code, 'BAD_MESSAGE');
    for (let i = 0; i < 30; i++) c.send({ event: 'PING', timestamp: i });
    await c.waitFor('ERROR', (m) => m.code === 'RATE_LIMITED');
    assert.ok(c.messages.filter((m) => m.event === 'PONG').length < 30);
  });
});
