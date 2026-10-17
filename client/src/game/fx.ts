/** Turns authoritative battle events into visuals and sound. */
import { sfx } from '../audio.ts';
import { ELEMENT_THEME } from '../pets.ts';
import type { BattleEvent, GameStateSnapshot, PlayerId } from '../types.ts';
import type { ArenaRenderer } from './renderer.ts';

const COLORS = {
  damage: '#ff5b5b',
  heal: '#5ee27a',
  dot: '#c18bff',
  miss: '#ffffff',
  block: '#bfe3ff',
  gold: '#ffcf3f',
};

/** Damage numbers grow with the hit: chip damage stays small, big hits shout. */
const damageSize = (amount: number): number => Math.min(46, 22 + amount * 0.45);

export function playEvents(events: BattleEvent[], state: GameStateSnapshot, r: ArenaRenderer, you: PlayerId): void {
  for (const e of events) {
    switch (e.type) {
      case 'SKILL_CAST': {
        const side = r.sideOf(e.actor.player);
        r.lunge(side);
        r.aura(side, e.actor.petIndex, e.possessedBy ? '#c18bff' : '#ffe9a8');
        r.floatText(side, e.actor.petIndex, e.skill, e.possessedBy ? COLORS.dot : '#fff6d8', 16, { pop: 1.25, life: 0.9 });
        if (e.possessedBy) r.floatText(side, e.actor.petIndex, 'DIRASUKI!', COLORS.dot, 20);
        sfx.play('cast');
        break;
      }

      case 'DAMAGE': {
        const side = r.sideOf(e.target.player);
        const idx = e.target.petIndex;
        const big = e.crit || e.amount >= 30;
        const overTime = e.source === 'DOT' || e.source === 'WEATHER';
        const show = () => {
          r.hit(side, idx, e.element, big);
          const halo = e.crit ? '#ffcf3f' : big && e.element ? ELEMENT_THEME[e.element].main : undefined;
          r.floatText(side, idx, `-${e.amount}${e.crit ? '!' : ''}`, e.crit ? COLORS.gold : overTime ? COLORS.dot : COLORS.damage, overTime ? 20 : damageSize(e.amount) + (e.crit ? 8 : 0), {
            pop: e.crit ? 2.3 : big ? 1.9 : overTime ? 1.3 : 1.6,
            glow: halo,
          });
          if (e.crit) r.floatText(side, idx, 'CRITICAL!', '#fff3b0', 18, { pop: 1.4, glow: '#ff9a2e' });
          sfx.play(e.element ? `hit:${e.element}` : 'hit:Earth');
        };
        const attacker = e.attacker;
        if ((e.source === 'SKILL' || e.source === 'REFLECT') && attacker && r.sideOf(attacker.player) !== side) {
          r.projectile(r.sideOf(attacker.player), attacker.petIndex, side, idx, e.element ?? 'Air', show);
        } else if (e.source === 'DOOM') {
          r.hit(side, idx, undefined, true);
          r.floatText(side, idx, 'DOOM', '#c9a6ff', 44, { pop: 2.2, glow: '#9b59ff' });
          sfx.play('ko');
        } else {
          show();
        }
        break;
      }

      case 'MISS': {
        const side = r.sideOf(e.target.player);
        const text = e.reason === 'BLOCK' ? 'BLOCK' : e.reason === 'DODGE' ? 'DODGE' : 'MISS';
        r.projectile(r.sideOf(e.attacker.player), e.attacker.petIndex, side, e.target.petIndex, state.players[e.attacker.player].pets[e.attacker.petIndex].element, () => {
          r.floatText(side, e.target.petIndex, text, e.reason === 'BLOCK' ? COLORS.block : COLORS.miss, 28, { pop: 1.6, glow: e.reason === 'BLOCK' ? '#7fc8ff' : '#ffffff' });
          if (e.reason === 'DECOY') r.sparkle(side, e.target.petIndex, ['#e8f0ff', '#c7d2ee', '#ffffff']);
          sfx.play(e.reason === 'BLOCK' ? 'block' : 'miss');
        });
        break;
      }

      case 'HEAL': {
        const side = r.sideOf(e.target.player);
        r.floatText(side, e.target.petIndex, `+${e.amount}`, COLORS.heal, damageSize(e.amount), { pop: 1.6, glow: '#2fff7a' });
        r.sparkle(side, e.target.petIndex, ['#5ee27a', '#c8ffd2', '#ffffff']);
        sfx.play('heal');
        break;
      }

      case 'HEAL_PREVENTED':
        r.floatText(r.sideOf(e.target.player), e.target.petIndex, 'TRAUMA', '#ff8f9f', 20);
        break;

      case 'STATUS_APPLIED': {
        const side = r.sideOf(e.target.player);
        if (e.status === 'DODGE' && e.label === 'SMOKE') {
          r.floatText(side, e.target.petIndex, 'DEFEND DODGE!', '#e8f0ff', 22, { pop: 1.8, glow: '#9fb8ff' });
          r.sparkle(side, e.target.petIndex, ['#d6e2ff', '#a9b6d6', '#ffffff']);
          break;
        }
        if (e.status === 'DECOY') {
          // Only the owner ever receives this event (the server hides it from the opponent).
          r.floatText(side, e.target.petIndex, 'DECOY (rahasia)', '#e8f0ff', 18, { pop: 1.4 });
          break;
        }
        const notable = ['STUN', 'SILENCE', 'ROOT', 'DOOM', 'TRAUMA', 'DODGE', 'BLOCK', 'REBIRTH', 'COOLDOWN_SLOW', 'COOLDOWN_HASTE'];
        if (notable.includes(e.status)) {
          r.floatText(side, e.target.petIndex, e.label.replace(/_/g, ' '), e.status === 'DODGE' || e.status === 'BLOCK' ? COLORS.block : COLORS.dot, 18, { pop: 1.4 });
        }
        break;
      }

      case 'STATUS_RESISTED':
        r.floatText(r.sideOf(e.target.player), e.target.petIndex, 'RESIST', COLORS.block, 18);
        break;

      case 'SWAP':
        sfx.play('swap');
        break;

      case 'KO': {
        const side = r.sideOf(e.target.player);
        r.hit(side, e.target.petIndex, undefined, true);
        r.shake(14, 420);
        r.floatText(side, e.target.petIndex, 'K.O.!', COLORS.gold, 44, { pop: 2.4, glow: '#ff9a2e', life: 1.5 });
        sfx.play('ko');
        break;
      }

      case 'REVIVE': {
        const side = r.sideOf(e.target.player);
        r.sparkle(side, e.target.petIndex, ['#ffcf3f', '#fff3b0', '#ffffff']);
        r.floatText(side, e.target.petIndex, 'REVIVE!', COLORS.gold, 28, { pop: 1.8, glow: '#ffcf3f' });
        sfx.play('revive');
        break;
      }

      case 'WEATHER_START':
        r.showBanner(e.name.toUpperCase(), '#bfe3ff', 1600);
        sfx.play('weather');
        break;

      case 'ACTION_REJECTED':
        if (e.player === you) sfx.play('denied');
        break;
    }
  }
}
