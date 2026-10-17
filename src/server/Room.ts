import { BattleSession } from '../engine/BattleSession.ts';
import { TICK_RATE_HZ } from '../engine/constants.ts';
import { TickLoop } from '../engine/TickLoop.ts';
import { PLAYER_IDS, type PlayerId, type TickResult } from '../engine/types.ts';
import { eventVisibleTo } from '../engine/visibility.ts';
import type { PetInfo } from '../data/petRepository.ts';
import type { ClientMessage, ErrorCode, ReplayInfo, RoomInfo, RoomMode, RoomStatus, ServerMessage, TeamPick } from './protocol.ts';

/** Transport-agnostic handle to one client (a WebSocket in production, a fake in tests). */
export interface ClientConnection {
  readonly id: string;
  send(message: ServerMessage): void;
  /** Round-trip time measured by the transport, if known. Bounds lag compensation. */
  readonly rttMs?: number | null;
}

export interface RoomOptions {
  code: string;
  mode: RoomMode;
  /** Wall clock (ms); also the `server_time` clients synchronise to. */
  now: () => number;
  /** How long a disconnected player has to REJOIN_ROOM before forfeiting. */
  graceMs: number;
  newToken: () => string;
  newSeed: () => number;
  /** Max lag compensation in wall ms (further capped per player by RTT/2 + jitter allowance). */
  maxLagCompensationMs?: number;
  /** Simulation speed multiplier, for automated tests / bot simulations only. */
  timeScale?: number;
}

/** Extra one-way latency tolerated above RTT/2 (jitter, tick alignment). */
const JITTER_ALLOWANCE_MS = 50;

interface Seat {
  playerId: PlayerId;
  userId: string;
  /** 2 battle pets, each the 3 spliced pets (base first). */
  pets: PetInfo[][];
  token: string;
  conn: ClientConnection | null;
  disconnectedAt: number | null;
}

export type CommandError = { code: ErrorCode; message: string };

let matchCounter = 0;

/**
 * One room = one 1v1 match. Owns the authoritative BattleSession, forwards
 * player commands into it and broadcasts STATE_TICK to both seats every tick.
 */
export class Room {
  readonly code: string;
  readonly mode: RoomMode;
  readonly createdAt: number;
  status: RoomStatus = 'LOBBY';
  matchId: string | null = null;
  seed: number | null = null;
  session: BattleSession | null = null;
  finishedAt: number | null = null;
  private readonly options: RoomOptions;
  private readonly seats: Partial<Record<PlayerId, Seat>> = {};
  private loop: TickLoop | null = null;

  constructor(options: RoomOptions) {
    this.options = options;
    this.code = options.code;
    this.mode = options.mode;
    this.createdAt = options.now();
  }

  get isFull(): boolean {
    return PLAYER_IDS.every((id) => this.seats[id]);
  }

  get isEmpty(): boolean {
    return PLAYER_IDS.every((id) => !this.seats[id]);
  }

  /** No seat has a live connection. */
  get isAbandoned(): boolean {
    return PLAYER_IDS.every((id) => !this.seats[id]?.conn);
  }

  info(): RoomInfo {
    const players: RoomInfo['players'] = {};
    for (const id of PLAYER_IDS) {
      const seat = this.seats[id];
      if (seat) players[id] = { user_id: seat.userId, pets: teamIds(seat.pets), connected: seat.conn !== null };
    }
    return { room_code: this.code, mode: this.mode, status: this.status, match_id: this.matchId, players };
  }

  addPlayer(conn: ClientConnection, userId: string, pets: PetInfo[][]): PlayerId {
    if (this.status !== 'LOBBY' || this.isFull) throw new Error(`Room ${this.code} is not joinable`);
    const playerId = PLAYER_IDS.find((id) => !this.seats[id])!;
    const seat: Seat = { playerId, userId, pets, token: this.options.newToken(), conn, disconnectedAt: null };
    this.seats[playerId] = seat;
    conn.send({ event: 'ROOM_JOINED', room_code: this.code, player_id: playerId, player_token: seat.token, room: this.info() });
    this.broadcast({ event: 'ROOM_UPDATE', room: this.info() });
    if (this.isFull) this.startMatch();
    return playerId;
  }

