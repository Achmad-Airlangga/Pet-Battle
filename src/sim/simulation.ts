import { isDeepStrictEqual } from 'node:util';
import type { MatchEndReason, PlayerId } from '../engine/types.ts';
import type { TeamPick } from '../server/protocol.ts';
import { BotClient, type BotStats, type Strategy } from './BotClient.ts';
import { LatencyProxy, type LatencyProfile } from './LatencyProxy.ts';
import { checkInvariants, checkOutcome, compareClients, verifyReplay, type ReplayReport } from './verify.ts';

export interface MatchSpec {
  label?: string;
  /** Each side's Battle Leash: 2 battle pets x 3 pet ids. */
  pets: [TeamPick, TeamPick];
  strategies?: [Strategy, Strategy];
  /** Network profile of each bot's link to the server. */
  latency: [LatencyProfile, LatencyProfile];
  mode?: 'private' | 'quick';
  /** Kill bot 2's socket this long after MATCH_START (disconnect / forfeit scenario). */
  dropSecondAfterMs?: number;
  /** Temporary lag spike on bot 1's link. */
  lagSpike?: { afterMs: number; forMs: number; profile: LatencyProfile };
  /**
   * Matches have no timer. If neither side is K.O. this long (wall ms) after
   * MATCH_START, the side with less HP left surrenders (LEAVE_ROOM), as a
   * human would in a stalemate.
   */
  surrenderAfterMs?: number;
  seed?: number;
}

export interface BotSummary {
  name: string;
  player: PlayerId | null;
  ticks: number;
  tickGaps: number;
  actionsSent: number;
  rejected: number;
  compensated: number;
  rttMs: number;
  actionLatencyMs: number;
  replay: ReplayReport | null;
}

export interface MatchReport {
  label: string;
  matchId: string | null;
  winner: PlayerId | 'DRAW' | null;
  reason: MatchEndReason | null;
  ticks: number;
  wallMs: number;
  bots: [BotSummary, BotSummary];
  syncedTicks: number;
  /** Which bot gave up a stalled match, if any. */
  surrendered: PlayerId | null;
  failures: string[];
  passed: boolean;
}

/** The side with the lower remaining HP share in the latest state this bot saw. */
function behindSide(bot: BotClient): PlayerId | null {
  const latest = bot.states.get(Math.max(0, ...bot.states.keys()));
  if (!latest) return null;
  const share = (id: PlayerId) => latest.players[id].pets.reduce((a, p) => a + p.current_hp / p.max_hp, 0);
  return share('p1') <= share('p2') ? 'p1' : 'p2';
}

const median = (xs: number[]) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);

function summarize(bot: BotClient, replay: ReplayReport | null): BotSummary {
  const s: BotStats = bot.stats;
  return {
    name: bot.name,
    player: bot.you,
    ticks: s.ticksReceived,
    tickGaps: s.tickGaps,
    actionsSent: s.actionsSent,
    rejected: Object.values(s.rejected).reduce((a, b) => a + b, 0),
    compensated: s.compensated,
    rttMs: Math.round(median(s.rttSamples)),
    actionLatencyMs: Math.round(median(s.actionLatencyMs)),
    replay,
  };
}

