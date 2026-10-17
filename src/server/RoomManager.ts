import { randomBytes, randomInt } from 'node:crypto';
import { TICK_MS } from '../engine/constants.ts';
import type { PlayerId } from '../engine/types.ts';
import { getPetInfo, type PetInfo } from '../data/petRepository.ts';
import { parseClientMessage, type ClientMessage, type ErrorCode, type TeamPick } from './protocol.ts';
import { Room, type ClientConnection } from './Room.ts';

export interface QuickMatchOptions {
  /** Max MMR difference accepted immediately. */
  baseWindow: number;
  /** The accepted difference grows by this much per second of waiting. */
  widenPerSec: number;
  defaultMmr: number;
}

export interface RoomManagerOptions {
  /** Wall clock in ms (default Date.now); clients sync to it through PONG.server_time. */
  now?: () => number;
  /** Max lag compensation window in wall ms (default 200). */
  maxLagCompensationMs?: number;
  /** Speeds up every match; only for automated tests and bot simulations. */
  timeScale?: number;
  /** Reconnect window before a disconnected player forfeits (default 15s). */
  graceMs?: number;
  /** Finished rooms are deleted after this long (default 60s). */
  finishedRoomTtlMs?: number;
  quickMatch?: Partial<QuickMatchOptions>;
}

interface ClientState {
  conn: ClientConnection;
  room: Room | null;
  playerId: PlayerId | null;
  queued: QueueEntry | null;
}

interface QueueEntry {
  conn: ClientConnection;
  userId: string;
  pets: PetInfo[][];
  mmr: number;
  since: number;
}

export class RoomManager {
  private readonly now: () => number;
  private readonly graceMs: number;
  private readonly finishedRoomTtlMs: number;
  private readonly quick: QuickMatchOptions;
  private readonly options: RoomManagerOptions;
  private readonly rooms = new Map<string, Room>();
  private readonly clients = new Map<ClientConnection, ClientState>();
  private queue: QueueEntry[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: RoomManagerOptions = {}) {
    this.options = options;
    this.now = options.now ?? Date.now;
    this.graceMs = options.graceMs ?? 15_000;
    this.finishedRoomTtlMs = options.finishedRoomTtlMs ?? 60_000;
    this.quick = { baseWindow: 100, widenPerSec: 50, defaultMmr: 1000, ...options.quickMatch };
  }

  /** One timer drives matchmaking and every room's 20Hz simulation. */
  start(): void {
    if (!this.timer) this.timer = setInterval(() => this.tick(), TICK_MS);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    for (const room of this.rooms.values()) room.dispose();
  }

  stats() {
    return { rooms: this.rooms.size, clients: this.clients.size, queue: this.queue.length };
  }

  getRoom(code: string): Room | undefined {
    return this.rooms.get(code);
  }

  // -------------------------------------------------------------------------
  // Connection lifecycle
  // -------------------------------------------------------------------------

  connect(conn: ClientConnection): void {
    this.clients.set(conn, { conn, room: null, playerId: null, queued: null });
  }

  disconnect(conn: ClientConnection): void {
    const state = this.clients.get(conn);
    if (!state) return;
    this.dequeue(state);
    if (state.room && state.playerId) {
      state.room.disconnect(state.playerId);
      this.dropIfEmpty(state.room);
    }
    this.clients.delete(conn);
  }

  handleRaw(conn: ClientConnection, raw: string): void {
    const parsed = parseClientMessage(raw);
    if (!parsed.ok) this.error(conn, parsed.code, parsed.message);
    else this.handle(conn, parsed.message);
  }

  handle(conn: ClientConnection, message: ClientMessage): void {
    const state = this.clients.get(conn);
    if (!state) return;

    switch (message.event) {
      case 'PING':
        conn.send({ event: 'PONG', timestamp: message.timestamp, server_time: this.now() });
        return;

      case 'CREATE_ROOM': {
        if (!this.canEnterRoom(state)) return;
        const pets = this.resolvePets(conn, message.pets);
        if (!pets) return;
        const room = this.createRoom('PRIVATE');
        this.seat(state, room, message.user_id, pets);
        return;
      }

      case 'JOIN_ROOM': {
        if (!this.canEnterRoom(state)) return;
        const room = this.rooms.get(message.room_code);
        if (!room) return this.error(conn, 'ROOM_NOT_FOUND', `Room ${message.room_code} does not exist`);
        if (room.mode !== 'PRIVATE' || room.status !== 'LOBBY' || room.isFull) {
          return this.error(conn, 'ROOM_FULL', `Room ${message.room_code} is not accepting players`);
        }
        const pets = this.resolvePets(conn, message.pets);
        if (!pets) return;
        this.seat(state, room, message.user_id, pets);
        return;
      }

      case 'REJOIN_ROOM': {
        if (!this.canEnterRoom(state)) return;
        const room = this.rooms.get(message.room_code);
        if (!room) return this.error(conn, 'ROOM_NOT_FOUND', `Room ${message.room_code} does not exist`);
        const result = room.rejoin(conn, message.player_token);
        if (!result) return this.error(conn, 'INVALID_TOKEN', 'player_token does not match a seat in this room');
        if (result.replaced) {
          // Same player opened a second connection: the old one loses the seat.
          const old = this.clients.get(result.replaced);
          if (old) {
            old.room = null;
            old.playerId = null;
            result.replaced.send({ event: 'LEFT_ROOM', room_code: room.code });
          }
        }
        state.room = room;
        state.playerId = result.playerId;
        return;
      }

      case 'QUICK_MATCH': {
        if (!this.canEnterRoom(state)) return;
        const pets = this.resolvePets(conn, message.pets);
        if (!pets) return;
        state.queued = { conn, userId: message.user_id, pets, mmr: message.mmr ?? this.quick.defaultMmr, since: this.now() };
        this.queue.push(state.queued);
        conn.send({ event: 'QUEUED', queue_size: this.queue.length });
        return;
      }

      case 'CANCEL_QUICK_MATCH':
        if (!state.queued) return this.error(conn, 'NOT_QUEUED', 'You are not in the quick match queue');
        this.dequeue(state);
        conn.send({ event: 'QUEUE_LEFT' });
        return;

      case 'LEAVE_ROOM': {
        if (!state.room || !state.playerId) return this.error(conn, 'NOT_IN_ROOM', 'You are not in a room');
        const room = state.room;
        room.leave(state.playerId);
        state.room = null;
        state.playerId = null;
        this.dropIfEmpty(room);
        return;
      }

      case 'CHAT':
        if (!state.room || !state.playerId) return this.error(conn, 'NOT_IN_ROOM', 'You are not in a room');
        state.room.chat(state.playerId, message.text);
        return;

      case 'CAST_SKILL':
      case 'SWAP_PET': {
        if (!state.room || !state.playerId) return this.error(conn, 'NOT_IN_ROOM', 'You are not in a room');
        const failure = state.room.command(state.playerId, message);
        if (failure) this.error(conn, failure.code, failure.message);
        return;
      }
    }
  }

