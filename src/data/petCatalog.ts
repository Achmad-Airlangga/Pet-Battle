/**
 * Mechanical definitions for the 170 pets in growtopia_pet_battle_database.xlsx
 * plus the pets added by hand in data/source/extra_pets.json (No 171+).
 * Names, elements, abilities and cooldowns are taken verbatim from the data;
 * effect lists translate the "Deskripsi Efek & Mekanik Skill" column into the
 * engine's effect DSL. Visual descriptions are imported separately (PRD Step 2).
 *
 * Where a description has no exact number, the interpretation is noted inline
 * (see also "Asumsi" in README.md).
 */
import type { Element } from '../engine/elements.ts';
import { petIdFromName } from './ids.ts';
import type {
  ApplyStatusEffect,
  DamageEffect,
  EffectTarget,
  NumberOrRange,
  PassiveDefinition,
  PetDefinition,
  SkillDefinition,
  SkillEffect,
  StatusType,
} from '../engine/types.ts';

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

const dmg = (amount: NumberOrRange, opts: Omit<DamageEffect, 'kind' | 'amount'> = {}): DamageEffect => ({
  kind: 'damage',
  amount,
  ...opts,
});

const st = (
  target: EffectTarget,
  status: StatusType,
  durationSec: NumberOrRange,
  opts: Omit<ApplyStatusEffect, 'kind' | 'target' | 'status' | 'durationSec'> = {},
): ApplyStatusEffect => ({ kind: 'status', target, status, durationSec, ...opts });

const stun = (sec: NumberOrRange, label = 'STUN') => st('enemy', 'STUN', sec, { label });
const trauma = (sec: number) => st('enemy', 'TRAUMA', sec);
const block = (sec: number) => st('self', 'BLOCK', sec);
const dodge = (sec: number) => st('self', 'DODGE', sec);
const burn = (perSec: number, sec: number) => st('enemy', 'DOT', sec, { value: perSec, intervalSec: 1, element: 'Fire', label: 'BURN' });
const doubleChance = (chance: number, sec: number) => st('self', 'DOUBLE_DAMAGE_CHANCE', sec, { value: chance });
const thorns = (damage: number, sec: number, element: Element, consumeOnTrigger: boolean, label: string) =>
  st('self', 'THORNS', sec, { value: damage, element, consumeOnTrigger, label });
/** Reflects a fraction of the incoming hit instead of a flat amount (Diamond Shield). */
const thornsPct = (pct: number, sec: number, element: Element, label: string) =>
  st('self', 'THORNS', sec, { reflectPct: pct, element, label });

const skill = (
  name: string,
  cooldownSec: number,
  initialCooldownSec: number,
  effects: SkillEffect[],
  extra: Partial<SkillDefinition> = {},
): SkillDefinition => ({ name, cooldownSec, initialCooldownSec, effects, ...extra });

const pet = (no: number, name: string, element: Element, s: SkillDefinition): PetDefinition => ({
  id: petIdFromName(name),
  no,
  name,
  element,
  ability: s.name,
  skill: s,
});

const passivePet = (no: number, name: string, element: Element, ability: string, passives: PassiveDefinition[]): PetDefinition => ({
  id: petIdFromName(name),
  no,
  name,
  element,
  ability,
  passives,
});

// ---------------------------------------------------------------------------
// Dinosaur line (16 species x 4 elements, identical numbers per element)
// ---------------------------------------------------------------------------

type DinoSpecies =
  | 'Tyrannosaurus' | 'Pteranus Rex' | 'Tricerus Rex' | 'Apatosaurus' | 'Tyranopatos' | 'Tripatosaurus'
  | 'Pterosaurus' | 'Triceratops' | 'Apatos Rex' | 'Apatoceratops' | 'Pteratops' | 'Pteranodon'
  | 'Tyranotops' | 'Tyranodon' | 'Apatodon' | 'Triceradon';

/** Each colour's "bonus vs element" target, as stated in the database. */
const DINO_BONUS_TARGET: Record<Element, Element> = { Air: 'Water', Earth: 'Air', Fire: 'Earth', Water: 'Fire' };
const DINO_COLOR: Record<Element, string> = { Air: 'Grey', Earth: 'Brown', Fire: 'Red', Water: 'Blue' };
const DINO_SUFFIX: Record<Element, string> = { Air: 'A', Earth: 'E', Fire: 'F', Water: 'W' };

