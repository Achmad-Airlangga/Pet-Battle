/**
 * WebSocket wire protocol. Every message is a JSON object with an `event` field
 * (PRD 3.2). The server derives the player's identity from the connection, so
 * `player_id` sent by a client is informational only.
 */
import type { BattleEvent, GameStateSnapshot, LoggedCommand, MatchEndReason, PlayerId } from '../engine/types.ts';

/** Sent with MATCH_END: lets any client re-simulate and verify the whole match. */
export interface ReplayInfo {
  seed: number;
  /** Tick on which the match ended (there is no timer, so replays stop here). */
  final_tick: number;
  lag_compensation_ms: number;
  players: Record<PlayerId, { user_id: string; pets: TeamPick }>;
  commands: LoggedCommand[];
}

// ---------------------------------------------------------------------------
// Client -> Server
// ---------------------------------------------------------------------------

/** One battle pet = 3 pet ids spliced together, base pet first (Battle Pet Cage). */
export type BattlePetPick = [string, string, string];
/** A Battle Leash: 2 battle pets, the first starts active. */
export type TeamPick = [BattlePetPick, BattlePetPick];

export type ClientMessage =
  | { event: 'CREATE_ROOM'; user_id: string; pets: TeamPick }
  | { event: 'JOIN_ROOM'; room_code: string; user_id: string; pets: TeamPick }
  | { event: 'REJOIN_ROOM'; room_code: string; player_token: string }
  | { event: 'QUICK_MATCH'; user_id: string; pets: TeamPick; mmr?: number }
  | { event: 'CANCEL_QUICK_MATCH' }
  | { event: 'LEAVE_ROOM' }
  /** `timestamp`: the client's estimate of server_time when the input happened (clock-synced via PING/PONG). */
  | { event: 'CAST_SKILL'; match_id?: string; player_id?: string; pet_index?: number; ability_index?: number; timestamp?: number }
  | { event: 'SWAP_PET'; match_id?: string; player_id?: string; timestamp?: number }
  | { event: 'PING'; timestamp: number }
  | { event: 'CHAT'; text: string };

export const MAX_CHAT_LENGTH = 200;

export type ClientEvent = ClientMessage['event'];

// ---------------------------------------------------------------------------
// Server -> Client
// ---------------------------------------------------------------------------

export type ErrorCode =
  | 'BAD_MESSAGE'
  | 'UNKNOWN_EVENT'
  | 'INVALID_PETS'
  | 'ROOM_NOT_FOUND'
  | 'ROOM_FULL'
  | 'ALREADY_IN_ROOM'
  | 'ALREADY_QUEUED'
  | 'NOT_IN_ROOM'
  | 'NOT_QUEUED'
  | 'MATCH_NOT_STARTED'
  | 'WRONG_MATCH'
  | 'INVALID_TOKEN'
  | 'RATE_LIMITED';

export type RoomMode = 'PRIVATE' | 'QUICK';
export type RoomStatus = 'LOBBY' | 'IN_PROGRESS' | 'FINISHED';

export interface SeatInfo {
  user_id: string;
  pets: TeamPick;
  connected: boolean;
}

export interface RoomInfo {
  room_code: string;
  mode: RoomMode;
  status: RoomStatus;
  match_id: string | null;
  players: Partial<Record<PlayerId, SeatInfo>>;
}

export type ServerMessage =
  | { event: 'ERROR'; code: ErrorCode; message: string }
  | { event: 'QUEUED'; queue_size: number }
  | { event: 'QUEUE_LEFT' }
  | { event: 'ROOM_JOINED'; room_code: string; player_id: PlayerId; player_token: string; room: RoomInfo }
  | { event: 'ROOM_UPDATE'; room: RoomInfo }
  | { event: 'LEFT_ROOM'; room_code: string }
  | { event: 'MATCH_START'; match_id: string; room_code: string; you: PlayerId; tick_rate_hz: number; server_time: number; state: GameStateSnapshot }
  | { event: 'STATE_TICK'; match_id: string; tick: number; server_time: number; state: GameStateSnapshot; events: BattleEvent[] }
  | { event: 'MATCH_END'; match_id: string; winner: PlayerId | 'DRAW'; reason: MatchEndReason; state: GameStateSnapshot; replay: ReplayInfo }
  | { event: 'PLAYER_DISCONNECTED'; player_id: PlayerId; grace_ms: number }
  | { event: 'PLAYER_RECONNECTED'; player_id: PlayerId }
  | { event: 'PONG'; timestamp: number; server_time: number }
  | { event: 'CHAT'; player_id: PlayerId; user_id: string; text: string; server_time: number };

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export type ParseResult = { ok: true; message: ClientMessage } | { ok: false; code: ErrorCode; message: string };

