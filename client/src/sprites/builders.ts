/**
 * Reusable body plans. Everything faces right, stands on y ~= 30 and fits a
 * 32x32 grid. Recipes in recipes.ts combine these with per-pet details.
 */
import { BASE, DARK, HI, LIGHT, SHADOW, Sprite, ramp, type Paint } from './pixel.ts';

export const C = {
  white: '#eeebe4',
  snow: '#f7f8fb',
  cream: '#f1dcb4',
  black: '#2b2833',
  ink: '#1c1824',
  grey: '#9aa0aa',
  darkGrey: '#5b606e',
  silver: '#c9ced8',
  brown: '#93592f',
  darkBrown: '#5e3a22',
  tan: '#d29a5f',
  pink: '#f2a2b8',
  hotPink: '#ec5d97',
  red: '#d8352a',
  orange: '#f08424',
  yellow: '#f5c63a',
  gold: '#e6b324',
  green: '#4aa83a',
  leaf: '#72c447',
  teal: '#2fb5a0',
  blue: '#3478d6',
  sky: '#7cc8f4',
  cyan: '#62e0f5',
  purple: '#7d46c8',
  violet: '#b382f2',
  wood: '#a06a3a',
} as const;

export type Kind = 'rex' | 'apato' | 'trice' | 'ptera';

// ---------------------------------------------------------------------------
// Small details
// ---------------------------------------------------------------------------

/** 4-point twinkle. */
export function sparkle(s: Sprite, x: number, y: number, color = '#fff6c2', big = false): void {
  const g = ramp(color, 1, true);
  s.px(x, y, g, HI);
  s.pxs([[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]], g, LIGHT);
  if (big) s.pxs([[x - 2, y], [x + 2, y], [x, y - 2], [x, y + 2]], g, BASE);
}

/** Teardrop flame, outer red -> orange -> yellow core. */
export function flame(s: Sprite, x: number, baseY: number, w: number, h: number, lean = 0, colors = ['#e23d1a', '#ff9420', '#ffe46a']): void {
  const layer = (k: number, color: string, tone?: number) => {
    const ww = w * k, hh = h * k;
    s.ellipse(x, baseY - ww * 0.7, ww, ww * 0.85, color, { noOutline: true, noEdge: true, tone });
    s.poly([[x - ww, baseY - ww * 0.7], [x - ww * 0.45, baseY - hh * 0.55], [x + lean * k, baseY - hh], [x + ww * 0.55, baseY - hh * 0.5], [x + ww, baseY - ww * 0.7]], color, { noOutline: true, noEdge: true, tone });
  };
  layer(1, colors[0]);
  layer(0.68, colors[1], LIGHT);
  layer(0.36, colors[2], HI);
}

/** Thin dangling string / leash from (x,y) downward with a slight curve. */
export function string(s: Sprite, x: number, y: number, len: number, color = '#e9e3d4', sway = 1): void {
  for (let i = 0; i < len; i++) s.px(x + Math.round(Math.sin(i / 2.2) * sway), y + i, color, i % 3 === 0 ? SHADOW : BASE);
}

/** Pendant chain hanging as a U from (x0,y) to (x1,y). */
export function chain(s: Sprite, x0: number, x1: number, y: number, depth: number, color: string = C.gold): void {
  const n = Math.ceil(Math.abs(x1 - x0) * 1.3);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const yy = y + Math.sin(t * Math.PI) * depth;
    s.px(x, yy, color, i % 2 ? LIGHT : SHADOW);
  }
}

/** Feathered wing seen from the side, anchored at the shoulder. */
export function featherWing(s: Sprite, x: number, y: number, len: number, angle: number, color: string, tip?: string): void {
  s.ellipse(x - Math.cos(angle) * len * 0.45, y - Math.sin(angle) * len * 0.45, len * 0.55, len * 0.26, color, { rot: angle });
  const tx = x - Math.cos(angle) * len * 0.9, ty = y - Math.sin(angle) * len * 0.9;
  for (let i = 0; i < 3; i++) s.limb(tx + i * 1.2, ty + i * 1.4, tx + i * 1.2 - Math.cos(angle) * 2.5, ty + i * 1.4 - Math.sin(angle) * 2.5 + 1, 0.9, 0.4, tip ?? color, { noEdge: true });
}