function dinoSkill(species: DinoSpecies, el: Element): SkillDefinition {
  const sfx = DINO_SUFFIX[el];
  const vs = (pct: number) => ({ bonusVsElement: { element: DINO_BONUS_TARGET[el], pct } });
  const precise = (pct: number) => ({ unblockable: true, undodgeable: true, bonusIfEvading: pct });
  switch (species) {
    case 'Tyrannosaurus': return skill(`Crushing Jaws ${sfx}`, 16, 8, [dmg(29), trauma(3)]);
    case 'Pteranus Rex': return skill(`Precision Crush ${sfx}`, 19, 9.5, [dmg(25, precise(0.1))]);
    case 'Tricerus Rex': return skill(`Defensive Bite ${sfx}`, 18, 9, [dmg(22), block(2)]);
    case 'Apatosaurus': return skill(`Dino Slam ${sfx}`, 10, 5, [dmg(15, vs(1.0))]);
    case 'Tyranopatos': return skill(`Grinding Jaws ${sfx}`, 20, 10, [dmg(3), trauma(30)]);
    case 'Tripatosaurus': return skill(`Defensive Bash ${sfx}`, 20, 10, [dmg(10), block(7)]);
    case 'Pterosaurus': return skill(`Critical Strike ${sfx}`, 15, 7.5, [dmg(17, precise(0.5))]);
    case 'Triceratops': return skill(`Defensive Gore ${sfx}`, 13, 6.5, [dmg(16), block(4)]);
    case 'Apatos Rex': return skill(`Dino Chomp ${sfx}`, 10, 5, [dmg(18, vs(0.25))]);
    case 'Apatoceratops': return skill(`Dino Charge ${sfx}`, 8, 4, [dmg(14, vs(0.6))]);
    case 'Pteratops': return skill(`Precision Attack ${sfx}`, 9, 4.5, [dmg(11, precise(0.17))]);
    case 'Pteranodon': return skill(`Precision Strike ${sfx}`, 5, 2.5, [dmg(7, precise(0.25))]);
    case 'Tyranotops': return skill(`Crushing Beak ${sfx}`, 13, 6.5, [dmg(19), trauma(7)]);
    case 'Tyranodon': return skill(`Piercing Jaws ${sfx}`, 10, 5, [dmg(15), trauma(4)]);
    case 'Apatodon': return skill(`Dino Dive ${sfx}`, 6, 3, [dmg(10, vs(0.5))]);
    case 'Triceradon': return skill(`Defensive Flurry ${sfx}`, 10, 5, [dmg(12), block(2)]);
  }
}

const AIR_DINO_ORDER: DinoSpecies[] = [
  'Tyrannosaurus', 'Pteranus Rex', 'Tricerus Rex', 'Apatosaurus', 'Tyranopatos', 'Tripatosaurus', 'Pterosaurus', 'Triceratops',
  'Apatos Rex', 'Apatoceratops', 'Pteratops', 'Pteranodon', 'Tyranotops', 'Tyranodon', 'Apatodon', 'Triceradon',
];
const DINO_ORDER: DinoSpecies[] = [
  'Tyrannosaurus', 'Apatos Rex', 'Pteranus Rex', 'Tricerus Rex', 'Apatosaurus', 'Tyranopatos', 'Tripatosaurus', 'Pterosaurus',
  'Triceratops', 'Apatoceratops', 'Pteratops', 'Pteranodon', 'Tyranotops', 'Tyranodon', 'Apatodon', 'Triceradon',
];

const dinos = (el: Element, firstNo: number, order: DinoSpecies[]): PetDefinition[] =>
  order.map((species, i) => pet(firstNo + i, `${DINO_COLOR[el]} Pet ${species}`, el, dinoSkill(species, el)));

// ---------------------------------------------------------------------------
// Catalog
// ---------------------------------------------------------------------------

