import type { BattleSession } from './BattleSession.ts';
import { TICK_MS } from './constants.ts';
import type { TickResult } from './types.ts';

export interface TickLoopOptions {
  /** Called after every simulated tick (e.g. broadcast BATTLE_TICK_UPDATE). */
  onTick?: (result: TickResult, session: BattleSession) => void;
  /** Called once when the match finishes. */
  onFinish?: (session: BattleSession) => void;
  /** Wall clock in ms; injectable for tests. */
  now?: () => number;
  /** Safety cap on catch-up ticks per timer callback (e.g. after the event loop stalls). */
  maxCatchUpTicks?: number;
  /** false = no own setInterval; the owner calls pump() (one server timer for many rooms). */
  schedule?: boolean;
}

/**
 * Fixed-timestep driver: real time is accumulated and consumed in exact 50ms
 * ticks, so timer jitter never changes simulation results.
 */
export class TickLoop {
  private readonly session: BattleSession;
  private readonly options: TickLoopOptions;
  private readonly now: () => number;
  private handle: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private lastTime = 0;
  private accumulator = 0;

  constructor(session: BattleSession, options: TickLoopOptions = {}) {
    this.session = session;
    this.options = options;
    this.now = options.now ?? (() => performance.now());
  }

  get running(): boolean {
    return this.started;
  }

  start(): void {
    if (this.started) return;
    if (this.session.status === 'WAITING') this.session.start();
    this.started = true;
    this.lastTime = this.now();
    this.accumulator = 0;
    if (this.options.schedule !== false) this.handle = setInterval(() => this.pump(), TICK_MS);
  }

  stop(): void {
    if (this.handle) clearInterval(this.handle);
    this.handle = null;
    this.started = false;
  }

  /** Runs every tick that is due. Public so tests can drive it with a fake clock. */
  pump(): number {
    if (!this.started) return 0;
    const now = this.now();
    // A wall clock can step backwards (NTP); never run time in reverse.
    this.accumulator += Math.max(0, now - this.lastTime);
    this.lastTime = now;
    const cap = this.options.maxCatchUpTicks ?? 20;
    let ran = 0;
    while (this.accumulator >= TICK_MS && ran < cap && this.session.status === 'IN_PROGRESS') {
      this.accumulator -= TICK_MS;
      const result = this.session.tick();
      this.options.onTick?.(result, this.session);
      ran++;
    }
    if (ran === cap) this.accumulator = 0;
    if (this.session.status === 'FINISHED') {
      this.stop();
      this.options.onFinish?.(this.session);
    }
    return ran;
  }
}