/** Membrane wing (bat / dragon / pterosaur): bony leading edge + webbed fill. */
export function membraneWing(s: Sprite, sx: number, sy: number, tipX: number, tipY: number, rootX: number, rootY: number, skin: string, bone: string): void {
  const midX = (tipX + rootX) / 2, midY = (tipY + rootY) / 2 + 2.5;
  s.poly([[sx, sy], [tipX, tipY], [midX + (tipX - midX) * 0.35, midY - 1], [midX, midY + 1], [rootX, rootY]], skin);
  s.limb(sx, sy, tipX, tipY, 0.9, 0.4, bone, { noEdge: true });
  s.limb(tipX, tipY, midX, midY, 0.5, 0.4, bone, { noEdge: true });
}

// ---------------------------------------------------------------------------
// Four-legged animals
// ---------------------------------------------------------------------------

export interface Quad {
  body: Paint;
  belly?: string;
  leg?: string;
  hoof?: string;
  cx?: number;
  cy?: number;
  bw?: number;
  bh?: number;
  head?: number;
  headColor?: string;
  hx?: number;
  hy?: number;
  snout?: number;
  snoutColor?: string;
  nose?: string;
  ears?: 'point' | 'flop' | 'long' | 'round' | 'none';
  earColor?: string;
  earInner?: string;
  tail?: 'curl' | 'thin' | 'bushy' | 'stub' | 'tuft' | 'none';
  tailColor?: string;
  legR?: number;
  eye?: 1 | 2 | 3;
  iris?: string;
  short?: boolean;
}

export interface QuadGeo {
  cx: number;
  cy: number;
  bw: number;
  bh: number;
  hx: number;
  hy: number;
  head: number;
}