const AIR: PetDefinition[] = [
  pet(1, 'Spiritual Resonator', 'Air', skill('Possession', 20, 10, [{ kind: 'possession' }])),
  pet(2, 'Haunted Pants', 'Air', skill('Phantom Pain', 10, 5, [dmg(30), st('enemy', 'HOT', 10, { value: 3, intervalSec: 1, label: 'PHANTOM_REGEN' })])),
  pet(3, 'Chick Leash', 'Air', skill('Chirp', 5, 2.5, [dmg(9, { unblockable: true })])),
  passivePet(4, 'Yeonnalligi', 'Air', 'Soaring', [{ kind: 'dodgeChance', chance: 0.25 }]),
  pet(5, 'Lovebird Pendant', 'Air', skill('Enthrall', 20, 10, [dmg(10), st('enemy', 'SILENCE', 6, { label: 'ENTHRALL' })])),
  pet(6, 'Electro Magnifying Glass', 'Air', skill('Shock Blast', 10, 5, [dmg(18), stun(1)])),
  pet(7, 'Lucky Pendant', 'Air', skill('Lucky Strike', 10, 5, [dmg({ min: 1, max: 40 })])),
  pet(8, 'Mid-Pacific Owl', 'Air', skill('Swoop', 10, 5, [dmg(15), dodge(2)])),
  pet(9, 'Zorbnik Leash', 'Air', skill('Stun Ray', 10, 5, [dmg(10), stun(3)])),
  pet(10, "Onisim's Genie", 'Air', skill('Wish', 999, 12, [{ kind: 'revivePartner', hpPct: 0.3 }], { usesPerBattle: 1 })),
  // Windspeed: -2s on every cooldown of the battle pet that carries it, and
  // swapping into that pet never starts the 1.5s swap lock. The other deck slot
  // gets nothing from it.
  passivePet(11, 'Summer Kite', 'Air', 'Windspeed', [
    { kind: 'cooldownReduction', seconds: 2, minSec: 1, includePartner: false },
    { kind: 'noSwapCooldown' },
  ]),
  pet(12, 'Cosmic Unicorn Bracelet', 'Air', skill('Cosmic Barrage', 20, 10, [dmg(36, { undodgeable: true })])),
  pet(13, "Death's Scarf", 'Air', skill('Doom', 30, 12, [st('enemy', 'DOOM', 20)])),
  pet(14, 'Butterfly Leash', 'Air', skill('Acrobatics', 10, 5, [dodge(5)])),
  pet(15, 'Pineapple Kite', 'Air', skill('Pineapple Bomb', 9, 4.5, [dmg(18)])),
  pet(16, 'Sonar Bracelet', 'Air', skill('Sonic Burst', 5, 2.5, [dmg(9, { undodgeable: true })])),
  pet(17, 'Leashed Silkworm - White', 'Air', skill('Psyblade', 5, 2.5, [dmg(12), { kind: 'recoil', amount: 4 }])),
  pet(18, 'Leashed Silkworm - Purple', 'Air', skill('Face Slap', 5, 2.5, [dmg(12), st('enemy', 'RAGE', 10, { value: 0.25, maxStacks: 20 })])),
  pet(19, 'Thinking Cap', 'Air', skill('Mind Swap', 30, 12, [{ kind: 'mindSwap' }])),
  passivePet(20, 'Eye Of Growganoth', 'Air', 'Gift of Growganoth', [{ kind: 'reserveRegen', amount: 7, intervalSec: 5 }]),
  {
    ...pet(21, 'Betty Bluetooth Doll', 'Air', skill('Static Charge', 3, 1.5, [dmg(0, { perCharge: 5 })])),
    passives: [{ kind: 'chargeOnDamage', maxCharges: 10 }],
  },
  ...dinos('Air', 22, AIR_DINO_ORDER),
  pet(38, 'Rainbow Kite', 'Air', skill('Taste The Rainbow', 8, 4, [dmg(16, { element: 'RANDOM' })])),
  pet(39, 'Haunted Synthoid', 'Air', skill('Draining Beam', 10, 5, [dmg(5), { kind: 'extendEnemyCooldowns', seconds: 3 }])),
  passivePet(40, 'Ladybug Leaf', 'Air', 'Exoskeleton', [{ kind: 'debuffDurationReduction', seconds: 2 }]),
  pet(41, 'Red Floaty Balloon', 'Air', skill('Floaty Bomb', 9, 4.5, [dmg(18)])),
  pet(42, 'Blue Floaty Balloon', 'Air', skill('Bouncy Barrier', 11, 5.5, [thorns(25, 4, 'Air', true, 'BOUNCY_BARRIER')])),
  pet(43, 'Green Floaty Balloon', 'Air', skill('Pumped Up', 20, 10, [{ kind: 'heal', target: 'self', amount: 30 }])),
  pet(44, 'Playful Wind Sprite', 'Air', skill('Playful Wind', 4, 2, [dmg(6), doubleChance(0.15, 8)])),
  pet(45, 'Cloud Rabbit', 'Air', skill('Self Sacrifice', 20, 10, [st('self', 'DECOY', 4, { value: 4 })])),
  pet(46, 'Discoball Companion', 'Air', skill('Just Dance!', 20, 10, [
    st('enemy', 'SILENCE', 4, { label: 'DANCE' }),
    st('enemy', 'DOT', 4, { value: 5, intervalSec: 1, element: 'Air', label: 'DANCE' }),
  ])),
  pet(47, 'Flying Bell', 'Air', skill('Sound Blast!', 5, 2.5, [dmg(9, { undodgeable: true }), stun(1)])),
  pet(48, 'Pet Hatchley', 'Air', skill('Musically Stunned!', 10, 5, [dmg(10), stun({ min: 8, max: 10 })])),
  pet(49, 'Pineapple Blump Pet', 'Air', skill('Spikey Shield', 15, 7.5, [thorns(20, 8, 'Air', true, 'SPIKEY_SHIELD')])),
  pet(50, 'Party Fowl', 'Air', skill('Party Foul', 5, 2.5, [dmg(5)])),
  pet(51, 'Radioactive Synthoid', 'Air', skill('Radiation Beam', 13, 6.5, [dmg(30)])),
  // "Hit by Inspiration" only says "a random buff": the pool lives in BattleSession (RANDOM_BUFFS).
  pet(52, 'Passionate Painter Paintbrush', 'Air', skill('Hit by Inspiration', 15, 7.5, [dmg(20), { kind: 'randomBuff' }])),
  // "To The Shadow Realm!" has no duration in the sheet; 6s like Lovebird Pendant's Enthrall.
  pet(53, "Lantern's ChronoReaper", 'Air', skill('To The Shadow Realm!', 30, 15, [st('enemy', 'SILENCE', 6, { label: 'SHADOW_REALM' })])),
];

