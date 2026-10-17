import assert from 'node:assert/strict';
import { isDeepStrictEqual } from 'node:util';
import { describe, it } from 'node:test';
import { BattleSession } from '../src/engine/BattleSession.ts';
import { replayMatch } from '../src/engine/replay.ts';
import { Rng } from '../src/engine/rng.ts';
import { getPet } from '../src/data/petCatalog.ts';
import type { BattleEvent, Command, PlayerId } from '../src/engine/types.ts';
import { ofType, ready } from './helpers.ts';

function session(p1: [string, string], p2: [string, string], lagCompensationMs = 200): BattleSession {
  const s = new BattleSession({
    matchId: 'LAG',
    seed: 5,
    lagCompensationMs,
    players: {
      p1: { userId: 'A', pets: [getPet(p1[0]), getPet(p1[1])] },
      p2: { userId: 'B', pets: [getPet(p2[0]), getPet(p2[1])] },
    },
  });
  s.start();
  s.advance(500);
  ready(s, 'p1');
  ready(s, 'p2');
  s.advance(100); // validity snapshots with both skills ready
  return s;
}

const run = (s: BattleSession, ...commands: Command[]): BattleEvent[] => {
  for (const c of commands) s.submit(c);
  return s.tick().events;
};

describe('lag compensation', () => {
  it('honours a cast pressed before an in-flight stun landed', () => {
    const s = session(['puppy_leash', 'piglet_leash'], ['zorbnik_leash', 'piglet_leash']);
    const pressedAt = s.elapsedMs - 10;
    run(s, { type: 'CAST_SKILL', playerId: 'p2' }); // Stun Ray lands on p1
    assert.equal(s.activePet('p1').has('STUN'), true);

    const events = run(s, { type: 'CAST_SKILL', playerId: 'p1', atMs: pressedAt });
    const comp = ofType(events, 'LAG_COMPENSATED')[0];
    assert.equal(comp.reason, 'STUNNED');
    assert.equal(comp.lagMs, 60);
    assert.equal(ofType(events, 'SKILL_CAST')[0].actor.player, 'p1');
    assert.equal(ofType(events, 'ACTION_REJECTED').length, 0);
  });

  it('rejects inputs pressed after the stun, without a timestamp, or outside the window', () => {
    const cases: [string, (s: BattleSession, stunAt: number) => number | undefined][] = [
      ['after the stun', (s) => s.elapsedMs - 1],
      ['no timestamp', () => undefined],
      ['older than the window', (_s, stunAt) => stunAt - 10],
    ];
    for (const [name, atMs] of cases) {
      const s = session(['puppy_leash', 'piglet_leash'], ['zorbnik_leash', 'piglet_leash'], name === 'older than the window' ? 100 : 200);
      const stunAt = s.elapsedMs;
      run(s, { type: 'CAST_SKILL', playerId: 'p2' });
      s.advance(name === 'older than the window' ? 150 : 0);
      const events = run(s, { type: 'CAST_SKILL', playerId: 'p1', atMs: atMs(s, stunAt) });
      assert.equal(ofType(events, 'ACTION_REJECTED')[0]?.reason, 'STUNNED', name);
      assert.equal(ofType(events, 'LAG_COMPENSATED').length, 0, name);
    }
  });

  it('never compensates a player against their own earlier action (double press)', () => {
    const s = session(['puppy_leash', 'piglet_leash'], ['piglet_leash', 'puddy_leash']);
    const at = s.elapsedMs - 20;
    const events = run(s, { type: 'CAST_SKILL', playerId: 'p1', atMs: at }, { type: 'CAST_SKILL', playerId: 'p1', atMs: at });
    assert.equal(ofType(events, 'SKILL_CAST').length, 1);
    assert.equal(ofType(events, 'ACTION_REJECTED')[0].reason, 'GLOBAL_COOLDOWN');
    const later = run(s, { type: 'CAST_SKILL', playerId: 'p1', atMs: at + 5 });
    assert.equal(ofType(later, 'ACTION_REJECTED')[0].reason, 'GLOBAL_COOLDOWN');
  });

  it('does not compensate when the active pet changed in between (forced swap)', () => {
    const s = session(['puppy_leash', 'piglet_leash'], ['calf_leash', 'puddy_leash']);
    const pressedAt = s.elapsedMs - 10;
    run(s, { type: 'CAST_SKILL', playerId: 'p2' }); // Trample forces p1 to swap
    const events = run(s, { type: 'CAST_SKILL', playerId: 'p1', atMs: pressedAt });
    assert.equal(ofType(events, 'ACTION_REJECTED')[0].reason, 'SWAP_LOCK');
  });

  it('compensates a swap that a root interrupted in flight', () => {
    const s = session(['puppy_leash', 'piglet_leash'], ['seahorse_companion', 'puddy_leash']);
    const pressedAt = s.elapsedMs - 10;
    run(s, { type: 'CAST_SKILL', playerId: 'p2' }); // Bubble Trap roots p1
    const events = run(s, { type: 'SWAP_PET', playerId: 'p1', atMs: pressedAt });
    assert.equal(ofType(events, 'LAG_COMPENSATED')[0].reason, 'ROOTED');
    assert.equal(s.players.p1.activeIndex, 1);
  });

  it('resolves same-tick inputs in the order they were pressed, not received', () => {
    const s = session(['puppy_leash', 'piglet_leash'], ['puppy_leash', 'piglet_leash']);
    const t = s.elapsedMs;
    const events = run(s, { type: 'CAST_SKILL', playerId: 'p2', atMs: t - 5 }, { type: 'CAST_SKILL', playerId: 'p1', atMs: t - 40 });
    assert.deepEqual(ofType(events, 'SKILL_CAST').map((e) => e.actor.player), ['p1', 'p2']);
    assert.deepEqual(s.commandLog.slice(-2).map((c) => c.command.playerId), ['p1', 'p2']);
  });

  it('can be disabled', () => {
    const s = session(['puppy_leash', 'piglet_leash'], ['zorbnik_leash', 'piglet_leash'], 0);
    const pressedAt = s.elapsedMs - 10;
    run(s, { type: 'CAST_SKILL', playerId: 'p2' });
    assert.equal(ofType(run(s, { type: 'CAST_SKILL', playerId: 'p1', atMs: pressedAt }), 'ACTION_REJECTED')[0].reason, 'STUNNED');
  });
});

