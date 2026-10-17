import type { BattleEvent, GameStateSnapshot, PetRef, PlayerId } from '../types.ts';

export type LogClass = 'line' | 'dmg' | 'heal' | 'status' | 'sys';

export const REJECT_TEXT: Record<string, string> = {
  ON_COOLDOWN: 'Skill masih cooldown',
  STUNNED: 'Pet sedang stun',
  SILENCED: 'Pet tidak bisa memakai skill',
  SWAP_LOCK: 'Tunggu jeda swap 1.5 detik',
  GLOBAL_COOLDOWN: 'Tunggu jeda skill 1 detik',
  ROOTED: 'Pet terkunci, tidak bisa swap',
  RESERVE_KO: 'Pet cadangan sudah K.O.',
  NO_ACTIVE_SKILL: 'Pet ini punya ability pasif',
  NO_USES_LEFT: 'Skill hanya bisa dipakai sekali',
  NO_VALID_TARGET: 'Belum ada target untuk skill ini',
  PET_KO: 'Pet sudah K.O.',
  WRONG_PET: 'Pet aktif sudah berganti',
  MATCH_NOT_IN_PROGRESS: 'Match belum berjalan',
};

const BUFFS = new Set([
  'DODGE', 'BLOCK', 'DAMAGE_REDUCTION', 'THORNS', 'DECOY', 'REBIRTH', 'HOT',
  'DAMAGE_BOOST', 'RAGE', 'NEXT_ELEMENT_BOOST', 'DOUBLE_DAMAGE_CHANCE', 'COOLDOWN_HASTE',
]);

const MISS_TEXT ={ DODGE: 'menghindar', BLOCK: 'memblokir serangan', DECOY: 'berkorban dan kabur' };

export function describeEvent(e: BattleEvent, state: GameStateSnapshot, you: PlayerId): { text: string; cls: LogClass } | null {
  const who = (p: PlayerId) => (p === you ? 'Kamu' : 'Lawan');
  const pet = (r: PetRef) => `${state.players[r.player].pets[r.petIndex].name} (${who(r.player).toLowerCase()})`;

  switch (e.type) {
    case 'SKILL_CAST':
      return { text: `${pet(e.actor)} memakai ${e.skill}${e.possessedBy ? ' (dirasuki!)' : ''}`, cls: 'line' };
    case 'DAMAGE': {
      const n = `-${e.amount}`;
      switch (e.source) {
        case 'SKILL': return { text: `${pet(e.target)} ${n}${e.crit ? ' CRIT x2!' : ''}`, cls: 'dmg' };
        case 'DOT': return { text: `${pet(e.target)} ${n} (${e.label ?? 'DoT'})`, cls: 'status' };
        case 'WEATHER': return { text: `${pet(e.target)} ${n} (${e.label ?? 'cuaca'})`, cls: 'status' };
        case 'REFLECT': return { text: `${pet(e.target)} ${n} (pantulan duri)`, cls: 'dmg' };
        case 'RECOIL': return { text: `${pet(e.target)} ${n} (recoil)`, cls: 'dmg' };
        case 'SWAP_PUNISH': return { text: `${pet(e.target)} ${n} (Lockjaw!)`, cls: 'dmg' };
        case 'DOOM': return { text: `${pet(e.target)} dijemput DOOM!`, cls: 'dmg' };
      }
      return null;
    }
    case 'HEAL':
      return { text: `${pet(e.target)} +${e.amount} HP`, cls: 'heal' };
    case 'HEAL_PREVENTED':
      return { text: `${pet(e.target)} tidak bisa heal (Trauma)`, cls: 'status' };
    case 'MISS':
      return { text: `${pet(e.target)} ${MISS_TEXT[e.reason]}`, cls: 'line' };
    case 'STATUS_APPLIED': {
      const verb = BUFFS.has(e.status) ? 'mendapat' : 'terkena';
      return { text: `${pet(e.target)} ${verb} ${e.label}${e.durationSec ? ` ${e.durationSec}s` : ''}`, cls: 'status' };
    }
    case 'STATUS_REFRESHED':
      return e.stacks > 1 ? { text: `${pet(e.target)} ${e.label} x${e.stacks}`, cls: 'status' } : null;
    case 'STATUS_RESISTED':
      return { text: `${pet(e.target)} kebal terhadap ${e.label}`, cls: 'status' };
    case 'STATUS_REMOVED':
      if (e.reason === 'PURGED') return { text: `${e.label} milik ${pet(e.target)} dihapus`, cls: 'status' };
      if (e.reason === 'STOLEN') return { text: `${e.label} milik ${pet(e.target)} dicuri`, cls: 'status' };
      if (e.reason === 'TRANSFERRED') return { text: `${e.label} dipindah dari ${pet(e.target)}`, cls: 'status' };
      return null;
    case 'SWAP': {
      const next = state.players[e.player].pets[e.to].name;
      const how = { PLAYER: 'mengganti pet ke', FORCED: 'dipaksa swap ke', KO: 'menurunkan', DECOY: 'kabur, digantikan' }[e.cause];
      return { text: `${who(e.player)} ${how} ${next}`, cls: 'line' };
    }
    case 'KO':
      return { text: `${pet(e.target)} K.O.!`, cls: 'sys' };
    case 'REVIVE':
      return { text: `${pet(e.target)} bangkit dengan ${e.hp} HP`, cls: 'heal' };
    case 'COOLDOWN_EXTENDED':
      return { text: `Cooldown ${pet(e.target)} +${e.seconds}s`, cls: 'status' };
    case 'WEATHER_START':
      return { text: `Cuaca: ${e.name} (${e.durationSec}s)`, cls: 'sys' };
    case 'WEATHER_END':
      return e.reason === 'EXPIRED' ? { text: `${e.name} berakhir`, cls: 'sys' } : null;
    case 'SKILL_FIZZLED':
      return { text: `${e.skill} gagal`, cls: 'line' };
    case 'SKILL_PHASE':
      return { text: `${pet(e.actor)}: ${e.phase}${e.phase === 'GROW' ? ` x${e.stacks}` : ''}`, cls: 'line' };
    case 'ACTION_REJECTED':
      return e.player === you ? { text: REJECT_TEXT[e.reason] ?? e.reason, cls: 'sys' } : null;
    case 'LAG_COMPENSATED':
      return e.player === you ? { text: `Aksi tetap dijalankan (kompensasi lag ${e.lagMs} ms)`, cls: 'sys' } : null;
    default:
      return null;
  }
}