const EARTH: PetDefinition[] = [
  pet(54, 'Puppy Leash', 'Earth', skill('Pounce', 4, 2, [dmg(9)])),
  pet(55, 'Piglet Leash', 'Earth', skill('Wallow', 10, 5, [{ kind: 'heal', target: 'self', amount: 20 }])),
  pet(56, 'Puddy Leash', 'Earth', skill('Hairball', 5, 2.5, [dmg(10)])),
  pet(57, 'Tumbleweed Attractor', 'Earth', skill('Needles', 10, 5, [thorns(5, 15, 'Earth', false, 'NEEDLES')])),
  pet(58, 'Muddy Pants', 'Earth', skill('Mud Glob', 40, 12, [dmg(20), st('enemy', 'COOLDOWN_SLOW', 10, { value: 2, label: 'MUD' })])),
  pet(59, 'Unicorn Garland', 'Earth', skill('Rainbow Beam', 6, 3, [dmg(11, { unblockable: true })])),
  passivePet(60, 'Mini Mammoth Leash', 'Earth', 'Mammoth Heart', [{ kind: 'maxHpBonus', pct: 0.3 }]),
  pet(61, "Wolf Tamer's Glove", 'Earth', skill('Howl', 30, 15, [st('self', 'DAMAGE_BOOST', 30, { value: 0.25, label: 'HOWL' })])),
  pet(62, 'Leashed Silkworm - Grey', 'Earth', skill('Stoneform', 10, 5, [block(5)])),
  pet(63, 'Leashed Silkworm - Green', 'Earth', skill('Toxic Cloud', 60, 12, [{ kind: 'weather', weather: 'TOXIC_CLOUD', durationSec: 60 }])),
  pet(64, 'Calf Leash', 'Earth', skill('Trample', 7, 3.5, [dmg(10), { kind: 'forceSwap' }])),
  pet(65, 'Moose Cap', 'Earth', skill('Antler Bash', 12, 5.5, [dmg(22, { unblockable: true })])),
  pet(66, 'Baby Bunny', 'Earth', skill('Hop', 3, 1.5, [])),
  pet(67, 'MickeyMay Leash', 'Earth', skill('Cower', 15, 7.5, [block(7)])),
  pet(68, 'Mini Growtopian', 'Earth', skill('Punch, Build, Grow', 6, 3, [
    { kind: 'growtopianCycle', punchDamage: 8, punchPerGrow: 4, buildBlockSec: 1, buildPerGrowSec: 1, maxGrow: 5 },
  ])),
  pet(69, 'Pet Bunny', 'Earth', skill('Big Sharp Pointy Teeth', 15, 7.5, [dmg(30)])),
  passivePet(70, 'Pet Burrito', 'Earth', 'Stubborn', [{ kind: 'damageTakenReduction', pct: 0.25 }]),
  pet(71, 'Pet Leprechaun', 'Earth', skill('Get Lucky', 20, 10, [doubleChance(0.25, 10)])),
  pet(72, "Lil' Sheepers", 'Earth', skill('Count Sheep', 40, 20, [{ kind: 'weather', weather: 'COUNT_SHEEP', durationSec: 8 }])),
  pet(73, 'Rhino Horn', 'Earth', skill('Charge', 6, 3, [dmg(16), st('self', 'STUN', 3)])),
  pet(74, 'Flowersaurus Rex', 'Earth', skill('Pollen Barrage', 12, 6, [dmg(15, { perConsumedBuff: 15 })])),
  ...dinos('Earth', 75, DINO_ORDER),
  pet(91, 'Zombie Hound', 'Earth', skill('Bursting Spores', 10, 5, [
    dmg(10),
    st('enemy', 'DOT', 6, { value: 5, intervalSec: 2, element: 'Earth', label: 'SPORES' }),
  ])),
  pet(92, 'Pineapple Finger Ring', 'Earth', skill('Sticky Pineapple Web', 20, 10, [
    st('enemy', 'DOT', 5, { value: 4, intervalSec: 1, element: 'Earth', label: 'STICKY_WEB' }),
    st('enemy', 'ROOT', 5, { label: 'STICKY_WEB' }),
  ])),
  pet(93, 'Playful Wood Sprite', 'Earth', skill('Playtime', 15, 7.5, [dmg(5), doubleChance(0.3, 4)])),
  pet(94, 'Dryad', 'Earth', skill('Draining Roots', 30, 12, [dmg(30), st('self', 'HOT', 1, { value: 30, intervalSec: 1, label: 'DRAINING_ROOTS' })])),
  pet(95, 'Prickly Pet', 'Earth', skill('Spikey Shield', 15, 7.5, [thorns(20, 8, 'Earth', true, 'SPIKEY_SHIELD')])),
  pet(96, "Growmoji's Little Friend", 'Earth', skill('Adorable Eyes... and Claw!', 40, 12, [dmg(35), { kind: 'forceSwap' }])),
  pet(97, "14DEViL's Friendly Doggy Leash", 'Earth', skill('Lockjaw!', 12, 6, [dmg(85), st('enemy', 'SWAP_PUNISH', 2, { value: 40, label: 'LOCKJAW' })])),
  // Unearthly Beam: the Base Damage column says 25 while the text reads
  // "10 + 15 per enemy debuff". The column wins (petRepository cross-checks it)
  // and the +15 per negative status scales on top.
  pet(98, 'Unearthly Synthoid', 'Earth', skill('Unearthly Beam', 10, 5, [dmg(25, { perEnemyDebuff: 15 })])),
  // Supercharge: "much deadlier next attacks" with no number -> +50% for 15s
  // (stronger and shorter than Wolf Tamer's Glove Howl, which is +25% for 30s).
  pet(99, 'Captain Bark / Royal Captain Bark', 'Earth', skill('Supercharge', 20, 10, [st('self', 'DAMAGE_BOOST', 15, { value: 0.5, label: 'SUPERCHARGE' })])),
  pet(100, 'Mechasaurus Rex', 'Earth', skill('Ratatatata!', 15, 7.5, [dmg(40)])),
  pet(101, 'Gingerbread Man', 'Earth', skill('Ginger Blast', 10, 5, [dmg(18)])),
  // Diamond Shield: "blocks attacks and reflects part of the damage" -> takes
  // half damage (DAMAGE_REDUCTION) and reflects half of the incoming hit back.
  pet(102, 'Diamond Block', 'Earth', skill('Diamond Shield', 15, 7.5, [
    st('self', 'DAMAGE_REDUCTION', 4, { value: 0.5, label: 'DIAMOND' }),
    thornsPct(0.5, 4, 'Earth', 'DIAMOND_SHIELD'),
  ])),
  // Lockdown: no stun duration in the sheet; 2s (between Shock Blast's 1s and Stun Ray's 3s).
  pet(103, 'Toy Lock-Bot', 'Earth', skill('Lockdown', 10, 5, [dmg(17), stun(2, 'LOCKDOWN')])),
];

