import { STATUS_RULES } from './status.ts';
import { PLAYER_IDS, type BattleEvent, type GameStateSnapshot, type PetSnapshot, type PlayerId } from './types.ts';

/**
 * Some statuses are secret to their owner (Decoy: the attacker must not know the
 * next hit will be dodged). `viewer` keeps its own pets intact and strips the
 * secret statuses from the opponent's; `null` strips them from everyone, which
 * gives two clients' views a common form to compare.
 */
export function redactState(state: GameStateSnapshot, viewer: PlayerId | null): GameStateSnapshot {
  const strip = (pet: PetSnapshot): PetSnapshot => ({
    ...pet,
    active_buffs: pet.active_buffs.filter((s) => !STATUS_RULES[s.status].hiddenFromOpponent),
    active_debuffs: pet.active_debuffs.filter((s) => !STATUS_RULES[s.status].hiddenFromOpponent),
  });
  const players = { ...state.players };
  for (const id of PLAYER_IDS) {
    if (id !== viewer) players[id] = { ...players[id], pets: players[id].pets.map(strip) };
  }
  return { ...state, players };
}

/** Rejections are private to the sender; secret status changes are private to the pet's owner. */
export function eventVisibleTo(event: BattleEvent, viewer: PlayerId): boolean {
  switch (event.type) {
    case 'ACTION_REJECTED':
      return event.player === viewer;
    case 'STATUS_APPLIED':
    case 'STATUS_REFRESHED':
    case 'STATUS_RESISTED':
    case 'STATUS_REMOVED':
      return event.target.player === viewer || !STATUS_RULES[event.status].hiddenFromOpponent;
    default:
      return true;
  }
}
