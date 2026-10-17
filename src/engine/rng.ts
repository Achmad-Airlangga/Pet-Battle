/**
 * Seeded PRNG (mulberry32). The authoritative server owns all randomness, so a
 * match is fully reproducible from its seed plus the ordered command log.
 */
export class Rng {
  private state: number;
  private readonly source: (() => number) | null;

  constructor(seed: number = Date.now(), source?: () => number) {
    this.state = seed >>> 0;
    this.source = source ?? null;
  }

  /** Float in [0, 1). */
  next(): number {
    if (this.source) return this.source();
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Integer in [min, max], both inclusive. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  chance(probability: number): boolean {
    return probability > 0 && this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.floor(this.next() * items.length)];
  }
}