const FIRE: PetDefinition[] = [
  pet(104, 'Fiery Dragon Leash', 'Fire', skill('Flame Breath', 10, 5, [dmg(24), burn(2, 4)])),
  pet(105, 'Hot Pepper Leash', 'Fire', skill('Spicy Ignite', 8, 4, [
    dmg(16),
    st('self', 'NEXT_ELEMENT_BOOST', Infinity, { value: 0.2, element: 'Fire', label: 'SPICY' }),
  ])),
  pet(106, 'Phoenix Pendant', 'Fire', skill('Blazing Rebirth', 15, 7.5, [dmg(20), st('self', 'REBIRTH', 5, { value: 0.1 })])),
  pet(107, 'Fire Elemental', 'Fire', skill('Inferno Burst', 12, 6, [dmg(28, { unblockable: true })])),
  // Revision: was a 60s Heat Wave weather skill. The sheet now lists 13s/24 damage
  // ("Death Ray"); only the damage is implemented so the 13s cooldown stays sane.
  pet(108, 'Leashed Silkworm - Red', 'Fire', skill('Death Ray / Heat Wave', 13, 6.5, [dmg(24)])),
  pet(109, 'Fire Ants', 'Fire', skill('Ant Swarm', 10, 5, [dmg(15), burn(3, 5)])),
  ...dinos('Fire', 110, DINO_ORDER),
  pet(126, 'Magma Salamander', 'Fire', skill('Lava Spit', 8, 4, [dmg(18), burn(2, 6)])),
  // Revision: renaming "Flame Sprite" (previously 15s/12 damage Wildfire).
  pet(127, 'Flame Sprite / Playful Fire Sprite', 'Fire', skill('Playful Fire / Wildfire', 8, 4, [dmg(15), doubleChance(0.2, 6)])),
  // Glowing Nose: "burns the enemy" -> same burn as Fiery Dragon Leash.
  pet(128, 'Magic Reindeer Bell', 'Fire', skill('Glowing Nose', 12, 6, [dmg(10), burn(2, 4)])),
  // Disco Fever: 4 Fire damage/s for 5s (20 total) and the target cannot act (like Just Dance!).
  pet(129, 'Retro Magnifying Glass', 'Fire', skill('Disco Fever', 20, 10, [
    st('enemy', 'SILENCE', 5, { label: 'DISCO' }),
    st('enemy', 'DOT', 5, { value: 4, intervalSec: 1, element: 'Fire', label: 'DISCO' }),
  ])),
  pet(130, 'Spitfire Mask', 'Fire', skill('Spirit Swap', 20, 10, [dmg(10), { kind: 'forceSwap' }])),
  pet(131, 'Lion Taming Whip', 'Fire', skill('Claws Out', 15, 7.5, [dmg(35)])),
  pet(132, 'Dragon Hand', 'Fire', skill('Fire Breath', 6, 3, [dmg(3)])),
  pet(133, 'Fiesta Dragon', 'Fire', skill('Party Breath', 10, 5, [dmg(10)])),
  pet(134, 'Nightmare Magnifying Glass', 'Fire', skill('Nightmares', 20, 10, [dmg(10), stun(5)])),
  pet(135, 'Dragon of Legend', 'Fire', skill('BURNINATE!', 40, 12, [dmg(40)])),
  pet(136, 'Skeletal Dragon Claw', 'Fire', skill('Deathfire', 10, 5, [dmg(10)])),
  pet(137, 'Phoenix Pacifier', 'Fire', skill('Firestorm', 60, 12, [dmg(64)])),
  pet(138, 'Phlogiston', 'Fire', skill('Toasties', 6, 3, [dmg(3)])),
  pet(139, 'Pinata Pal', 'Fire', skill('Surprise!', 22, 11, [dmg(50)])),
  pet(140, 'Hotpants', 'Fire', skill('Pepper', 3, 1.5, [dmg(6)])),
  pet(141, 'Pet Fox', 'Fire', skill('Desperate Bite', 7, 3.5, [dmg(10)])),
];