describe('deterministic replay', () => {
  it('re-simulates a noisy match tick for tick from seed + command log', () => {
    const config = {
      matchId: 'REPLAY',
      seed: 99,
      lagCompensationMs: 200,
      players: {
        p1: { userId: 'A', pets: [getPet('zorbnik_leash'), getPet('lucky_pendant')] as const },
        p2: { userId: 'B', pets: [getPet('rainbow_kite'), getPet('seahorse_companion')] as const },
      },
    };
    const original = new BattleSession({ ...config, players: { p1: { ...config.players.p1, pets: [...config.players.p1.pets] }, p2: { ...config.players.p2, pets: [...config.players.p2.pets] } } });
    original.start();
    const rng = new Rng(3);
    const states = new Map<number, unknown>();
    while (original.status === 'IN_PROGRESS') {
      for (const id of ['p1', 'p2'] as PlayerId[]) {
        if (rng.chance(0.06)) {
          const atMs = Math.max(0, original.elapsedMs - rng.int(0, 180));
          original.submit(rng.chance(0.7) ? { type: 'CAST_SKILL', playerId: id, atMs } : { type: 'SWAP_PET', playerId: id, atMs });
        }
      }
      const { tick } = original.tick();
      states.set(tick, original.getState());
      if (tick === 900) original.forfeit('p2');
    }

    let compared = 0;
    const replay = replayMatch(
      { ...config, players: { p1: { userId: 'A', pets: [getPet('zorbnik_leash'), getPet('lucky_pendant')] }, p2: { userId: 'B', pets: [getPet('rainbow_kite'), getPet('seahorse_companion')] } } },
      original.commandLog,
      (result, s) => {
        compared++;
        assert.ok(isDeepStrictEqual(s.getState(), states.get(result.tick)), `tick ${result.tick} diverged`);
      },
    );
    assert.equal(compared, original.tickCount);
    assert.deepEqual(replay.getState(), original.getState());
    assert.equal(replay.endReason, 'FORFEIT');
  });
});
