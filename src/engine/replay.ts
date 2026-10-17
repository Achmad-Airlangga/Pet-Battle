import { BattleSession, type BattleConfig } from './BattleSession.ts';
import { TICK_RATE_HZ } from './constants.ts';
import type { LoggedCommand, TickResult } from './types.ts';

/** Safety stop when the final tick is unknown: 30 minutes past the last command. */
const DEFAULT_TAIL_TICKS = 30 * 60 * TICK_RATE_HZ;

/**
 * Re-simulates a match from its config (incl. seed) and command log.
 * The engine is deterministic, so every tick must reproduce the original
 * state exactly; `onTick` lets a caller compare tick by tick. Matches have no
 * timer, so pass `finalTick` (sent in MATCH_END) to know where to stop.
 */
export function replayMatch(
  config: BattleConfig,
  log: readonly LoggedCommand[],
  onTick?: (result: TickResult, session: BattleSession) => void,
  finalTick?: number,
): BattleSession {
  const session = new BattleSession(config);
  session.start();
  const byTick = new Map<number, LoggedCommand[]>();
  for (const entry of log) {
    const list = byTick.get(entry.tick) ?? [];
    list.push(entry);
    byTick.set(entry.tick, list);
  }
  const forfeitsAfter = (tick: number) => {
    for (const entry of byTick.get(tick) ?? []) {
      if (entry.command.type === 'FORFEIT') session.forfeit(entry.command.playerId);
    }
  };

  forfeitsAfter(0);
  const lastTick = finalTick ?? Math.max(0, ...log.map((e) => e.tick)) + DEFAULT_TAIL_TICKS;
  for (let t = 1; session.status === 'IN_PROGRESS' && t <= lastTick; t++) {
    for (const entry of byTick.get(t) ?? []) {
      if (entry.command.type !== 'FORFEIT') session.submit(entry.command);
    }
    const result = session.tick();
    onTick?.(result, session);
    forfeitsAfter(t);
  }
  return session;
}