const WATER: PetDefinition[] = [
  // Acid Spit: 10 Fire damage per second for 5s (50 total). The pet itself is Water.
  pet(142, 'Battle Mutant Fish', 'Water', skill('Acid Spit', 20, 10, [
    st('enemy', 'DOT', 5, { value: 10, intervalSec: 1, element: 'Fire', label: 'ACID_SPIT' }),
  ])),
  pet(143, 'Ice Calf Leash', 'Water', skill('Ice Laser', 12, 6, [dmg(15), stun(5, 'FREEZE')])),
  // Trick Escape: same wording as Cloud Rabbit's Self Sacrifice (4s evade, auto swap, smoke).
  pet(144, 'Mini-Peng', 'Water', skill('Trick Escape', 20, 10, [st('self', 'DECOY', 4, { value: 4 })])),
  pet(145, 'Polar Bear Leash', 'Water', skill('Frost Bite', 10, 5, [dmg(18), stun(2, 'FREEZE')])),
  pet(146, 'Penguin Leash', 'Water', skill('Ice Blast', 10, 5, [dmg(14), stun(2.5, 'FREEZE')])),
  pet(147, 'Water Balloon', 'Water', skill('Hydro Splash', 6, 3, [dmg(12), { kind: 'purgeBuffs', target: 'enemy' }])),
  pet(148, 'Baby Turtle', 'Water', skill('Shell Defense', 12, 6, [dmg(8), st('self', 'DAMAGE_REDUCTION', 3, { value: 0.8, label: 'SHELL' })])),
  pet(149, 'Seahorse Companion', 'Water', skill('Bubble Trap', 14, 7, [dmg(10), st('enemy', 'ROOT', 6, { label: 'BUBBLE' })])),
  pet(150, 'Leashed Silkworm - Blue', 'Water', skill('Hailstorm', 60, 12, [{ kind: 'weather', weather: 'HAILSTORM', durationSec: 60 }])),
  ...dinos('Water', 151, DINO_ORDER),
  pet(167, 'Robo Shark', 'Water', skill('Laserbeam!', 25, 10, [dmg(35, { unblockable: true })])),
  pet(168, 'Magical Carrot', 'Water', skill("That's Cold", 12, 6, [dmg(15), stun(4, 'FREEZE')])),
  pet(169, 'Leashed Silkworm - Yellow', 'Water', skill('Liquify', 20, 10, [dmg(15)])),
  pet(170, 'Playful Water Sprite', 'Water', skill('Playful Water', 8, 4, [dmg(15), doubleChance(0.15, 8)])),
];

