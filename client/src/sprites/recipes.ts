/**
 * One drawing per pet, following each pet's visual description in the
 * database (pets_data.json). Pets face right on a 32x32 grid, feet on y ~= 30.
 */
import {
  C,
  balloon,
  bird,
  chain,
  dino,
  dragonHead,
  fairy,
  featherWing,
  flame,
  kite,
  magnifier,
  membraneWing,
  pants,
  quad,
  shade,
  silkworm,
  sparkle,
  string,
  synthoid,
  type DinoColors,
  type Kind,
} from './builders.ts';
import { BASE, DARK, HI, LIGHT, SHADOW, Sprite, ramp } from './pixel.ts';

export type Recipe = (s: Sprite) => void;

// ---------------------------------------------------------------------------
// Dinosaurs (4 colours x 16 species)
// ---------------------------------------------------------------------------

const DINO_COLORS: Record<string, DinoColors> = {
  grey: { body: '#8f949e', belly: '#cfd2d8', accent: '#5f6472' },
  brown: { body: '#8f5a2c', belly: '#d29a5f', accent: '#5a3418' },
  red: { body: '#c8392a', belly: '#f2a04e', accent: '#7a1a12', horn: '#ffe2a8' },
  blue: { body: '#2f6fbe', belly: '#92cdf2', accent: '#1b3f7a' },
};

const SPECIES: Record<string, { kinds: Kind[]; pterosaurus?: boolean }> = {
  tyrannosaurus: { kinds: ['rex'] },
  apatosaurus: { kinds: ['apato'] },
  triceratops: { kinds: ['trice'] },
  pteranodon: { kinds: ['ptera'] },
  pterosaurus: { kinds: ['ptera'], pterosaurus: true },
  pteranus_rex: { kinds: ['ptera', 'rex'] },
  tricerus_rex: { kinds: ['trice', 'rex'] },
  apatos_rex: { kinds: ['apato', 'rex'] },
  tyranopatos: { kinds: ['rex', 'apato'] },
  tripatosaurus: { kinds: ['trice', 'apato'] },
  apatoceratops: { kinds: ['apato', 'trice'] },
  pteratops: { kinds: ['ptera', 'trice'] },
  tyranotops: { kinds: ['rex', 'trice'] },
  tyranodon: { kinds: ['rex', 'ptera'] },
  apatodon: { kinds: ['apato', 'ptera'] },
  triceradon: { kinds: ['trice', 'ptera'] },
};

function dinoRecipe(id: string): Recipe | null {
  const m = /^(grey|brown|red|blue)_pet_(.+)$/.exec(id);
  if (!m || !SPECIES[m[2]]) return null;
  const sp = SPECIES[m[2]];
  const col = DINO_COLORS[m[1]];
  return (s) => {
    if (m[1] === 'red') s.aura(15, 18, 15, '#ff7a2a', 0.25);
    dino(s, sp.kinds, col, { pterosaurus: sp.pterosaurus });
  };
}

// ---------------------------------------------------------------------------
// Silkworms
// ---------------------------------------------------------------------------

const SILKWORMS: Record<string, Recipe> = {
  leashed_silkworm_white: (s) => silkworm(s, '#f1eee6', '#c9c2d6', { pearl: true }),
  leashed_silkworm_purple: (s) => silkworm(s, '#8e55d6', '#e0b8ff', { pearl: true, glow: '#c08aff' }),
  leashed_silkworm_grey: (s) => silkworm(s, '#8e9098', '#5b5d66', { rocky: true }),
  leashed_silkworm_green: (s) => silkworm(s, '#6fbf3e', '#d6f29a'),
  leashed_silkworm_red: (s) => silkworm(s, '#d8402a', '#ffcf5a', { glow: '#ff7a2a' }),
  leashed_silkworm_blue: (s) => silkworm(s, '#5fb5f2', '#e2f6ff', { pearl: true }),
  leashed_silkworm_yellow: (s) => silkworm(s, '#f2c838', '#a4741a'),
};

// ---------------------------------------------------------------------------
// Everything else
// ---------------------------------------------------------------------------

