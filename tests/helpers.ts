import { BattleSession } from '../src/engine/BattleSession.ts';
import { getPet } from '../src/data/petCatalog.ts';
import type { BattleEvent, Command, PetDefinition, PlayerId } from '../src/engine/types.ts';

export interface SetupOptions {
  seed?: number;
  random?: () => number;
}

/** A pet to put in a team: a catalog name/id, or an inline definition for engine tests. */
export type TeamPet = string | PetDefinition;

const resolvePet = (pet: TeamPet): PetDefinition => (typeof pet === 'string' ? getPet(pet) : pet);

/** Creates and starts a match. Pets are looked up by name or id in the catalog. */
export function setup(p1: [TeamPet, TeamPet], p2: [TeamPet, TeamPet], options: SetupOptions = {}): BattleSession {
  const session = new BattleSession({
    matchId: 'TEST_MATCH',
    players: {
      p1: { userId: 'USER_A', pets: [resolvePet(p1[0]), resolvePet(p1[1])] },
      p2: { userId: 'USER_B', pets: [resolvePet(p2[0]), resolvePet(p2[1])] },
    },
    seed: options.seed ?? 1,
    random: options.random,
  });
  session.start();
  return session;
}

/** Skip the starting cooldown, the global cooldown and any swap lock for a player's active pet. */
export function ready(session: BattleSession, playerId: PlayerId): void {
  for (const a of session.activePet(playerId).abilities) a.cooldownMs = 0;
  session.players[playerId].swapCooldownMs = 0;
  session.players[playerId].globalCooldownMs = 0;
}

export function act(session: BattleSession, command: Command): BattleEvent[] {
  session.submit(command);
  return session.tick().events;
}

export function cast(session: BattleSession, playerId: PlayerId): BattleEvent[] {
  return act(session, { type: 'CAST_SKILL', playerId });
}

export function swap(session: BattleSession, playerId: PlayerId): BattleEvent[] {
  return act(session, { type: 'SWAP_PET', playerId });
}

export function readyCast(session: BattleSession, playerId: PlayerId): BattleEvent[] {
  ready(session, playerId);
  return cast(session, playerId);
}

export function ofType<T extends BattleEvent['type']>(events: BattleEvent[], type: T): Extract<BattleEvent, { type: T }>[] {
  return events.filter((e): e is Extract<BattleEvent, { type: T }> => e.type === type);
}
