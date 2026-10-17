/**
 * Headless player that speaks the real WebSocket protocol. Used to simulate
 * matches end to end: it syncs its clock, plays a strategy, and records every
 * STATE_TICK so the match can be verified afterwards.
 */
import { WebSocket } from 'ws';
import { Rng } from '../engine/rng.ts';
import type { BattleEvent, GameStateSnapshot, PetSnapshot, PlayerId } from '../engine/types.ts';
import type { ClientMessage, ServerMessage, TeamPick } from '../server/protocol.ts';

type Msg<E extends ServerMessage['event']> = Extract<ServerMessage, { event: E }>;

export type Strategy = 'aggressive' | 'tactical' | 'chaos' | 'idle';

export interface BotOptions {
  url: string;
  name: string;
  /** Battle Leash: 2 battle pets x 3 pet ids. */
  pets: TeamPick;
  strategy?: Strategy;
  seed?: number;
}

export interface BotStats {
  ticksReceived: number;
  tickGaps: number;
  outOfOrder: number;
  actionsSent: number;
  rejected: Record<string, number>;
  compensated: number;
  rttSamples: number[];
  actionLatencyMs: number[];
  clockOffsetMs: number;
  errors: string[];
  /** Inputs that arrived after MATCH_END (in flight when the match ended). */
  lateInputs: number;
}

const PENDING_TIMEOUT_MS = 600;

export class BotClient {
  readonly name: string;
  readonly strategy: Strategy;
  you: PlayerId | null = null;
  matchId: string | null = null;
  roomCode: string | null = null;
  token: string | null = null;
  end: Msg<'MATCH_END'> | null = null;
  /** Every authoritative state received, by tick. */
  readonly states = new Map<number, GameStateSnapshot>();
  readonly events: BattleEvent[] = [];
  readonly stats: BotStats = {
    ticksReceived: 0,
    tickGaps: 0,
    outOfOrder: 0,
    actionsSent: 0,
    rejected: {},
    compensated: 0,
    rttSamples: [],
    actionLatencyMs: [],
    clockOffsetMs: 0,
    errors: [],
    lateInputs: 0,
  };
  private readonly options: BotOptions;
  private readonly rng: Rng;
  private ws: WebSocket | null = null;
  private readonly inbox: ServerMessage[] = [];
  private waiters: (() => void)[] = [];
  private lastTick = 0;
  private pending: { kind: 'CAST_SKILL' | 'SWAP_PET'; sentAt: number; key: string } | null = null;
  private readonly blockedUntil = new Map<string, number>();

