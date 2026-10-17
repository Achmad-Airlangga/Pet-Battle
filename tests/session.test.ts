import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { BattleSession } from '../src/engine/BattleSession.ts';
import { TickLoop } from '../src/engine/TickLoop.ts';
import { PET_CATALOG, getPet } from '../src/data/petCatalog.ts';
import type { BattleEvent, PetDefinition, PlayerId } from '../src/engine/types.ts';
import { eventVisibleTo } from '../src/engine/visibility.ts';
import { act, cast, ofType, ready, readyCast, setup, swap } from './helpers.ts';

/**
 * Leashed Silkworm - Red ("Death Ray / Heat Wave") now only deals damage, so no
 * catalog pet summons Heat Wave any more. The weather is still an engine feature,
 * so its tests drive the original ability through this inline pet.
 */
const HEAT_WAVE_PET: PetDefinition = {
  id: 'heat_wave_test_pet',
  name: 'Heat Wave Test Pet',
  element: 'Fire',
  ability: 'Heat Wave',
  skill: {
    name: 'Heat Wave',
    cooldownSec: 60,
    initialCooldownSec: 12,
    effects: [{ kind: 'weather', weather: 'HEAT_WAVE', durationSec: 60 }],
  },
};

describe('match lifecycle', () => {
  it('resets every pet to full HP and applies starting cooldowns', () => {
    const s = setup(['Mid-Pacific Owl', 'Mini Mammoth Leash'], ['Puppy Leash', 'Piglet Leash']);
    const state = s.getState();
    assert.equal(state.status, 'IN_PROGRESS');
    assert.equal(state.elapsed_sec, 0);
    assert.equal(state.players.p1.pets[0].current_hp, 150);
    assert.equal(state.players.p1.pets[1].max_hp, 195); // Mammoth Heart +30%
    assert.equal(state.players.p1.pets[0].abilities[0].cooldown_remaining, 5); // Swoop: 10s, starts at 5s
    assert.equal(state.players.p2.pets[0].abilities[0].cooldown_remaining, 2); // Pounce: 4s, starts at 2s
  });

  it('rejects casting during the starting cooldown, then allows it after exactly 100 ticks', () => {
    const s = setup(['Mid-Pacific Owl', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    const rejected = ofType(cast(s, 'p1'), 'ACTION_REJECTED');
    assert.equal(rejected[0].reason, 'ON_COOLDOWN');
    s.advance(4950); // 1 tick already elapsed above, 99 more
    assert.equal(s.tickCount, 100);
    assert.deepEqual(s.canCastSkill('p1'), { ok: true });
    assert.equal(ofType(cast(s, 'p1'), 'SKILL_CAST').length, 1);
  });

  it('runs the cooldown down by 50ms per tick after a cast', () => {
    const s = setup(['Mid-Pacific Owl', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    readyCast(s, 'p1');
    assert.equal(s.getState().players.p1.pets[0].abilities[0].cooldown_remaining, 9.95);
    let ticks = 1;
    while (!s.canCastSkill('p1').ok) {
      s.tick();
      ticks++;
    }
    assert.equal(ticks, 200); // 10s / 50ms
  });

  it('ends by KO with auto-swap to the reserve pet', () => {
    const s = setup(['Puppy Leash', 'Piglet Leash'], ['Piglet Leash', 'Puddy Leash']);
    s.activePet('p2').hp = 1;
    const events = readyCast(s, 'p1');
    assert.equal(ofType(events, 'KO').length, 1);
    assert.deepEqual(ofType(events, 'SWAP')[0], { ...ofType(events, 'SWAP')[0], player: 'p2', cause: 'KO', to: 1 });
    assert.equal(s.status, 'IN_PROGRESS');

    s.activePet('p2').hp = 1;
    const end = readyCast(s, 'p1');
    assert.equal(ofType(end, 'MATCH_END')[0].winner, 'p1');
    assert.equal(s.status, 'FINISHED');
    assert.equal(s.endReason, 'KO');
    assert.deepEqual(s.tick().events, []);
  });

  it('has no timer: a match keeps running until K.O. or surrender', () => {
    const s = setup(['Baby Bunny', 'Baby Bunny'], ['Baby Bunny', 'Baby Bunny']);
    s.activePet('p1').hp = 100;
    s.advance(10 * 60_000); // ten minutes
    assert.equal(s.status, 'IN_PROGRESS');
    assert.equal(s.getState().elapsed_sec, 600);
    assert.deepEqual(s.forfeit('p2').map((e) => e.type), ['MATCH_END']);
    assert.equal(s.winner, 'p1');
    assert.equal(s.endReason, 'FORFEIT');
  });
});

describe('damage resolution', () => {
  it('applies the element multiplier', () => {
    const vsEarth = setup(['Mid-Pacific Owl', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    assert.equal(ofType(readyCast(vsEarth, 'p1'), 'DAMAGE')[0].amount, 19); // 15 x 1.25
    const vsWater = setup(['Mid-Pacific Owl', 'Puppy Leash'], ['Penguin Leash', 'Piglet Leash']);
    assert.equal(ofType(readyCast(vsWater, 'p1'), 'DAMAGE')[0].amount, 11); // 15 x 0.75
  });

  it('Dodge evades normal attacks and cancels their riders, Undodgeable goes through', () => {
    const s = setup(['Zorbnik Leash', 'Sonar Bracelet'], ['Butterfly Leash', 'Puppy Leash']);
    readyCast(s, 'p2'); // Acrobatics: Dodge 5s
    const miss = readyCast(s, 'p1');
    assert.equal(ofType(miss, 'MISS')[0].reason, 'DODGE');
    assert.equal(ofType(miss, 'STATUS_APPLIED').length, 0); // no Stun rider
    swap(s, 'p1');
    const hit = readyCast(s, 'p1'); // Sonic Burst, Undodgeable
    assert.equal(ofType(hit, 'DAMAGE')[0].amount, 9);
  });

  it('Block stops normal attacks, Unblockable goes through', () => {
    const s = setup(['Puppy Leash', 'Chick Leash'], ['Leashed Silkworm - Grey', 'Piglet Leash']);
    readyCast(s, 'p2'); // Stoneform: Block 5s
    assert.equal(ofType(readyCast(s, 'p1'), 'MISS')[0].reason, 'BLOCK');
    swap(s, 'p1');
    assert.equal(ofType(readyCast(s, 'p1'), 'DAMAGE')[0].amount, 11); // Chirp 9 x 1.25
  });

  it('Precision attacks gain their bonus against a blocking target', () => {
    const open = setup(['Grey Pet Pteranodon', 'Puppy Leash'], ['Leashed Silkworm - Grey', 'Piglet Leash']);
    assert.equal(ofType(readyCast(open, 'p1'), 'DAMAGE')[0].amount, 9); // 7 x 1.25 = 8.75
    const blocking = setup(['Grey Pet Pteranodon', 'Puppy Leash'], ['Leashed Silkworm - Grey', 'Piglet Leash']);
    readyCast(blocking, 'p2');
    assert.equal(ofType(readyCast(blocking, 'p1'), 'DAMAGE')[0].amount, 11); // 7 x 1.25 x 1.25
  });

  it('Dino bonus applies only against the listed element', () => {
    const s = setup(['Grey Pet Apatosaurus', 'Puppy Leash'], ['Penguin Leash', 'Piglet Leash']);
    assert.equal(ofType(readyCast(s, 'p1'), 'DAMAGE')[0].amount, 23); // 15 x 0.75 x 2.0 = 22.5
  });

  it('Shell Defense reduces 80% and Stubborn reduces 25%', () => {
    const shell = setup(['Puppy Leash', 'Piglet Leash'], ['Baby Turtle', 'Piglet Leash']);
    readyCast(shell, 'p2');
    assert.equal(ofType(readyCast(shell, 'p1'), 'DAMAGE')[0].amount, 2); // 9 x 0.2 = 1.8
    const stubborn = setup(['Pet Bunny', 'Piglet Leash'], ['Pet Burrito', 'Piglet Leash']);
    assert.equal(ofType(readyCast(stubborn, 'p1'), 'DAMAGE')[0].amount, 23); // 30 x 0.75 = 22.5
  });

  it('Howl grants a 30s +25% damage buff', () => {
    const s = setup(["Wolf Tamer's Glove", 'Pet Bunny'], ['Piglet Leash', 'Puppy Leash']);
    readyCast(s, 'p1');
    assert.deepEqual(s.getState().players.p1.pets[0].active_buffs[0], { type: 'HOWL', status: 'DAMAGE_BOOST', duration: 29.95, value: 0.25 });
  });

  it('Spicy Ignite boosts the next Fire attack by 20% and is consumed by it', () => {
    const s = setup(['Hot Pepper Leash', 'Puppy Leash'], ['Piglet Leash', 'Puppy Leash']);
    assert.equal(ofType(readyCast(s, 'p1'), 'DAMAGE')[0].amount, 12); // 16 x 0.75
    const second = readyCast(s, 'p1');
    assert.equal(ofType(second, 'DAMAGE')[0].amount, 14); // 16 x 0.75 x 1.2 = 14.4
    assert.equal(ofType(second, 'STATUS_REMOVED')[0].reason, 'CONSUMED');
    assert.equal(s.activePet('p1').find('NEXT_ELEMENT_BOOST')?.label, 'SPICY'); // re-armed
  });

  it('Recoil damages the caster, thorns reflect to the attacker', () => {
    const recoil = setup(['Leashed Silkworm - White', 'Puppy Leash'], ['Piglet Leash', 'Puppy Leash']);
    readyCast(recoil, 'p1');
    assert.equal(recoil.activePet('p1').hp, 146);

    const needles = setup(['Puppy Leash', 'Piglet Leash'], ['Tumbleweed Attractor', 'Piglet Leash']);
    readyCast(needles, 'p2');
    const first = readyCast(needles, 'p1');
    assert.equal(ofType(first, 'DAMAGE').find((e) => e.source === 'REFLECT')?.amount, 5);
    const second = readyCast(needles, 'p1');
    assert.equal(ofType(second, 'DAMAGE').filter((e) => e.source === 'REFLECT').length, 1); // Needles persists
  });

  it('Spikey Shield reflects once and is consumed', () => {
    const s = setup(['Puppy Leash', 'Piglet Leash'], ['Prickly Pet', 'Piglet Leash']);
    readyCast(s, 'p2');
    const first = readyCast(s, 'p1');
    assert.equal(ofType(first, 'DAMAGE').find((e) => e.source === 'REFLECT')?.amount, 20);
    assert.equal(ofType(first, 'STATUS_REMOVED')[0].reason, 'CONSUMED');
    assert.equal(ofType(readyCast(s, 'p1'), 'DAMAGE').filter((e) => e.source === 'REFLECT').length, 0);
  });

  it('Static Charge stores one charge per hit taken and releases 5 per charge', () => {
    const s = setup(['Betty Bluetooth Doll', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    for (let i = 0; i < 3; i++) readyCast(s, 'p2');
    assert.equal(s.activePet('p1').charges, 3);
    const release = readyCast(s, 'p1');
    assert.equal(ofType(release, 'DAMAGE')[0].amount, 19); // 3 x 5 = 15, Air vs Earth x 1.25 = 18.75
    assert.equal(s.activePet('p1').charges, 0);
  });

  it('Mini Growtopian cycles Punch -> Build -> Grow and scales', () => {
    const s = setup(['Mini Growtopian', 'Puppy Leash'], ['Piglet Leash', 'Puppy Leash']);
    assert.equal(ofType(readyCast(s, 'p1'), 'DAMAGE')[0].amount, 8);
    assert.equal(ofType(readyCast(s, 'p1'), 'STATUS_APPLIED')[0].label, 'BUILD');
    assert.equal(ofType(readyCast(s, 'p1'), 'SKILL_PHASE')[0].stacks, 1);
    assert.equal(ofType(readyCast(s, 'p1'), 'DAMAGE')[0].amount, 12);
  });
});

describe('status effects', () => {
  it('Stun locks skill and swap, then expires', () => {
    const s = setup(['Zorbnik Leash', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    readyCast(s, 'p1');
    ready(s, 'p2');
    assert.deepEqual(s.canCastSkill('p2'), { ok: false, reason: 'STUNNED' });
    assert.deepEqual(s.canSwap('p2'), { ok: false, reason: 'STUNNED' });
    const later = s.advance(3000);
    assert.equal(ofType(later, 'STATUS_REMOVED')[0].reason, 'EXPIRED');
    assert.deepEqual(s.canSwap('p2'), { ok: true });
  });

  it('Enthrall silences but still allows swapping; Bubble Trap roots', () => {
    const s = setup(['Lovebird Pendant', 'Seahorse Companion'], ['Puppy Leash', 'Piglet Leash']);
    readyCast(s, 'p1');
    ready(s, 'p2');
    assert.deepEqual(s.canCastSkill('p2'), { ok: false, reason: 'SILENCED' });
    assert.deepEqual(s.canSwap('p2'), { ok: true });

    const r = setup(['Seahorse Companion', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    readyCast(r, 'p1');
    ready(r, 'p2');
    assert.deepEqual(r.canSwap('p2'), { ok: false, reason: 'ROOTED' });
    assert.deepEqual(r.canCastSkill('p2'), { ok: true });
  });

  it('Burn ticks once per second for its duration', () => {
    const s = setup(['Fiery Dragon Leash', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    const hit = readyCast(s, 'p1');
    assert.equal(ofType(hit, 'DAMAGE')[0].amount, 18); // 24 x 0.75 (Fire vs Earth)
    const dots = ofType(s.advance(5000), 'DAMAGE').filter((e) => e.source === 'DOT');
    assert.deepEqual(dots.map((d) => d.amount), [2, 2, 2, 2]);
    assert.equal(s.activePet('p2').hp, 150 - 18 - 8);
  });

  it('Trauma prevents healing', () => {
    const s = setup(['Grey Pet Tyrannosaurus', 'Puppy Leash'], ['Piglet Leash', 'Puppy Leash']);
    readyCast(s, 'p1');
    assert.equal(s.activePet('p2').hp, 150 - 36); // 29 x 1.25
    const heal = readyCast(s, 'p2');
    assert.equal(ofType(heal, 'HEAL_PREVENTED').length, 1);
    s.advance(3000);
    assert.equal(ofType(readyCast(s, 'p2'), 'HEAL')[0].amount, 20);
  });

  it('Doom KOs the target unless it swaps out', () => {
    const doomed = setup(["Death's Scarf", 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    readyCast(doomed, 'p1');
    const events = doomed.advance(20_000);
    assert.equal(ofType(events, 'DAMAGE').find((e) => e.source === 'DOOM')?.amount, 150);
    assert.equal(doomed.players.p2.pets[0].ko, true);

    const escaped = setup(["Death's Scarf", 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    readyCast(escaped, 'p1');
    const out = swap(escaped, 'p2');
    assert.equal(ofType(out, 'STATUS_REMOVED')[0].reason, 'SWAP_OUT');
    escaped.advance(20_000);
    assert.equal(escaped.players.p2.pets[0].ko, false);
  });

  it('Exoskeleton shortens debuffs by 2s and fully resists short ones', () => {
    const s = setup(['Zorbnik Leash', 'Electro Magnifying Glass'], ['Ladybug Leaf', 'Puppy Leash']);
    const stun = ofType(readyCast(s, 'p1'), 'STATUS_APPLIED')[0];
    assert.equal(stun.durationSec, 1);
    s.advance(1000);
    swap(s, 'p1');
    assert.equal(ofType(readyCast(s, 'p1'), 'STATUS_RESISTED').length, 1);
  });

  it('Mud Glob makes cooldowns recover 2x slower', () => {
    const s = setup(['Muddy Pants', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    readyCast(s, 'p1');
    s.activePet('p2').abilities[0].cooldownMs = 4000;
    s.advance(1000);
    assert.equal(s.activePet('p2').abilities[0].cooldownMs, 3500);
  });

  it('Draining Beam adds 3s to recharging enemy skills', () => {
    const s = setup(['Haunted Synthoid', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    const before = s.players.p2.pets.map((p) => p.abilities[0].cooldownMs);
    readyCast(s, 'p1');
    assert.deepEqual(s.players.p2.pets.map((p) => p.abilities[0].cooldownMs), before.map((ms) => ms + 3000 - 50));
  });

  it('Hydro Splash purges enemy buffs', () => {
    const s = setup(['Water Balloon', 'Puppy Leash'], ["Wolf Tamer's Glove", 'Piglet Leash']);
    readyCast(s, 'p2');
    const events = readyCast(s, 'p1');
    assert.equal(ofType(events, 'STATUS_REMOVED')[0].reason, 'PURGED');
    assert.equal(s.activePet('p2').statuses.length, 0);
  });

  it('Face Slap gives the enemy stacking Rage', () => {
    const s = setup(['Leashed Silkworm - Purple', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    readyCast(s, 'p1');
    readyCast(s, 'p1');
    assert.equal(s.activePet('p2').find('RAGE')?.stacks, 2);
    assert.equal(ofType(readyCast(s, 'p2'), 'DAMAGE')[0].amount, 10); // 9 x 0.75 (Earth vs Air) x 1.5 = 10.125
  });
});

describe('special skills', () => {
  it('Forced swap moves the enemy to its reserve with a swap lock', () => {
    const s = setup(['Calf Leash', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    const events = readyCast(s, 'p1');
    assert.equal(ofType(events, 'SWAP')[0].cause, 'FORCED');
    assert.equal(s.players.p2.activeIndex, 1);
    assert.deepEqual(s.canCastSkill('p2'), { ok: false, reason: 'SWAP_LOCK' });
  });

  it('Swapping locks skills and swaps for 1.5s', () => {
    const s = setup(['Puppy Leash', 'Piglet Leash'], ['Puppy Leash', 'Piglet Leash']);
    swap(s, 'p1');
    s.activePet('p1').abilities[0].cooldownMs = 0;
    assert.deepEqual(s.canCastSkill('p1'), { ok: false, reason: 'SWAP_LOCK' });
    assert.deepEqual(s.canSwap('p1'), { ok: false, reason: 'SWAP_LOCK' });
    s.advance(1400);
    assert.equal(s.canCastSkill('p1').ok, false);
    s.advance(50);
    assert.deepEqual(s.canCastSkill('p1'), { ok: true });
  });

  it('Lockjaw punishes a swap within 2s on both enemy pets', () => {
    const s = setup(["14DEViL's Friendly Doggy Leash", 'Puppy Leash'], ['Piglet Leash', 'Puppy Leash']);
    readyCast(s, 'p1');
    swap(s, 'p2');
    assert.deepEqual(s.players.p2.pets.map((p) => p.hp), [150 - 85 - 40, 150 - 40]);
  });

  it('Self Sacrifice evades even Undodgeable, swaps out and gives the partner Dodge', () => {
    const s = setup(['Cosmic Unicorn Bracelet', 'Puppy Leash'], ['Cloud Rabbit', 'Piglet Leash']);
    readyCast(s, 'p2');
    const events = readyCast(s, 'p1');
    assert.equal(ofType(events, 'MISS')[0].reason, 'DECOY');
    assert.equal(ofType(events, 'SWAP')[0].cause, 'DECOY');
    assert.equal(s.activePet('p2').find('DODGE')?.label, 'SMOKE');
  });

  it('Possession makes the enemy hit itself, and redirects its heals', () => {
    const s = setup(['Spiritual Resonator', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    const cdBefore = s.activePet('p2').abilities[0].cooldownMs;
    const events = readyCast(s, 'p1');
    assert.equal(ofType(events, 'SKILL_CAST')[1].possessedBy, 'p1');
    assert.equal(s.activePet('p2').hp, 141); // Pounce 9 on itself
    assert.equal(s.activePet('p2').abilities[0].cooldownMs, cdBefore - 50);

    const heal = setup(['Spiritual Resonator', 'Puppy Leash'], ['Piglet Leash', 'Puppy Leash']);
    heal.activePet('p1').hp = 100;
    readyCast(heal, 'p1');
    assert.equal(heal.activePet('p1').hp, 120); // Wallow went to the possessor
  });

  it('Mind Swap steals buffs and hands over debuffs', () => {
    const s = setup(['Thinking Cap', 'Puppy Leash'], ['Grey Pet Tyranopatos', 'Butterfly Leash']);
    readyCast(s, 'p2'); // Grinding Jaws: Trauma 30s on p1
    assert.equal(s.activePet('p1').has('TRAUMA'), true);
    swap(s, 'p2');
    readyCast(s, 'p2'); // Acrobatics on Butterfly
    readyCast(s, 'p1');
    assert.equal(s.activePet('p1').has('DODGE'), true);
    assert.equal(s.activePet('p1').has('TRAUMA'), false);
    assert.equal(s.activePet('p2').has('TRAUMA'), true);
    assert.equal(s.activePet('p2').has('DODGE'), false);
  });

  it('Wish revives a KO partner once per battle', () => {
    const s = setup(["Onisim's Genie", 'Puppy Leash'], ['Piglet Leash', 'Puppy Leash']);
    ready(s, 'p1');
    assert.deepEqual(s.canCastSkill('p1'), { ok: false, reason: 'NO_VALID_TARGET' });
    const partner = s.reservePet('p1');
    partner.hp = 0;
    partner.ko = true;
    const events = cast(s, 'p1');
    assert.equal(ofType(events, 'REVIVE')[0].hp, 45);
    assert.equal(partner.ko, false);
    ready(s, 'p1');
    assert.deepEqual(s.canCastSkill('p1'), { ok: false, reason: 'NO_USES_LEFT' });
  });

  it('Blazing Rebirth revives at 10% HP when KO within 5s', () => {
    const s = setup(['Puppy Leash', 'Piglet Leash'], ['Phoenix Pendant', 'Piglet Leash']);
    readyCast(s, 'p2');
    s.activePet('p2').hp = 5;
    const events = readyCast(s, 'p1');
    assert.equal(ofType(events, 'REVIVE')[0].cause, 'REBIRTH');
    assert.equal(s.activePet('p2').hp, 15);
    assert.equal(s.players.p2.activeIndex, 0);
  });

  it('Windspeed removes the swap lock only when swapping into the Kite', () => {
    const s = setup(['Puppy Leash', 'Summer Kite'], ['Calf Leash', 'Piglet Leash']);
    swap(s, 'p1'); // to the Kite
    assert.equal(s.players.p1.swapCooldownMs, 0);
    assert.deepEqual(s.canSwap('p1'), { ok: true });
    swap(s, 'p1'); // back to Puppy, which has no Windspeed
    assert.equal(s.players.p1.swapCooldownMs, 1450);
    ready(s, 'p1');
    assert.equal(ofType(readyCast(s, 'p2'), 'SWAP')[0].cause, 'FORCED'); // Trample forces p1 into the Kite
    assert.equal(s.players.p1.swapCooldownMs, 0); // no lock on forced swaps into it either
    assert.deepEqual(s.canSwap('p1'), { ok: true });
  });

  it('Windspeed works when the Kite is spliced into a battle pet; without it the 1.5s lock stays', () => {
    const spliced = new BattleSession({
      matchId: 'KITE',
      seed: 1,
      players: {
        p1: { userId: 'A', pets: [['Puppy Leash', 'Summer Kite', 'Pet Bunny'].map(getPet), [getPet('Calf Leash')]] },
        p2: { userId: 'B', pets: [getPet('Piglet Leash'), getPet('Puddy Leash')] },
      },
    });
    spliced.start();
    swap(spliced, 'p1'); // into the Calf: the Kite's slot is not the active one, so the lock stays
    assert.equal(spliced.players.p1.swapCooldownMs, 1450);
    spliced.advance(1450);
    swap(spliced, 'p1'); // back into the spliced Kite pet
    assert.equal(spliced.players.p1.swapCooldownMs, 0);
    swap(spliced, 'p2');
    assert.equal(spliced.players.p2.swapCooldownMs, 1450); // the opponent has no Kite
  });

  it('Spit Mud deals 20 Water damage and halves the target recharge for 5s', () => {
    const s = setup(['Pet Frog', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    const hit = readyCast(s, 'p1');
    assert.equal(ofType(hit, 'DAMAGE')[0].amount, 20); // Water vs Earth = 1.0
    assert.equal(ofType(hit, 'STATUS_APPLIED')[0].durationSec, 5);
    s.activePet('p2').abilities[0].cooldownMs = 4000;
    s.advance(1000);
    assert.equal(s.activePet('p2').abilities[0].cooldownMs, 3500);
    s.advance(4000); // Mud has worn off
    s.activePet('p2').abilities[0].cooldownMs = 4000;
    s.advance(1000);
    assert.equal(s.activePet('p2').abilities[0].cooldownMs, 3000);
  });

  it('Sugar Rush makes both own pets recharge twice as fast for 10s', () => {
    const s = setup(['Marshmallow Basket', 'Puppy Leash'], ['Piglet Leash', 'Puddy Leash']);
    const events = readyCast(s, 'p1');
    assert.deepEqual(ofType(events, 'STATUS_APPLIED').map((e) => [e.target.petIndex, e.label]), [[0, 'SUGAR_RUSH'], [1, 'SUGAR_RUSH']]);
    assert.equal(s.activePet('p1').abilities[0].cooldownMs, 60_000 - 100); // first tick already at 2x
    const partner = s.reservePet('p1');
    partner.abilities[0].cooldownMs = 4000;
    s.advance(1000);
    assert.equal(partner.abilities[0].cooldownMs, 2000);
    s.advance(9000); // buff over
    partner.abilities[0].cooldownMs = 4000;
    s.advance(1000);
    assert.equal(partner.abilities[0].cooldownMs, 3000);
  });

  it('Summer Kite does not shorten the cooldowns of the other deck slot', () => {
    const s = setup(['Puppy Leash', 'Summer Kite'], ['Piglet Leash', 'Puppy Leash']);
    readyCast(s, 'p1');
    assert.equal(s.activePet('p1').abilities[0].cooldownMs, 4000 - 50); // Pounce, full 4s
  });

  it('Mud also slows the swap lock and the global cooldown of the whole team', () => {
    const s = setup(['Pet Frog', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    readyCast(s, 'p1'); // Spit Mud on p2's Puppy
    swap(s, 'p2'); // the muddy Puppy goes to the reserve, Mud keeps slowing the team
    assert.equal(s.players.p2.swapCooldownMs, 1500 - 25);
    s.reservePet('p2').abilities[0].cooldownMs = 1000;
    readyCast(s, 'p2');
    assert.equal(s.players.p2.globalCooldownMs, 1000 - 25);
    assert.equal(s.reservePet('p2').abilities[0].cooldownMs, 1000 - 25);
  });

  it('Sugar Rush wakes up from Count Sheep twice as fast', () => {
    const s = setup(['Marshmallow Basket', 'Puppy Leash'], ["Lil' Sheepers", 'Piglet Leash']);
    readyCast(s, 'p1'); // Sugar Rush
    readyCast(s, 'p2'); // Count Sheep: 8s sleep on both active pets
    assert.equal(s.activePet('p1').find('STUN')?.label, 'SLEEP');
    s.advance(4000);
    assert.equal(s.activePet('p1').has('STUN'), false); // awake after ~4s
    assert.equal(s.activePet('p2').has('STUN'), true); // still asleep
    s.advance(4000);
    assert.equal(s.activePet('p2').has('STUN'), false);
  });

  it('Decoy is only visible to its owner', () => {
    const s = setup(['Cloud Rabbit', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    const events = readyCast(s, 'p1');
    const applied = ofType(events, 'STATUS_APPLIED').find((e) => e.status === 'DECOY')!;
    assert.equal(eventVisibleTo(applied, 'p1'), true);
    assert.equal(eventVisibleTo(applied, 'p2'), false);
    const has = (viewer: 'p1' | 'p2') => s.getState(viewer).players.p1.pets[0].active_buffs.some((b) => b.status === 'DECOY');
    assert.equal(has('p1'), true);
    assert.equal(has('p2'), false);
    assert.equal(s.getState().players.p1.pets[0].active_buffs.some((b) => b.status === 'DECOY'), true); // replays keep it
  });

  it('Smoke gives Dodge even when there is no partner to swap to', () => {
    const s = setup(['Cosmic Unicorn Bracelet', 'Puppy Leash'], ['Cloud Rabbit', 'Piglet Leash']);
    const partner = s.reservePet('p2');
    partner.hp = 0;
    partner.ko = true;
    readyCast(s, 'p2');
    const events = readyCast(s, 'p1');
    assert.equal(ofType(events, 'MISS')[0].reason, 'DECOY');
    assert.equal(ofType(events, 'SWAP').length, 0);
    assert.equal(s.activePet('p2').find('DODGE')?.label, 'SMOKE');
  });
});

describe('weather', () => {
  it('Toxic Cloud hits every active pet for 4 every 5s for 60s', () => {
    const s = setup(['Leashed Silkworm - Green', 'Puppy Leash'], ['Baby Bunny', 'Piglet Leash']);
    const start = readyCast(s, 'p1');
    assert.equal(ofType(start, 'WEATHER_START')[0].name, 'Toxic Cloud');
    assert.equal(s.getState().active_weather?.damage_per_tick, 4);
    const events = s.advance(60_000);
    assert.equal(ofType(events, 'WEATHER_END')[0].reason, 'EXPIRED');
    assert.equal(s.activePet('p1').hp, 150 - 48);
    assert.equal(s.activePet('p2').hp, 150 - 48);
    assert.equal(s.getState().active_weather, null);
  });

  it('only one weather is active: a new one replaces the old', () => {
    const s = setup(['Leashed Silkworm - Green', 'Puppy Leash'], [HEAT_WAVE_PET, 'Piglet Leash']);
    readyCast(s, 'p1');
    const events = readyCast(s, 'p2');
    assert.equal(ofType(events, 'WEATHER_END')[0].reason, 'REPLACED');
    assert.equal(s.activeWeather, 'HEAT_WAVE');
  });

  it('Heat Wave boosts Fire attacks by 25%', () => {
    const s = setup([HEAT_WAVE_PET, 'Pet Bunny'], ['Fire Elemental', 'Piglet Leash']);
    readyCast(s, 'p1');
    assert.equal(ofType(readyCast(s, 'p2'), 'DAMAGE')[0].amount, 35); // 28 x 1.25
  });

  it('Hailstorm adds 1.5s to cooldowns started during it', () => {
    const s = setup(['Leashed Silkworm - Blue', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    readyCast(s, 'p1');
    readyCast(s, 'p2');
    assert.equal(s.activePet('p2').abilities[0].cooldownMs, 5500 - 50);
  });

  it('Count Sheep puts both active pets to sleep for 8s', () => {
    const s = setup(["Lil' Sheepers", 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    readyCast(s, 'p1');
    assert.equal(s.activePet('p1').find('STUN')?.label, 'SLEEP');
    assert.equal(s.activePet('p2').find('STUN')?.label, 'SLEEP');
  });
});

describe('revised database (2026) pets', () => {
  it('Unearthly Beam adds +15 base damage per debuff on the target', () => {
    const s = setup(['Unearthly Synthoid', 'Puppy Leash'], ['Rhino Horn', 'Piglet Leash']);
    readyCast(s, 'p2'); // Charge stuns Rhino Horn itself: 1 debuff on the target
    assert.equal(s.activePet('p2').has('STUN'), true);
    assert.equal(ofType(readyCast(s, 'p1'), 'DAMAGE')[0].amount, 40); // (25 + 15) x 1.0, Earth vs Earth
  });

  it('Hit by Inspiration deals its damage and grants one random buff', () => {
    const s = setup(['Passionate Painter Paintbrush', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    const events = readyCast(s, 'p1');
    assert.equal(ofType(events, 'DAMAGE')[0].amount, 25); // 20 Air x 1.25 vs Earth
    const buffs = s.activePet('p1').statuses.filter((x) => x.polarity === 'BUFF');
    assert.equal(buffs.length, 1);
    assert.equal(buffs[0].label, 'INSPIRED');
  });

  it('Diamond Shield halves damage taken and reflects half of the hit', () => {
    const s = setup(['Puppy Leash', 'Piglet Leash'], ['Diamond Block', 'Piglet Leash']);
    readyCast(s, 'p2'); // 4s of -50% damage taken plus a 50% reflect
    const events = readyCast(s, 'p1'); // Pounce 9 Earth vs Earth
    assert.equal(s.activePet('p2').hp, 150 - 5); // 9 x 0.5 = 4.5 -> 5
    assert.equal(ofType(events, 'DAMAGE').find((d) => d.source === 'REFLECT')?.amount, 3); // half of the 5 that landed
    assert.equal(s.activePet('p1').hp, 150 - 3);
  });

  it('Leashed Silkworm - Red fires a Death Ray instead of summoning Heat Wave', () => {
    const s = setup(['Leashed Silkworm - Red', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    const events = readyCast(s, 'p1');
    assert.equal(ofType(events, 'WEATHER_START').length, 0);
    assert.equal(s.activeWeather, null);
    assert.equal(ofType(events, 'DAMAGE')[0].amount, 18); // 24 Fire x 0.75 vs Earth
  });

  it('Battle Mutant Fish spits 10 Fire damage per second for 5s (50 total)', () => {
    const s = setup(['Battle Mutant Fish', 'Puppy Leash'], ['Puppy Leash', 'Piglet Leash']);
    readyCast(s, 'p1');
    const ticks = ofType(s.advance(5000), 'DAMAGE').filter((d) => d.source === 'DOT');
    assert.equal(ticks.length, 5);
    assert.ok(ticks.every((t) => t.amount === 10 && t.element === 'Fire'));
    assert.equal(s.activePet('p2').hp, 150 - 50);
  });
});

describe('determinism, snapshot and tick loop', () => {
  const runBots = (seed: number): BattleEvent[] => {
    const session = new BattleSession({
      matchId: 'BOT',
      seed,
      players: {
        p1: { userId: 'A', pets: [getPet('Lucky Pendant'), getPet('Yeonnalligi')] },
        p2: { userId: 'B', pets: [getPet('Rainbow Kite'), getPet('Pet Leprechaun')] },
      },
    });
    const log: BattleEvent[] = [...session.start()];
    while (session.status === 'IN_PROGRESS') {
      for (const id of ['p1', 'p2'] as PlayerId[]) {
        if (session.canCastSkill(id).ok) session.submit({ type: 'CAST_SKILL', playerId: id });
        else if (session.tickCount % 200 === 0 && session.canSwap(id).ok) session.submit({ type: 'SWAP_PET', playerId: id });
      }
      log.push(...session.tick().events);
    }
    return log;
  };

  it('replays identically from the same seed', () => {
    assert.deepEqual(runBots(42), runBots(42));
    assert.notDeepEqual(runBots(42), runBots(7));
  });

  it('exposes state in the PRD 5.1 shape', () => {
    const s = setup(['Mid-Pacific Owl', 'Puppy Leash'], ['Fiery Dragon Leash', 'Baby Turtle']);
    readyCast(s, 'p2');
    const state = s.getState();
    assert.equal(state.match_id, 'TEST_MATCH');
    assert.equal(state.players.p1.user_id, 'USER_A');
    const owl = state.players.p1.pets[0];
    assert.deepEqual(Object.keys(owl).sort(), [
      'abilities', 'active_buffs', 'active_debuffs', 'charges', 'current_hp', 'element', 'id', 'is_ko', 'max_hp', 'name',
    ]);
    assert.deepEqual(owl.abilities, [
      { name: 'Swoop', pet_id: 'mid_pacific_owl', element: 'Air', is_passive: false, cooldown_remaining: 4.95, uses_left: null },
    ]);
    assert.deepEqual(owl.active_debuffs[0], { type: 'BURN', status: 'DOT', duration: 3.95, value: 2, dps: 2 });
    assert.doesNotThrow(() => JSON.stringify(state));
  });

  it('TickLoop runs fixed 50ms steps from wall-clock time', () => {
    const s = setup(['Puppy Leash', 'Piglet Leash'], ['Puppy Leash', 'Piglet Leash']);
    let now = 0;
    const loop = new TickLoop(s, { now: () => now });
    loop.start();
    try {
      now = 175;
      assert.equal(loop.pump(), 3);
      now = 200;
      assert.equal(loop.pump(), 1);
      assert.equal(s.tickCount, 4);
    } finally {
      loop.stop();
    }
  });

  it('TickLoop stops itself and reports when the match finishes', () => {
    const s = setup(['Puppy Leash', 'Baby Bunny'], ['Baby Bunny', 'Baby Bunny']);
    for (const pet of s.players.p2.pets) pet.hp = 1;
    let now = 0;
    let finished = 0;
    const loop = new TickLoop(s, { now: () => now, maxCatchUpTicks: 100, onFinish: () => finished++ });
    loop.start();
    ready(s, 'p1');
    s.submit({ type: 'CAST_SKILL', playerId: 'p1' }); // Pounce K.O.s the first pet...
    now = 50;
    loop.pump();
    assert.equal(loop.running, true);
    ready(s, 'p1');
    s.submit({ type: 'CAST_SKILL', playerId: 'p1' }); // ...and the second one
    now = 100;
    loop.pump();
    assert.equal(s.endReason, 'KO');
    assert.equal(s.status, 'FINISHED');
    assert.equal(loop.running, false);
    assert.equal(finished, 1);
  });

  it('every catalog pet can be cast without throwing', () => {
    for (const def of PET_CATALOG) {
      const s = new BattleSession({
        matchId: def.id,
        seed: 3,
        players: {
          p1: { userId: 'A', pets: [def, getPet('Puppy Leash')] },
          p2: { userId: 'B', pets: [getPet('Piglet Leash'), getPet('Puddy Leash')] },
        },
      });
      s.start();
      s.reservePet('p1').hp = 0;
      s.reservePet('p1').ko = true; // lets Wish find a target
      assert.doesNotThrow(() => {
        readyCast(s, 'p1');
        s.advance(10_000);
      }, def.name);
    }
  });

  it('commands can carry the PRD pet_index and are validated against the active pet', () => {
    const s = setup(['Puppy Leash', 'Piglet Leash'], ['Puppy Leash', 'Piglet Leash']);
    ready(s, 'p1');
    assert.equal(ofType(act(s, { type: 'CAST_SKILL', playerId: 'p1', petIndex: 1 }), 'ACTION_REJECTED')[0].reason, 'WRONG_PET');
    assert.equal(ofType(act(s, { type: 'CAST_SKILL', playerId: 'p1', petIndex: 0 }), 'SKILL_CAST').length, 1);
  });
});
