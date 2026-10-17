import type { Element } from '../types.ts';

export type Shape = 'dot' | 'square' | 'spark' | 'ring' | 'text' | 'blob';

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
  gravity: number;
  drag: number;
  shape: Shape;
  grow: number;
  text?: string;
  glow?: boolean;
  spin?: number;
  angle?: number;
  /** Text only: starting scale that settles to 1 (damage number pop). */
  pop?: number;
  /** Text only: glow colour behind the letters. */
  halo?: string;
}

const MAX_PARTICLES = 1500;

const easeOutBack = (t: number): number => {
  const c = 1.7;
  return 1 + (c + 1) * (t - 1) ** 3 + c * (t - 1) ** 2;
};

export class ParticleSystem {
  items: Particle[] = [];

  add(p: Partial<Particle> & { x: number; y: number }): void {
    if (this.items.length >= MAX_PARTICLES) this.items.shift();
    const life = p.life ?? 0.6;
    this.items.push({
      vx: 0, vy: 0, size: 3, color: '#fff', gravity: 0, drag: 0, shape: 'dot', grow: 0, ...p, life, max: life,
    });
  }

  burst(
    x: number,
    y: number,
    opts: { count: number; colors: string[]; speed: number; life?: number; size?: number; gravity?: number; shape?: Shape; spread?: number; angle?: number; glow?: boolean },
  ): void {
    for (let i = 0; i < opts.count; i++) {
      const a = (opts.angle ?? 0) + (Math.random() - 0.5) * (opts.spread ?? Math.PI * 2);
      const s = opts.speed * (0.35 + Math.random() * 0.65);
      this.add({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life: (opts.life ?? 0.6) * (0.6 + Math.random() * 0.6),
        size: (opts.size ?? 3) * (0.6 + Math.random() * 0.8),
        color: opts.colors[Math.floor(Math.random() * opts.colors.length)],
        gravity: opts.gravity ?? 0,
        drag: 2,
        shape: opts.shape ?? 'square',
        glow: opts.glow,
        spin: (Math.random() - 0.5) * 10,
        angle: Math.random() * Math.PI,
      });
    }
  }

  /** Floating combat text: pops in big, jumps up, then drifts and fades. */
  text(x: number, y: number, text: string, color: string, size = 24, life = 1.1, pop = 1.5, halo?: string): void {
    this.add({ x, y, vy: -150, vx: (Math.random() - 0.5) * 40, gravity: 190, life, size, color, shape: 'text', text, drag: 1.6, pop, halo });
  }