  // -------------------------------------------------------------------------
  // Server tick
  // -------------------------------------------------------------------------

  tick(): void {
    this.matchmake();
    const now = this.now();
    for (const room of [...this.rooms.values()]) {
      room.update();
      const expired = room.status === 'FINISHED' && now - room.finishedAt! >= this.finishedRoomTtlMs;
      if (expired || (room.status === 'FINISHED' && room.isAbandoned)) this.deleteRoom(room);
    }
  }

  /** Pairs the longest-waiting players first, with an MMR window that widens over time. */
  private matchmake(): void {
    if (this.queue.length < 2) return;
    const now = this.now();
    const queue = [...this.queue].sort((a, b) => a.since - b.since);
    const paired = new Set<QueueEntry>();
    const windowOf = (e: QueueEntry) => this.quick.baseWindow + (this.quick.widenPerSec * (now - e.since)) / 1000;

    for (const a of queue) {
      if (paired.has(a)) continue;
      let best: QueueEntry | null = null;
      for (const b of queue) {
        if (b === a || paired.has(b)) continue;
        const diff = Math.abs(a.mmr - b.mmr);
        if (diff > Math.max(windowOf(a), windowOf(b))) continue;
        if (!best || diff < Math.abs(a.mmr - best.mmr)) best = b;
      }
      if (!best) continue;
      paired.add(a);
      paired.add(best);
      const room = this.createRoom('QUICK');
      for (const entry of [a, best]) {
        const state = this.clients.get(entry.conn)!;
        state.queued = null;
        this.seat(state, room, entry.userId, entry.pets);
      }
    }
    this.queue = this.queue.filter((e) => !paired.has(e));
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  /** A finished room does not block entering a new one; it is simply left behind. */
  private canEnterRoom(state: ClientState): boolean {
    if (state.queued) {
      this.error(state.conn, 'ALREADY_QUEUED', 'Cancel quick match first');
      return false;
    }
    if (state.room?.status === 'FINISHED' && state.playerId) {
      state.room.leave(state.playerId);
      state.room = null;
      state.playerId = null;
    }
    if (state.room) {
      this.error(state.conn, 'ALREADY_IN_ROOM', `You are already in room ${state.room.code}`);
      return false;
    }
    return true;
  }

  /**
   * Resolves a Battle Leash: 2 battle pets x 3 spliced pets. Elements may be
   * mixed freely; the base pet (first) sets the battle pet's defending element.
   */
  private resolvePets(conn: ClientConnection, pick: TeamPick): PetInfo[][] | null {
    try {
      return pick.map((battlePet) => battlePet.map((id) => getPetInfo(id)));
    } catch (e) {
      this.error(conn, 'INVALID_PETS', (e as Error).message);
      return null;
    }
  }

  private seat(state: ClientState, room: Room, userId: string, pets: PetInfo[][]): void {
    state.room = room;
    state.playerId = room.addPlayer(state.conn, userId, pets);
  }

  private createRoom(mode: 'PRIVATE' | 'QUICK'): Room {
    let code: string;
    do code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    while (this.rooms.has(code));
    const room = new Room({
      code,
      mode,
      now: this.now,
      graceMs: this.graceMs,
      newToken: () => randomBytes(16).toString('hex'),
      newSeed: () => randomInt(0, 2 ** 31),
      maxLagCompensationMs: this.options.maxLagCompensationMs,
      timeScale: this.options.timeScale,
    });
    this.rooms.set(code, room);
    return room;
  }

  private dropIfEmpty(room: Room): void {
    if (room.status === 'LOBBY' && room.isEmpty) this.deleteRoom(room);
  }

  private deleteRoom(room: Room): void {
    room.dispose();
    this.rooms.delete(room.code);
    for (const state of this.clients.values()) {
      if (state.room === room) {
        state.room = null;
        state.playerId = null;
      }
    }
  }

  private dequeue(state: ClientState): void {
    if (!state.queued) return;
    const entry = state.queued;
    this.queue = this.queue.filter((e) => e !== entry);
    state.queued = null;
  }

  private error(conn: ClientConnection, code: ErrorCode, message: string): void {
    conn.send({ event: 'ERROR', code, message });
  }
}
