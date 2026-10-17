/**
 * Headless bot-vs-bot battle: `npm run simulate -- [seed]`.
 * Each bot uses the first ready ability of its battle pet and swaps when it drops below 30% HP.
 * There is no timer: the match runs until one side is K.O.
 */
import { BattleSession } from '../src/engine/BattleSession.ts';
import { getPet } from '../src/data/petCatalog.ts';
import type { BattleEvent, PetRef, PlayerId } from '../src/engine/types.ts';

const seed = Number(process.argv[2] ?? 2024);
const session = new BattleSession({
  matchId: 'SIM_' + seed,
  seed,
  players: {
    // Battle Leash: 2 battle pets x 3 spliced pets (any elements; base pet first).
    p1: {
      userId: 'BOT_A',
      pets: [
        ['Mid-Pacific Owl', 'Zorbnik Leash', 'Chick Leash'].map(getPet),
        ['Puppy Leash', 'Pet Bunny', 'Calf Leash'].map(getPet),
      ],
    },
    p2: {
      userId: 'BOT_B',
      pets: [
        ['Fiery Dragon Leash', 'Fire Ants', 'Hot Pepper Leash'].map(getPet),
        ['Baby Turtle', 'Penguin Leash', 'Robo Shark'].map(getPet),
      ],
    },
  },
});

const name = (ref: PetRef) => `${ref.player}:${session.players[ref.player].pets[ref.petIndex].name}`;
const describe = (e: BattleEvent): string | null => {
  switch (e.type) {
    case 'SKILL_CAST': return `${name(e.actor)} uses ${e.skill}`;
    case 'DAMAGE': return `  ${name(e.target)} -${e.amount} (${e.source}${e.crit ? ', CRIT' : ''}) -> ${e.hp} HP`;
    case 'HEAL': return `  ${name(e.target)} +${e.amount} -> ${e.hp} HP`;
    case 'MISS': return `  ${name(e.target)} ${e.reason}!`;
    case 'STATUS_APPLIED': return `  ${name(e.target)} gains ${e.label}`;
    case 'SWAP': return `${e.player} swaps ${e.from} -> ${e.to} (${e.cause})`;
    case 'KO': return `  ${name(e.target)} is K.O.!`;
    case 'MATCH_END': return `MATCH END: winner=${e.winner} (${e.reason})`;
    default: return null;
  }
};

for (const e of session.start()) console.log(describe(e) ?? e.type);
while (session.status === 'IN_PROGRESS') {
  for (const id of ['p1', 'p2'] as PlayerId[]) {
    const pet = session.activePet(id);
    if (pet.hp < pet.maxHp * 0.3 && session.canSwap(id).ok) session.submit({ type: 'SWAP_PET', playerId: id });
    else {
      const ready = pet.abilities.findIndex((_, i) => session.canCastSkill(id, i).ok);
      if (ready >= 0) session.submit({ type: 'CAST_SKILL', playerId: id, abilityIndex: ready });
    }
  }
  for (const e of session.tick().events) {
    const line = describe(e);
    if (line) console.log(`[${(e.t / 1000).toFixed(2).padStart(6)}s] ${line}`);
  }
}
console.log(JSON.stringify(session.getState(), null, 2));
