import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BattleSession } from '../src/engine/BattleSession.ts';
import { getPet } from '../src/data/petCatalog.ts';
import type { PetDefinition } from '../src/engine/types.ts';
import { act, ofType, ready } from './helpers.ts';

const bp = (...names: string[]): PetDefinition[] => names.map(getPet);

function match(p1: PetDefinition[][], p2: PetDefinition[][], seed = 1): BattleSession {
  const s = new BattleSession({
    matchId: 'BP',
    seed,
    players: { p1: { userId: 'A', pets: [p1[0], p1[1]] }, p2: { userId: 'B', pets: [p2[0], p2[1]] } },
  });
  s.start();
  return s;
}

const cast = (s: BattleSession, playerId: 'p1' | 'p2', abilityIndex: number) => act(s, { type: 'CAST_SKILL', playerId, abilityIndex });

describe('battle pet with 3 abilities', () => {
  const earth = () => bp('Puppy Leash', 'Puddy Leash', 'Pet Bunny');
  const filler = () => bp('Piglet Leash', 'Baby Bunny', 'Calf Leash');

  it('starts every ability on its own starting cooldown and exposes all three', () => {
    const s = match([earth(), filler()], [filler(), filler()]);
    const pet = s.getState().players.p1.pets[0];
    assert.equal(pet.name, 'Puppy Leash');
    assert.deepEqual(pet.abilities.map((a) => [a.name, a.cooldown_remaining]), [['Pounce', 2], ['Hairball', 2.5], ['Big Sharp Pointy Teeth', 7.5]]);
  });

  it('abilities have independent cooldowns', () => {
    const s = match([earth(), filler()], [filler(), filler()]);
    ready(s, 'p1');
    const first = cast(s, 'p1', 0);
    assert.equal(ofType(first, 'SKILL_CAST')[0].abilityIndex, 0);
    assert.deepEqual(s.canCastSkill('p1', 1), { ok: false, reason: 'GLOBAL_COOLDOWN' });
    s.players.p1.globalCooldownMs = 0;
    assert.deepEqual(s.canCastSkill('p1', 0), { ok: false, reason: 'ON_COOLDOWN' });
    assert.deepEqual(s.canCastSkill('p1', 1), { ok: true });
    const second = cast(s, 'p1', 2);
    assert.equal(ofType(second, 'SKILL_CAST')[0].skill, 'Big Sharp Pointy Teeth');
    assert.deepEqual(s.activePet('p1').abilities.map((a) => a.cooldownMs), [4000 - 100, 0, 15000 - 50]);
  });

  it('rejects passive slots and missing slots', () => {
    const s = match([bp('Puppy Leash', 'Pet Burrito', 'Pet Bunny'), filler()], [filler(), [getPet('Puppy Leash')]]);
    ready(s, 'p1');
    assert.deepEqual(s.canCastSkill('p1', 1), { ok: false, reason: 'NO_ACTIVE_SKILL' });
    assert.deepEqual(s.canCastSkill('p1', 3), { ok: false, reason: 'NO_ACTIVE_SKILL' });
  });

  it('stun and silence lock every ability of the pet', () => {
    const s = match([earth(), filler()], [bp('Zorbnik Leash', 'Chick Leash', 'Sonar Bracelet'), filler()]);
    ready(s, 'p2');
    cast(s, 'p2', 0);
    ready(s, 'p1');
    for (const i of [0, 1, 2]) assert.deepEqual(s.canCastSkill('p1', i), { ok: false, reason: 'STUNNED' });
  });

  it('merges passives from all three spliced pets', () => {
    const s = match([bp('Puppy Leash', 'Mini Mammoth Leash', 'Pet Burrito'), filler()], [bp('Pet Bunny', 'Puddy Leash', 'Piglet Leash'), filler()]);
    assert.equal(s.activePet('p1').maxHp, 195); // Mammoth Heart +30%
    ready(s, 'p2');
    const hit = ofType(cast(s, 'p2', 0), 'DAMAGE')[0];
    assert.equal(hit.amount, 23); // Big Sharp Pointy Teeth 30 x 0.75 (Stubborn)
  });

  it("each ability hits with its source pet's element; the base pet sets the defending element", () => {
    const s = match([bp('Puppy Leash', 'Mid-Pacific Owl'), filler()], [bp('Fiery Dragon Leash'), filler()]);
    ready(s, 'p1');
    // Swoop is Air (from the Owl) although the base pet is Earth: Air vs Fire = 1.0
    assert.equal(ofType(cast(s, 'p1', 1), 'DAMAGE')[0].amount, 15);

    // Defender: a Piglet-based battle pet defends as Earth, so Air Swoop gets 1.25.
    const t = match([filler(), filler()], [bp('Mid-Pacific Owl'), filler()]);
    ready(t, 'p2');
    assert.equal(ofType(cast(t, 'p2', 0), 'DAMAGE')[0].amount, 19);
  });

  it('Windspeed only shortens the battle pet that carries it, not the other deck slot', () => {
    const other = match([earth(), bp('Summer Kite')], [filler(), filler()]);
    ready(other, 'p1');
    cast(other, 'p1', 0);
    ready(other, 'p1');
    cast(other, 'p1', 2);
    assert.deepEqual(other.activePet('p1').abilities.map((a) => a.cooldownMs), [0, 0, 15000 - 50]);

    const carrier = match([bp('Puppy Leash', 'Summer Kite', 'Pet Bunny'), filler()], [filler(), filler()]);
    ready(carrier, 'p1');
    cast(carrier, 'p1', 0);
    assert.equal(carrier.activePet('p1').abilities[0].cooldownMs, 2000 - 50); // Pounce 4s - 2s
  });

  it('a 1s global cooldown follows every skill, for every ability of the player', () => {
    const s = match([earth(), filler()], [filler(), filler()]);
    ready(s, 'p1');
    cast(s, 'p1', 0);
    assert.equal(s.getState().players.p1.global_cooldown_remaining, 0.95);
    assert.equal(ofType(cast(s, 'p1', 1), 'ACTION_REJECTED')[0].reason, 'GLOBAL_COOLDOWN');
    s.advance(850);
    assert.deepEqual(s.canCastSkill('p1', 1), { ok: false, reason: 'GLOBAL_COOLDOWN' });
    s.advance(50);
    assert.deepEqual(s.canCastSkill('p1', 1), { ok: true });
  });

  it('Draining Beam extends every recharging ability', () => {
    const s = match([bp('Haunted Synthoid'), filler()], [earth(), filler()]);
    const before = s.activePet('p2').abilities.map((a) => a.cooldownMs);
    ready(s, 'p1');
    cast(s, 'p1', 0);
    assert.deepEqual(s.activePet('p2').abilities.map((a) => a.cooldownMs), before.map((ms) => ms + 3000 - 50));
  });

  it('Possession makes the victim use one of its own abilities at random', () => {
    const picks = new Set<string>();
    for (let seed = 1; seed <= 20; seed++) {
      const s = match([bp('Spiritual Resonator'), filler()], [bp('Puppy Leash', 'Puddy Leash', 'Spiritual Resonator'), filler()], seed);
      ready(s, 'p1');
      const casts = ofType(cast(s, 'p1', 0), 'SKILL_CAST');
      assert.equal(casts[1].possessedBy, 'p1');
      picks.add(casts[1].skill);
    }
    assert.deepEqual([...picks].sort(), ['Hairball', 'Pounce']); // never its own Possession
  });

  it('rejects more than 3 abilities', () => {
    assert.throws(() => match([bp('Puppy Leash', 'Puddy Leash', 'Pet Bunny', 'Calf Leash'), filler()], [filler(), filler()]), /1-3 abilities/);
  });
});
