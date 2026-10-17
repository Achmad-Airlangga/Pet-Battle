/**
 * Independent checks a client can run on a finished match:
 *  - replay: re-simulate from seed + command log and compare every tick it received
 *  - invariants: every state is internally consistent
 *  - outcome: the declared winner matches the final state (K.O. / timeout rules)
 *  - sync: two clients received identical states for every tick
 */
import { isDeepStrictEqual } from 'node:util';
import { getPetInfo } from '../data/petRepository.ts';
import { SWAP_COOLDOWN_MS } from '../engine/constants.ts';
import { replayMatch } from '../engine/replay.ts';
import { PLAYER_IDS, type GameStateSnapshot, type PlayerId } from '../engine/types.ts';
import { redactState } from '../engine/visibility.ts';
import type { ServerMessage } from '../server/protocol.ts';

type MatchEnd = Extract<ServerMessage, { event: 'MATCH_END' }>;

const battlePet = (ids: readonly string[]) => ids.map((id) => getPetInfo(id));

export interface ReplayReport {
  ticksReplayed: number;
  ticksCompared: number;
  mismatches: string[];
}

export function verifyReplay(end: MatchEnd, states: ReadonlyMap<number, GameStateSnapshot>): ReplayReport {
  const r = end.replay;
  const mismatches: string[] = [];
  let compared = 0;
  const session = replayMatch(
    {
      matchId: end.match_id,
      seed: r.seed,
      lagCompensationMs: r.lag_compensation_ms,
      players: {
        p1: { userId: r.players.p1.user_id, pets: [battlePet(r.players.p1.pets[0]), battlePet(r.players.p1.pets[1])] },
        p2: { userId: r.players.p2.user_id, pets: [battlePet(r.players.p2.pets[0]), battlePet(r.players.p2.pets[1])] },
      },
    },
    r.commands,
    (result, s) => {
      const recorded = states.get(result.tick);
      if (!recorded) return;
      compared++;
      // A client only ever sees its own secret statuses, so compare the shared part.
      if (mismatches.length < 5 && !isDeepStrictEqual(redactState(s.getState(), null), redactState(recorded, null))) mismatches.push(`tick ${result.tick}: replayed state differs from received state`);
    },
    r.final_tick,
  );
  if (!isDeepStrictEqual(session.getState(), end.state)) mismatches.push('final replayed state differs from MATCH_END state');
  if (session.winner !== end.winner || session.endReason !== end.reason) {
    mismatches.push(`replay ended ${session.winner}/${session.endReason}, server said ${end.winner}/${end.reason}`);
  }
  return { ticksReplayed: session.tickCount, ticksCompared: compared, mismatches };
}

export function checkInvariants(states: ReadonlyMap<number, GameStateSnapshot>): string[] {
  const problems: string[] = [];
  const add = (msg: string) => problems.length < 10 && problems.push(msg);
  let prevClock = -Infinity;
  for (const [tick, s] of [...states].sort((a, b) => a[0] - b[0])) {
    if (s.tick !== tick) add(`tick ${tick}: state.tick=${s.tick}`);
    if (s.elapsed_sec < prevClock) add(`tick ${tick}: match clock went backwards`);
    prevClock = s.elapsed_sec;
    for (const id of PLAYER_IDS) {
      const p = s.players[id];
      if (p.swap_cooldown_remaining < 0 || p.swap_cooldown_remaining > SWAP_COOLDOWN_MS / 1000) add(`tick ${tick} ${id}: swap cooldown ${p.swap_cooldown_remaining}`);
      p.pets.forEach((pet, i) => {
        if (pet.current_hp < 0 || pet.current_hp > pet.max_hp) add(`tick ${tick} ${id}#${i}: hp ${pet.current_hp}/${pet.max_hp}`);
        if (pet.is_ko !== (pet.current_hp === 0)) add(`tick ${tick} ${id}#${i}: is_ko=${pet.is_ko} with hp ${pet.current_hp}`);
        if (pet.abilities.some((a) => a.cooldown_remaining < 0)) add(`tick ${tick} ${id}#${i}: negative cooldown`);
        for (const st of [...pet.active_buffs, ...pet.active_debuffs]) {
          if (st.duration !== null && st.duration < 0) add(`tick ${tick} ${id}#${i}: ${st.type} negative duration`);
        }
        if (pet.is_ko && pet.active_buffs.length + pet.active_debuffs.length > 0) add(`tick ${tick} ${id}#${i}: K.O. pet still has statuses`);
      });
      const active = p.pets[p.active_pet_index];
      if (s.status === 'IN_PROGRESS' && active.is_ko && p.pets.some((x) => !x.is_ko)) add(`tick ${tick} ${id}: K.O. pet left active while reserve alive`);
    }
  }
  return problems;
}

export function checkOutcome(end: MatchEnd): string[] {
  const s = end.state;
  const problems: string[] = [];
  const allKo = (id: PlayerId) => s.players[id].pets.every((p) => p.is_ko);
  if (s.status !== 'FINISHED') problems.push(`final status ${s.status}`);
  if (s.winner !== end.winner) problems.push('state.winner differs from MATCH_END.winner');
  if (end.reason === 'KO') {
    if (end.winner === 'DRAW') {
      if (!allKo('p1') || !allKo('p2')) problems.push('K.O. draw but a side still has a pet standing');
    } else {
      const loser: PlayerId = end.winner === 'p1' ? 'p2' : 'p1';
      if (!allKo(loser)) problems.push(`K.O. win but ${loser} still has a pet standing`);
      if (allKo(end.winner)) problems.push(`K.O. win but winner ${end.winner} has no pet standing`);
    }
  } else if (end.winner === 'DRAW') {
    problems.push('a surrender cannot end in a draw');
  }
  return problems;
}

/** Two clients must have received identical state for every common tick (apart from each side's secret statuses). */
export function compareClients(a: ReadonlyMap<number, GameStateSnapshot>, b: ReadonlyMap<number, GameStateSnapshot>): { common: number; onlyA: number; onlyB: number; diverged: number[] } {
  let common = 0;
  const diverged: number[] = [];
  for (const [tick, sa] of a) {
    const sb = b.get(tick);
    if (!sb) continue;
    common++;
    if (!isDeepStrictEqual(redactState(sa, null), redactState(sb, null))) diverged.push(tick);
  }
  return { common, onlyA: a.size - common, onlyB: b.size - common, diverged };
}
