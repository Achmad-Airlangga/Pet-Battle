/**
 * Canvas renderer for the 2D side-view arena (PRD 2.1): background stage,
 * active + reserve pets, overhead HP / status / cooldown, projectiles,
 * particles, floating combat text and weather overlays.
 * The local player is always drawn on the left.
 */
import { ELEMENT_THEME } from '../pets.ts';
import { petSprite } from '../sprites.ts';
import type { Element, GameStateSnapshot, PetSnapshot, PlayerId, PlayerSnapshot, WeatherType } from '../types.ts';
import { ELEMENT_FX, ParticleSystem, Projectile } from './particles.ts';

export type Side = 'L' | 'R';
export const W = 960;
export const H = 540;
const GROUND = 430;
const X: Record<Side, { active: number; reserve: number }> = { L: { active: 290, reserve: 86 }, R: { active: 670, reserve: 874 } };
const ACTIVE_SCALE = 8;
const RESERVE_SCALE = 4;
const SWAP_MS = 320;
const DYING_MS = 850;
const LUNGE_MS = 240;
/** Must match GLOBAL_COOLDOWN_MS on the server: the energy bar refills over this time. */
export const GCD_SEC = 1;
/** Canvas y of the top of the status tray under the overhead bars (the DOM tray sits there). */
export const STATUS_TRAY_Y = GROUND - 16 * ACTIVE_SCALE - 26;
export const ACTIVE_X = { L: X.L.active, R: X.R.active };

interface SideView {
  player: PlayerSnapshot | null;
  active: number;
  hp: number[];
  ghost: number[];
  flashUntil: number[];
  shakeUntil: number[];
  swapAt: number;
  lungeAt: number;
  textSlot?: number;
  dying: { index: number; at: number; pet: PetSnapshot } | null;
}

export interface RendererHooks {
  /** Total cooldown (s) for the radial indicator. */
  cooldownTotal(player: PlayerId, petIndex: number, abilityIndex: number): number;
  /** Predicted seconds left on an ability (accounts for Mud / Sugar Rush between states). */
  abilityLeft(player: PlayerId, petIndex: number, abilityIndex: number): number;
  /** Predicted seconds left on the player's global skill cooldown. */
  gcdLeft(player: PlayerId): number;
  /** Seconds elapsed since the last authoritative state, for smooth countdowns. */
  sinceState(): number;
}

const newView = (): SideView => ({
  player: null,
  active: 0,
  hp: [0, 0],
  ghost: [0, 0],
  flashUntil: [0, 0],
  shakeUntil: [0, 0],
  swapAt: -1e9,
  lungeAt: -1e9,
  dying: null,
});

const easeOut = (t: number) => 1 - (1 - t) ** 3;

