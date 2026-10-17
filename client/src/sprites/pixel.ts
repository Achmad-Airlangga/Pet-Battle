/**
 * A tiny pixel-art painter. Shapes are drawn as lit volumes on a 32x32 grid:
 * every shape gets a hue-shifted colour ramp (cool shadows, warm highlights),
 * is shaded from a top-left light with ordered dithering between bands, gets
 * a darker line where it overlaps something behind it, and the finished sprite
 * gets a selective outline (each edge in the darkest tone of its own colour).
 */

export const N = 32;

/** Tone indices in a ramp. */
export const OUT = 0, DARK = 1, SHADOW = 2, BASE = 3, LIGHT = 4, HI = 5;

const LX = -0.5, LY = -0.66, LZ = 0.56;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => v / 16 - 0.5);

type HSL = [number, number, number];

function hexToHsl(hex: string): HSL {
  const n = parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return [h, s * 100, l * 100];
}

/** Rotate hue `h` toward `target` by `amount` degrees along the short way. */
function shiftHue(h: number, target: number, amount: number): number {
  let d = ((target - h + 540) % 360) - 180;
  if (Math.abs(d) < amount) return target;
  return (h + Math.sign(d) * amount + 360) % 360;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export interface Ramp {
  tones: string[];
  glow: boolean;
}

const rampCache = new Map<string, Ramp>();

/**
 * 6-tone ramp from one base colour: outline, dark, shadow, base, light, highlight.
 * Shadows drift toward blue-violet, highlights toward warm yellow.
 */
export function ramp(hex: string, alpha = 1, glow = false): Ramp {
  const key = `${hex}|${alpha}|${glow}`;
  const hit = rampCache.get(key);
  if (hit) return hit;
  const [h, s, l] = hexToHsl(hex);
  const grey = s < 8;
  const tone = (dl: number, hueAmt: number, ds: number) => {
    const target = dl < 0 ? 250 : 55;
    const hh = grey ? h : shiftHue(h, target, hueAmt);
    const ll = dl < 0 ? l * (1 + dl) : l + (100 - l) * dl;
    const ss = grey ? s : clamp(s + ds, 0, 100);
    return `hsla(${hh.toFixed(1)} ${ss.toFixed(1)}% ${clamp(ll, 2, 98).toFixed(1)}% / ${alpha})`;
  };
  const r: Ramp = {
    glow,
    tones: [
      tone(-0.78, 26, 8),
      tone(-0.5, 18, 6),
      tone(-0.24, 9, 3),
      `hsla(${h.toFixed(1)} ${s.toFixed(1)}% ${l.toFixed(1)}% / ${alpha})`,
      tone(0.32, 8, -4),
      tone(0.66, 14, -14),
    ],
  };
  rampCache.set(key, r);
  return r;
}

export type Paint = string | Ramp;
const asRamp = (p: Paint): Ramp => (typeof p === 'string' ? ramp(p) : p);

export interface ShapeOpts {
  /** Allow the brightest tone (shiny / wet surfaces). */
  gloss?: boolean;
  /** No dark line where the shape overlaps earlier shapes. */
  noEdge?: boolean;
  /** Flat colour at this tone instead of lighting. */
  tone?: number;
  /** Brightness offset added to the lighting (-0.3 .. 0.3). */
  lift?: number;
  /** Skip the final silhouette outline next to this shape. */
  noOutline?: boolean;
}

export class Sprite {
  readonly col: (string | null)[] = new Array(N * N).fill(null);
  /** Outline colour to use next to each filled pixel; null = no outline. */
  private readonly outl: (string | null)[] = new Array(N * N).fill(null);
  private readonly glowPx = new Uint8Array(N * N);

  /**
   * Core fill: `light(x, y)` returns the lit intensity (0..1) of the pixel
   * centre, or null when the pixel is outside the shape.
   */
  fill(paint: Paint, light: (x: number, y: number) => number | null, opts: ShapeOpts = {}): void {
    const r = asRamp(paint);
    const cover = new Float32Array(N * N).fill(-1);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const v = light(x + 0.5, y + 0.5);
        if (v !== null) cover[y * N + x] = v;
      }
    }
    const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < N && y < N && cover[y * N + x] >= 0;
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        const v = cover[i];
        if (v < 0) continue;
        let t: number;
        const edge = !inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1);
        if (edge && !opts.noEdge && this.col[i] !== null && !this.glowPx[i]) {
          t = DARK;
        } else if (opts.tone !== undefined) {
          t = opts.tone;
        } else {
          const lit = v + (opts.lift ?? 0) + BAYER[(y & 3) * 4 + (x & 3)] * 0.09;
          t = lit < 0.3 ? DARK : lit < 0.5 ? SHADOW : lit < 0.76 ? BASE : lit < 0.9 || !opts.gloss ? LIGHT : HI;
        }
        this.col[i] = r.tones[t];
        this.outl[i] = opts.noOutline || r.glow ? null : r.tones[OUT];
        this.glowPx[i] = r.glow ? 1 : 0;
      }
    }
  }

  /** Shaded ellipsoid, optionally rotated (radians). */
  ellipse(cx: number, cy: number, rx: number, ry: number, paint: Paint, opts: ShapeOpts & { rot?: number } = {}): void {
    const c = Math.cos(opts.rot ?? 0), s = Math.sin(opts.rot ?? 0);
    this.fill(paint, (x, y) => {
      const dx = x - cx, dy = y - cy;
      const lx = (dx * c + dy * s) / rx, ly = (-dx * s + dy * c) / ry;
      const d = lx * lx + ly * ly;
      if (d > 1) return null;
      const nz = Math.sqrt(1 - d);
      const wx = lx * c - ly * s, wy = lx * s + ly * c;
      return 0.24 + 0.76 * Math.max(0, wx * LX + wy * LY + nz * LZ);
    }, opts);
  }

  circle(cx: number, cy: number, r: number, paint: Paint, opts: ShapeOpts = {}): void {
    this.ellipse(cx, cy, r, r, paint, opts);
  }

  /** Tapered capsule from (x0,y0) radius r0 to (x1,y1) radius r1, shaded as a cylinder. */
  limb(x0: number, y0: number, x1: number, y1: number, r0: number, r1: number, paint: Paint, opts: ShapeOpts = {}): void {
    const vx = x1 - x0, vy = y1 - y0;
    const len2 = vx * vx + vy * vy || 1;
    this.fill(paint, (x, y) => {
      const t = clamp(((x - x0) * vx + (y - y0) * vy) / len2, 0, 1);
      const px = x0 + vx * t, py = y0 + vy * t;
      const r = r0 + (r1 - r0) * t;
      const dx = x - px, dy = y - py;
      const d = Math.sqrt(dx * dx + dy * dy) / Math.max(0.35, r);
      if (d > 1) return null;
      const nx = dx / Math.max(0.35, r), ny = dy / Math.max(0.35, r);
      const nz = Math.sqrt(Math.max(0, 1 - d * d));
      return 0.24 + 0.76 * Math.max(0, nx * LX + ny * LY + nz * LZ);
    }, opts);
  }

  /** Box with bevelled lighting (top/left lit, bottom/right in shadow). */
  rect(x0: number, y0: number, w: number, h: number, paint: Paint, opts: ShapeOpts = {}): void {
    const x1 = x0 + w, y1 = y0 + h;
    this.fill(paint, (x, y) => {
      if (x < x0 || x > x1 || y < y0 || y > y1) return null;
      const u = (x - x0) / w, v = (y - y0) / h;
      if (v < 0.18 || u < 0.12) return 0.84;
      if (v > 0.8 || u > 0.88) return 0.42;
      return 0.66 - v * 0.12;
    }, opts);
  }

  /** Polygon lit by a vertical gradient (and a little horizontal), for flat-ish parts. */
  poly(pts: readonly (readonly [number, number])[], paint: Paint, opts: ShapeOpts = {}): void {
    const ys = pts.map((p) => p[1]), xs = pts.map((p) => p[0]);
    const minY = Math.min(...ys), maxY = Math.max(...ys), minX = Math.min(...xs), maxX = Math.max(...xs);
    this.fill(paint, (x, y) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i], [xj, yj] = pts[j];
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      if (!inside) return null;
      const v = (y - minY) / Math.max(1, maxY - minY), u = (x - minX) / Math.max(1, maxX - minX);
      return 0.9 - v * 0.5 - u * 0.12;
    }, opts);
  }

  /** Single pixel at a fixed tone. */
  px(x: number, y: number, paint: Paint, tone = BASE): void {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= N || y >= N) return;
    const r = asRamp(paint);
    const i = y * N + x;
    this.col[i] = r.tones[tone];
    if (!this.outl[i] && !r.glow) this.outl[i] = r.tones[OUT];
  }

  /** Several pixels from "x,y" pairs. */
  pxs(coords: readonly (readonly [number, number])[], paint: Paint, tone = BASE): void {
    for (const [x, y] of coords) this.px(x, y, paint, tone);
  }

  /** Soft additive halo behind everything drawn later; never outlined. */
  aura(cx: number, cy: number, r: number, hex: string, strength = 0.45): void {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r;
        if (d > 1) continue;
        const i = y * N + x;
        if (this.col[i]) continue;
        const a = (1 - d) * strength + BAYER[(y & 3) * 4 + (x & 3)] * 0.12;
        if (a < 0.12) continue;
        this.col[i] = ramp(hex, Math.min(0.75, Number(a.toFixed(2))), true).tones[BASE];
        this.glowPx[i] = 1;
      }
    }
  }

  /**
   * Eye looking right. size 1: 2x2 bead with a glint. size 2: white sclera
   * with a pupil toward the front. size 3: big round cartoon eye.
   */
  eye(x: number, y: number, size: 1 | 2 | 3 = 1, iris = '#2a1a22'): void {
    const white = '#f6f4ef';
    if (size === 1) {
      this.pxs([[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]], iris, DARK);
      this.px(x, y, white, BASE);
    } else if (size === 2) {
      this.pxs([[x, y], [x + 1, y], [x + 2, y], [x, y + 1], [x, y + 2]], white, BASE);
      this.pxs([[x + 1, y + 1], [x + 2, y + 1], [x + 1, y + 2], [x + 2, y + 2]], iris, DARK);
      this.px(x + 2, y + 1, white, HI);
    } else {
      for (let dy = 0; dy < 4; dy++) for (let dx = 0; dx < 4; dx++) if (!((dx === 0 || dx === 3) && (dy === 0 || dy === 3))) this.px(x + dx, y + dy, white, BASE);
      this.pxs([[x + 2, y + 1], [x + 3, y + 1], [x + 2, y + 2], [x + 3, y + 2], [x + 1, y + 2]], iris, DARK);
      this.px(x + 3, y + 1, white, HI);
    }
  }

  /** Cut an elliptical hole (loops, rings, gaps). */
  erase(cx: number, cy: number, rx: number, ry: number): void {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        if (((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 > 1) continue;
        const i = y * N + x;
        this.col[i] = null;
        this.outl[i] = null;
        this.glowPx[i] = 0;
      }
    }
  }

  /** Mirror everything left-right (for parts drawn facing the wrong way). */
  flip(): void {
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N / 2; x++) {
        const a = y * N + x, b = y * N + (N - 1 - x);
        [this.col[a], this.col[b]] = [this.col[b], this.col[a]];
        [this.outl[a], this.outl[b]] = [this.outl[b], this.outl[a]];
        [this.glowPx[a], this.glowPx[b]] = [this.glowPx[b], this.glowPx[a]];
      }
    }
  }

  /** Paint to a canvas: silhouette outline first, then the pixels. */
  toCanvas(ko: boolean): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = N;
    canvas.height = N;
    const ctx = canvas.getContext('2d')!;
    const outline: (string | null)[] = new Array(N * N).fill(null);
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) {
        const i = y * N + x;
        if (this.col[i] && !this.glowPx[i]) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= N || ny >= N) continue;
          const j = ny * N + nx;
          if (this.col[j] && !this.glowPx[j] && this.outl[j]) {
            outline[i] = this.outl[j];
            break;
          }
        }
      }
    }
    for (let i = 0; i < N * N; i++) {
      const c = outline[i] ?? this.col[i];
      if (!c) continue;
      ctx.fillStyle = c;
      ctx.fillRect(i % N, Math.floor(i / N), 1, 1);
    }
    if (ko) {
      const img = ctx.getImageData(0, 0, N, N);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const g = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) * 0.7;
        d[i] = d[i + 1] = d[i + 2] = g;
      }
      ctx.putImageData(img, 0, 0);
    }
    return canvas;
  }
}