/** Pets not in the spreadsheet, added from in-game ability cards (data/source/extra_pets.json). */
const EXTRA: PetDefinition[] = [
  // "For 5s, the target's abilities recharge half as fast. Inflicts 20 Water damage."
  pet(171, 'Pet Frog', 'Water', skill('Spit Mud', 12, 6, [dmg(20), st('enemy', 'COOLDOWN_SLOW', 5, { value: 2, label: 'MUD' })])),
  // "For 10s, your abilities recharge twice as fast for both your pets."
  pet(172, 'Marshmallow Basket', 'Fire', skill('Sugar Rush', 60, 12, [
    st('self', 'COOLDOWN_HASTE', 10, { value: 2, label: 'SUGAR_RUSH' }),
    st('partner', 'COOLDOWN_HASTE', 10, { value: 2, label: 'SUGAR_RUSH' }),
  ])),
];

export const PET_CATALOG: readonly PetDefinition[] = [...AIR, ...EARTH, ...FIRE, ...WATER, ...EXTRA];

const BY_ID = new Map(PET_CATALOG.map((p) => [p.id, p]));
const BY_NAME = new Map(PET_CATALOG.map((p) => [p.name.toLowerCase(), p]));

export function getPet(idOrName: string): PetDefinition {
  const found = BY_ID.get(idOrName) ?? BY_NAME.get(idOrName.toLowerCase());
  if (!found) throw new Error(`Unknown pet: ${idOrName}`);
  return found;
}