  constructor(options: BotOptions) {
    this.options = options;
    this.name = options.name;
    this.strategy = options.strategy ?? 'tactical';
    this.rng = new Rng(options.seed ?? 1);
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.options.url);
      this.ws = ws;
      ws.once('open', () => resolve());
      ws.once('error', reject);
      ws.on('message', (data) => this.onMessage(JSON.parse(data.toString()) as ServerMessage));
    });
  }

  close(): void {
    this.ws?.close();
  }

  /** Kill the socket without a close handshake (simulates a dropped connection). */
  drop(): void {
    this.ws?.terminate();
  }

  serverNow(): number {
    return Date.now() + this.stats.clockOffsetMs;
  }

  /** NTP-style sync: keep the offset from the lowest-RTT sample. */
  async syncClock(samples = 5): Promise<void> {
    let best = Infinity;
    for (let i = 0; i < samples; i++) {
      const sent = Date.now();
      this.send({ event: 'PING', timestamp: sent });
      const pong = await this.waitFor('PONG', (m) => m.timestamp === sent);
      const received = Date.now();
      const rtt = received - sent;
      this.stats.rttSamples.push(rtt);
      if (rtt < best) {
        best = rtt;
        this.stats.clockOffsetMs = pong.server_time - (sent + received) / 2;
      }
    }
  }

  async createRoom(): Promise<string> {
    this.send({ event: 'CREATE_ROOM', user_id: this.name, pets: this.options.pets });
    const joined = await this.waitFor('ROOM_JOINED');
    return joined.room_code;
  }

  joinRoom(code: string): void {
    this.send({ event: 'JOIN_ROOM', room_code: code, user_id: this.name, pets: this.options.pets });
  }

  quickMatch(mmr?: number): void {
    this.send({ event: 'QUICK_MATCH', user_id: this.name, pets: this.options.pets, mmr });
  }

  async waitForEnd(timeoutMs: number): Promise<Msg<'MATCH_END'>> {
    return this.waitFor('MATCH_END', () => true, timeoutMs);
  }

  waitFor<E extends ServerMessage['event']>(event: E, match: (m: Msg<E>) => boolean = () => true, timeoutMs = 5000): Promise<Msg<E>> {
    const deadline = Date.now() + timeoutMs;
    return new Promise((resolve, reject) => {
      const check = () => {
        const found = this.inbox.find((m): m is Msg<E> => m.event === event && match(m as Msg<E>));
        if (found) return resolve(found);
        const left = deadline - Date.now();
        if (left <= 0) return reject(new Error(`${this.name}: timed out waiting for ${event}`));
        const timer = setTimeout(check, left);
        this.waiters.push(() => {
          clearTimeout(timer);
          check();
        });
      };
      check();
    });
  }

  send(message: ClientMessage): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(message));
  }

  // -------------------------------------------------------------------------

  private onMessage(msg: ServerMessage): void {
    this.inbox.push(msg);
    if (this.inbox.length > 500) this.inbox.splice(0, this.inbox.length - 200);
    switch (msg.event) {
      case 'ROOM_JOINED':
        this.you = msg.player_id;
        this.roomCode = msg.room_code;
        this.token = msg.player_token;
        break;
      case 'MATCH_START':
        this.you = msg.you;
        this.matchId = msg.match_id;
        if (msg.state.tick === 0) this.lastTick = 0;
        break;
      case 'STATE_TICK':
        this.onTick(msg);
        break;
      case 'MATCH_END':
        this.end = msg;
        break;
      case 'ERROR':
        // An input still in flight when the match ended is expected, not a fault.
        if (this.end && msg.code === 'MATCH_NOT_STARTED') this.stats.lateInputs++;
        else this.stats.errors.push(`${msg.code}: ${msg.message}`);
        break;
    }
    for (const w of this.waiters.splice(0)) w();
  }

  private onTick(msg: Msg<'STATE_TICK'>): void {
    this.stats.ticksReceived++;
    if (msg.tick <= this.lastTick) this.stats.outOfOrder++;
    else this.stats.tickGaps += msg.tick - this.lastTick - 1;
    this.lastTick = Math.max(this.lastTick, msg.tick);
    this.states.set(msg.tick, msg.state);
    this.events.push(...msg.events);

    const now = performance.now();
    for (const e of msg.events) {
      if (e.type === 'ACTION_REJECTED' && e.player === this.you) {
        this.stats.rejected[e.reason] = (this.stats.rejected[e.reason] ?? 0) + 1;
        // e.g. Wish with no K.O. partner: leave that ability alone for a while.
        if (this.pending?.key && (e.reason === 'NO_VALID_TARGET' || e.reason === 'NO_USES_LEFT')) {
          this.blockedUntil.set(this.pending.key, now + 5000);
        }
        this.pending = null;
      } else if (e.type === 'LAG_COMPENSATED' && e.player === this.you) {
        this.stats.compensated++;
      } else if (this.pending && e.type === 'SKILL_CAST' && e.actor.player === this.you && !e.possessedBy && this.pending.kind === 'CAST_SKILL') {
        this.stats.actionLatencyMs.push(now - this.pending.sentAt);
        this.pending = null;
      } else if (this.pending && e.type === 'SWAP' && e.player === this.you && e.cause === 'PLAYER' && this.pending.kind === 'SWAP_PET') {
        this.stats.actionLatencyMs.push(now - this.pending.sentAt);
        this.pending = null;
      }
    }
    if (this.pending && now - this.pending.sentAt > PENDING_TIMEOUT_MS) this.pending = null;
    if (msg.state.status === 'IN_PROGRESS') this.decide(msg.state);
  }

  private decide(state: GameStateSnapshot): void {
    if (!this.you || this.strategy === 'idle') return;
    if (this.strategy === 'chaos') {
      if (this.rng.chance(0.08)) this.act(this.rng.chance(0.5) ? 'CAST_SKILL' : 'SWAP_PET', state);
      return;
    }
    if (this.pending) return;
    const me = state.players[this.you];
    const active = me.pets[me.active_pet_index];
    const reserve = me.pets[me.active_pet_index === 0 ? 1 : 0];
    const locked = me.swap_cooldown_remaining > 0 || has(active, 'STUN');

    const usable = (p: PetSnapshot) => p.abilities.some((a) => !a.is_passive && a.uses_left !== 0);
    if (!locked && !reserve.is_ko && !has(active, 'ROOT')) {
      const hpRatio = (p: PetSnapshot) => p.current_hp / p.max_hp;
      const stuck = !usable(active) && usable(reserve);
      const retreat = this.strategy === 'tactical' && hpRatio(active) < 0.3 && hpRatio(reserve) > hpRatio(active) + 0.25;
      if (stuck || retreat) return this.act('SWAP_PET', state);
    }
    if (locked || has(active, 'SILENCE')) return;
    const now = performance.now();
    const ready = active.abilities.findIndex(
      (a, i) => !a.is_passive && a.cooldown_remaining <= 0 && a.uses_left !== 0 && (this.blockedUntil.get(`${me.active_pet_index}:${i}`) ?? 0) < now,
    );
    if (ready >= 0) this.act('CAST_SKILL', state, ready);
  }

  private act(kind: 'CAST_SKILL' | 'SWAP_PET', state: GameStateSnapshot, abilityIndex?: number): void {
    const timestamp = Math.round(this.serverNow());
    const me = state.players[this.you!];
    if (kind === 'CAST_SKILL') {
      const ability = abilityIndex ?? this.rng.int(0, 2);
      this.send({ event: 'CAST_SKILL', match_id: this.matchId!, pet_index: me.active_pet_index, ability_index: ability, timestamp });
      this.pending = { kind, sentAt: performance.now(), key: `${me.active_pet_index}:${ability}` };
    } else {
      this.send({ event: 'SWAP_PET', match_id: this.matchId!, timestamp });
      this.pending = { kind, sentAt: performance.now(), key: '' };
    }
    this.stats.actionsSent++;
  }
}

function has(pet: PetSnapshot, status: string): boolean {
  return pet.active_debuffs.some((d) => d.status === status) || pet.active_buffs.some((b) => b.status === status);
}
