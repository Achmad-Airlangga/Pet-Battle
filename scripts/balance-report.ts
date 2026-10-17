/**
 * Balance report: how fast do matches reach a K.O.? (There is no timer.)
 *
 *   npm run balance                  # DPS table + headless sweep over HP values
 *   npm run balance -- --matches 2000 --hp 150,100,50
 *
 * Runs the real engine without sockets (fast), with bots that cast as soon as
 * a skill is ready and swap away from passive-only pets.
 */
import { parseArgs } from 'node:util';
import { PET_ROSTER, getPetInfo } from '../src/data/petRepository.ts';
import { BattleSession } from '../src/engine/BattleSession.ts';
import type { BattlePetSpec } from '../src/engine/pet.ts';
import { randomBattlePet } from '../src/sim/teams.ts';
import { Rng } from '../src/engine/rng.ts';
import type { PetDefinition, PlayerId, SkillDefinition } from '../src/engine/types.ts';

const { values } = parseArgs({
  options: {
    matches: { type: 'string', default: '1000' },
    hp: { type: 'string', default: '150' },
    cap: { type: 'string', default: '600' },
    seed: { type: 'string', default: '11' },
  },
});

/** Element-neutral expected damage of one cast (direct hits + DoT), ignoring dodge/block. */
function damagePerCast(skill: SkillDefinition): number {
  let total = 0;
  for (const e of skill.effects) {
    if (e.kind === 'damage') {
      if (e.perCharge !== undefined) total += e.perCharge * 3; // ~3 charges between casts
      else total += typeof e.amount === 'number' ? e.amount : (e.amount.min + e.amount.max) / 2;
    } else if (e.kind === 'status' && e.status === 'DOT') {
      const dur = typeof e.durationSec === 'number' ? e.durationSec : (e.durationSec.min + e.durationSec.max) / 2;
      total += (e.value ?? 0) * Math.floor(dur / (e.intervalSec ?? 1));
    } else if (e.kind === 'growtopianCycle') {
      total += (e.punchDamage + e.punchPerGrow * 2) / 3;
    } else if (e.kind === 'weather' && e.weather === 'TOXIC_CLOUD') {
      total += 4 * (e.durationSec / 5); // hits both sides; counted once
    }
  }
  return total;
}

const pct = (xs: number[], p: number) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.floor(xs.length * p))];

// ---------------------------------------------------------------------------
// 1. DPS table
// ---------------------------------------------------------------------------

const withSkill = PET_ROSTER.filter((p) => p.skill);
const dps = withSkill.map((p) => ({ pet: p, dps: damagePerCast(p.skill!) / p.skill!.cooldownSec }));
const damaging = dps.filter((d) => d.dps > 0);
const dpsValues = damaging.map((d) => d.dps);
const mean = dpsValues.reduce((a, b) => a + b, 0) / dpsValues.length;

console.log('== Damage per second per pet (element-neutral, no dodge/block) ==');
console.log(`pets: ${PET_ROSTER.length} | with active skill: ${withSkill.length} | deal damage: ${damaging.length} | passive: ${PET_ROSTER.length - withSkill.length} | utility-only skills: ${withSkill.length - damaging.length}`);
console.log(`DPS  median ${pct(dpsValues, 0.5).toFixed(2)} | mean ${mean.toFixed(2)} | p10 ${pct(dpsValues, 0.1).toFixed(2)} | p90 ${pct(dpsValues, 0.9).toFixed(2)} | max ${Math.max(...dpsValues).toFixed(2)}`);
const top = [...damaging].sort((a, b) => b.dps - a.dps).slice(0, 5);
console.log(`top: ${top.map((d) => `${d.pet.name} ${d.dps.toFixed(1)}`).join(', ')}`);
const hpPool = 300;
console.log(`time to burn a 2x150 HP team at median DPS: ${(hpPool / pct(dpsValues, 0.5)).toFixed(0)}s; at mean DPS: ${(hpPool / mean).toFixed(0)}s`);
console.log(`with 3 abilities per battle pet (Growtopia Battle Leash): ~${(hpPool / (3 * pct(dpsValues, 0.5))).toFixed(0)}s at median DPS\n`);

// ---------------------------------------------------------------------------
// 2. Headless match sweep. Matches have no timer, so we measure how long a
//    K.O. takes; a match still running at --cap is a stalemate that one
//    player would have to end by surrendering.
// ---------------------------------------------------------------------------

function play(teams: [BattlePetSpec[], BattlePetSpec[]], seed: number, capSec: number) {
  const s = new BattleSession({
    matchId: 'BAL',
    seed,
    lagCompensationMs: 0,
    players: { p1: { userId: 'A', pets: [teams[0][0], teams[0][1]] }, p2: { userId: 'B', pets: [teams[1][0], teams[1][1]] } },
  });
  s.start();
  while (s.status === 'IN_PROGRESS' && s.elapsedMs < capSec * 1000) {
    for (const id of ['p1', 'p2'] as PlayerId[]) {
      const usable = (i: 0 | 1) => s.players[id].pets[i].abilities.some((a) => a.skill && a.usesLeft > 0);
      const active = s.players[id].activeIndex;
      if (!usable(active) && usable(active === 0 ? 1 : 0) && s.canSwap(id).ok) {
        s.submit({ type: 'SWAP_PET', playerId: id });
        continue;
      }
      const ready = s.activePet(id).abilities.findIndex((_, i) => s.canCastSkill(id, i).ok);
      if (ready >= 0) s.submit({ type: 'CAST_SKILL', playerId: id, abilityIndex: ready });
    }
    s.tick();
  }
  return { ko: s.endReason === 'KO', seconds: s.elapsedMs / 1000 };
}

const matches = Number(values.matches);
const cap = Number(values.cap);
console.log(`== Headless sweep: ${matches} random mixed-element teams per row, no timer (stalemate cut-off ${cap}s) ==`);
console.log('abilities/pet | base HP | K.O. by 60s | by 120s | by 300s | stalemate | median time to K.O.');
const share = (n: number) => `${((n / matches) * 100).toFixed(0)}%`;
for (const abilities of [1, 3]) {
  for (const hp of values.hp.split(',').map(Number)) {
    const rng = new Rng(Number(values.seed));
    const withHp = (id: string): PetDefinition => ({ ...getPetInfo(id), maxHp: hp });
    const battlePet = (): BattlePetSpec => randomBattlePet(rng).slice(0, abilities).map(withHp);
    const results = Array.from({ length: matches }, (_, i) => play([[battlePet(), battlePet()], [battlePet(), battlePet()]], i + 1, cap));
    const by = (sec: number) => results.filter((r) => r.ko && r.seconds <= sec).length;
    const kos = results.filter((r) => r.ko).map((r) => r.seconds);
    console.log(
      `${String(abilities).padStart(13)} | ${String(hp).padStart(7)} | ${share(by(60)).padStart(11)} | ${share(by(120)).padStart(7)} | ` +
        `${share(by(300)).padStart(7)} | ${share(matches - kos.length).padStart(9)} | ${kos.length ? pct(kos, 0.5).toFixed(0) : '-'}s`,
    );
  }
}