const PETS: Record<string, Recipe> = {
  // ================================ AIR ================================
  spiritual_resonator: (s) => {
    s.aura(16, 15, 15, '#b07cff', 0.55);
    string(s, 16, 1, 5, '#d9c7ff', 0);
    s.poly([[16, 5], [23, 10], [23, 19], [16, 24], [9, 19], [9, 10]], '#7d46c8', { gloss: true });
    s.poly([[16, 8], [20.5, 11], [20.5, 18], [16, 21], [11.5, 18], [11.5, 11]], '#a978f0', { noEdge: true });
    s.pxs([[16, 10], [16, 11], [15, 12], [17, 12], [16, 13], [16, 14], [14, 15], [18, 15], [16, 16], [16, 18]], ramp('#8ff6ff', 1, true), HI);
    for (const [x, y] of [[5, 22], [27, 9], [26, 25], [6, 8]] as const) sparkle(s, x, y, '#e0c8ff');
    s.ellipse(16, 27.5, 3, 1.2, ramp('#c8a6ff', 0.6), { noEdge: true });
  },
  haunted_pants: (s) => {
    s.aura(16, 17, 15, '#7ff0d0', 0.4);
    pants(s, '#6fcfb6', { alpha: 0.72 });
    s.pxs([[9, 29], [11, 28], [13, 29], [19, 29], [21, 28], [23, 29]], ramp('#bff8e8', 0.6), LIGHT);
    s.eye(10, 13, 2, '#14352d');
    s.eye(19, 13, 2, '#14352d');
    s.pxs([[13, 18], [14, 19], [15, 18], [16, 19], [17, 18]], '#14352d', DARK);
  },
  chick_leash: (s) => {
    bird(s, { body: '#ffd84a', belly: '#fff0a0', wing: '#f2bf2a', beak: C.orange, cx: 13, cy: 22, size: 0.9, eye: 1 });
    s.pxs([[16, 12], [17, 11], [15, 11]], '#ffe98a', LIGHT);
  },
  yeonnalligi: (s) => {
    for (let i = 0; i < 10; i++) {
      const colors = ['#e2352a', '#2d6fd6', '#f5c63a', '#3aa85a', '#ffffff'];
      s.px(14 + Math.sin(i / 1.5) * 2, 18 + i, colors[i % 5], BASE);
      s.px(18 + Math.sin(i / 1.5 + 1) * 2, 18 + i, colors[(i + 2) % 5], BASE);
    }
    s.poly([[16, 7], [29, 3], [26, 10], [17, 14]], '#2d6fd6');
    s.poly([[16, 7], [3, 3], [6, 10], [15, 14]], '#e2352a');
    s.ellipse(16, 11, 3, 6, '#f5c63a');
    s.poly([[18, 6], [22, 7.5], [18, 8.5]], C.orange);
    s.eye(16, 6, 1);
    s.pxs([[8, 6], [10, 7], [22, 7], [24, 6]], '#ffffff', LIGHT);
  },
  lovebird_pendant: (s) => {
    chain(s, 6, 26, 0, 7);
    s.circle(16, 19, 10, C.gold, { gloss: true });
    s.circle(16, 19, 8, '#5a2a14', { tone: SHADOW });
    // Two lovebirds facing each other, beaks touching
    for (const dir of [-1, 1]) {
      const bx = 16 + dir * 3.6;
      const col = dir < 0 ? '#f27fa4' : '#f59ab8';
      s.poly([[bx + dir * 2, 22], [bx + dir * 5.5, 25.5], [bx + dir * 2.5, 25]], '#d8507a');
      s.ellipse(bx + dir * 0.5, 21.5, 3, 3.6, col, { rot: dir * 0.3 });
      s.ellipse(bx + dir * 1.2, 21.5, 1.8, 2.4, shade(col, -0.15), { rot: dir * 0.3, noEdge: true });
      s.circle(bx - dir * 0.8, 16.6, 2.4, col);
      s.poly([[bx - dir * 2.6, 16.2], [bx - dir * 4.2, 17], [bx - dir * 2.6, 17.9]], '#f5a020');
      s.px(bx - dir * 1.2, 16, C.ink, DARK);
    }
    s.pxs([[15, 12], [17, 12], [14, 13], [15, 13], [16, 13], [17, 13], [18, 13], [15, 14], [16, 14], [17, 14], [16, 15]], '#ff4d7a', LIGHT);
  },
  electro_magnifying_glass: (s) => {
    s.aura(19, 12, 14, '#6fd8ff', 0.45);
    magnifier(s, '#4c6c94', '#9ee6ff', '#2c3446');
    s.pxs([[17, 8], [18, 9], [17, 10], [18, 11], [19, 12], [18, 13], [19, 14], [20, 15]], ramp('#ffffff', 1, true), HI);
    for (const [x, y] of [[4, 6], [28, 22], [27, 4]] as const) {
      s.pxs([[x, y], [x + 1, y + 1], [x, y + 2], [x + 1, y + 3]], ramp('#ffe45a', 1, true), HI);
    }
  },
  lucky_pendant: (s) => {
    chain(s, 6, 26, 1, 7, C.silver);
    s.limb(16, 26, 18, 30, 0.6, 0.4, '#3a8a2a');
    for (const [x, y] of [[12.5, 15.5], [19.5, 15.5], [12.5, 22.5], [19.5, 22.5]] as const) s.circle(x, y, 4, '#52b83a', { gloss: true });
    s.circle(16, 19, 2, '#3a8a2a');
    s.pxs([[11, 14], [18, 14], [11, 21], [18, 21]], '#c8ff9a', HI);
    sparkle(s, 26, 10);
  },
  mid_pacific_owl: (s) => {
    s.poly([[8, 24], [5, 28], [10, 27]], '#6e5a48');
    s.ellipse(14, 20, 7, 8, '#8c7660');
    s.ellipse(15.5, 22, 4.5, 5.5, '#c6b29a', { noEdge: true });
    for (const [x, y] of [[14, 20], [17, 21], [15, 24], [18, 25]] as const) s.px(x, y, '#7a6450', SHADOW);
    featherWing(s, 13, 17, 12, -0.5, '#6e5a48', '#4e3e30');
    s.circle(17, 10, 6.4, '#8c7660');
    s.poly([[12, 6], [11, 0], [15, 5]], '#6e5a48');
    s.poly([[19, 5], [22, 0], [22, 6]], '#6e5a48');
    s.circle(15, 10, 2.6, '#e6dccb', { noEdge: true });
    s.circle(20, 10, 2.6, '#e6dccb', { noEdge: true });
    s.eye(14, 9, 2, '#e88a1a');
    s.eye(19, 9, 2, '#e88a1a');
    s.poly([[17, 12], [18.5, 12], [17.6, 14.5]], '#e0a030');
    s.pxs([[13, 29], [14, 29], [18, 29], [19, 29]], C.orange, SHADOW);
  },
  zorbnik_leash: (s) => {
    s.aura(16, 14, 14, '#9cff6a', 0.3);
    for (const x of [11, 15, 19, 22]) s.limb(x, 21, x - 1 + (x % 2), 27, 1, 0.5, '#4fae3a');
    s.ellipse(16, 15, 8, 8.5, '#6fd14a', { gloss: true });
    s.limb(16, 7, 14, 1.5, 0.5, 0.4, '#4fae3a');
    s.circle(14, 1.5, 1.2, ramp('#d6ff5a', 1, true), { tone: LIGHT });
    s.circle(18, 13, 4.4, '#ffffff');
    s.circle(19, 13.5, 2.6, '#7a1a90');
    s.circle(19.5, 13.5, 1.2, C.ink, { tone: DARK });
    s.px(18, 12, '#ffffff', HI);
    s.pxs([[16, 19], [17, 20], [18, 20], [19, 19]], '#2a5a1a', DARK);
  },
  onisim_s_genie: (s) => {
    s.aura(20, 10, 12, '#7ab8ff', 0.4);
    // Smoke tail rising from the lamp's spout into the genie's torso.
    s.limb(26, 21, 23, 17, 1.4, 2.2, ramp('#6aa8ff', 0.75), { noEdge: true });
    s.limb(23, 17, 20, 15, 2.2, 3, ramp('#5a9cff', 0.85), { noEdge: true });
    s.ellipse(19.5, 11, 4.6, 3.8, '#4a8af0');
    s.limb(15.5, 10, 23.5, 11.5, 1.1, 1.1, '#5a9cff');
    s.circle(15, 10, 1.1, C.gold, { gloss: true });
    s.circle(20, 5, 3.4, '#5a9cff');
    s.limb(18, 2.5, 15, 0.5, 0.8, 0.5, '#1a2a60');
    s.eye(20, 4, 1);
    s.eye(22, 4, 1);
    s.pxs([[20, 7], [21, 7], [22, 6.5]], '#1a2a60', DARK);
    s.px(17, 6, C.gold, LIGHT);
    // Lamp
    s.ellipse(14, 25, 9, 3.8, C.gold, { gloss: true });
    s.poly([[21, 24], [28, 20], [29, 21.5], [22.5, 27]], C.gold);
    s.limb(6, 24, 3, 21, 1, 0.8, C.gold);
    s.limb(3, 21, 4, 27, 0.8, 0.8, C.gold);
    s.ellipse(14, 21.6, 4, 1.4, '#c89a1a');
    s.circle(14, 20.2, 1.1, C.gold, { gloss: true });
    s.rect(10, 28, 8, 1.8, '#b0861a', { noEdge: true });
  },
  summer_kite: (s) => kite(s, ['#ffcf3a', '#ff7a2a'], ['#ff4d6d', '#3ab0ff', '#ffcf3a'], 'triangle'),
  cosmic_unicorn_bracelet: (s) => {
    s.aura(16, 14, 15, '#c9a6ff', 0.35);
    s.ellipse(16, 22, 11, 5.5, '#c9ced8', { gloss: true });
    s.ellipse(16, 21.5, 8, 3.2, '#2a2048', { tone: SHADOW, noEdge: true });
    for (const [x, y] of [[11, 21], [15, 22], [19, 20], [21, 22]] as const) s.px(x, y, '#fff6c2', HI);
    s.poly([[13, 18], [19, 18], [17, 2], [15.5, 2]], '#f5d9ff', { gloss: true });
    for (let y = 4; y < 18; y += 3) s.pxs([[15, y], [16, y + 1], [17, y + 1]], '#e3a8ff', SHADOW);
    for (const [x, y] of [[6, 8], [26, 6], [24, 14], [8, 15]] as const) sparkle(s, x, y, '#fff6c2', x === 26);
  },
  death_s_scarf: (s) => {
    const cloth = '#2f2a38';
    // Loop around an (invisible) neck, then two long tails fluttering to the right.
    s.ellipse(13, 9, 9, 5.5, cloth);
    s.erase(13, 9, 5.2, 2.2);
    s.poly([[15, 11], [20, 10], [23, 16], [28, 21], [27, 28], [23, 25], [20, 18], [15, 14]], '#27222f');
    s.poly([[11, 12], [16, 12], [15, 19], [13, 26], [8, 29], [8, 21]], cloth);
    s.rect(12.5, 10, 4, 4, '#3a3446', { noEdge: false });
    for (const [x, y] of [[23, 26], [25, 28], [27, 27], [9, 28], [11, 29]] as const) s.px(x, y, '#4a4456', BASE);
    const skull = (x: number, y: number) => {
      s.circle(x, y, 2.2, '#ece8de');
      s.rect(x - 1.1, y + 1.4, 2.2, 1.5, '#ece8de', { noEdge: true });
      s.pxs([[x - 1, y], [x + 1, y]], C.ink, DARK);
      s.px(x, y + 2, C.ink, DARK);
    };
    skull(23, 20);
    skull(11.5, 21);
    skull(5, 8);
  },
  butterfly_leash: (s) => {
    // Seen from above: four patterned wings around a dark body.
    for (const dir of [-1, 1]) {
      s.ellipse(16 + dir * 7, 11, 7, 6.5, '#f27fb0', { rot: dir * 0.35, gloss: true });
      s.ellipse(16 + dir * 6, 21.5, 5, 4.5, '#ea5f9e', { rot: dir * -0.45 });
      s.ellipse(16 + dir * 7.5, 11.5, 3.6, 3.2, '#ffd0e4', { rot: dir * 0.35, noEdge: true });
      s.circle(16 + dir * 6.5, 21.5, 1.8, '#ffd0e4', { noEdge: true });
      for (const [dx, dy] of [[11, 6], [13, 9], [12, 13]] as const) s.px(16 + dir * dx, dy, '#5a1a3a', DARK);
      s.px(16 + dir * 8, 10, '#ffffff', HI);
    }
    s.limb(16, 8, 16, 25, 1.4, 0.9, C.black);
    s.circle(16, 7, 1.8, C.black);
    s.limb(15.5, 6, 12, 1, 0.3, 0.3, C.black, { noEdge: true });
    s.limb(16.5, 6, 20, 1, 0.3, 0.3, C.black, { noEdge: true });
    s.pxs([[12, 1], [20, 1]], '#f27fb0', LIGHT);
  },
  pineapple_kite: (s) => {
    string(s, 16, 22, 9, '#d8d2c0', 1);
    for (let i = 0; i < 5; i++) s.poly([[16, 8], [10 + i * 3, 0], [13 + i * 3 - 1, 1]], '#3a9a3a');
    s.ellipse(16, 15, 7, 8, '#f5c63a', { gloss: true });
    for (let y = 9; y < 23; y += 3) for (let x = 11; x < 22; x += 3) s.px(x + ((y / 3) % 2 ? 1 : 0), y, '#b07a1a', SHADOW);
  },
  sonar_bracelet: (s) => {
    for (let r = 0; r < 3; r++) for (let a = -0.6; a <= 0.6; a += 0.2) s.px(23 + (4 + r * 2.5) * Math.cos(a), 12 + (4 + r * 2.5) * Math.sin(a), ramp('#7ae8ff', 1, true), r === 0 ? HI : LIGHT);
    s.ellipse(14, 22, 10, 5, '#4a4458', { gloss: true });
    s.ellipse(14, 21.5, 7.4, 2.8, '#1c1824', { tone: SHADOW, noEdge: true });
    membraneWing(s, 13, 15, 3, 8, 10, 18, '#3a3446', '#5a5268');
    membraneWing(s, 15, 15, 24, 7, 18, 18, '#4a4458', '#6a6278');
    s.circle(14, 15, 3, '#4a4458');
    s.poly([[12, 13], [12.5, 10], [13.5, 12.5]], '#4a4458');
    s.poly([[15, 12.5], [16, 10], [16.3, 13]], '#4a4458');
    s.pxs([[13, 15], [15, 15]], ramp('#ff4d4d', 1, true), HI);
    s.rect(12, 24, 4, 2, ramp('#7ae8ff', 1, true), { tone: LIGHT, noEdge: true });
  },
  thinking_cap: (s) => {
    s.aura(16, 12, 15, '#ff8fe0', 0.35);
    s.ellipse(16, 13, 11, 9, '#f2a2c4', { gloss: true });
    for (const [x0, y0, x1, y1] of [[9, 9, 14, 12], [14, 7, 18, 10], [19, 9, 23, 13], [10, 15, 15, 14], [17, 15, 22, 17], [16, 5, 16, 20]] as const) s.limb(x0, y0, x1, y1, 0.5, 0.5, '#c9668e', { noEdge: true, tone: SHADOW });
    s.rect(5, 19, 22, 4, '#5a6ae0');
    s.poly([[22, 21], [30, 22], [22, 24]], '#3a48b0');
    s.pxs([[4, 6], [5, 5], [27, 5], [28, 4]], ramp('#ffe45a', 1, true), HI);
  },
  eye_of_growganoth: (s) => {
    s.aura(16, 15, 16, '#ff3a3a', 0.45);
    for (const [a, l] of [[2.4, 9], [3.2, 8], [4, 9], [0.8, 8], [5.5, 7]] as const) s.limb(16 + Math.cos(a) * 8, 15 + Math.sin(a) * 8, 16 + Math.cos(a) * (8 + l), 15 + Math.sin(a) * (8 + l), 1.4, 0.4, '#6a1a2a');
    s.circle(16, 15, 10, '#f2e4d8', { gloss: true });
    for (const [x0, y0, x1, y1] of [[7, 12, 11, 14], [8, 19, 12, 17], [24, 11, 21, 13], [23, 20, 20, 18]] as const) s.limb(x0, y0, x1, y1, 0.4, 0.3, '#d8303a', { noEdge: true, tone: BASE });
    s.circle(17, 15, 6, '#d8202a', { gloss: true });
    s.ellipse(17.5, 15, 1.4, 4.6, C.ink, { tone: DARK });
    s.pxs([[14, 12], [15, 12], [14, 13]], '#ffffff', HI);
  },
  betty_bluetooth_doll: (s) => {
    s.limb(13, 23, 12.5, 29.4, 1, 0.9, '#2a4a8a');
    s.limb(19, 23, 19.5, 29.4, 1, 0.9, '#2a4a8a');
    s.poly([[11, 16], [21, 16], [24, 25], [8, 25]], '#3a7ae0');
    s.pxs([[12, 24], [15, 24], [18, 24], [21, 24]], '#ffffff', LIGHT);
    s.limb(11, 17, 7, 22, 0.9, 0.8, C.silver);
    s.limb(21, 17, 25, 22, 0.9, 0.8, C.silver);
    s.rect(9.5, 5, 13, 11, '#9ec8ff', { gloss: true });
    s.rect(12, 8, 9, 5, '#1c2a48', { noEdge: true });
    s.pxs([[14, 10], [18, 10]], ramp('#6ff6ff', 1, true), HI);
    s.pxs([[15, 12], [16, 12], [17, 12]], ramp('#6ff6ff', 1, true), LIGHT);
    s.limb(16, 5, 16, 1, 0.4, 0.4, C.silver, { noEdge: true });
    s.circle(16, 1, 1, ramp('#3ab0ff', 1, true), { tone: HI });
    for (let r = 2; r < 5; r++) s.pxs([[16 + r + 1, 1 - (r > 3 ? 1 : 0)], [16 - r - 1, 1 - (r > 3 ? 1 : 0)]], ramp('#6ff6ff', 1, true), LIGHT);
  },
  rainbow_kite: (s) => {
    kite(s, ['#ff4d4d', '#ffd23a', '#3ab0ff'], ['#ff4d4d', '#ff9a2a', '#ffd23a', '#4fc24a', '#3ab0ff', '#9a5af0']);
    for (let i = 0; i < 6; i++) s.limb(10 + i * 1.4, 10 - i * 1.4, 18 + i * 1.4, 18 - i * 1.4, 0.5, 0.5, ['#ff4d4d', '#ff9a2a', '#ffd23a', '#4fc24a', '#3ab0ff', '#9a5af0'][i], { noEdge: true, tone: BASE });
  },
  haunted_synthoid: (s) => synthoid(s, '#8fd8e8', '#5ff6ff', { alpha: 0.6, glow: '#5ff6ff' }),
  ladybug_leaf: (s) => {
    s.ellipse(16, 18, 13, 6.5, '#4aa83a', { rot: -0.25 });
    s.limb(4, 21, 27, 15, 0.4, 0.3, '#2e7a24', { noEdge: true });
    s.limb(2, 22, 5, 21, 0.6, 0.6, '#2e7a24');
    s.ellipse(17, 13, 5.5, 4.4, '#e2302a', { gloss: true });
    s.circle(22, 13, 2.4, C.black);
    s.limb(17, 9, 17, 17, 0.3, 0.3, C.ink, { noEdge: true });
    for (const [x, y] of [[14, 11], [15, 15], [19, 12], [20, 15]] as const) s.circle(x, y, 1, C.ink, { tone: DARK });
    s.px(22, 12, '#ffffff', HI);
  },
  red_floaty_balloon: (s) => balloon(s, '#e4342c'),
  blue_floaty_balloon: (s) => balloon(s, '#3a7ae6'),
  green_floaty_balloon: (s) => balloon(s, '#4fd14a', { heal: true }),
  playful_wind_sprite: (s) => {
    fairy(s, ramp('#e8f8ff', 0.85), '#bfe8ff', '#ffffff', '#cfefff');
    for (let i = 0; i < 8; i++) s.px(4 + i * 1.2, 26 - Math.sin(i) * 2, ramp('#ffffff', 0.8, true), LIGHT);
  },
  cloud_rabbit: (s) => {
    for (const [x, y, r] of [[8, 23, 4], [14, 25, 4.6], [21, 24, 4], [11, 19, 5], [18, 19, 5.2]] as const) s.circle(x, y, r, '#f7f8fb', { gloss: true });
    s.limb(20, 13, 18, 2, 1.8, 1.4, '#eef1f7');
    s.limb(23, 13, 24, 3, 1.8, 1.4, '#f7f8fb');
    s.limb(24, 11, 24, 5, 0.5, 0.4, '#ffc9d9', { noEdge: true, tone: BASE });
    s.circle(22, 15, 4.6, '#f7f8fb', { gloss: true });
    s.eye(23, 13, 1, '#3a6ab0');
    s.px(26, 16, '#ffaac4', BASE);
    s.pxs([[21, 17], [24, 17]], '#ffc9d9', BASE);
  },
  discoball_companion: (s) => {
    for (const [x, c] of [[4, '#ff4d9a'], [28, '#3ab0ff'], [8, '#ffe45a']] as const) s.limb(16, 14, x, 30, 1.2, 2.5, ramp(c, 0.35, true), { noEdge: true, tone: BASE });
    string(s, 16, 0, 4, C.silver, 0);
    s.circle(16, 14, 9.5, '#b9bfcc', { gloss: true });
    for (let y = 6; y < 23; y += 2) for (let x = 7; x < 26; x += 2) if ((x - 16) ** 2 + (y - 14) ** 2 < 80) s.px(x, y, '#6a7080', SHADOW);
    for (const [x, y, c] of [[12, 10, '#ff9ad0'], [18, 9, '#9ae0ff'], [14, 16, '#fff09a'], [20, 15, '#b8ff9a']] as const) s.px(x, y, c, HI);
    sparkle(s, 10, 9, '#ffffff', true);
  },
  flying_bell: (s) => {
    for (const r of [11, 13]) for (let a = -0.5; a <= 0.5; a += 0.25) {
      s.px(16 + Math.cos(a) * r, 15 + Math.sin(a) * r, ramp('#fff3b0', 1, true), LIGHT);
      s.px(16 - Math.cos(a) * r, 15 + Math.sin(a) * r, ramp('#fff3b0', 1, true), LIGHT);
    }
    featherWing(s, 9, 10, 7, 0.4, '#ffffff');
    s.poly([[11, 6], [21, 6], [24, 20], [8, 20]], C.gold, { gloss: true });
    s.ellipse(16, 6, 5, 3, C.gold, { gloss: true });
    s.rect(6.5, 19, 19, 3, '#c8941a');
    s.circle(16, 23.5, 2, '#8a5a12');
    s.limb(16, 1, 16, 3, 1, 1, '#c8941a');
    s.pxs([[12, 9], [12, 12], [12, 15]], '#fff6c2', HI);
  },
  pet_hatchley: (s) => {
    s.ellipse(15, 18, 7, 7, '#ffd84a');
    s.circle(17, 10, 4.6, '#ffe06a');
    s.poly([[21, 9], [25, 10], [21, 11.5]], C.orange);
    s.eye(18, 8, 1);
    s.poly([[8, 19], [24, 19], [23, 27], [9, 27]], '#f4efe2', { gloss: true });
    s.ellipse(16, 27, 7, 2.6, '#f4efe2');
    s.pxs([[8, 19], [10, 17], [12, 19], [14, 17], [16, 19], [18, 17], [20, 19], [22, 17], [24, 19]], '#f4efe2', LIGHT);
    s.pxs([[11, 22], [12, 23], [19, 23], [20, 24]], '#c9c2b0', SHADOW);
    s.pxs([[26, 4], [26, 5], [26, 6], [25, 6], [27, 3], [28, 3], [28, 4]], ramp('#5a2a90', 1), BASE);
  },
  pineapple_blump_pet: (s) => {
    for (let i = 0; i < 5; i++) s.poly([[16, 9], [9 + i * 3.4, 1], [12 + i * 3.4, 3]], '#3f9a3a');
    s.ellipse(16, 19, 10, 10, '#f5c63a', { gloss: true });
    for (let y = 12; y < 28; y += 3) for (let x = 8; x < 25; x += 3) if ((x - 16) ** 2 + (y - 19) ** 2 < 85) s.px(x + ((y / 3) % 2 ? 1 : 0), y, '#a8721a', SHADOW);
    for (const [x, y, dx] of [[6, 16, -3], [26, 16, 3], [8, 25, -3], [24, 25, 3]] as const) s.poly([[x, y - 1], [x + dx, y], [x, y + 1]], '#3f9a3a');
    s.eye(16, 15, 2);
    s.eye(21, 15, 2);
    s.pxs([[18, 21], [19, 22], [20, 21]], C.ink, DARK);
  },
  party_fowl: (s) => {
    const g = bird(s, { body: '#f2ede2', belly: '#ffffff', wing: '#d9d2c2', tail: '#2a8a5a', beak: '#f0a020', cx: 13, cy: 21, eye: 1 });
    s.poly([[g.hx - 1, g.hy - 3.5], [g.hx + 1, g.hy - 6], [g.hx + 2.5, g.hy - 3.5]], '#e2302a');
    s.ellipse(g.hx + g.r, g.hy + 3, 1, 1.6, '#e2302a');
    s.poly([[g.hx - 2.5, g.hy - 3.3], [g.hx + 0.5, g.hy - 12], [g.hx + 3.5, g.hy - 3.3]], '#3a8af0');
    s.pxs([[Math.round(g.hx), Math.round(g.hy - 9)], [Math.round(g.hx + 1), Math.round(g.hy - 6)], [Math.round(g.hx - 1), Math.round(g.hy - 5)]], '#ffe45a', HI);
    s.circle(g.hx + 0.5, g.hy - 12, 1.1, '#ff4d9a');
    s.rect(g.hx - 1.5, g.hy - 2.5, 6, 2, C.ink, { tone: DARK, noEdge: true });
    s.px(g.hx + 3, g.hy - 2, '#8ad8ff', HI);
  },
  radioactive_synthoid: (s) => {
    synthoid(s, '#3a6a3a', '#9cff3a', { glow: '#7dff4f' });
    s.pxs([[16, 18], [15, 19], [17, 19]], C.ink, DARK);
  },
  passionate_painter_paintbrush: (s) => {
    for (const [x, y, c] of [[5, 6, '#ff4d6d'], [27, 9, '#3ab0ff'], [24, 26, '#ffd23a'], [6, 25, '#4fc24a'], [10, 3, '#b06af0']] as const) s.circle(x, y, 1.6, c, { gloss: true });
    s.limb(26, 3, 15, 16, 2, 1.6, C.wood, { gloss: true });
    s.limb(15, 16, 12, 19.5, 2.4, 2.4, C.silver, { gloss: true });
    s.poly([[9, 18], [14, 22], [8, 29], [4, 27]], '#2a2430');
    s.poly([[8, 22], [11, 24.5], [6, 29], [4, 27]], '#ff4d6d');
    s.pxs([[7, 25], [6, 26], [8, 26]], '#ffd23a', LIGHT);
    s.pxs([[24, 5], [22, 7], [20, 9]], '#d8a46a', LIGHT);
  },
  lantern_s_chronoreaper: (s) => {
    s.limb(25, 2, 23, 29, 0.6, 0.6, '#5a4a3a');
    s.poly([[25, 2], [31, 4], [28, 7], [26, 4]], '#c9ced8', { gloss: true });
    s.poly([[9, 10], [21, 10], [24, 29], [6, 29]], '#2a2433');
    for (const x of [7, 11, 15, 19, 23]) s.px(x, 29, '#1a1622', DARK);
    s.ellipse(15, 8, 6, 6.5, '#2a2433');
    s.ellipse(16.5, 9, 3.4, 4, '#0d0b12', { tone: DARK, noEdge: true });
    s.pxs([[16, 8], [18, 8]], ramp('#6ff6ff', 1, true), HI);
    s.limb(20, 14, 23, 17, 0.9, 0.8, '#2a2433');
    s.aura(9, 22, 7, '#ffcf5a', 0.6);
    string(s, 9, 14, 3, '#8a7a5a', 0);
    s.rect(6.5, 17, 5, 7, '#6a5a3a');
    s.rect(7.5, 18, 3, 5, ramp('#ffd25a', 1, true), { tone: LIGHT, noEdge: true });
    s.px(9, 20, '#ffffff', HI);
  },

  // =============================== EARTH ===============================
  puppy_leash: (s) =>
    quad(s, { body: '#a8682f', belly: '#e2b47a', head: 5, snout: 2.6, snoutColor: '#e2b47a', ears: 'flop', earColor: '#6e3e1a', tail: 'thin', eye: 2 }, {
      front: (g) => s.pxs([[Math.round(g.hx + 2), Math.round(g.hy + 3)]], '#e2647a', BASE),
    }),
  piglet_leash: (s) =>
    quad(s, { body: '#f4a8b8', belly: '#ffd0da', bw: 8, bh: 5.5, head: 4.8, snout: 1.8, snoutColor: '#ec8aa0', nose: '#a8405a', ears: 'point', earInner: '#e07a92', tail: 'curl', legR: 1.3, short: true, eye: 1 }),
  puddy_leash: (s) =>
    quad(s, { body: '#d9d2c6', belly: '#f6f1e8', head: 4.6, snout: 1.6, snoutColor: '#f6f1e8', nose: '#e27a8a', ears: 'point', earInner: '#f2a2b8', tail: 'thin', legR: 1.2, eye: 2, iris: '#3aa05a' }, {
      back: (g) => s.pxs([[Math.round(g.cx - 3), Math.round(g.cy - 4)], [Math.round(g.cx), Math.round(g.cy - 5)], [Math.round(g.cx + 3), Math.round(g.cy - 4)]], '#a89a8a', SHADOW),
      front: (g) => {
        s.pxs([[Math.round(g.hx + 4), Math.round(g.hy + 2)], [Math.round(g.hx + 5), Math.round(g.hy + 2)], [Math.round(g.hx + 4), Math.round(g.hy + 3)], [Math.round(g.hx + 6), Math.round(g.hy + 3)]], '#5a5048', DARK);
      },
    }),
  tumbleweed_attractor: (s) => {
    s.circle(15, 18, 11, '#b08a52');
    for (let i = 0; i < 14; i++) {
      const a = i * 0.9, b = a + 2.2;
      s.limb(15 + Math.cos(a) * 9, 18 + Math.sin(a) * 9, 15 + Math.cos(b) * 8, 18 + Math.sin(b) * 8, 0.4, 0.4, i % 2 ? '#7a5a2a' : '#d8b878', { noEdge: true, tone: i % 2 ? SHADOW : LIGHT });
    }
    for (const [x, y] of [[4, 12], [6, 26], [26, 10], [27, 24], [15, 5]] as const) s.limb(x, y, x + (15 - x) * 0.15, y + (18 - y) * 0.15, 0.3, 0.6, '#3a8a3a');
    s.circle(17, 16, 2.6, '#4aa83a');
  },
  muddy_pants: (s) => {
    pants(s, '#7a5a3a');
    for (const [x, y, r] of [[10, 22, 2], [21, 18, 2.4], [12, 13, 1.6], [23, 26, 1.8], [9, 28, 1.6]] as const) s.circle(x, y, r, '#4a3020', { gloss: true });
    s.pxs([[10, 25], [10, 26], [21, 21], [21, 22], [21, 23]], '#4a3020', BASE);
  },
  unicorn_garland: (s) => {
    s.aura(18, 18, 13, '#ffd86a', 0.35);
    for (let i = 0; i <= 10; i++) {
      const x = 3 + i * 2.6, y = 4 + Math.sin((i / 10) * Math.PI) * 12;
      s.circle(x, y, 1.6, ['#ff9ad0', '#fff09a', '#9ad8ff', '#c9a6ff'][i % 4], { gloss: true });
    }
    // Unicorn head medallion hanging from the garland
    s.ellipse(12.5, 22, 3, 5, '#c9a6ff', { rot: 0.3 });
    s.ellipse(11.5, 26, 2.4, 3, '#ff9ad0', { rot: 0.2 });
    s.ellipse(15.5, 22.5, 4, 4.4, '#f7f4ff');
    s.ellipse(19.5, 25.5, 3, 2.2, '#f7f4ff', { rot: 0.3 });
    s.poly([[13.5, 18.5], [14.5, 15.5], [16, 18.5]], '#f7f4ff');
    s.limb(16.5, 18.5, 19.5, 11, 1, 0.2, C.gold, { gloss: true });
    s.eye(16, 21, 1, '#7a4ab0');
    s.px(21, 26, '#e88aa8', BASE);
    sparkle(s, 25, 14, '#fff6c2', true);
  },
  mini_mammoth_leash: (s) =>
    quad(s, { body: '#7a4a24', bw: 8.5, bh: 6.5, cy: 19.5, head: 5.6, hx: 21.5, hy: 15, ears: 'flop', earColor: '#5e3418', tail: 'tuft', legR: 2, eye: 1 }, {
      back: (g) => {
        for (let x = g.cx - 7; x <= g.cx + 6; x += 2) s.limb(x, g.cy + 3, x - 0.5, g.cy + 7, 0.8, 0.5, '#5e3418');
      },
      front: (g) => {
        s.limb(g.hx + 3.5, g.hy + 2, g.hx + 6, g.hy + 10, 1.6, 1, '#7a4a24');
        s.limb(g.hx + 1.5, g.hy + 3, g.hx + 7.5, g.hy + 7, 0.8, 0.5, '#f4ead2', { gloss: true });
        s.pxs([[Math.round(g.hx - 3), Math.round(g.hy - 4)], [Math.round(g.hx - 1), Math.round(g.hy - 5.5)], [Math.round(g.hx + 1), Math.round(g.hy - 5)]], '#5e3418', SHADOW);
      },
    }),
  wolf_tamer_s_glove: (s) => {
    s.rect(6, 20, 13, 10, '#6a4228');
    s.rect(6, 19, 13, 2.5, '#8a8f9a', { gloss: true });
    s.ellipse(15, 14, 8, 7, '#8a5a34');
    for (let i = 0; i < 4; i++) s.limb(13 + i * 3, 9, 14 + i * 3.4, 2 + Math.abs(i - 1.5), 1.4, 1.2, '#8a5a34');
    s.limb(9, 14, 5, 9, 1.4, 1.2, '#8a5a34');
    for (const [x, y] of [[11, 13], [15, 12], [19, 13], [13, 17], [17, 17]] as const) s.circle(x, y, 0.9, '#c9ced8', { gloss: true });
    s.pxs([[8, 23], [11, 23], [14, 23], [17, 23]], '#c9ced8', LIGHT);
  },
  calf_leash: (s) =>
    quad(s, { body: '#8a5a32', belly: '#f2ece2', head: 4.4, snout: 2, snoutColor: '#f2c8b8', nose: '#8a4a3a', ears: 'flop', earColor: '#6a4024', tail: 'tuft', hoof: '#3a2a20', legR: 1.3, eye: 1 }, {
      back: (g) => {
        for (const [dx, dy, r] of [[-3, -1, 1.8], [2, -2.5, 1.6], [4.5, 1, 1.4]] as const) s.circle(g.cx + dx, g.cy + dy, r, '#f2ece2', { noEdge: true });
      },
      front: (g) => {
        s.limb(g.hx - 1, g.hy - g.head + 0.5, g.hx - 2, g.hy - g.head - 1.6, 0.6, 0.4, '#efe2c8');
        s.limb(g.hx + 1, g.hy - g.head + 0.5, g.hx + 1.5, g.hy - g.head - 1.6, 0.6, 0.4, '#efe2c8');
      },
    }),
  moose_cap: (s) => {
    const antler = (dir: number) => {
      const bx = 16 + dir * 5;
      s.ellipse(bx + dir * 5, 8, 6, 3.5, '#c8a06a', { rot: dir * -0.3 });
      for (let i = 0; i < 4; i++) s.limb(bx + dir * (2 + i * 2.6), 7, bx + dir * (2.5 + i * 2.8), 1.5 + (i % 2), 0.7, 0.4, '#c8a06a');
      s.limb(16 + dir * 3, 14, bx + dir * 2, 9, 1, 0.9, '#b08a52');
    };
    antler(-1);
    antler(1);
    s.ellipse(16, 20, 9, 6, '#7a4a28');
    s.rect(6, 23, 20, 4, '#5e3418');
    s.poly([[22, 25], [30, 26], [22, 28]], '#4a2a12');
    s.eye(19, 18, 1);
    s.eye(13, 18, 1);
    s.ellipse(16, 22, 2.4, 1.6, '#4a2a12', { noEdge: true });
  },
  baby_bunny: (s) =>
    quad(s, { body: '#c9a27a', belly: '#f2e6d4', cx: 14, cy: 23, bw: 6.5, bh: 5, head: 4.4, hx: 20, hy: 18, ears: 'long', earInner: '#f2a2b8', tail: 'stub', tailColor: '#f7f4ee', legR: 1.4, short: true, eye: 2 }, {
      front: (g) => s.px(g.hx + g.head - 0.5, g.hy + 0.5, '#e27a8a', BASE),
    }),
  mickeymay_leash: (s) => {
    quad(s, { body: '#9a9ea8', belly: '#d6d8de', cx: 13, cy: 24, bw: 6.5, bh: 4.6, head: 4.6, hx: 19, hy: 20, ears: 'round', earInner: '#f2a2b8', snout: 1.4, snoutColor: '#d6d8de', nose: '#e27a8a', tail: 'thin', legR: 1.1, short: true, eye: 2 });
    s.limb(22, 24, 21, 19, 1, 0.9, '#9a9ea8');
    s.pxs([[20, 17], [21, 17]], '#ffffff', HI);
    s.pxs([[25, 13], [26, 12], [26, 14]], ramp('#bfe8ff', 1, true), LIGHT);
  },
  mini_growtopian: (s) => {
    s.limb(13, 23, 13, 29.4, 1.4, 1.3, '#2a4a8a');
    s.limb(18, 23, 18.5, 29.4, 1.4, 1.3, '#2a4a8a');
    s.rect(11, 29, 4, 1.6, C.black, { noEdge: true });
    s.rect(16.5, 29, 4, 1.6, C.black, { noEdge: true });
    s.rect(10.5, 15, 10, 9, '#f2f0ea');
    s.limb(11, 16, 8, 22, 1.2, 1, '#e8b088');
    s.limb(20, 16, 23, 22, 1.2, 1, '#e8b088');
    s.circle(15.5, 9, 7, '#e8b088');
    s.ellipse(14, 4.5, 7, 3.4, '#5a3418', { rot: -0.1 });
    s.eye(16, 8, 2);
    s.eye(19, 8, 2);
    s.pxs([[18, 13], [19, 13], [20, 12]], '#8a3a2a', DARK);
  },
  pet_bunny: (s) =>
    quad(s, { body: '#f6f4f0', belly: '#ffffff', cx: 14, cy: 23, bw: 6.5, bh: 5, head: 4.6, hx: 20, hy: 17.5, ears: 'long', earColor: '#f6f4f0', earInner: '#f6a8bc', tail: 'stub', legR: 1.4, short: true, eye: 1, iris: '#e2302a' }, {
      front: (g) => s.px(g.hx + g.head - 0.5, g.hy + 0.5, '#f27a92', BASE),
    }),
  pet_burrito: (s) =>
    quad(s, { body: '#8e9098', belly: '#d2d4d8', head: 4.4, hx: 22, hy: 14.5, snout: 2.4, snoutColor: '#c9cbd0', ears: 'long', earColor: '#7a7c84', tail: 'tuft', hoof: '#3a3a40', legR: 1.3, eye: 1 }, {
      front: (g) => {
        s.rect(g.cx - 4, g.cy - g.bh - 1, 8, 4, '#a0703a');
        s.rect(g.cx - 4.5, g.cy - g.bh - 2, 2, 3, '#7a4a20', { noEdge: true });
        s.rect(g.cx + 3, g.cy - g.bh - 2, 2, 3, '#7a4a20', { noEdge: true });
        s.limb(g.cx, g.cy - g.bh + 2, g.cx, g.cy + 3, 0.4, 0.4, '#5a3418', { noEdge: true });
        s.pxs([[Math.round(g.hx - 2), Math.round(g.hy - 4)], [Math.round(g.hx - 3), Math.round(g.hy - 3)], [Math.round(g.hx - 4), Math.round(g.hy - 2)]], '#4a4c54', SHADOW);
      },
    }),
  pet_leprechaun: (s) => {
    s.limb(13, 24, 12.5, 29.4, 1.2, 1.1, '#2e7a2a');
    s.limb(18, 24, 18.5, 29.4, 1.2, 1.1, '#2e7a2a');
    s.rect(10.5, 28.5, 4, 1.8, C.black, { noEdge: true });
    s.rect(16.5, 28.5, 4, 1.8, C.black, { noEdge: true });
    s.ellipse(15.5, 20, 6, 5.5, '#3e9a3a');
    s.rect(9.5, 20, 12, 2, C.black, { noEdge: true });
    s.rect(14.5, 19.5, 2.5, 3, C.gold, { noEdge: true });
    s.circle(16, 11, 5, '#f2c8a0');
    s.ellipse(17, 15, 5, 3.2, '#e2702a');
    s.eye(17, 9, 1);
    s.ellipse(16, 6.5, 8, 1.6, '#2e7a2a');
    s.rect(11.5, -0.5, 9, 7, '#3e9a3a');
    s.rect(11.5, 4, 9, 1.6, C.black, { noEdge: true });
    s.limb(22, 18, 25, 21, 1, 0.9, '#3e9a3a');
    s.circle(26, 22, 2.6, C.gold, { gloss: true });
    s.px(26, 22, '#fff6c2', HI);
  },
  lil_sheepers: (s) =>
    quad(s, { body: '#f4f2ec', leg: '#3a3440', cx: 13, cy: 20, bw: 8.5, bh: 6.5, head: 3.8, hx: 22.5, hy: 16.5, headColor: '#3a3440', ears: 'flop', earColor: '#3a3440', tail: 'stub', tailColor: '#f4f2ec', legR: 1.2, eye: 1, iris: '#1a1620' }, {
      back: (g) => {
        for (const [dx, dy] of [[-7, -2], [-4, -5], [0, -6.5], [4, -5], [6.5, -1], [-6, 3], [5, 3.5], [0, 4.5]] as const) s.circle(g.cx + dx, g.cy + dy, 3, '#f4f2ec', { gloss: true });
      },
      front: (g) => {
        s.circle(g.hx - 1, g.hy - 3.5, 2.4, '#f4f2ec', { gloss: true });
        s.px(g.hx + 1, g.hy - 1, '#ffffff', HI);
      },
    }),
  rhino_horn: (s) => {
    s.ellipse(16, 28, 13, 3.5, '#6a645c');
    for (const [x, y, r] of [[6, 26, 3], [25, 26, 3.4], [11, 28, 2.5]] as const) s.circle(x, y, r, '#8a847a', { gloss: true });
    s.poly([[9, 27], [23, 27], [21, 15], [17, 3], [14, 10], [11, 20]], '#a89a86', { gloss: true });
    s.poly([[17, 3], [21, 15], [23, 27], [19, 27], [18, 14]], '#7a6e60', { noEdge: true });
    for (const [x, y] of [[13, 22], [15, 17], [16, 12], [18, 21], [14, 25]] as const) s.px(x, y, '#5a5048', SHADOW);
  },
  flowersaurus_rex: (s) => {
    dino(s, ['rex'], { body: '#4fae3a', belly: '#c8ef8a', accent: '#2e7a24' });
    for (const [x, y, c] of [[9, 14, '#ff6aa8'], [12, 12.5, '#ffd23a'], [15, 13, '#ff8a3a'], [6, 18, '#b07cf0']] as const) {
      s.circle(x, y, 1.8, c, { gloss: true });
      s.px(x, y, '#fff6c2', HI);
    }
  },
  zombie_hound: (s) =>
    quad(s, { body: '#7a8a6a', belly: '#a8a07a', head: 4.8, hy: 13.5, snout: 3, snoutColor: '#6a7a5a', ears: 'point', earColor: '#5a6a4a', tail: 'thin', legR: 1.4, eye: 1, iris: '#d6ff3a' }, {
      back: (g) => {
        for (let i = 0; i < 4; i++) s.limb(g.cx - 2 + i * 1.8, g.cy - 2, g.cx - 2 + i * 1.8, g.cy + 2, 0.4, 0.4, '#e8e0c8', { noEdge: true, tone: SHADOW });
      },
      front: (g) => {
        for (let i = 0; i < 4; i++) s.limb(g.cx - 3 + i * 1.8, g.cy - 2.5, g.cx - 3 + i * 1.8, g.cy + 1.5, 0.35, 0.35, '#e8e0c8', { noEdge: true, tone: LIGHT });
        for (const [dx, dy, c] of [[-5, -5, '#c9583a'], [1, -6, '#d8a83a'], [4, -5, '#c9583a']] as const) {
          s.limb(g.cx + dx, g.cy + dy + 1.5, g.cx + dx, g.cy + dy, 0.4, 0.4, '#e8e0c8', { noEdge: true });
          s.ellipse(g.cx + dx, g.cy + dy - 0.5, 1.6, 1, c);
        }
        s.pxs([[Math.round(g.hx + 2), Math.round(g.hy + 3)], [Math.round(g.hx + 4), Math.round(g.hy + 3)]], '#f4f0e0', LIGHT);
      },
    }),
  pineapple_finger_ring: (s) => {
    s.ellipse(16, 23, 9, 5, '#a0703a', { gloss: true });
    s.ellipse(16, 22.6, 6.4, 2.6, '#3a2414', { tone: SHADOW, noEdge: true });
    for (let i = 0; i < 4; i++) s.poly([[16, 8], [11 + i * 3.3, 1], [13.5 + i * 3.3, 2]], '#3f9a3a');
    s.ellipse(16, 13.5, 5, 6, '#d8a83a', { gloss: true });
    for (let y = 10; y < 19; y += 3) for (let x = 13; x < 20; x += 3) s.px(x + ((y / 3) % 2 ? 1 : 0), y, '#8a5a1a', SHADOW);
    for (const [x, y, dx] of [[11, 12, -2], [21, 12, 2], [11, 16, -2], [21, 16, 2]] as const) s.poly([[x, y - 0.8], [x + dx, y], [x, y + 0.8]], '#7a4a1a');
  },
  playful_wood_sprite: (s) => fairy(s, '#c99a6a', '#5a8a3a', '#b8f08a', '#b8f08a', { leaves: true }),
  dryad: (s) => {
    s.aura(16, 14, 15, '#a8f08a', 0.3);
    for (const [x0, x1] of [[12, 6], [15, 14], [18, 26], [16, 21]] as const) s.limb(x0, 25, x1, 30, 1.1, 0.5, '#7a5230');
    s.poly([[12, 13], [20, 13], [23, 26], [9, 26]], '#5aae4a');
    s.pxs([[11, 24], [14, 22], [18, 23], [21, 24], [13, 19], [19, 18]], '#2e7a24', SHADOW);
    s.limb(12, 15, 7, 11, 0.8, 0.6, '#a8d88a');
    s.limb(20, 15, 25, 11, 0.8, 0.6, '#a8d88a');
    s.ellipse(14, 8, 5, 7, '#3e8a2a');
    s.circle(17, 8, 4.3, '#b8e09a');
    for (const [x, y, c] of [[12, 3, '#72c447'], [15, 2, '#ff9ad0'], [18, 2, '#72c447'], [21, 4, '#ffd23a'], [10, 6, '#72c447']] as const) s.circle(x, y, 1.4, c, { gloss: true });
    s.eye(18, 7, 1, '#2e6a2a');
    s.px(20, 10, '#e46a7e', BASE);
  },
  prickly_pet: (s) => {
    s.ellipse(16, 21, 7, 9, '#4aa83a', { gloss: true });
    s.limb(9, 20, 5, 15, 1.8, 1.6, '#4aa83a');
    s.limb(5, 15, 5, 12, 1.6, 1.4, '#4aa83a');
    s.limb(23, 22, 27, 17, 1.6, 1.4, '#4aa83a');
    for (let x = 12; x <= 20; x += 4) s.limb(x, 13, x, 29, 0.3, 0.3, '#2e7a24', { noEdge: true, tone: SHADOW });
    for (const [x, y, dx, dy] of [[9, 15, -2, -1], [23, 14, 2, -1], [8, 24, -2, 0], [24, 25, 2, 0], [16, 11, 0, -2], [12, 12, -1, -2], [20, 12, 1, -2]] as const) s.limb(x, y, x + dx, y + dy, 0.3, 0.2, '#f4f0d8', { noEdge: true, tone: LIGHT });
    s.circle(16, 11.5, 2, '#ff6aa8', { gloss: true });
    s.eye(16, 18, 2);
    s.eye(20, 18, 2);
    s.pxs([[17, 23], [18, 24], [19, 23]], '#1a3a14', DARK);
  },
  growmoji_s_little_friend: (s) => {
    s.ellipse(16, 20, 10, 9, '#8a6a4a', { gloss: true });
    for (const [x, y] of [[9, 16], [12, 26], [20, 27], [23, 15], [14, 13]] as const) s.px(x, y, '#5a4430', SHADOW);
    for (const x of [8, 22]) {
      s.limb(x, 25, x + (x < 16 ? -3 : 3), 28, 1.6, 1.2, '#8a6a4a');
      for (let i = 0; i < 3; i++) s.px(x + (x < 16 ? -4 - i * 0.2 : 4 + i * 0.2) , 27 + i, '#f2ead8', LIGHT);
    }
    s.eye(12, 15, 3);
    s.eye(18, 15, 3);
    s.pxs([[15, 23], [16, 24], [17, 24], [18, 23]], '#2a1a10', DARK);
  },
  '14devil_s_friendly_doggy_leash': (s) =>
    quad(s, { body: '#2e2a36', belly: '#4a4456', head: 5, snout: 2.6, ears: 'point', earColor: '#2e2a36', tail: 'thin', legR: 1.4, eye: 1, iris: '#ff3a2a' }, {
      back: (g) => s.aura(g.cx, g.cy, 13, '#ff4a2a', 0.25),
      front: (g) => {
        s.limb(g.hx - 0.5, g.hy - g.head + 1, g.hx - 2, g.hy - g.head - 3, 0.8, 0.2, '#e2302a');
        s.limb(g.hx + 2, g.hy - g.head + 1, g.hx + 3, g.hy - g.head - 3, 0.8, 0.2, '#e2302a');
        s.poly([[g.cx - g.bw - 5, g.cy - 7], [g.cx - g.bw - 3.5, g.cy - 8.5], [g.cx - g.bw - 3, g.cy - 6.5]], '#e2302a');
        s.px(g.hx + 3, g.hy + 3, '#ff6a8a', BASE);
      },
    }),
  unearthly_synthoid: (s) => synthoid(s, '#3a3150', '#c06aff', { glow: '#9a4aff' }),
  captain_bark_royal_captain_bark: (s) => {
    s.limb(13, 22, 12.5, 29.4, 1.8, 1.6, '#8a5a2a');
    s.limb(19, 22, 19.5, 29.4, 1.8, 1.6, '#8a5a2a');
    s.poly([[9, 13], [23, 13], [22, 24], [10, 24]], '#5a6a8a', { gloss: true });
    s.rect(14, 15, 4, 4, C.gold, { noEdge: true });
    s.limb(9, 14, 5, 22, 2, 1.6, '#a8682f');
    s.limb(23, 14, 26, 22, 2, 1.6, '#a8682f');
    s.ellipse(9, 14, 3, 2, '#c9ced8', { gloss: true });
    s.ellipse(23, 14, 3, 2, '#c9ced8', { gloss: true });
    s.circle(16, 8, 5.4, '#a8682f');
    s.ellipse(20.5, 9.5, 2.8, 2, '#e2b47a');
    s.px(23, 9, C.ink, DARK);
    s.ellipse(11.5, 9, 1.8, 3.4, '#6e3e1a', { rot: 0.3 });
    s.eye(17, 6, 1);
    s.poly([[11, 3.5], [11, -0.5], [13.5, 2], [16, -1], [18.5, 2], [21, -0.5], [21, 3.5]], C.gold, { gloss: true });
    s.pxs([[13, 2], [16, 1], [19, 2]], '#e2302a', HI);
  },
  mechasaurus_rex: (s) => {
    dino(s, ['rex'], { body: '#7a808c', belly: '#a8aeb8', accent: '#3a3f4a', horn: '#c9ced8' });
    for (const [x, y] of [[10, 17], [13, 15], [8, 22], [14, 21]] as const) s.px(x, y, '#c9ced8', HI);
    s.rect(17, 19, 7, 3, '#3a3f4a', { gloss: true });
    for (let i = 0; i < 3; i++) s.limb(24, 19.5 + i, 29, 19.5 + i, 0.4, 0.4, '#c9ced8', { noEdge: true });
    s.pxs([[23, 9]], ramp('#ff3a3a', 1, true), HI);
  },
  gingerbread_man: (s) => {
    const dough = '#c07a3a';
    s.limb(12, 21, 9, 29, 2.4, 2.2, dough);
    s.limb(20, 21, 23, 29, 2.4, 2.2, dough);
    s.limb(11, 15, 5, 18, 2.2, 2, dough);
    s.limb(21, 15, 27, 12, 2.2, 2, dough);
    s.ellipse(16, 18, 6, 6.5, dough);
    s.circle(16, 8, 5.5, dough);
    const icing = '#ffffff';
    s.pxs([[8, 28], [9, 27], [10, 28], [22, 28], [23, 27], [24, 28], [5, 17], [6, 18], [27, 11], [26, 12]], icing, LIGHT);
    s.eye(14, 6, 1);
    s.eye(17, 6, 1);
    s.pxs([[14, 10], [15, 11], [16, 11], [17, 10]], icing, LIGHT);
    for (const [y, c] of [[15, '#e2302a'], [18, '#3ab04a'], [21, '#3a8af0']] as const) s.circle(16, y, 1.1, c, { gloss: true });
  },
  diamond_block: (s) => {
    s.aura(16, 16, 15, '#9ef0ff', 0.3);
    s.poly([[6, 9], [16, 4], [26, 9], [16, 14]], '#d8faff', { gloss: true });
    s.poly([[6, 9], [16, 14], [16, 28], [6, 23]], '#6ad8f2', { gloss: true });
    s.poly([[16, 14], [26, 9], [26, 23], [16, 28]], '#3aa8d8');
    s.limb(9, 13, 13, 21, 0.4, 0.4, '#ffffff', { noEdge: true, tone: HI });
    s.limb(19, 17, 23, 15, 0.4, 0.4, '#a8f0ff', { noEdge: true, tone: LIGHT });
    sparkle(s, 12, 7, '#ffffff', true);
    sparkle(s, 25, 25, '#ffffff');
  },
  toy_lock_bot: (s) => {
    s.limb(12, 23, 11, 29.4, 1.3, 1.2, '#5a6070');
    s.limb(20, 23, 21, 29.4, 1.3, 1.2, '#5a6070');
    s.rect(9, 13, 14, 11, '#4fc23a', { gloss: true });
    s.rect(12, 16, 8, 5, '#f5c63a');
    s.circle(16, 18.5, 1.4, C.ink, { tone: DARK });
    s.rect(15.5, 19, 1, 2, C.ink, { tone: DARK, noEdge: true });
    s.limb(4, 17, 9, 17, 0.6, 0.6, '#c9ced8');
    s.ellipse(3, 17, 1.2, 3, '#c9ced8', { gloss: true });
    s.rect(10, 4, 12, 9, '#f5c63a', { gloss: true });
    s.eye(13, 7, 2, '#1a4a14');
    s.eye(18, 7, 2, '#1a4a14');
    s.limb(16, 4, 16, 1, 0.4, 0.4, '#5a6070', { noEdge: true });
    s.circle(16, 0.8, 1, '#e2302a', { gloss: true });
  },

  // ================================ FIRE ================================
  fiery_dragon_leash: (s) => {
    s.aura(15, 15, 15, '#ff7a2a', 0.3);
    membraneWing(s, 13, 13, 3, 3, 9, 17, '#a8281c', '#ffb02a');
    s.limb(9, 18, 2, 22, 2.2, 0.5, '#d8352a');
    s.poly([[1, 21], [-1, 24], [3, 23]], '#ffb02a');
    s.ellipse(13, 17, 6, 4.5, '#d8352a', { rot: -0.3 });
    s.ellipse(14, 19, 4, 2, '#f5b04a', { noEdge: true, rot: -0.3 });
    s.limb(12, 20, 11, 25, 1, 0.8, '#b8281c');
    s.limb(15, 20, 15.5, 25, 1, 0.8, '#d8352a');
    membraneWing(s, 15, 12, 22, 2, 14, 16, '#d8352a', '#ffb02a');
    s.limb(17, 14, 20, 10, 2, 1.8, '#d8352a');
    dragonHead(s, 22, 9, '#d8352a', '#f4e2c0');
    flame(s, 29, 13, 1.6, 5, 2);
  },
  hot_pepper_leash: (s) => {
    s.aura(16, 17, 14, '#ff6a2a', 0.3);
    s.limb(9, 9, 13, 26, 4.2, 1.2, '#e2302a', { gloss: true });
    s.poly([[13, 25], [18, 28], [14, 28.5]], '#e2302a');
    s.limb(9, 5, 12, 1, 1, 0.8, '#3a8a2a');
    s.ellipse(9, 6, 4, 1.8, '#3f9a3a');
    s.eye(11, 12, 2);
    s.pxs([[12, 17], [13, 18], [14, 17]], '#5a0a0a', DARK);
    for (const [x, y] of [[21, 8], [24, 14], [20, 20], [25, 5]] as const) flame(s, x, y, 1.4, 4, 0.5);
  },
  phoenix_pendant: (s) => {
    s.aura(16, 17, 15, '#ffb02a', 0.45);
    chain(s, 6, 26, 0, 6);
    for (const dir of [-1, 1]) s.poly([[16, 15], [16 + dir * 13, 8], [16 + dir * 11, 14], [16 + dir * 12, 18], [16 + dir * 4, 20]], dir < 0 ? '#e88a1a' : '#f5b02a');
    s.ellipse(16, 18, 3.5, 5, C.gold, { gloss: true });
    s.circle(16, 12, 2.6, C.gold, { gloss: true });
    s.poly([[17.5, 11.5], [20.5, 12.5], [17.5, 13.5]], '#e2702a');
    s.px(16, 11, C.ink, DARK);
    for (const x of [13, 16, 19]) flame(s, x, 29, 1.6, 6, x - 16);
  },
  fire_elemental: (s) => {
    s.aura(16, 18, 15, '#ff7a2a', 0.5);
    flame(s, 16, 30, 9, 28, 1);
    s.eye(13, 17, 2, '#ff1a0a');
    s.eye(19, 17, 2, '#ff1a0a');
    s.pxs([[14, 23], [15, 24], [16, 24], [17, 24], [18, 23]], '#7a1a0a', DARK);
  },
  fire_ants: (s) => {
    const ant = (x: number, y: number, k: number) => {
      for (const dx of [-1.5, 0, 1.5]) s.limb(x + dx * k, y + 0.5, x + dx * k - 1.5 * k, y + 3.2 * k, 0.35, 0.3, '#4a0a0a', { noEdge: true });
      s.ellipse(x - 3.4 * k, y + 0.3, 2.6 * k, 2 * k, '#c8281c', { gloss: true });
      s.circle(x, y - 0.2, 1.3 * k, '#a81c14');
      s.circle(x + 2.8 * k, y - 0.9, 1.9 * k, '#c8281c', { gloss: true });
      s.limb(x + 3.5 * k, y - 2.4 * k, x + 5.5 * k, y - 4.6 * k, 0.3, 0.3, '#4a0a0a', { noEdge: true });
      s.limb(x + 2.5 * k, y - 2.6 * k, x + 3.5 * k, y - 5 * k, 0.3, 0.3, '#4a0a0a', { noEdge: true });
      s.px(x + 3.4 * k, y - 1.4 * k, '#ffe45a', HI);
      flame(s, x - 3.6 * k, y - 1.2 * k, 1.3 * k, 4.5 * k, -0.6);
    };
    ant(9, 13, 1.25);
    ant(21, 18.5, 1.35);
    ant(10, 26, 1.3);
  },
  magma_salamander: (s) => {
    s.aura(16, 21, 15, '#ff6a1a', 0.3);
    s.limb(8, 21, 0.5, 26, 2.8, 0.6, '#c8401c');
    for (const x of [9, 19]) s.limb(x + 2, 22, x + 3.5, 28.5, 1.1, 0.8, '#8a2a14', { lift: -0.2 });
    s.ellipse(15, 21, 8.5, 4.2, '#d8481c');
    s.ellipse(16, 23.5, 6, 1.8, '#f5a03a', { noEdge: true });
    for (const x of [9, 19]) {
      s.limb(x, 22.5, x - 2, 28.5, 1.3, 1, '#d8481c');
      s.pxs([[x - 4, 29], [x - 3, 29], [x - 2, 29]], '#d8481c', SHADOW);
    }
    s.ellipse(25, 19, 4.6, 3.3, '#d8481c');
    s.ellipse(28.5, 19.8, 2.6, 1.9, '#d8481c');
    for (const [x0, y0, x1, y1] of [[5, 21, 9, 22], [11, 18, 14, 20], [16, 17.5, 19, 19], [21, 19, 23, 17], [12, 22, 15, 21]] as const) s.limb(x0, y0, x1, y1, 0.45, 0.4, ramp('#ffd23a', 1, true), { noEdge: true, tone: LIGHT });
    s.eye(25, 17, 2, '#ffcf3f');
    s.limb(27, 21, 30, 21, 0.3, 0.3, '#5a1a0a', { noEdge: true, tone: DARK });
  },
  flame_sprite_playful_fire_sprite: (s) => fairy(s, '#ffb07a', '#e2402a', '#ffd23a', '#ff8a2a', { flameHair: true }),
  magic_reindeer_bell: (s) => {
    s.aura(16, 17, 14, '#ffe08a', 0.35);
    for (const dir of [-1, 1]) {
      s.limb(16 + dir * 3, 9, 16 + dir * 9, 1, 0.9, 0.5, '#b8844a');
      s.limb(16 + dir * 6, 5.5, 16 + dir * 10, 5, 0.6, 0.4, '#b8844a');
      s.limb(16 + dir * 7.5, 3.5, 16 + dir * 6, 0, 0.5, 0.3, '#b8844a');
    }
    s.poly([[11, 10], [21, 10], [24, 24], [8, 24]], C.gold, { gloss: true });
    s.ellipse(16, 10, 5, 3, C.gold, { gloss: true });
    s.rect(6.5, 23, 19, 3, '#c8941a');
    s.circle(16, 27, 1.8, '#8a5a12');
    s.rect(10, 15, 12, 2.5, '#e2302a', { noEdge: true });
    s.poly([[16, 16], [11, 12.5], [12, 19]], '#e2302a');
    s.poly([[16, 16], [21, 12.5], [20, 19]], '#e2302a');
    s.circle(16, 16, 1.4, '#b81c1c');
    s.pxs([[12, 13], [12, 20], [11, 22]], '#fff6c2', HI);
  },
  retro_magnifying_glass: (s) => {
    for (const [x, c] of [[2, '#ff4d9a'], [28, '#3ab0ff'], [24, '#b8ff3a']] as const) s.limb(19, 12, x, 0, 1, 2, ramp(c, 0.4, true), { noEdge: true, tone: BASE });
    magnifier(s, '#2a2430', '#2a2a34', '#c8402a');
    for (const r of [5, 3.5]) for (let a = 0; a < 6.3; a += 0.35) s.px(19 + Math.cos(a) * r, 12 + Math.sin(a) * r, '#4a4a58', LIGHT);
    s.circle(19, 12, 1.8, '#e2302a');
    s.px(19, 12, C.ink, DARK);
  },
  spitfire_mask: (s) => {
    for (const [x, h] of [[9, 9], [13, 12], [16, 14], [19, 12], [23, 9]] as const) flame(s, x, 8, 2.4, h, (x - 16) * 0.3);
    s.ellipse(16, 17, 9, 11, '#8a4a24');
    s.ellipse(16, 17, 7, 9, '#a8602a', { noEdge: true });
    for (const [x0, y0, x1, y1, c] of [[9, 12, 23, 12, '#e2302a'], [10, 22, 22, 22, '#f5c63a'], [16, 7, 16, 11, '#f5f0e2']] as const) s.limb(x0, y0, x1, y1, 0.5, 0.5, c, { noEdge: true, tone: BASE });
    s.ellipse(12.5, 16, 2.4, 1.6, '#1a0a04', { tone: DARK });
    s.ellipse(19.5, 16, 2.4, 1.6, '#1a0a04', { tone: DARK });
    s.pxs([[12, 16], [13, 16], [19, 16], [20, 16]], ramp('#ffb02a', 1, true), HI);
    s.rect(13, 24, 6, 2.4, '#1a0a04', { tone: DARK });
    s.pxs([[14, 24], [16, 24], [18, 24]], '#f5f0e2', LIGHT);
  },
  lion_taming_whip: (s) => {
    s.limb(5, 29, 9, 20, 1.8, 1.6, '#5a3418');
    s.rect(7.5, 19, 3.5, 2, C.gold, { noEdge: true });
    for (let i = 0; i < 14; i++) {
      const t = i / 13;
      const x = 10 + t * 14 + Math.sin(t * 7) * 3, y = 19 - t * 12 + Math.cos(t * 6) * 2.5;
      s.circle(x, y, 1.1 - t * 0.5, '#7a4a24', { noEdge: true });
    }
    s.aura(25, 7, 7, '#ff8a2a', 0.6);
    flame(s, 25, 10, 3, 9, 1);
  },
  dragon_hand: (s) => {
    s.aura(16, 14, 15, '#ff6a2a', 0.3);
    s.rect(4, 18, 9, 11, '#a8281c');
    s.rect(3.5, 17, 10, 2.5, C.gold, { noEdge: true });
    s.ellipse(16, 15, 9, 7, '#d8352a');
    s.ellipse(23, 17, 5, 3, '#d8352a');
    s.ellipse(22, 20.5, 5, 1.6, '#a8281c');
    for (let x = 18; x <= 26; x += 2) s.px(x, 19, C.snow, LIGHT);
    s.limb(13, 9, 9, 3, 1, 0.3, '#f4e2c0');
    s.limb(16, 9, 14, 2, 1, 0.3, '#f4e2c0');
    s.eye(18, 12, 2, '#ffcf3f');
    s.pxs([[12, 11], [14, 10], [12, 18], [10, 15]], '#7a1a12', SHADOW);
    flame(s, 30, 21, 1.6, 6, 1);
  },
  fiesta_dragon: (s) => {
    const stripes = ['#ff4d6d', '#ffd23a', '#3ab0ff', '#4fc24a', '#b06af0'];
    for (const lx of [9, 17]) s.limb(lx, 21, lx, 29.4, 1.6, 1.4, '#ff9a2a');
    s.limb(6, 18, 1, 14, 2, 1, '#b06af0');
    s.ellipse(13, 19, 8, 5, '#ff4d6d');
    for (let i = 0; i < 5; i++) s.limb(7 + i * 3, 14.5, 7 + i * 3, 23.5, 0.8, 0.8, stripes[i], { noEdge: true, tone: BASE });
    membraneWing(s, 13, 15, 8, 6, 10, 16, '#3ab0ff', '#ffd23a');
    s.limb(19, 16, 21, 11, 2.2, 2, '#ffd23a');
    dragonHead(s, 23, 9, '#4fc24a', '#ff4d6d');
    for (const [x, y, c] of [[12, 13, '#ff4d6d'], [16, 13, '#ffd23a'], [20, 7, '#3ab0ff']] as const) s.pxs([[x, y], [x, y - 1], [x + 1, y - 1]], c, LIGHT);
  },
  nightmare_magnifying_glass: (s) => {
    s.aura(19, 12, 15, '#7a2ac8', 0.5);
    magnifier(s, '#3a2a50', '#4a1a6a', '#1c1424');
    s.ellipse(19, 12, 4, 2.6, '#e8d8ff');
    s.circle(19.5, 12, 1.8, '#c81a5a');
    s.px(19.5, 12, C.ink, DARK);
    for (const [x, y] of [[5, 6], [27, 26], [4, 18]] as const) s.pxs([[x, y], [x + 1, y - 1], [x + 2, y]], ramp('#c06aff', 1, true), LIGHT);
  },
  dragon_of_legend: (s) => {
    s.aura(15, 13, 16, '#ffd23a', 0.35);
    membraneWing(s, 13, 12, 0, 0, 8, 17, '#c8901a', '#ffe08a');
    s.limb(9, 19, 1, 26, 2.6, 0.5, C.gold);
    s.ellipse(13, 18, 7, 5, C.gold, { rot: -0.3, gloss: true });
    s.ellipse(14, 20.5, 4.5, 2.2, '#fff0a8', { noEdge: true, rot: -0.3 });
    for (const x of [10, 16]) s.limb(x, 21, x + 0.5, 29.4, 1.4, 1.2, '#c8901a');
    membraneWing(s, 15, 11, 25, 0, 16, 15, C.gold, '#fff0a8');
    s.limb(17, 14, 21, 9, 2.2, 1.8, C.gold);
    dragonHead(s, 23, 8, C.gold, '#fff6d8');
    flame(s, 30, 12, 1.8, 6, 2);
    for (const [x, y] of [[11, 14], [14, 13], [8, 18]] as const) s.px(x, y, '#fff6c2', HI);
  },
  skeletal_dragon_claw: (s) => {
    s.aura(16, 18, 15, '#9a4aff', 0.4);
    flame(s, 8, 30, 4, 12, -1, ['#6a2ac8', '#3ad86a', '#d8ffb0']);
    flame(s, 24, 30, 4, 11, 1, ['#6a2ac8', '#3ad86a', '#d8ffb0']);
    s.limb(16, 30, 16, 20, 2.4, 2, '#e8e0c8');
    s.ellipse(16, 19, 4.6, 3, '#e8e0c8');
    for (const [x1, y1] of [[8, 9], [13, 5], [19, 5], [24, 9]] as const) {
      s.limb(16 + (x1 - 16) * 0.3, 18, x1, y1 + 4, 0.9, 0.7, '#e8e0c8');
      s.limb(x1, y1 + 4, x1 + (x1 < 16 ? 1 : -1), y1, 0.7, 0.2, '#f8f4e8');
    }
    s.pxs([[14, 22], [18, 22], [16, 25]], '#9a8a6a', SHADOW);
  },
  phoenix_pacifier: (s) => {
    s.aura(16, 15, 14, '#ffb02a', 0.4);
    for (const dir of [-1, 1]) s.poly([[16, 10], [16 + dir * 12, 3], [16 + dir * 10, 9], [16 + dir * 6, 13]], dir < 0 ? '#e88a1a' : '#f5b02a');
    s.circle(16, 22, 5.5, C.gold, { gloss: true });
    s.circle(16, 22, 3.2, '#c8901a', { tone: SHADOW, noEdge: true });
    s.ellipse(16, 14, 8, 3, C.gold, { gloss: true });
    s.ellipse(16, 10, 3, 3.4, '#ffd6a8', { gloss: true });
    s.circle(16, 7, 2.2, C.gold);
    s.poly([[17.5, 6.5], [20, 7.5], [17.5, 8.3]], '#e2702a');
    flame(s, 16, 4.5, 1.6, 5, 0);
  },
  phlogiston: (s) => {
    s.aura(16, 16, 16, '#ff7a2a', 0.55);
    s.poly([[16, 2], [23, 12], [20, 28], [12, 28], [9, 12]], '#ff6a1a', { gloss: true });
    s.poly([[16, 2], [16, 28], [12, 28], [9, 12]], '#ffb02a', { noEdge: true, gloss: true });
    s.poly([[16, 7], [19, 13], [16, 23], [13, 13]], ramp('#fff09a', 1, true), { tone: HI });
    sparkle(s, 25, 6, '#fff6c2', true);
    sparkle(s, 6, 22, '#ffd23a');
  },
  pinata_pal: (s) =>
    quad(s, { body: '#ff6aa8', head: 4.4, hx: 22, hy: 14, snout: 2.4, snoutColor: '#ffd23a', ears: 'long', earColor: '#3ab0ff', tail: 'tuft', tailColor: '#4fc24a', hoof: '#b06af0', legR: 1.6, eye: 1 }, {
      front: (g) => {
        const stripes = ['#ffd23a', '#3ab0ff', '#4fc24a', '#b06af0', '#ff8a2a'];
        for (let i = 0; i < 5; i++) s.limb(g.cx - 6 + i * 3, g.cy - g.bh + 0.8, g.cx - 6 + i * 3, g.cy + g.bh - 0.8, 0.7, 0.7, stripes[i], { noEdge: true, tone: BASE });
        for (let i = 0; i < 3; i++) s.limb(g.hx - 1 + i * 1.5, g.hy - g.head + 0.5, g.hx - 1 + i * 1.5, g.hy + g.head - 1, 0.5, 0.5, stripes[i + 1], { noEdge: true, tone: BASE });
        s.eye(Math.round(g.hx + 0.5), Math.round(g.hy - 2), 1);
      },
    }),
  hotpants: (s) => {
    for (const [x, h] of [[8, 9], [12, 12], [20, 12], [24, 9]] as const) flame(s, x, 24, 2.6, h + 6, (x - 16) * 0.2);
    pants(s, '#d8281c', { short: true });
    s.pxs([[10, 18], [11, 17], [21, 17], [22, 18]], '#ffb02a', LIGHT);
  },
  pet_fox: (s) =>
    quad(s, { body: '#ec7a24', belly: '#fbe6cc', head: 4.6, snout: 3, snoutColor: '#fbe6cc', ears: 'point', earColor: '#ec7a24', earInner: '#3a1a10', tail: 'bushy', legR: 1.2, leg: '#3a2418', eye: 1, iris: '#3a1a10' }, {
      back: (g) => {
        s.aura(g.cx - g.bw - 4, g.cy - 3, 6, '#ff6a1a', 0.5);
        flame(s, g.cx - g.bw - 5, g.cy - 0.5, 2.6, 8, -1);
      },
    }),

  // =============================== WATER ===============================
  battle_mutant_fish: (s) => {
    s.aura(26, 3, 5, '#7ae8ff', 0.6);
    s.poly([[3, 10], [8, 15], [3, 22]], '#2a7a8a');
    s.ellipse(16, 16, 10, 8, '#3a9aa8');
    s.ellipse(17, 20, 7, 3.4, '#a8e0d8', { noEdge: true });
    s.poly([[11, 9], [16, 3], [19, 9]], '#2a7a8a');
    s.ellipse(13, 18, 3.6, 2.2, '#2a7a8a', { rot: 0.5 });
    s.poly([[20, 19], [27, 18], [26, 22], [21, 22]], '#1a4a54');
    for (let x = 21; x <= 26; x++) s.px(x, x % 2 ? 19 : 21, C.snow, LIGHT);
    for (const [x, y] of [[18, 12], [21, 11], [24, 13]] as const) s.eye(x, y, 1, '#d8202a');
    s.limb(19, 8, 24, 2, 0.4, 0.4, '#2a7a8a', { noEdge: true });
    s.circle(26, 3, 1.8, ramp('#bff8ff', 1, true), { tone: HI });
    for (const [x, y] of [[10, 13], [13, 11], [9, 18]] as const) s.px(x, y, '#2a6a74', SHADOW);
  },
  ice_calf_leash: (s) =>
    quad(s, { body: ramp('#9ad8f8', 0.85), belly: '#e8f8ff', head: 4.4, snout: 2, snoutColor: '#d8f2ff', nose: '#3a7ab0', ears: 'flop', earColor: '#7ac0e8', tail: 'tuft', hoof: '#3a6a9a', legR: 1.3, eye: 1 }, {
      back: (g) => s.aura(g.cx, g.cy - 2, 13, '#bff0ff', 0.3),
      front: (g) => {
        for (const [x, y] of [[g.cx - 8, g.cy - 9], [g.cx + 2, g.cy - 11], [g.hx + 5, g.hy - 5]] as const) {
          s.poly([[x, y - 2], [x + 1.3, y], [x, y + 2], [x - 1.3, y]], '#d8f8ff', { gloss: true });
        }
        s.limb(g.hx - 1, g.hy - g.head + 0.5, g.hx - 2, g.hy - g.head - 1.6, 0.6, 0.4, '#e8f8ff');
      },
    }),
  mini_peng: (s) => {
    s.ellipse(15, 21, 7, 8, '#2b2833');
    s.ellipse(17, 22.5, 4.4, 6, '#f7f8fb', { noEdge: true });
    s.ellipse(9.5, 21, 2, 4.5, '#1c1824', { rot: 0.4 });
    s.circle(16, 12, 5, '#2b2833');
    s.ellipse(18, 13, 2.6, 2.4, '#f7f8fb', { noEdge: true });
    s.poly([[20, 12.5], [24, 13.5], [20, 14.5]], C.orange);
    s.eye(18, 11, 1);
    s.pxs([[12, 29.5], [13, 29.5], [17, 29.5], [18, 29.5]], C.orange, BASE);
    s.ellipse(16, 7.3, 6.5, 1.4, C.black);
    s.rect(12, -0.5, 8, 7.5, C.black, { gloss: true });
    s.rect(12, 5, 8, 1.5, '#e2302a', { noEdge: true });
    sparkle(s, 25, 5, '#fff6c2');
  },
  polar_bear_leash: (s) =>
    quad(s, { body: '#f2f1ec', belly: '#ffffff', cx: 12.5, cy: 20, bw: 9, bh: 6, head: 4.6, hx: 22.5, hy: 17, snout: 2.2, snoutColor: '#f2f1ec', ears: 'round', earInner: '#c9c4bc', tail: 'stub', legR: 2, eye: 1 }, {
      front: (g) => s.pxs([[Math.round(g.cx - 7), 29], [Math.round(g.cx - 6), 29], [Math.round(g.cx + 4), 29], [Math.round(g.cx + 5), 29]], '#b8b4ac', SHADOW),
    }),
  penguin_leash: (s) => {
    s.ellipse(15, 21, 7, 8, '#2b2833');
    s.ellipse(17, 22.5, 4.4, 6, '#f7f8fb', { noEdge: true });
    s.ellipse(9.5, 21, 2, 4.5, '#1c1824', { rot: 0.4 });
    s.circle(16, 11, 5.2, '#2b2833');
    s.ellipse(18, 12, 2.6, 2.4, '#f7f8fb', { noEdge: true });
    s.poly([[20.5, 11.5], [24, 12.5], [20.5, 13.5]], C.orange);
    s.eye(18, 10, 1);
    s.pxs([[12, 29.5], [13, 29.5], [17, 29.5], [18, 29.5]], C.orange, BASE);
    s.ellipse(15.5, 15.5, 6, 2, '#e2302a', { gloss: true });
    s.limb(11, 16, 8, 22, 1.2, 1, '#e2302a');
    s.pxs([[8, 22], [7, 23], [9, 23]], '#ffffff', LIGHT);
  },
  water_balloon: (s) => balloon(s, '#7cc8f4', { water: true }),
  baby_turtle: (s) => {
    for (const x of [9, 18]) s.limb(x + 1, 22, x + 1.5, 28.5, 1.4, 1.2, '#4a9a3a', { lift: -0.2 });
    s.limb(6, 22, 3, 24, 1, 0.4, '#5aae4a');
    s.ellipse(15, 21, 9, 7, '#3e7a2a', { gloss: true });
    s.ellipse(15, 26, 9, 2, '#d8c88a', { noEdge: true });
    for (const [x, y] of [[11, 18], [15, 16], [19, 18], [13, 22], [17, 22]] as const) s.poly([[x - 1.6, y], [x, y - 1.6], [x + 1.6, y], [x, y + 1.6]], '#6aa83a', { noEdge: true });
    for (const x of [8, 19]) s.limb(x, 24, x - 0.5, 29.4, 1.5, 1.3, '#5aae4a');
    s.limb(23, 22, 25, 18, 1.8, 1.6, '#5aae4a');
    s.circle(26, 17, 3, '#5aae4a');
    s.eye(27, 15, 1);
    s.px(28, 18, '#2a5a1a', DARK);
  },
  seahorse_companion: (s) => {
    for (const [x, y, r] of [[25, 6, 1.6], [27, 11, 1], [24, 2, 1.2]] as const) s.circle(x, y, r, ramp('#bff0ff', 0.7), { gloss: true });
    s.limb(14, 22, 12, 27, 2.2, 1.4, '#3a8ad8');
    for (let i = 0; i < 6; i++) s.px(12 - Math.cos(i) * 2, 27 + Math.sin(i) * 1.6, '#3a8ad8', BASE);
    s.ellipse(15, 16, 4.4, 7, '#3a8ad8');
    s.ellipse(16.5, 17, 2.4, 5, '#f5c63a', { noEdge: true });
    for (let y = 12; y < 22; y += 2) s.px(16, y, '#c89a1a', SHADOW);
    s.poly([[10, 12], [8, 16], [11, 19]], '#f5c63a');
    s.circle(16, 7, 3.8, '#3a8ad8');
    s.limb(18, 8, 23, 9, 1.2, 0.9, '#3a8ad8');
    s.pxs([[14, 3], [15, 2], [16, 3], [17, 2]], '#f5c63a', LIGHT);
    s.eye(17, 6, 1);
  },
  robo_shark: (s) => {
    s.poly([[2, 9], [7, 15], [3, 21]], '#5a6070');
    s.ellipse(16, 15, 12, 6, '#8a92a0', { gloss: true });
    s.ellipse(17, 18.5, 9, 2.4, '#c9ced8', { noEdge: true });
    s.poly([[13, 10], [17, 2], [19, 10]], '#6a7080');
    s.poly([[15, 19], [19, 25], [20, 19]], '#6a7080');
    for (const x of [8, 12, 16, 20]) s.limb(x, 11, x, 18, 0.3, 0.3, '#4a505c', { noEdge: true, tone: SHADOW });
    for (const [x, y] of [[10, 13], [14, 12], [18, 13]] as const) s.px(x, y, '#e8ecf2', HI);
    s.poly([[23, 17], [28, 16], [27, 18.5], [23, 19]], '#2a2e38');
    for (let x = 23; x <= 27; x += 2) s.px(x, 17, C.snow, LIGHT);
    s.circle(24, 13, 1.4, ramp('#ff2a2a', 1, true), { tone: HI });
    s.limb(26, 13, 31, 12, 0.4, 0.4, ramp('#ff4a4a', 0.9, true), { noEdge: true, tone: LIGHT });
  },
  magical_carrot: (s) => {
    for (let i = 0; i < 3; i++) s.limb(14 + i * 2, 11, 12 + i * 3, 4 - (i === 1 ? 1 : 0), 1, 0.5, '#3f9a3a');
    s.poly([[9, 12], [23, 12], [17, 30], [15, 30]], '#f08424', { gloss: true });
    for (const y of [16, 20, 24]) s.limb(13 + (y - 12) * 0.22, y, 16 - (y - 12) * 0.05, y + 0.5, 0.3, 0.3, '#b05a14', { noEdge: true, tone: SHADOW });
    s.eye(14, 14, 2);
    s.eye(18, 14, 2);
    s.pxs([[15, 18], [16, 19], [17, 18]], '#5a2a0a', DARK);
    s.ellipse(16, 11.5, 9, 1.6, '#2a4ab0');
    s.poly([[11, 11], [21, 11], [18, 4], [22, 0], [15, 3]], '#3a5ad8');
    for (const [x, y] of [[14, 8], [17, 6], [16, 10]] as const) s.px(x, y, '#fff6c2', HI);
  },
  playful_water_sprite: (s) => fairy(s, ramp('#9ae0ff', 0.85), '#3a8ad8', '#bff0ff', '#7ad8ff', { droplet: true }),
  pet_frog: (s) => {
    s.limb(9, 24, 4, 29, 2.4, 1.4, '#3e8a2a', { lift: -0.15 });
    s.ellipse(15, 22, 9, 6.5, '#4fae3a', { gloss: true });
    s.ellipse(16, 25, 6.5, 3, '#d8ef9a', { noEdge: true });
    for (const [x, y] of [[10, 19], [14, 17], [12, 22], [18, 18]] as const) s.circle(x, y, 1, '#2e6a1e', { tone: SHADOW, noEdge: true });
    s.ellipse(8, 26, 4.5, 3, '#4fae3a');
    s.pxs([[3, 29], [4, 29], [5, 29], [2, 28]], '#4fae3a', BASE);
    s.limb(21, 24, 22, 29.4, 1.2, 1, '#4fae3a');
    s.pxs([[21, 29], [23, 29], [24, 29]], '#4fae3a', BASE);
    s.circle(20, 15, 3.2, '#4fae3a', { gloss: true });
    s.circle(14.5, 15.5, 3, '#4fae3a', { gloss: true });
    s.eye(19, 13, 3);
    s.eye(13, 14, 2);
    s.limb(19, 21, 25, 20, 0.4, 0.4, '#1e4a14', { noEdge: true, tone: DARK });
  },
  marshmallow_basket: (s) => {
    s.limb(6, 15, 16, 3, 1, 1, '#a0703a');
    s.limb(16, 3, 26, 15, 1, 1, '#a0703a');
    for (const [x, y, toast] of [[10, 13, false], [15, 11.5, true], [20, 12.5, false], [12.5, 9, false], [18, 8.5, true], [23, 15, true]] as const) {
      s.ellipse(x, y, 3, 2.6, '#f7f3ec', { gloss: true });
      if (toast) s.ellipse(x + 0.5, y - 1.2, 2.2, 1, '#d8a06a', { noEdge: true, tone: BASE });
    }
    s.poly([[4, 15], [28, 15], [25, 29], [7, 29]], '#b8803e');
    for (let y = 17; y < 29; y += 3) s.limb(5 + (y - 15) * 0.2, y, 27 - (y - 15) * 0.2, y, 0.4, 0.4, '#7a4e22', { noEdge: true, tone: SHADOW });
    for (let x = 8; x < 26; x += 3) for (let y = 16; y < 28; y += 3) s.px(x + ((y / 3) % 2 ? 1.5 : 0), y + 1, '#e2b06a', LIGHT);
    s.rect(3.5, 14, 25, 2.4, '#8a5a2a');
  },
};

export function recipeFor(id: string): Recipe | null {
  return PETS[id] ?? SILKWORMS[id] ?? dinoRecipe(id);
}

/** Every id with a hand-made design (for the sprite gallery and tests). */
export const RECIPE_IDS: readonly string[] = [...Object.keys(PETS), ...Object.keys(SILKWORMS)];

/** Fallback when a pet has no recipe yet: a round critter in its element colour. */
export function fallbackRecipe(element: string): Recipe {
  const color = { Air: '#9fd4ff', Earth: '#8fd16a', Fire: '#ff8a4c', Water: '#4fa8ff' }[element] ?? '#c18bff';
  return (s) => {
    quad(s, { body: color, belly: shade(color, 0.4), head: 4.6, ears: 'round', tail: 'stub', eye: 2 });
  };
}