const MAX_TEXT = 64;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isText = (v: unknown, max = MAX_TEXT): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isOptNumber = (v: unknown) => v === undefined || (typeof v === 'number' && Number.isFinite(v));
const isOptText = (v: unknown) => v === undefined || isText(v);
const isBattlePet = (v: unknown): v is BattlePetPick => Array.isArray(v) && v.length === 3 && v.every((p) => isText(p));
const isPets = (v: unknown): v is TeamPick => Array.isArray(v) && v.length === 2 && v.every(isBattlePet);
const PETS_HINT = 'pets must be 2 battle pets of 3 pet ids each: [[a, b, c], [d, e, f]]';
const isRoomCode = (v: unknown): v is string => typeof v === 'string' && /^\d{6}$/.test(v);

class Invalid extends Error {}
const need = (cond: boolean, what: string) => {
  if (!cond) throw new Invalid(what);
};

export function parseClientMessage(raw: string): ParseResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, code: 'BAD_MESSAGE', message: 'Message is not valid JSON' };
  }
  if (!isObj(data) || typeof data.event !== 'string') return { ok: false, code: 'BAD_MESSAGE', message: 'Missing "event" field' };

  try {
    switch (data.event) {
      case 'CREATE_ROOM':
        need(isText(data.user_id), 'user_id must be a non-empty string (max 64)');
        need(isPets(data.pets), PETS_HINT);
        return ok({ event: 'CREATE_ROOM', user_id: data.user_id as string, pets: data.pets as TeamPick });
      case 'JOIN_ROOM':
        need(isRoomCode(data.room_code), 'room_code must be 6 digits');
        need(isText(data.user_id), 'user_id must be a non-empty string (max 64)');
        need(isPets(data.pets), PETS_HINT);
        return ok({ event: 'JOIN_ROOM', room_code: data.room_code as string, user_id: data.user_id as string, pets: data.pets as TeamPick });
      case 'REJOIN_ROOM':
        need(isRoomCode(data.room_code), 'room_code must be 6 digits');
        need(isText(data.player_token, 128), 'player_token is required');
        return ok({ event: 'REJOIN_ROOM', room_code: data.room_code as string, player_token: data.player_token as string });
      case 'QUICK_MATCH':
        need(isText(data.user_id), 'user_id must be a non-empty string (max 64)');
        need(isPets(data.pets), PETS_HINT);
        need(isOptNumber(data.mmr), 'mmr must be a number');
        return ok({ event: 'QUICK_MATCH', user_id: data.user_id as string, pets: data.pets as TeamPick, mmr: data.mmr as number | undefined });
      case 'CANCEL_QUICK_MATCH':
        return ok({ event: 'CANCEL_QUICK_MATCH' });
      case 'LEAVE_ROOM':
        return ok({ event: 'LEAVE_ROOM' });
      case 'CAST_SKILL':
        need(isOptText(data.match_id) && isOptText(data.player_id), 'match_id / player_id must be strings');
        need(data.pet_index === undefined || data.pet_index === 0 || data.pet_index === 1, 'pet_index must be 0 or 1');
        need(data.ability_index === undefined || [0, 1, 2].includes(data.ability_index as number), 'ability_index must be 0, 1 or 2');
        need(isOptNumber(data.timestamp), 'timestamp must be a number');
        return ok({
          event: 'CAST_SKILL',
          match_id: data.match_id as string | undefined,
          player_id: data.player_id as string | undefined,
          pet_index: data.pet_index as number | undefined,
          ability_index: data.ability_index as number | undefined,
          timestamp: data.timestamp as number | undefined,
        });
      case 'SWAP_PET':
        need(isOptText(data.match_id) && isOptText(data.player_id), 'match_id / player_id must be strings');
        need(isOptNumber(data.timestamp), 'timestamp must be a number');
        return ok({
          event: 'SWAP_PET',
          match_id: data.match_id as string | undefined,
          player_id: data.player_id as string | undefined,
          timestamp: data.timestamp as number | undefined,
        });
      case 'PING':
        need(typeof data.timestamp === 'number' && Number.isFinite(data.timestamp), 'timestamp must be a number');
        return ok({ event: 'PING', timestamp: data.timestamp as number });
      case 'CHAT': {
        need(typeof data.text === 'string', 'text must be a string');
        // Strip control characters and collapse whitespace; clients render it as plain text.
        const text = (data.text as string).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
        need(text.length > 0 && text.length <= MAX_CHAT_LENGTH, `text must be 1-${MAX_CHAT_LENGTH} characters`);
        return ok({ event: 'CHAT', text });
      }
      default:
        return { ok: false, code: 'UNKNOWN_EVENT', message: `Unknown event "${data.event.slice(0, 32)}"` };
    }
  } catch (e) {
    if (e instanceof Invalid) return { ok: false, code: 'BAD_MESSAGE', message: `${data.event}: ${e.message}` };
    throw e;
  }
}

const ok = (message: ClientMessage): ParseResult => ({ ok: true, message });
