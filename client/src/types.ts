// Shared with the server: the client only imports types, never server code.
export type { ClientMessage, ServerMessage, RoomInfo, ErrorCode, TeamPick, BattlePetPick } from '../../src/server/protocol.ts';
export type {
  BattleEvent,
  GameStateSnapshot,
  PetSnapshot,
  AbilitySnapshot,
  PlayerId,
  PlayerSnapshot,
  StatusSnapshot,
  WeatherType,
  PetRef,
} from '../../src/engine/types.ts';
export type { Element } from '../../src/engine/elements.ts';
export type { PetInfo } from '../../src/data/petRepository.ts';

import type { ServerMessage } from '../../src/server/protocol.ts';
export type Msg<E extends ServerMessage['event']> = Extract<ServerMessage, { event: E }>;