  /** Reattach a (re)connected client to its seat. Returns the seat and the connection it replaced. */
  rejoin(conn: ClientConnection, token: string): { playerId: PlayerId; replaced: ClientConnection | null } | null {
    const seat = PLAYER_IDS.map((id) => this.seats[id]).find((s) => s?.token === token);
    if (!seat || this.status === 'FINISHED') return null;
    const replaced = seat.conn;
    seat.conn = conn;
    seat.disconnectedAt = null;
    conn.send({ event: 'ROOM_JOINED', room_code: this.code, player_id: seat.playerId, player_token: seat.token, room: this.info() });
    if (this.session && this.matchId) this.sendMatchStart(seat);
    this.broadcast({ event: 'PLAYER_RECONNECTED', player_id: seat.playerId });
    return { playerId: seat.playerId, replaced };
  }

  /** Connection dropped. In the lobby the seat is freed; mid-match the grace timer starts. */
  disconnect(playerId: PlayerId): void {
    const seat = this.seats[playerId];
    if (!seat) return;
    seat.conn = null;
    if (this.status === 'LOBBY') {
      delete this.seats[playerId];
      this.broadcast({ event: 'ROOM_UPDATE', room: this.info() });
    } else if (this.status === 'IN_PROGRESS') {
      seat.disconnectedAt = this.options.now();
      this.broadcast({ event: 'PLAYER_DISCONNECTED', player_id: playerId, grace_ms: this.options.graceMs });
    }
  }

  /** Explicit LEAVE_ROOM: frees the lobby seat, or surrenders a running match (the only way to end it besides K.O.). */
  leave(playerId: PlayerId): void {
    const seat = this.seats[playerId];
    if (!seat) return;
    if (this.status === 'IN_PROGRESS') {
      this.forfeit(playerId);
      seat.conn?.send({ event: 'LEFT_ROOM', room_code: this.code });
      seat.conn = null;
    } else if (this.status === 'LOBBY') {
      seat.conn?.send({ event: 'LEFT_ROOM', room_code: this.code });
      delete this.seats[playerId];
      this.broadcast({ event: 'ROOM_UPDATE', room: this.info() });
    } else {
      seat.conn?.send({ event: 'LEFT_ROOM', room_code: this.code });
      seat.conn = null;
    }
  }

  command(playerId: PlayerId, message: Extract<ClientMessage, { event: 'CAST_SKILL' | 'SWAP_PET' }>): CommandError | null {
    if (!this.session || this.status !== 'IN_PROGRESS') return { code: 'MATCH_NOT_STARTED', message: 'The match is not running' };
    if (message.match_id !== undefined && message.match_id !== this.matchId) {
      return { code: 'WRONG_MATCH', message: `match_id ${message.match_id} does not match ${this.matchId}` };
    }
    const atMs = this.inputMatchTime(playerId, message.timestamp);
    if (message.event === 'CAST_SKILL') {
      this.session.submit({
        type: 'CAST_SKILL',
        playerId,
        petIndex: message.pet_index,
        abilityIndex: message.ability_index,
        timestamp: message.timestamp,
        atMs,
      });
    } else {
      this.session.submit({ type: 'SWAP_PET', playerId, timestamp: message.timestamp, atMs });
    }
    return null;
  }

  /**
   * Converts the client's clock-synced timestamp into match time. The claimed lag
   * is clamped to [0, min(max window, RTT/2 + jitter allowance)], so a client
   * cannot buy more compensation than its measured latency justifies.
   */
  private inputMatchTime(playerId: PlayerId, timestamp: number | undefined): number | undefined {
    if (timestamp === undefined || !this.session) return undefined;
    const max = this.options.maxLagCompensationMs ?? 200;
    const rtt = this.seats[playerId]?.conn?.rttMs;
    const cap = rtt === null || rtt === undefined ? max : Math.min(max, rtt / 2 + JITTER_ALLOWANCE_MS);
    const lagWall = Math.min(cap, Math.max(0, this.options.now() - timestamp));
    return Math.max(0, this.session.elapsedMs - lagWall * (this.options.timeScale ?? 1));
  }

  chat(playerId: PlayerId, text: string): void {
    const seat = this.seats[playerId];
    if (!seat) return;
    this.broadcast({ event: 'CHAT', player_id: playerId, user_id: seat.userId, text, server_time: this.options.now() });
  }