export function quad(s: Sprite, o: Quad, extra?: { back?: (g: QuadGeo) => void; front?: (g: QuadGeo) => void }): QuadGeo {
  const cx = o.cx ?? 13, cy = o.cy ?? 21, bw = o.bw ?? 7.5, bh = o.bh ?? 5;
  const head = o.head ?? 4.6;
  const hx = o.hx ?? cx + bw * 0.82, hy = o.hy ?? cy - bh * 0.85;
  const leg = o.leg ?? o.body;
  const legR = o.legR ?? 1.5;
  const foot = 29.6;
  const g: QuadGeo = { cx, cy, bw, bh, hx, hy, head };
  const legTop = o.short ? cy + bh * 0.4 : cy + 1;

  for (const lx of [cx - bw * 0.55 + 1.3, cx + bw * 0.5 + 1.3]) s.limb(lx, legTop, lx, foot, legR, legR * 0.85, leg, { lift: -0.2 });
  const tc = o.tailColor ?? o.body;
  const bx = cx - bw + 0.5, by = cy - bh * 0.3;
  switch (o.tail) {
    case 'thin':
      s.limb(bx + 1, by + 1, bx - 3, by - 5, 0.9, 0.7, tc);
      break;
    case 'bushy':
      s.ellipse(bx - 3, by + 1, 4.5, 2.4, tc, { rot: -0.5 });
      break;
    case 'stub':
      s.circle(bx, by, 1.6, tc);
      break;
    case 'tuft':
      s.limb(bx + 1, by, bx - 2, by + 4, 0.6, 0.5, tc);
      s.circle(bx - 2, by + 5, 1.2, o.hoof ?? C.darkBrown);
      break;
    case 'curl':
      s.pxs([[bx, by], [bx - 1, by - 1], [bx - 2, by - 1], [bx - 2, by], [bx - 1, by + 1]], tc, SHADOW);
      break;
  }
  extra?.back?.(g);
  s.ellipse(cx, cy, bw, bh, o.body);
  if (o.belly) s.ellipse(cx + 1, cy + bh * 0.5, bw * 0.72, bh * 0.42, o.belly, { noEdge: true });
  for (const lx of [cx - bw * 0.55, cx + bw * 0.5]) {
    s.limb(lx, legTop + 0.5, lx, foot, legR + 0.2, legR, leg);
    if (o.hoof) s.rect(lx - legR - 0.2, foot - 1.6, legR * 2 + 0.4, 1.8, o.hoof, { noEdge: true });
  }

  const ec = o.earColor ?? o.headColor ?? o.body;
  if (o.ears === 'long') s.limb(hx - 1.8, hy - head * 0.5, hx - 4.5, hy - head - 6, 1.4, 1.1, ec, { lift: -0.2 });
  if (o.ears === 'point') s.poly([[hx - 3.5, hy - head * 0.4], [hx - 3.2, hy - head - 3], [hx - 0.8, hy - head * 0.7]], ec, { lift: -0.2 });
  s.circle(hx, hy, head, o.headColor ?? o.body);
  if (o.snout) {
    s.ellipse(hx + head * 0.72, hy + head * 0.32, o.snout, head * 0.5, o.snoutColor ?? o.headColor ?? o.body);
    const nx = Math.round(hx + head * 0.72 + o.snout - 0.9), ny = Math.round(hy + head * 0.1);
    s.pxs([[nx, ny], [nx - 1, ny]], o.nose ?? C.ink, DARK);
  }
  switch (o.ears) {
    case 'point':
      s.poly([[hx - 1.5, hy - head * 0.55], [hx - 0.2, hy - head - 3.4], [hx + 1.6, hy - head * 0.75]], ec);
      if (o.earInner) s.pxs([[Math.round(hx - 0.3), Math.round(hy - head - 0.8)], [Math.round(hx - 0.3), Math.round(hy - head + 0.2)]], o.earInner, BASE);
      break;
    case 'flop':
      s.ellipse(hx - head * 0.45, hy + 0.2, 1.7, 3.4, ec, { rot: 0.35, lift: -0.15 });
      break;
    case 'long':
      s.limb(hx - 0.4, hy - head * 0.6, hx - 1.8, hy - head - 7, 1.6, 1.2, ec);
      if (o.earInner) s.limb(hx - 0.5, hy - head - 1, hx - 1.6, hy - head - 5.8, 0.5, 0.4, o.earInner, { noEdge: true, tone: BASE });
      break;
    case 'round':
      s.circle(hx - 1.5, hy - head + 0.3, 1.9, ec, { lift: -0.1 });
      if (o.earInner) s.px(hx - 1.5, hy - head + 0.3, o.earInner, BASE);
      break;
  }
  s.eye(Math.round(hx + head * 0.18), Math.round(hy - head * 0.42), o.eye ?? 1, o.iris);
  extra?.front?.(g);
  return g;
}

// ---------------------------------------------------------------------------
// Birds
// ---------------------------------------------------------------------------

export interface Bird {
  body: string;
  belly?: string;
  wing?: string;
  head?: string;
  beak?: string;
  legs?: string;
  cx?: number;
  cy?: number;
  size?: number;
  eye?: 1 | 2 | 3;
  iris?: string;
  tail?: string;
}

export function bird(s: Sprite, o: Bird): { hx: number; hy: number; r: number } {
  const k = o.size ?? 1;
  const cx = o.cx ?? 14, cy = o.cy ?? 21;
  const legs = o.legs ?? C.orange;
  s.limb(cx - 1, cy + 4 * k, cx - 1.5, 29.5, 0.6, 0.5, legs, { lift: -0.2 });
  s.limb(cx + 1.5, cy + 4 * k, cx + 1.5, 29.5, 0.6, 0.5, legs);
  s.pxs([[cx + 2, 29], [cx + 3, 29], [cx - 1, 29], [cx, 29]], legs, SHADOW);
  if (o.tail) s.poly([[cx - 5 * k, cy - 1], [cx - 10 * k, cy - 4 * k], [cx - 9 * k, cy + 1], [cx - 4 * k, cy + 2]], o.tail);
  s.ellipse(cx, cy, 6 * k, 5.2 * k, o.body);
  if (o.belly) s.ellipse(cx + 1.5 * k, cy + 1.5 * k, 3.6 * k, 3.4 * k, o.belly, { noEdge: true });
  const hx = cx + 3.5 * k, hy = cy - 6 * k, r = 4 * k;
  s.circle(hx, hy, r, o.head ?? o.body);
  s.poly([[hx + r - 0.8, hy - 0.6], [hx + r + 3 * k, hy + 0.6], [hx + r - 0.8, hy + 1.8]], o.beak ?? C.orange);
  s.ellipse(cx - 1, cy - 0.5, 4.2 * k, 2.6 * k, o.wing ?? o.body, { rot: 0.35, lift: -0.08 });
  s.eye(Math.round(hx + r * 0.2), Math.round(hy - r * 0.45), o.eye ?? 1, o.iris);
  return { hx, hy, r };
}