export class ArenaRenderer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly hooks: RendererHooks;
  private readonly bg: HTMLCanvasElement;
  private readonly particles = new ParticleSystem();
  private projectiles: Projectile[] = [];
  private readonly views: Record<Side, SideView> = { L: newView(), R: newView() };
  private you: PlayerId = 'p1';
  private weather: WeatherType | null = null;
  private blobs: { x: number; y: number; r: number; v: number }[] = [];
  private banner: { text: string; color: string; at: number; ms: number } | null = null;
  private camShake = { until: 0, mag: 0 };
  private flashes: { x: number; y: number; at: number; color: string; r: number }[] = [];
  private raf = 0;
  private last = 0;
  private scale = 1;
  private readonly silhouettes = new WeakMap<HTMLCanvasElement, HTMLCanvasElement>();
  private readonly resizeObserver: ResizeObserver;

  constructor(canvas: HTMLCanvasElement, hooks: RendererHooks) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.hooks = hooks;
    this.bg = paintBackground();
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas);
    this.resize();
  }

  start(): void {
    this.last = performance.now();
    const loop = (now: number) => {
      this.frame(now);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  stop(): void {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
  }

  sideOf(player: PlayerId): Side {
    return player === this.you ? 'L' : 'R';
  }

  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------

  setState(state: GameStateSnapshot, you: PlayerId): void {
    this.you = you;
    const now = performance.now();
    for (const id of ['p1', 'p2'] as PlayerId[]) {
      const view = this.views[this.sideOf(id)];
      const next = state.players[id];
      const prev = view.player;
      if (!prev) {
        view.hp = next.pets.map((p) => p.current_hp);
        view.ghost = [...view.hp];
      } else {
        const prevActive = prev.pets[prev.active_pet_index];
        if (!prevActive.is_ko && next.pets[prev.active_pet_index].is_ko) {
          view.dying = { index: prev.active_pet_index, at: now, pet: next.pets[prev.active_pet_index] };
        }
        if (next.active_pet_index !== prev.active_pet_index) view.swapAt = now;
        next.pets.forEach((p, i) => {
          if (p.current_hp > view.ghost[i]) view.ghost[i] = p.current_hp;
        });
      }
      view.player = next;
      view.active = next.active_pet_index;
    }
    this.setWeather(state.active_weather?.type ?? null);
  }

  private setWeather(type: WeatherType | null): void {
    if (type === this.weather) return;
    this.weather = type;
    this.blobs = type === 'TOXIC_CLOUD'
      ? Array.from({ length: 16 }, () => ({ x: Math.random() * W, y: 120 + Math.random() * 330, r: 60 + Math.random() * 90, v: 8 + Math.random() * 18 }))
      : [];
  }

  // -------------------------------------------------------------------------
  // Effect API (driven by battle events)
  // -------------------------------------------------------------------------

  /** Centre of a pet's body, wherever it currently stands. */
  anchor(side: Side, index: number): { x: number; y: number } {
    const view = this.views[side];
    const isActive = index === view.active || view.dying?.index === index;
    const scale = isActive ? ACTIVE_SCALE : RESERVE_SCALE;
    const x = isActive ? X[side].active : X[side].reserve;
    const ground = isActive ? GROUND : GROUND + 34;
    return { x, y: ground - 16 * scale * 0.45 };
  }

  projectile(from: Side, fromIndex: number, to: Side, toIndex: number, element: Element, onHit: () => void): void {
    const a = this.anchor(from, fromIndex);
    const b = this.anchor(to, toIndex);
    const dir = Math.sign(b.x - a.x) || 1;
    this.projectiles.push(new Projectile({ x: a.x + dir * 40, y: a.y - 6 }, { x: b.x - dir * 20, y: b.y }, element, 0.32, onHit));
  }

  hit(side: Side, index: number, element: Element | undefined, strong = false): void {
    const now = performance.now();
    const view = this.views[side];
    view.flashUntil[index] = now + 110;
    view.shakeUntil[index] = now + (strong ? 320 : 200);
    const p = this.anchor(side, index);
    const colors = element ? ELEMENT_FX[element].impact : ['#ffffff', '#ff8f8f'];
    this.particles.burst(p.x, p.y, { count: strong ? 34 : 20, colors, speed: strong ? 420 : 300, life: 0.5, size: 5, gravity: element === 'Earth' || element === 'Water' ? 700 : 0, glow: element === 'Fire' || element === 'Air' });
    this.particles.burst(p.x, p.y, { count: strong ? 14 : 8, colors: ['#ffffff', colors[0]], speed: strong ? 700 : 520, life: 0.22, size: 4, shape: 'spark', glow: true });
    this.particles.add({ x: p.x, y: p.y, shape: 'ring', size: 10, grow: 220, life: 0.3, color: colors[0] });
    if (strong) this.particles.add({ x: p.x, y: p.y, shape: 'ring', size: 20, grow: 380, life: 0.4, color: '#ffffff' });
    this.flashes.push({ x: p.x, y: p.y, at: now, color: colors[0], r: strong ? 120 : 80 });
    this.shake(strong ? 9 : 4, strong ? 260 : 140);
  }

  /** Whole-arena camera shake. */
  shake(mag: number, ms: number): void {
    const now = performance.now();
    if (now < this.camShake.until && this.camShake.mag > mag) return;
    this.camShake = { until: now + ms, mag };
  }

  /** The caster jumps toward the opponent, so every skill reads as an action. */
  lunge(side: Side): void {
    this.views[side].lungeAt = performance.now();
  }

  floatText(side: Side, index: number, text: string, color: string, size = 26, opts: { pop?: number; glow?: string; life?: number } = {}): void {
    const p = this.anchor(side, index);
    // Fan successive numbers out so a flurry of hits stays readable.
    const view = this.views[side];
    view.textSlot = ((view.textSlot ?? 0) + 1) % 4;
    const dx = [0, -34, 34, -12][view.textSlot];
    this.particles.text(p.x + dx + (Math.random() - 0.5) * 10, p.y - 56, text, color, size, opts.life ?? 1.15, opts.pop ?? 1.7, opts.glow);
  }

  aura(side: Side, index: number, color: string): void {
    const p = this.anchor(side, index);
    this.particles.add({ x: p.x, y: p.y + 30, shape: 'ring', size: 20, grow: 160, life: 0.45, color });
    for (let i = 0; i < 14; i++) {
      this.particles.add({ x: p.x + (Math.random() - 0.5) * 90, y: p.y + 40, vy: -120 - Math.random() * 120, life: 0.7, size: 3, color, shape: 'square', glow: true });
    }
  }

  sparkle(side: Side, index: number, colors: string[]): void {
    const p = this.anchor(side, index);
    this.particles.burst(p.x, p.y, { count: 26, colors, speed: 220, life: 0.9, size: 4, gravity: -60, shape: 'spark', glow: true });
  }

  showBanner(text: string, color = '#ffcf3f', ms = 1300): void {
    this.banner = { text, color, at: performance.now(), ms };
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  private resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(this.canvas.clientWidth * dpr));
    const h = Math.max(1, Math.round(this.canvas.clientHeight * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.scale = w / W;
  }

  private frame(now: number): void {
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now;
    const ctx = this.ctx;
    ctx.setTransform(this.scale, 0, 0, this.scale, 0, 0);
    if (now < this.camShake.until) {
      const k = (this.camShake.until - now) / 260;
      const m = this.camShake.mag * Math.min(1, k);
      ctx.translate((Math.random() - 0.5) * m, (Math.random() - 0.5) * m);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.bg, -12, -12, W + 24, H + 24);
    this.drawClouds(now);
    this.drawTorches(now, dt);
    this.drawWeatherBack(now, dt);

    for (const side of ['L', 'R'] as Side[]) this.easeHp(this.views[side], dt);
    for (const side of ['L', 'R'] as Side[]) this.drawReserve(side, now);
    for (const side of ['L', 'R'] as Side[]) this.drawActive(side, now, dt);

    for (const p of this.projectiles) p.update(dt, this.particles);
    this.projectiles = this.projectiles.filter((p) => !p.done);
    for (const p of this.projectiles) p.draw(ctx, now);
    this.drawFlashes(now);
    this.particles.update(dt);
    this.particles.draw(ctx);

    for (const side of ['L', 'R'] as Side[]) this.drawOverhead(side, now);
    this.drawWeatherFront(dt);
    this.drawBanner(now);
  }

  private easeHp(view: SideView, dt: number): void {
    if (!view.player) return;
    view.player.pets.forEach((p, i) => {
      view.hp[i] += (p.current_hp - view.hp[i]) * Math.min(1, dt * 12);
      if (view.ghost[i] > view.hp[i]) view.ghost[i] += (view.hp[i] - view.ghost[i]) * Math.min(1, dt * 1.8);
      else view.ghost[i] = view.hp[i];
    });
  }

  private silhouette(sprite: HTMLCanvasElement): HTMLCanvasElement {
    let s = this.silhouettes.get(sprite);
    if (!s) {
      s = document.createElement('canvas');
      s.width = sprite.width;
      s.height = sprite.height;
      const c = s.getContext('2d')!;
      c.drawImage(sprite, 0, 0);
      c.globalCompositeOperation = 'source-in';
      c.fillStyle = '#ffffff';
      c.fillRect(0, 0, s.width, s.height);
      this.silhouettes.set(sprite, s);
    }
    return s;
  }

  private drawPetSprite(side: Side, index: number, pet: PetSnapshot, x: number, ground: number, scale: number, now: number, opts: { alpha?: number; rot?: number } = {}): void {
    const ctx = this.ctx;
    const view = this.views[side];
    const size = 16 * scale;
    const sprite = petSprite(pet.id, pet.element, pet.is_ko);
    const bob = pet.is_ko ? 0 : Math.sin(now / 280 + (side === 'L' ? 0 : 1.9) + index) * scale * 0.35;
    const shake = now < view.shakeUntil[index] ? (Math.random() - 0.5) * 10 : 0;
    const dodging = pet.active_buffs.some((b) => b.status === 'DODGE');

    ctx.fillStyle = 'rgba(20, 16, 40, 0.28)';
    ctx.beginPath();
    ctx.ellipse(x, ground, size * 0.36, size * 0.07, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(x + shake, ground - size / 2 + scale + bob);
    if (side === 'R') ctx.scale(-1, 1);
    if (opts.rot) ctx.rotate(opts.rot);
    ctx.imageSmoothingEnabled = false;
    const alpha = opts.alpha ?? 1;
    if (dodging && !pet.is_ko) {
      ctx.globalAlpha = 0.25 * alpha;
      ctx.drawImage(sprite, -size / 2 - 14, -size / 2, size, size);
      ctx.globalAlpha = 0.6 * alpha;
    } else {
      ctx.globalAlpha = alpha;
    }
    ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
    // White silhouette: hit flash, or a pale icy overlay while frozen.
    const flashing = now < view.flashUntil[index];
    const frozen = pet.active_debuffs.some((d) => d.type === 'FREEZE');
    if (flashing || frozen) {
      ctx.globalAlpha = (flashing ? 0.9 : 0.4) * alpha;
      ctx.drawImage(this.silhouette(sprite), -size / 2, -size / 2, size, size);
    }
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  private drawReserve(side: Side, now: number): void {
    const view = this.views[side];
    if (!view.player) return;
    const index = view.active === 0 ? 1 : 0;
    if (view.dying?.index === index && now - view.dying.at < DYING_MS) return;
    const pet = view.player.pets[index];
    const x = X[side].reserve;
    const ground = GROUND + 34;
    const swapT = (now - view.swapAt) / SWAP_MS;
    const alpha = swapT < 1 ? Math.max(0.2, swapT) : 1;
    this.drawPetSprite(side, index, pet, x, ground, RESERVE_SCALE, now, { alpha });

    const ctx = this.ctx;
    const w = 66;
    const y = ground - 16 * RESERVE_SCALE - 8;
    ctx.font = "600 11px 'Pixelify Sans', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    outlinedText(ctx, 'CADANGAN', x, y - 12, '#ffe9a8', 3);
    hpBar(ctx, x - w / 2, y - 6, w, 7, view.hp[index] / pet.max_hp, view.ghost[index] / pet.max_hp, now);
    if (pet.is_ko) {
      ctx.font = "700 18px 'Pixelify Sans', monospace";
      outlinedText(ctx, 'K.O.', x, ground - 24, '#ff5c5c', 4);
    }
  }

  private drawActive(side: Side, now: number, dt: number): void {
    const view = this.views[side];
    if (!view.player) return;
    const ctx = this.ctx;

    if (view.dying) {
      const t = (now - view.dying.at) / DYING_MS;
      if (t >= 1) view.dying = null;
      else {
        const dir = side === 'L' ? -1 : 1;
        this.drawPetSprite(side, view.dying.index, view.dying.pet, X[side].active - dir * t * 30, GROUND, ACTIVE_SCALE, now, {
          alpha: 1 - t,
          rot: dir * easeOut(t) * (Math.PI / 2),
        });
      }
    }

    const index = view.active;
    const pet = view.player.pets[index];
    let x = X[side].active;
    let scale = ACTIVE_SCALE;
    const swapT = (now - view.swapAt) / SWAP_MS;
    if (swapT < 1) {
      const k = easeOut(Math.max(0, swapT));
      x = X[side].reserve + (X[side].active - X[side].reserve) * k;
      scale = RESERVE_SCALE + (ACTIVE_SCALE - RESERVE_SCALE) * k;
    }
    const lungeT = (now - view.lungeAt) / LUNGE_MS;
    if (lungeT >= 0 && lungeT < 1) x += Math.sin(lungeT * Math.PI) * 34 * (side === 'L' ? 1 : -1);
    if (pet.is_ko) return;

    const size = 16 * scale;
    const centerY = GROUND - size * 0.45;
    const doom = pet.active_debuffs.find((d) => d.status === 'DOOM');
    if (doom) {
      const g = ctx.createRadialGradient(x, centerY, 10, x, centerY, size * 0.8);
      g.addColorStop(0, 'rgba(155, 89, 255, 0.45)');
      g.addColorStop(1, 'rgba(155, 89, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - size, centerY - size, size * 2, size * 2);
    }

    this.drawPetSprite(side, index, pet, x, GROUND, scale, now);

    // Defensive bubble in front of the pet
    const facing = side === 'L' ? 1 : -1;
    if (pet.active_buffs.some((b) => b.status === 'BLOCK' || b.status === 'DAMAGE_REDUCTION')) {
      ctx.strokeStyle = 'rgba(200, 230, 255, 0.85)';
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(x, centerY, size * 0.62, facing > 0 ? -1.1 : Math.PI - 1.1, facing > 0 ? 1.1 : Math.PI + 1.1);
      ctx.stroke();
      ctx.fillStyle = 'rgba(160, 210, 255, 0.12)';
      ctx.beginPath();
      ctx.arc(x, centerY, size * 0.62, 0, Math.PI * 2);
      ctx.fill();
    }
    if (pet.active_buffs.some((b) => b.status === 'THORNS')) {
      ctx.strokeStyle = 'rgba(182, 211, 106, 0.8)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, centerY, size * 0.55, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (pet.active_buffs.some((b) => b.status === 'REBIRTH')) {
      ctx.strokeStyle = `rgba(255, 207, 63, ${0.5 + Math.sin(now / 120) * 0.3})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(x, GROUND - 4, size * 0.4, size * 0.09, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Stun stars
    if (pet.active_debuffs.some((d) => d.status === 'STUN') && !pet.active_debuffs.some((d) => d.type === 'FREEZE')) {
      const headY = GROUND - size * 0.92;
      for (let i = 0; i < 3; i++) {
        const a = now / 260 + (i * Math.PI * 2) / 3;
        star(ctx, x + Math.cos(a) * size * 0.3, headY + Math.sin(a) * 6, 6, '#ffe066');
      }
    }

    // Ambient particles for over-time effects
    const chance = (perSec: number) => Math.random() < perSec * dt;
    for (const d of pet.active_debuffs) {
      if (d.status === 'DOT' && chance(10)) {
        const burn = d.type === 'BURN';
        this.particles.add({ x: x + (Math.random() - 0.5) * size * 0.6, y: centerY + size * 0.2, vy: -60 - Math.random() * 60, life: 0.6, size: 3, color: burn ? '#ff8a3c' : '#c18bff', glow: burn, shape: burn ? 'square' : 'dot' });
      }
      if (d.type === 'SLEEP' && chance(2.5)) this.particles.add({ x: x + 30 * facing, y: GROUND - size, vy: -40, vx: 12 * facing, life: 1.4, size: 18, color: '#cfd6ff', shape: 'text', text: 'z', pop: 1 });
    }
    for (const b of pet.active_buffs) {
      if (b.status === 'HOT' && chance(5)) this.particles.add({ x: x + (Math.random() - 0.5) * size * 0.6, y: centerY, vy: -60, life: 0.8, size: 16, color: '#7fe08f', shape: 'text', text: '+', pop: 1 });
    }
  }

  private drawOverhead(side: Side, now: number): void {
    const view = this.views[side];
    if (!view.player) return;
    const pet = view.player.pets[view.active];
    if (pet.is_ko || now - view.swapAt < SWAP_MS) return;
    const ctx = this.ctx;
    const x = X[side].active;
    const w = 196;
    const x0 = x - w / 2;
    const bottom = GROUND - 16 * ACTIVE_SCALE - 2;
    const player = this.playerOf(side);

    // Name with an element dot
    ctx.font = "700 17px 'Pixelify Sans', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    outlinedText(ctx, pet.name, x, bottom - 70, '#ffffff', 4);
    const nameW = ctx.measureText(pet.name).width;
    const theme = ELEMENT_THEME[pet.element];
    ctx.fillStyle = theme.main;
    ctx.shadowColor = theme.main;
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(x - nameW / 2 - 11, bottom - 75, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();

    // HP bar with the number on it
    const frac = view.hp[view.active] / pet.max_hp;
    hpBar(ctx, x0, bottom - 62, w, 20, frac, view.ghost[view.active] / pet.max_hp, now);
    ctx.font = "700 13px 'Pixelify Sans', monospace";
    ctx.textBaseline = 'middle';
    outlinedText(ctx, `${Math.round(pet.current_hp)} / ${pet.max_hp}`, x, bottom - 51.5, '#ffffff', 3);
    ctx.textAlign = side === 'L' ? 'left' : 'right';
    ctx.font = "700 10px 'Pixelify Sans', monospace";
    outlinedText(ctx, 'HP', side === 'L' ? x0 + 6 : x0 + w - 6, bottom - 51.5, '#ffffffcc', 3);

    // Energy bar: refills over the 1s global cooldown after each skill
    const gcd = this.hooks.gcdLeft(player);
    energyBar(ctx, x0 + 10, bottom - 37, w - 20, 7, 1 - gcd / GCD_SEC, now);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';

    // One cooldown radial per ability, stacked on the outer side of the bars
    const rx = side === 'L' ? x0 - 20 : x0 + w + 20;
    pet.abilities.forEach((_, i) => this.cooldownRing(pet, i, side, rx, bottom - 74 + i * 24, now));

    const doom = pet.active_debuffs.find((d) => d.status === 'DOOM');
    if (doom && doom.duration !== null) {
      const left = Math.max(0, doom.duration - this.hooks.sinceState());
      ctx.font = "700 22px 'Pixelify Sans', monospace";
      outlinedText(ctx, `☠ ${Math.ceil(left)}`, x, bottom - 94, '#c9a6ff', 4);
    }
  }

  private playerOf(side: Side): PlayerId {
    return side === 'L' ? this.you : this.you === 'p1' ? 'p2' : 'p1';
  }

  private cooldownRing(pet: PetSnapshot, abilityIndex: number, side: Side, x: number, y: number, now: number): void {
    const ctx = this.ctx;
    const ability = pet.abilities[abilityIndex];
    const r = 8.5;
    ctx.fillStyle = 'rgba(10,10,20,0.88)';
    ctx.beginPath();
    ctx.arc(x, y, r + 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.font = "700 10px 'Pixelify Sans', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (ability.is_passive || ability.uses_left === 0) {
      ctx.fillStyle = '#8e97ba';
      ctx.fillText(ability.is_passive ? 'P' : '-', x, y + 1);
      ctx.textBaseline = 'alphabetic';
      return;
    }
    const player = this.playerOf(side);
    const index = this.views[side].active;
    const remaining = this.hooks.abilityLeft(player, index, abilityIndex);
    const total = Math.max(remaining, this.hooks.cooldownTotal(player, index, abilityIndex));
    const frac = total > 0 ? 1 - remaining / total : 1;
    const ready = remaining <= 0;
    const color = ELEMENT_THEME[ability.element].main;

    ctx.lineWidth = 3.5;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineCap = 'round';
    ctx.strokeStyle = ready ? '#ffcf3f' : color;
    ctx.shadowColor = ready ? '#ffcf3f' : color;
    ctx.shadowBlur = ready ? 7 + Math.sin(now / 150) * 3 : 4;
    ctx.beginPath();
    ctx.arc(x, y, r, -Math.PI / 2, -Math.PI / 2 + Math.max(0.001, frac) * Math.PI * 2);
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.lineCap = 'butt';
    ctx.fillStyle = ready ? '#ffcf3f' : '#ffffff';
    ctx.fillText(ready ? '!' : String(Math.ceil(remaining)), x, y + 1);
    ctx.textBaseline = 'alphabetic';
  }

  private drawFlashes(now: number): void {
    const ctx = this.ctx;
    this.flashes = this.flashes.filter((f) => now - f.at < 160);
    if (!this.flashes.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const f of this.flashes) {
      const t = (now - f.at) / 160;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * (0.6 + t * 0.6));
      g.addColorStop(0, `rgba(255,255,255,${0.75 * (1 - t)})`);
      g.addColorStop(0.4, hexA(f.color, 0.45 * (1 - t)));
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g;
      ctx.fillRect(f.x - f.r * 1.3, f.y - f.r * 1.3, f.r * 2.6, f.r * 2.6);
    }
    ctx.restore();
  }

  private drawClouds(now: number): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const clouds = [
      [0, 70, 1], [260, 120, 0.7], [520, 60, 1.2], [760, 140, 0.8], [1000, 95, 1],
    ];
    for (const [base, y, s] of clouds) {
      const x = ((base + now * 0.006 * s) % (W + 240)) - 120;
      for (const [dx, dy, r] of [[0, 0, 22], [24, -10, 26], [50, 0, 20], [24, 6, 22]]) {
        ctx.beginPath();
        ctx.arc(x + dx * s, y + dy * s, r * s, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  private drawTorches(now: number, dt: number): void {
    const ctx = this.ctx;
    for (const x of [28, W - 28]) {
      const y = GROUND - 96;
      ctx.fillStyle = '#4b3a2a';
      ctx.fillRect(x - 4, y, 8, 96);
      ctx.fillStyle = '#6e5a46';
      ctx.fillRect(x - 9, y - 6, 18, 8);
      const flick = Math.sin(now / 70 + x) * 2;
      const g = ctx.createRadialGradient(x, y - 14, 2, x, y - 14, 60);
      g.addColorStop(0, 'rgba(255,180,60,0.45)');
      g.addColorStop(1, 'rgba(255,180,60,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 60, y - 74, 120, 120);
      ctx.fillStyle = '#ff9a2e';
      ctx.beginPath();
      ctx.ellipse(x, y - 14, 7 + flick * 0.3, 13 + flick, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffe17a';
      ctx.beginPath();
      ctx.ellipse(x, y - 10, 3.5, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      if (Math.random() < dt * 6) {
        this.particles.add({ x, y: y - 22, vy: -50, vx: (Math.random() - 0.5) * 20, life: 0.8, size: 2, color: '#ffb02e', glow: true, shape: 'square' });
      }
    }
  }

  private drawWeatherBack(now: number, dt: number): void {
    const ctx = this.ctx;
    const tint: Record<WeatherType, string> = {
      TOXIC_CLOUD: 'rgba(70, 170, 40, 0.18)',
      HAILSTORM: 'rgba(150, 200, 255, 0.2)',
      HEAT_WAVE: 'rgba(255, 110, 30, 0.16)',
      COUNT_SHEEP: 'rgba(10, 12, 50, 0.42)',
    };
    if (!this.weather) return;
    ctx.fillStyle = tint[this.weather];
    ctx.fillRect(0, 0, W, H);
    if (this.weather === 'TOXIC_CLOUD') {
      for (const b of this.blobs) {
        b.x += b.v * dt;
        if (b.x - b.r > W) b.x = -b.r;
        const g = ctx.createRadialGradient(b.x, b.y, 4, b.x, b.y, b.r);
        g.addColorStop(0, 'rgba(120, 220, 60, 0.22)');
        g.addColorStop(1, 'rgba(120, 220, 60, 0)');
        ctx.fillStyle = g;
        ctx.fillRect(b.x - b.r, b.y - b.r, b.r * 2, b.r * 2);
      }
    }
    if (this.weather === 'HEAT_WAVE') {
      ctx.globalAlpha = 0.1;
      ctx.fillStyle = '#ffcf6a';
      for (let i = 0; i < 6; i++) ctx.fillRect(0, GROUND - 120 + i * 18 + Math.sin(now / 200 + i) * 4, W, 3);
      ctx.globalAlpha = 1;
    }
  }

  private drawWeatherFront(dt: number): void {
    if (this.weather === 'HAILSTORM') {
      for (let i = 0; i < 260 * dt; i++) {
        this.particles.add({ x: Math.random() * (W + 200), y: -10, vx: -90, vy: 520 + Math.random() * 140, life: 1.1, size: 3 + Math.random() * 2, color: '#f2f8ff', shape: 'square' });
      }
    } else if (this.weather === 'HEAT_WAVE') {
      for (let i = 0; i < 40 * dt; i++) {
        this.particles.add({ x: Math.random() * W, y: GROUND + 10, vy: -80 - Math.random() * 80, vx: (Math.random() - 0.5) * 30, life: 1.5, size: 2.5, color: Math.random() < 0.5 ? '#ffb02e' : '#ff6a1a', glow: true, shape: 'square' });
      }
    } else if (this.weather === 'COUNT_SHEEP') {
      for (let i = 0; i < 8 * dt; i++) {
        this.particles.add({ x: Math.random() * W, y: 40 + Math.random() * 200, life: 1.2, size: 1.8, color: '#ffffff', glow: true });
      }
    }
  }

  private drawBanner(now: number): void {
    const b = this.banner;
    if (!b) return;
    const t = (now - b.at) / b.ms;
    if (t >= 1) {
      this.banner = null;
      return;
    }
    const ctx = this.ctx;
    const scale = t < 0.15 ? 0.6 + (t / 0.15) * 0.4 : 1;
    ctx.save();
    ctx.globalAlpha = t > 0.75 ? (1 - t) / 0.25 : 1;
    ctx.translate(W / 2, H * 0.42);
    ctx.scale(scale, scale);
    ctx.font = "700 64px 'Pixelify Sans', monospace";
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 10;
    ctx.strokeStyle = 'rgba(10,8,20,0.9)';
    ctx.strokeText(b.text, 0, 0);
    ctx.fillStyle = b.color;
    ctx.fillText(b.text, 0, 0);
    ctx.restore();
  }
}

// ---------------------------------------------------------------------------
// Drawing helpers
// ---------------------------------------------------------------------------

function outlinedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, width: number): void {
  ctx.lineWidth = width;
  ctx.strokeStyle = 'rgba(10, 8, 20, 0.9)';
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Health bar: dark frame, trailing "ghost" damage, glowing gradient fill and tick marks. */
function hpBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, ghost: number, now: number): void {
  frac = Math.max(0, Math.min(1, frac));
  ghost = Math.max(frac, Math.min(1, ghost));
  const r = Math.min(6, h / 2);
  ctx.save();
  ctx.fillStyle = 'rgba(6, 6, 14, 0.92)';
  ctx.beginPath();
  ctx.roundRect(x - 3, y - 3, w + 6, h + 6, r + 3);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.clip();
  ctx.fillStyle = '#231b30';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = 'rgba(255, 240, 220, 0.85)';
  ctx.fillRect(x, y, w * ghost, h);
  const [hi, lo] = frac > 0.5 ? ['#8dff9a', '#1fae4b'] : frac > 0.25 ? ['#ffe97a', '#e09a00'] : ['#ff8a8a', '#d01f2a'];
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, hi);
  g.addColorStop(1, lo);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w * frac, h);
  // Gloss and a moving sheen
  ctx.fillStyle = 'rgba(255,255,255,0.32)';
  ctx.fillRect(x, y, w * frac, Math.max(1, h * 0.38));
  const sheen = ((now / 1600) % 1.4) * w - w * 0.2;
  const sg = ctx.createLinearGradient(x + sheen, 0, x + sheen + 30, 0);
  sg.addColorStop(0, 'rgba(255,255,255,0)');
  sg.addColorStop(0.5, 'rgba(255,255,255,0.28)');
  sg.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = sg;
  ctx.fillRect(x, y, w * frac, h);
  if (h >= 12) {
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    for (let i = 1; i < 10; i++) ctx.fillRect(x + (w * i) / 10, y + h * 0.55, 1, h * 0.45);
  }
  ctx.restore();
  // Outer glow, pulsing when low
  ctx.save();
  ctx.strokeStyle = frac > 0.25 ? 'rgba(255,255,255,0.35)' : `rgba(255,90,90,${0.55 + Math.sin(now / 110) * 0.35})`;
  ctx.shadowColor = frac > 0.5 ? '#3dff6a' : frac > 0.25 ? '#ffc400' : '#ff3030';
  ctx.shadowBlur = frac > 0.25 ? 8 : 14;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(x - 0.5, y - 0.5, w + 1, h + 1, r);
  ctx.stroke();
  ctx.restore();
}

/** Energy bar: empties on every skill and refills over the global cooldown. */
function energyBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, frac: number, now: number): void {
  frac = Math.max(0, Math.min(1, frac));
  const full = frac >= 1;
  ctx.save();
  ctx.fillStyle = 'rgba(6, 6, 14, 0.9)';
  ctx.beginPath();
  ctx.roundRect(x - 2, y - 2, w + 4, h + 4, h);
  ctx.fill();
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, h / 2);
  ctx.clip();
  ctx.fillStyle = '#16233a';
  ctx.fillRect(x, y, w, h);
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#2f7bff');
  g.addColorStop(1, full ? '#9ffcff' : '#52d8ff');
  ctx.fillStyle = g;
  ctx.shadowColor = '#5fe1ff';
  ctx.shadowBlur = full ? 10 + Math.sin(now / 160) * 4 : 4;
  ctx.fillRect(x, y, w * frac, h);
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(x, y, w * frac, h * 0.4);
  ctx.restore();
}

/** '#rrggbb' + alpha -> rgba(). */
function hexA(hex: string, alpha: number): string {
  const n = parseInt(hex.slice(1, 7), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${Math.max(0, alpha).toFixed(3)})`;
}

function star(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, color: string): void {
  ctx.fillStyle = color;
  ctx.strokeStyle = '#3a2a00';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i * Math.PI) / 5 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
}

/** Static stage: sky, mountains, temple and the stone arena floor. Painted once at 2x. */
function paintBackground(): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = W * 2;
  c.height = H * 2;
  const ctx = c.getContext('2d')!;
  ctx.scale(2, 2);

  const sky = ctx.createLinearGradient(0, 0, 0, GROUND);
  sky.addColorStop(0, '#3f97ff');
  sky.addColorStop(0.65, '#9fd6ff');
  sky.addColorStop(1, '#ffe2b0');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  const sun = ctx.createRadialGradient(800, 92, 10, 800, 92, 120);
  sun.addColorStop(0, 'rgba(255, 248, 200, 1)');
  sun.addColorStop(0.3, 'rgba(255, 240, 170, 0.8)');
  sun.addColorStop(1, 'rgba(255, 240, 170, 0)');
  ctx.fillStyle = sun;
  ctx.fillRect(680, 0, 240, 220);

  const ridge = (base: number, peaks: number[], color: string) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, GROUND);
    const step = W / (peaks.length - 1);
    peaks.forEach((p, i) => ctx.lineTo(i * step, base - p));
    ctx.lineTo(W, GROUND);
    ctx.closePath();
    ctx.fill();
  };
  ridge(340, [40, 120, 70, 160, 90, 130, 60, 150, 80, 110, 50], '#86a9de');
  ridge(370, [20, 60, 100, 50, 80, 30, 90, 60, 110, 40, 70], '#6889c4');

  // Temple
  const tx = W / 2;
  ctx.fillStyle = '#b9b2a4';
  ctx.fillRect(tx - 150, 352, 300, 16);
  ctx.fillRect(tx - 130, 340, 260, 14);
  ctx.fillStyle = '#d8d1c0';
  for (let i = 0; i < 6; i++) {
    const px = tx - 110 + i * 44;
    ctx.fillRect(px - 9, 232, 18, 108);
    ctx.fillStyle = '#c4bcab';
    ctx.fillRect(px + 3, 232, 6, 108);
    ctx.fillStyle = '#d8d1c0';
  }
  ctx.fillStyle = '#e4ddcc';
  ctx.fillRect(tx - 134, 220, 268, 14);
  ctx.fillStyle = '#b5484a';
  ctx.beginPath();
  ctx.moveTo(tx - 150, 222);
  ctx.lineTo(tx, 168);
  ctx.lineTo(tx + 150, 222);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8f3335';
  ctx.fillRect(tx - 150, 218, 300, 6);
  ctx.fillStyle = '#ffcf3f';
  ctx.beginPath();
  ctx.arc(tx, 202, 9, 0, Math.PI * 2);
  ctx.fill();

  // Bushes along the horizon
  ctx.fillStyle = '#3f8f4f';
  for (let x = -10; x < W + 20; x += 34) {
    ctx.beginPath();
    ctx.arc(x, GROUND - 22 + Math.sin(x) * 4, 26, Math.PI, 0);
    ctx.fill();
  }

  // Arena floor
  ctx.fillStyle = '#5cc25c';
  ctx.fillRect(0, GROUND - 26, W, 10);
  ctx.fillStyle = '#3f9a46';
  for (let x = 0; x < W; x += 8) ctx.fillRect(x, GROUND - 16, 4, 4);
  const floorTop = GROUND - 16;
  ctx.fillStyle = '#9a95aa';
  ctx.fillRect(0, floorTop, W, H - floorTop);
  const rowH = 22;
  for (let row = 0; row * rowH < H - floorTop; row++) {
    const y = floorTop + 4 + row * rowH;
    const offset = row % 2 ? 0 : 30;
    for (let x = -offset; x < W; x += 60) {
      ctx.fillStyle = row % 2 ? '#a7a2b8' : '#9f9ab0';
      ctx.fillRect(x + 2, y + 2, 56, rowH - 4);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + 2, y + 2, 56, 3);
      ctx.fillStyle = 'rgba(0,0,0,0.12)';
      ctx.fillRect(x + 2, y + rowH - 5, 56, 3);
    }
  }
  const shade = ctx.createLinearGradient(0, floorTop, 0, H);
  shade.addColorStop(0, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(20,10,40,0.35)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, floorTop, W, H - floorTop);
  return c;
}