/** Plays one full match between two bots through latency proxies and verifies it. */
export async function runMatch(serverPort: number, spec: MatchSpec, timeoutMs = 180_000): Promise<MatchReport> {
  const label = spec.label ?? `${spec.pets[0].map((b) => b[0]).join('+')} vs ${spec.pets[1].map((b) => b[0]).join('+')}`;
  const proxies = spec.latency.map((p) => new LatencyProxy(serverPort, p));
  const ports = await Promise.all(proxies.map((p) => p.listen()));
  const seed = spec.seed ?? 1;
  const bots = [0, 1].map(
    (i) =>
      new BotClient({
        url: `ws://127.0.0.1:${ports[i]}/ws`,
        name: `Bot${i + 1}`,
        pets: spec.pets[i],
        strategy: spec.strategies?.[i] ?? 'tactical',
        seed: seed * 31 + i,
      }),
  ) as [BotClient, BotClient];
  const failures: string[] = [];
  const started = Date.now();
  const timers: ReturnType<typeof setTimeout>[] = [];
  let surrendered: PlayerId | null = null;

  try {
    await Promise.all(bots.map((b) => b.connect()));
    await Promise.all(bots.map((b) => b.syncClock(5)));

    if (spec.mode === 'quick') {
      bots[0].quickMatch(1000);
      bots[1].quickMatch(1020);
    } else {
      const code = await bots[0].createRoom();
      bots[1].joinRoom(code);
    }
    await Promise.all(bots.map((b) => b.waitFor('MATCH_START', () => true, 10_000)));

    if (spec.dropSecondAfterMs !== undefined) timers.push(setTimeout(() => bots[1].drop(), spec.dropSecondAfterMs));
    if (spec.lagSpike) {
      const { afterMs, forMs, profile } = spec.lagSpike;
      timers.push(setTimeout(() => proxies[0].setProfile(profile), afterMs));
      timers.push(setTimeout(() => proxies[0].setProfile(spec.latency[0]), afterMs + forMs));
    }
    if (spec.surrenderAfterMs !== undefined) {
      timers.push(
        setTimeout(() => {
          if (bots[0].end) return;
          const quitter = behindSide(bots[0]);
          const bot = bots.find((b) => b.you === quitter);
          if (!quitter || !bot) return;
          surrendered = quitter;
          bot.send({ event: 'LEAVE_ROOM' });
        }, spec.surrenderAfterMs),
      );
    }

    await bots[0].waitForEnd(timeoutMs);
    if (spec.dropSecondAfterMs === undefined) await bots[1].waitForEnd(5_000);
  } catch (e) {
    failures.push((e as Error).message);
  } finally {
    timers.forEach(clearTimeout);
  }

  const replays = bots.map((b) => (b.end ? verifyReplay(b.end, b.states) : null));
  bots.forEach((b, i) => {
    const r = replays[i];
    if (r?.mismatches.length) failures.push(`${b.name} replay: ${r.mismatches.join('; ')}`);
    if (b.end) failures.push(...checkOutcome(b.end).map((m) => `${b.name} outcome: ${m}`));
    failures.push(...checkInvariants(b.states).map((m) => `${b.name} invariant: ${m}`));
    if (b.stats.outOfOrder) failures.push(`${b.name}: ${b.stats.outOfOrder} out-of-order ticks`);
    const dropped = i === 1 && spec.dropSecondAfterMs !== undefined;
    if (!dropped && b.stats.tickGaps) failures.push(`${b.name}: ${b.stats.tickGaps} missing ticks`);
    const unexpected = b.stats.errors.filter((e) => !e.startsWith('RATE_LIMITED'));
    if (unexpected.length) failures.push(`${b.name} server errors: ${unexpected.slice(0, 3).join('; ')}`);
  });

  let syncedTicks = 0;
  if (spec.dropSecondAfterMs === undefined) {
    const sync = compareClients(bots[0].states, bots[1].states);
    syncedTicks = sync.common;
    if (sync.diverged.length) failures.push(`clients diverged on ${sync.diverged.length} ticks (first ${sync.diverged[0]})`);
    if (sync.onlyA || sync.onlyB) failures.push(`clients saw different tick sets (${sync.onlyA}/${sync.onlyB} unique)`);
    const [ea, eb] = [bots[0].end, bots[1].end];
    if (ea && eb && !isDeepStrictEqual(ea, eb)) failures.push('the two clients received different MATCH_END messages');
  }

  bots.forEach((b) => b.close());
  await Promise.all(proxies.map((p) => p.close()));

  const end = bots[0].end;
  return {
    label,
    matchId: end?.match_id ?? bots[0].matchId,
    winner: end?.winner ?? null,
    reason: end?.reason ?? null,
    ticks: end?.state.tick ?? 0,
    wallMs: Date.now() - started,
    bots: [summarize(bots[0], replays[0]), summarize(bots[1], replays[1])],
    syncedTicks,
    surrendered,
    failures,
    passed: failures.length === 0,
  };
}