// ---------------------------------------------------------------------------
// Dinosaurs: one modular builder for the 64 grey/brown/red/blue pets and the
// hybrids. The first kind sets the body plan, every kind adds its trait:
// rex = big toothy jaw, apato = long neck, trice = frill + horns, ptera = wings.
// ---------------------------------------------------------------------------

export interface DinoColors {
  body: string;
  belly: string;
  accent: string;
  horn?: string;
}

export function dino(s: Sprite, kinds: readonly Kind[], col: DinoColors, opts: { pterosaurus?: boolean } = {}): void {
  const has = (k: Kind) => kinds.includes(k);
  const first = kinds[0];
  const horn = col.horn ?? '#f4efe2';
  const stance = first === 'ptera' ? 'fly' : first === 'rex' ? 'biped' : 'quad';
  const longNeck = has('apato');
  const wings = has('ptera');

  let hx: number, hy: number;
  if (stance === 'fly') {
    // Spread wings, small body, legs tucked.
    membraneWing(s, 13, 15, 2, 4, 9, 18, shade(col.body, -0.1), col.accent);
    s.limb(10, 17, 3, 21, 1.6, 0.5, col.body);
    if (opts.pterosaurus) s.poly([[3, 20], [1, 22], [3, 23], [5, 21]], col.accent);
    s.ellipse(13, 17, 5, 3.4, col.body, { rot: -0.2 });
    s.ellipse(14, 18.6, 3.4, 1.6, col.belly, { noEdge: true });
    s.limb(12, 19.5, 11, 24, 0.7, 0.5, col.body);
    s.limb(14, 19.5, 14, 24, 0.7, 0.5, col.body);
    membraneWing(s, 15, 14, 27, 3, 17, 18, col.body, col.accent);
    s.limb(16, 15, 20, 11, 1.8, 1.4, col.body);
    hx = 21.5;
    hy = 10;
  } else if (stance === 'biped') {
    s.limb(10, 20, 11, 29.4, 1.6, 1.2, shade(col.body, -0.15));
    s.limb(8, 19, 1, 25, 3.3, 0.6, col.body);
    if (wings) membraneWing(s, 14, 15, 4, 6, 9, 18, shade(col.body, -0.12), col.accent);
    s.ellipse(13, 19, 7, 5, col.body, { rot: -0.4 });
    s.ellipse(14.5, 21.5, 4.5, 2.4, col.belly, { rot: -0.4, noEdge: true });
    s.ellipse(12.5, 22, 3, 3.6, col.body, { lift: 0.04 });
    s.limb(12.5, 24, 13, 29.4, 1.7, 1.3, col.body);
    s.rect(11.5, 28.3, 4.5, 1.6, shade(col.body, -0.2), { noEdge: true });
    s.limb(18.5, 20, 20.5, 22.5, 0.8, 0.6, col.body);
    if (longNeck) {
      s.limb(17, 16, 22, 8, 2.6, 2, col.body);
      hx = 23.5;
      hy = 7;
    } else {
      s.limb(17, 16, 20, 12.5, 2.8, 2.6, col.body);
      hx = 22;
      hy = 11;
    }
    if (wings) membraneWing(s, 15, 14, 20, 2, 12, 17, col.body, col.accent);
  } else {
    // Quadruped: Apatosaurus or Triceratops body.
    const apatoBody = first === 'apato';
    const cx = apatoBody ? 13 : 12.5, cy = apatoBody ? 20 : 21;
    for (const lx of [cx - 4, cx + 4]) s.limb(lx + 1, cy + 1, lx + 1, 29.4, 1.8, 1.6, shade(col.body, -0.15));
    s.limb(cx - 6, cy - 1, 0.5, apatoBody ? 25 : 23, apatoBody ? 2.6 : 2.4, 0.5, col.body);
    if (wings) membraneWing(s, cx, cy - 4, cx - 10, cy - 15, cx - 5, cy - 2, shade(col.body, -0.12), col.accent);
    s.ellipse(cx, cy, apatoBody ? 8 : 7.5, apatoBody ? 5.5 : 5.2, col.body);
    s.ellipse(cx + 1, cy + 2.6, 5.5, 2.2, col.belly, { noEdge: true });
    for (const lx of [cx - 4, cx + 4]) s.limb(lx, cy + 1.5, lx, 29.4, 2, 1.8, col.body);
    for (const lx of [cx - 4, cx + 4]) s.pxs([[lx - 1, 29], [lx, 29], [lx + 1, 29]], horn, SHADOW);
    if (wings) membraneWing(s, cx + 1, cy - 4, cx - 4, cy - 17, cx - 2, cy - 2, col.body, col.accent);
    if (longNeck) {
      s.limb(cx + 5, cy - 2, cx + 11, cy - 13, 2.8, 1.8, col.body);
      hx = cx + 12.5;
      hy = cy - 14.5;
    } else {
      s.limb(cx + 5, cy - 1, cx + 8, cy - 2, 3, 2.8, col.body);
      hx = cx + 10;
      hy = cy - 2.5;
    }
  }

  // Back ridge / stripes in the accent colour.
  if (stance !== 'fly') {
    const ridge: [number, number][] = stance === 'biped' ? [[9, 15], [11, 14], [13, 14], [15, 14]] : [[9, 15], [11, 14.5], [13, 14.5], [15, 15]];
    s.pxs(ridge.map(([x, y]) => [x, y + (stance === 'quad' && first === 'apato' ? 0 : 0)]), col.accent, SHADOW);
  }

  // Frill behind the head: a bony shield with a bright rim.
  if (has('trice')) {
    s.ellipse(hx - 3, hy - 2, 3.8, 5, col.belly, { rot: 0.5 });
    s.ellipse(hx - 2.6, hy - 1.6, 2.8, 4, col.accent, { rot: 0.5, noEdge: true });
  }
  if (wings && stance === 'fly' && !has('rex')) {
    // Crest on the back of the head.
    const crest = opts.pterosaurus ? 2.5 : 6;
    s.poly([[hx - 1, hy - 1.5], [hx - 2 - crest, hy - 3.5], [hx - 1.5, hy + 0.5]], col.accent);
  }

  // Head
  if (has('rex')) {
    const big = stance !== 'fly' && !longNeck ? 1 : 0.85;
    s.ellipse(hx + 0.5, hy, 5 * big, 3.3 * big, col.body);
    s.ellipse(hx + 1.2, hy + 2.6 * big, 4.3 * big, 1.5 * big, shade(col.body, -0.1), { lift: -0.05 });
    for (let x = Math.round(hx - 1); x <= Math.round(hx + 4.5 * big); x += 1) s.px(x, Math.round(hy + 1.4 * big), C.snow, x % 2 ? LIGHT : BASE);
    s.pxs([[Math.round(hx + 4.6 * big), Math.round(hy - 1)]], C.ink, DARK);
    s.eye(Math.round(hx - 0.5), Math.round(hy - 2.2 * big), 1, '#7a1a10');
    s.pxs([[Math.round(hx - 1.5), Math.round(hy - 3 * big)], [Math.round(hx - 0.5), Math.round(hy - 3.2 * big)], [Math.round(hx + 0.5), Math.round(hy - 3 * big)]], col.accent, SHADOW);
  } else if (stance === 'fly') {
    s.ellipse(hx, hy, 2.6, 2.2, col.body);
    s.poly([[hx + 1.5, hy - 1], [hx + (opts.pterosaurus ? 7 : 9.5), hy + 0.8], [hx + 1.5, hy + 1.6]], opts.pterosaurus ? col.body : horn);
    if (opts.pterosaurus) for (let x = Math.round(hx + 2); x < hx + 6; x += 2) s.px(x, Math.round(hy + 1), C.snow, LIGHT);
    s.eye(Math.round(hx - 0.5), Math.round(hy - 1.2), 1);
  } else if (first === 'trice' && !longNeck) {
    s.ellipse(hx, hy, 5, 3.7, col.body);
    s.ellipse(hx + 3, hy + 1, 2.6, 2, col.body);
    s.poly([[hx + 4, hy - 0.2], [hx + 7, hy + 1.6], [hx + 4.2, hy + 3]], shade(col.accent, -0.2));
    s.eye(Math.round(hx - 0.5), Math.round(hy - 1.6), 1);
  } else {
    s.ellipse(hx, hy, 3.2, 2.2, col.body);
    s.ellipse(hx + 2, hy + 0.6, 1.8, 1.4, col.body);
    s.px(hx + 3.2, hy, C.ink, DARK);
    s.eye(Math.round(hx - 0.6), Math.round(hy - 1.3), 1);
  }

  if (has('trice')) {
    // Two long brow horns and a short nose horn, ivory.
    s.limb(hx - 1, hy - 2.2, hx + 4.5, hy - 7.5, 0.9, 0.3, horn, { noOutline: false });
    s.limb(hx + 0.8, hy - 1.8, hx + 6.5, hy - 5.5, 0.8, 0.25, horn);
    s.limb(hx + 4, hy - 0.4, hx + 5.2, hy - 3, 0.6, 0.2, horn);
  }
}