  update(dt: number): void {
    for (const p of this.items) {
      p.life -= dt;
      p.vy += p.gravity * dt;
      const k = Math.max(0, 1 - p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
      if (p.spin) p.angle = (p.angle ?? 0) + p.spin * dt;
    }
    this.items = this.items.filter((p) => p.life > 0);
  }

  draw(ctx: CanvasRenderingContext2D): void {
    for (const p of this.items) {
      const t = p.life / p.max;
      ctx.globalAlpha = p.shape === 'text' ? Math.min(1, t * 2.2) : t;
      ctx.globalCompositeOperation = p.glow ? 'lighter' : 'source-over';
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      switch (p.shape) {
        case 'dot':
        case 'blob':
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(0.5, p.size), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'square': {
          const s = Math.max(1, p.size);
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.angle ?? 0);
          ctx.fillRect(-s / 2, -s / 2, s, s);
          ctx.restore();
          break;
        }
        case 'spark':
          ctx.lineWidth = Math.max(1, p.size * 0.5);
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04);
          ctx.stroke();
          break;
        case 'ring':
          ctx.lineWidth = 3 * t + 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(1, p.size), 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'text': {
          const age = p.max - p.life;
          const pop = p.pop ?? 1.5;
          // Overshoot: big -> slightly small -> 1, within the first ~0.2s.
          const k = Math.min(1, age / 0.2);
          const scale = k < 1 ? pop + (0.9 - pop) * easeOutBack(k) : 1;
          ctx.font = `700 ${Math.round(p.size * scale)}px 'Pixelify Sans', monospace`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineJoin = 'round';
          if (p.halo) {
            ctx.shadowColor = p.halo;
            ctx.shadowBlur = 16;
          }
          ctx.lineWidth = Math.max(4, p.size * 0.22);
          ctx.strokeStyle = 'rgba(10,8,20,0.92)';
          ctx.strokeText(p.text!, p.x, p.y);
          ctx.shadowBlur = 0;
          ctx.fillText(p.text!, p.x, p.y);
          ctx.fillStyle = 'rgba(255,255,255,0.35)';
          ctx.save();
          ctx.beginPath();
          ctx.rect(p.x - p.size * 4, p.y - p.size * scale * 0.6, p.size * 8, p.size * scale * 0.45);
          ctx.clip();
          ctx.fillText(p.text!, p.x, p.y);
          ctx.restore();
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
  }
}

// ---------------------------------------------------------------------------
// Element projectiles
// ---------------------------------------------------------------------------

export const ELEMENT_FX: Record<Element, { head: string; trail: string[]; impact: string[] }> = {
  Air: { head: '#f2fbff', trail: ['#ffffff', '#c9ecff', '#8fd3ff'], impact: ['#ffffff', '#bfe8ff', '#fff6a8'] },
  Earth: { head: '#9a6a3c', trail: ['#b98b58', '#7d5a36', '#c7b28a'], impact: ['#8b5e34', '#5f8f3a', '#c9a46a'] },
  Fire: { head: '#ffd36b', trail: ['#ff7a1a', '#ffb02e', '#ff4d1a'], impact: ['#ffde59', '#ff7a1a', '#ff3b1a'] },
  Water: { head: '#bfe6ff', trail: ['#4fa8ff', '#9ad3ff', '#2f7de0'], impact: ['#e0f4ff', '#4fa8ff', '#2f7de0'] },
};

export class Projectile {
  done = false;
  private t = 0;
  private x: number;
  private y: number;
  private readonly fromX: number;
  private readonly fromY: number;
  private readonly toX: number;
  private readonly toY: number;
  private readonly duration: number;
  private readonly element: Element;
  private readonly onHit: () => void;

  constructor(from: { x: number; y: number }, to: { x: number; y: number }, element: Element, duration: number, onHit: () => void) {
    this.fromX = from.x;
    this.fromY = from.y;
    this.toX = to.x;
    this.toY = to.y;
    this.x = from.x;
    this.y = from.y;
    this.element = element;
    this.duration = duration;
    this.onHit = onHit;
  }

  update(dt: number, particles: ParticleSystem): void {
    if (this.done) return;
    this.t = Math.min(1, this.t + dt / this.duration);
    const k = this.t;
    const arc = this.element === 'Earth' ? 120 : this.element === 'Water' ? 40 : 18;
    this.x = this.fromX + (this.toX - this.fromX) * k;
    this.y = this.fromY + (this.toY - this.fromY) * k - Math.sin(k * Math.PI) * arc;
    const fx = ELEMENT_FX[this.element];
    const dir = Math.sign(this.toX - this.fromX) || 1;
    for (let i = 0; i < 3; i++) {
      particles.add({
        x: this.x + (Math.random() - 0.5) * 8,
        y: this.y + (Math.random() - 0.5) * 8,
        vx: -dir * (30 + Math.random() * 60),
        vy: this.element === 'Fire' ? -30 - Math.random() * 40 : this.element === 'Water' ? 40 + Math.random() * 40 : (Math.random() - 0.5) * 40,
        life: 0.35 + Math.random() * 0.25,
        size: this.element === 'Air' ? 2 : 3 + Math.random() * 3,
        color: fx.trail[Math.floor(Math.random() * fx.trail.length)],
        shape: this.element === 'Air' ? 'spark' : this.element === 'Earth' ? 'square' : 'dot',
        glow: this.element === 'Fire' || this.element === 'Air',
        drag: 1,
      });
    }
    if (this.t >= 1) {
      this.done = true;
      this.onHit();
    }
  }

  draw(ctx: CanvasRenderingContext2D, now: number): void {
    if (this.done) return;
    const fx = ELEMENT_FX[this.element];
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.element === 'Earth') {
      ctx.rotate(now / 90);
      ctx.fillStyle = '#3b2814';
      ctx.fillRect(-11, -11, 22, 22);
      ctx.fillStyle = fx.head;
      ctx.fillRect(-9, -9, 18, 18);
      ctx.fillStyle = '#c49a6c';
      ctx.fillRect(-9, -9, 8, 6);
    } else {
      const r = this.element === 'Fire' ? 14 : 11;
      const g = ctx.createRadialGradient(0, 0, 1, 0, 0, r * 2);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.35, fx.head);
      g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, r * 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