  /** Called by the RoomManager on every server tick. */
  update(): void {
    if (this.status !== 'IN_PROGRESS') return;
    this.loop?.pump();
    if (this.status !== 'IN_PROGRESS') return;
    const now = this.options.now();
    for (const id of PLAYER_IDS) {
      const seat = this.seats[id];
      if (seat?.disconnectedAt !== null && seat?.disconnectedAt !== undefined && now - seat.disconnectedAt >= this.options.graceMs) {
        this.forfeit(id);
        return;
      }
    }
  }

  dispose(): void {
    this.loop?.stop();
    this.loop = null;
  }

  // -------------------------------------------------------------------------

  private startMatch(): void {
    const p1 = this.seats.p1!;
    const p2 = this.seats.p2!;
    this.matchId = `MATCH_${this.code}_${++matchCounter}`;
    this.seed = this.options.newSeed();
    const scale = this.options.timeScale ?? 1;
    this.session = new BattleSession({
      matchId: this.matchId,
      seed: this.seed,
      lagCompensationMs: (this.options.maxLagCompensationMs ?? 200) * scale,
      players: {
        p1: { userId: p1.userId, pets: [p1.pets[0], p1.pets[1]] },
        p2: { userId: p2.userId, pets: [p2.pets[0], p2.pets[1]] },
      },
    });
    const wallStart = this.options.now();
    this.loop = new TickLoop(this.session, {
      schedule: false,
      // Simulation clock: equals the wall clock unless a test speeds the match up.
      now: () => wallStart + (this.options.now() - wallStart) * scale,
      maxCatchUpTicks: Math.max(20, Math.ceil(scale) * 4),
      onTick: (result) => this.broadcastTick(result),
      onFinish: () => this.endMatch(),
    });
    this.loop.start();
    this.status = 'IN_PROGRESS';
    for (const id of PLAYER_IDS) this.sendMatchStart(this.seats[id]!);
    this.broadcast({ event: 'ROOM_UPDATE', room: this.info() });
  }

  private sendMatchStart(seat: Seat): void {
    seat.conn?.send({
      event: 'MATCH_START',
      match_id: this.matchId!,
      room_code: this.code,
      you: seat.playerId,
      tick_rate_hz: TICK_RATE_HZ,
      server_time: this.options.now(),
      state: this.session!.getState(seat.playerId),
    });
  }

  private broadcastTick(result: TickResult): void {
    const server_time = this.options.now();
    for (const id of PLAYER_IDS) {
      // Each seat gets its own view: the opponent's secret statuses (Decoy) are left out.
      this.seats[id]?.conn?.send({
        event: 'STATE_TICK',
        match_id: this.matchId!,
        tick: result.tick,
        server_time,
        state: this.session!.getState(id),
        events: result.events.filter((e) => eventVisibleTo(e, id)),
      });
    }
  }

  private forfeit(playerId: PlayerId): void {
    if (!this.session || this.status !== 'IN_PROGRESS') return;
    // No extra STATE_TICK here: that tick number was already broadcast. The
    // final state travels in MATCH_END.
    this.session.forfeit(playerId);
    this.endMatch();
  }

  private endMatch(): void {
    if (this.status === 'FINISHED' || !this.session) return;
    this.status = 'FINISHED';
    this.finishedAt = this.options.now();
    this.dispose();
    this.broadcast({
      event: 'MATCH_END',
      match_id: this.matchId!,
      winner: this.session.winner!,
      reason: this.session.endReason!,
      state: this.session.getState(),
      replay: this.replayInfo(),
    });
    this.broadcast({ event: 'ROOM_UPDATE', room: this.info() });
  }

  replayInfo(): ReplayInfo {
    const session = this.session!;
    const seat = (id: PlayerId) => {
      const s = this.seats[id]!;
      return { user_id: s.userId, pets: teamIds(s.pets) };
    };
    return {
      seed: this.seed!,
      final_tick: session.tickCount,
      lag_compensation_ms: session.lagCompensationMs,
      players: { p1: seat('p1'), p2: seat('p2') },
      commands: session.commandLog,
    };
  }

  private broadcast(message: ServerMessage): void {
    for (const id of PLAYER_IDS) this.seats[id]?.conn?.send(message);
  }
}

function teamIds(team: PetInfo[][]): TeamPick {
  return team.map((battlePet) => battlePet.map((p) => p.id)) as TeamPick;
}