/** Lighter / darker variant of a hex colour (amount -1..1). */
export function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.round(amount < 0 ? c * (1 + amount) : c + (255 - c) * amount);
  const r = f((n >> 16) & 255), g = f((n >> 8) & 255), b = f(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// ---------------------------------------------------------------------------
// Other families
// ---------------------------------------------------------------------------

export function silkworm(s: Sprite, body: string, stripe: string, opts: { pearl?: boolean; rocky?: boolean; glow?: string } = {}): void {
  if (opts.glow) s.aura(16, 24, 15, opts.glow, 0.35);
  const segs = 6;
  for (let i = 0; i < segs; i++) {
    const x = 5 + i * 3.6;
    const y = 25.5 - Math.sin((i / (segs - 1)) * Math.PI) * 2.2 + (i === segs - 1 ? -1.5 : 0);
    const r = i === segs - 1 ? 3.6 : 3 + Math.sin((i / segs) * Math.PI) * 0.6;
    s.circle(x, y, r, body, { gloss: opts.pearl });
    if (i < segs - 1) s.pxs([[Math.round(x - 0.5), Math.round(y - r + 1)], [Math.round(x + 0.5), Math.round(y - r + 1)]], stripe, BASE);
    if (opts.rocky && i % 2 === 0) s.px(x + 1, y + 1, stripe, SHADOW);
    if (i < segs - 1) s.pxs([[Math.round(x - 1), 29], [Math.round(x + 1), 29]], shade(body, -0.35), BASE);
  }
  const hx = 5 + (segs - 1) * 3.6, hy = 22;
  s.eye(Math.round(hx + 0.5), Math.round(hy - 1), 1);
  s.limb(hx, hy - 3, hx - 1, hy - 6.5, 0.4, 0.3, stripe, { noEdge: true });
  s.limb(hx + 1.5, hy - 3, hx + 2.5, hy - 6.5, 0.4, 0.3, stripe, { noEdge: true });
  s.pxs([[Math.round(hx - 1), Math.round(hy - 7)], [Math.round(hx + 2.5), Math.round(hy - 7)]], stripe, LIGHT);
  s.px(hx + 2.5, hy + 1, shade(body, -0.4), DARK);
}

export function balloon(s: Sprite, color: string, opts: { water?: boolean; heal?: boolean } = {}): void {
  string(s, 16, 21, 9, '#e6e1d6', 1);
  if (opts.heal) s.aura(16, 11, 13, '#8dff9a', 0.45);
  if (opts.water) {
    s.circle(16, 11, 8.6, ramp('#bfe8ff', 0.55), { gloss: true });
    s.ellipse(16, 14, 7.6, 5, ramp('#2f86e0', 0.85), { noEdge: true, gloss: true });
    s.pxs([[12, 9], [13, 8], [14, 8]], '#ffffff', HI);
  } else {
    s.ellipse(16, 11, 8.4, 9.2, color, { gloss: true });
    s.ellipse(13, 7.5, 1.6, 2.6, ramp('#ffffff', 0.55), { noEdge: true, tone: BASE, rot: 0.4 });
  }
  s.poly([[14.5, 20.6], [17.5, 20.6], [16, 19]], opts.water ? '#7cc8f4' : color);
  if (opts.heal) {
    s.pxs([[15, 10], [16, 10], [17, 10], [16, 9], [16, 11]], '#ffffff', HI);
  }
}

export function kite(s: Sprite, faces: string[], tail: string[], shape: 'diamond' | 'triangle' = 'diamond'): void {
  // Tail ribbons first
  for (let i = 0; i < 9; i++) {
    const x = 13 - i * 1.3, y = 18 + i * 1.3 + Math.sin(i) * 0.8;
    s.px(x, y, tail[i % tail.length], BASE);
    if (i % 3 === 1) s.pxs([[x - 1, y - 1], [x + 1, y + 1], [x - 1, y + 1], [x + 1, y - 1]], tail[(i + 1) % tail.length], LIGHT);
  }
  string(s, 21, 18, 11, '#d8d2c0', 2);
  if (shape === 'triangle') {
    s.poly([[16, 2], [28, 17], [6, 15]], faces[0]);
    s.poly([[16, 2], [17, 16.3], [6, 15]], faces[1]);
    s.limb(16, 2, 17, 16, 0.4, 0.4, C.wood, { noEdge: true });
  } else {
    s.poly([[18, 1], [27, 10], [18, 19], [9, 10]], faces[0]);
    s.poly([[18, 1], [18, 10], [9, 10]], faces[1]);
    s.poly([[18, 10], [27, 10], [18, 19]], faces[2] ?? faces[1]);
    s.limb(18, 1, 18, 19, 0.4, 0.4, C.wood, { noEdge: true });
    s.limb(9, 10, 27, 10, 0.4, 0.4, C.wood, { noEdge: true });
  }
}

export function magnifier(s: Sprite, frame: string, lens: string, handle: string): { cx: number; cy: number } {
  s.limb(8, 26, 14, 19, 2, 1.6, handle);
  s.rect(13, 17, 3, 3, frame, { noEdge: true });
  s.circle(19, 12, 8.5, frame, { gloss: true });
  s.circle(19, 12, 6.3, ramp(lens, 0.8), { gloss: true });
  s.pxs([[15, 9], [16, 8], [17, 7], [15, 10]], '#ffffff', HI);
  return { cx: 19, cy: 12 };
}

export function synthoid(s: Sprite, metal: string, light: string, opts: { alpha?: number; glow?: string } = {}): void {
  const a = opts.alpha ?? 1;
  if (opts.glow) s.aura(16, 15, 15, opts.glow, 0.4);
  const m = ramp(metal, a);
  // Floating: no feet, tapering lower body
  s.poly([[11, 21], [21, 21], [18, 28], [14, 28]], m);
  s.limb(10, 14, 7, 21, 1.4, 1.1, m, { lift: -0.15 });
  s.rect(10, 12, 12, 10, m);
  s.limb(22, 14, 25, 20, 1.4, 1.1, m);
  s.circle(25.3, 20.8, 1.3, light);
  s.rect(15, 15, 3, 3, ramp(light, 1, true), { tone: LIGHT });
  s.rect(11, 3, 11, 8.5, m);
  s.rect(15, 5.5, 7, 3, ramp(light, 1, true), { tone: BASE });
  s.pxs([[19, 6], [20, 6]], '#ffffff', HI);
  s.limb(16, 3, 15, 0.5, 0.4, 0.4, m, { noEdge: true });
  s.px(15, 0, light, HI);
  s.pxs([[12, 19], [13, 19], [19, 19], [20, 19]], light, LIGHT);
}

export function fairy(s: Sprite, skin: Paint, hair: string, wing: string, glow: string, opts: { leaves?: boolean; flameHair?: boolean; droplet?: boolean } = {}): void {
  s.aura(16, 15, 14, glow, 0.4);
  s.ellipse(10, 11, 5, 3, ramp(wing, 0.6), { rot: -0.6, noEdge: true, gloss: true });
  s.ellipse(10, 17, 4, 2.3, ramp(wing, 0.5), { rot: 0.5, noEdge: true });
  // Dress / body
  s.poly([[13, 15], [19, 15], [21, 24], [11, 24]], hair);
  s.limb(14, 24, 13, 28, 0.8, 0.6, skin);
  s.limb(18, 24, 19.5, 27.5, 0.8, 0.6, skin);
  s.limb(14, 16, 10, 13, 0.7, 0.6, skin);
  s.limb(18, 16, 23, 12, 0.7, 0.6, skin);
  s.circle(16.5, 10, 4.6, skin);
  if (opts.flameHair) flame(s, 16, 8, 4.5, 9, 1);
  else if (opts.droplet) s.poly([[12, 8], [16.5, -0.5], [21, 8], [17, 6]], hair);
  else s.ellipse(15.5, 7.2, 5, 3, hair, { rot: -0.2 });
  if (opts.leaves) s.pxs([[12, 5], [13, 4], [16, 3], [17, 2], [20, 4], [21, 5]], C.leaf, LIGHT);
  s.eye(18, 10, 1);
  s.px(16, 10, C.ink, DARK);
  s.px(19, 13, '#e46a7e', BASE);
  sparkle(s, 26, 6, glow);
  sparkle(s, 6, 25, glow);
}

export function pants(s: Sprite, cloth: string, opts: { short?: boolean; alpha?: number } = {}): void {
  const c = ramp(cloth, opts.alpha ?? 1);
  const bottom = opts.short ? 21 : 29.5;
  // Two separate legs so the gap between them stays open, then the seat over them.
  s.poly([[16.5, 11], [24.5, 11], [25.5, bottom], [18, bottom]], c, { lift: -0.06 });
  s.poly([[7.5, 11], [16, 11], [14.5, bottom], [6.5, bottom]], c);
  s.poly([[7.5, 9], [24.5, 9], [24.5, 13], [16, 17], [7.5, 13]], c, { noEdge: true });
  s.rect(7, 6.5, 18, 3.5, c);
  s.limb(16, 10, 16, 15, 0.3, 0.3, c, { noEdge: true, tone: DARK });
  for (const x of [10, 22]) s.rect(x - 1, 6, 2, 4, c, { tone: SHADOW, noEdge: true });
  s.pxs([[19, 12], [20, 12], [21, 12], [22, 13]], c, SHADOW);
  s.pxs([[8, bottom - 1.5], [12, bottom - 1.5], [19, bottom - 1.5], [23, bottom - 1.5]], c, LIGHT);
}

export function dragonHead(s: Sprite, hx: number, hy: number, body: string, horn: string, k = 1): void {
  s.limb(hx - 2, hy - 2, hx - 5, hy - 6 * k, 0.9, 0.3, horn);
  s.ellipse(hx, hy, 4 * k, 3 * k, body);
  s.ellipse(hx + 3 * k, hy + 1, 3 * k, 1.9 * k, body);
  s.px(hx + 5.5 * k, hy, C.ink, DARK);
  s.limb(hx, hy - 2, hx - 3, hy - 5.5 * k, 0.8, 0.25, horn);
  s.eye(Math.round(hx), Math.round(hy - 1.5), 1, '#ffcf3f');
}
