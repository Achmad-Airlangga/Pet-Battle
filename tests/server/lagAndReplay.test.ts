import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GameStateSnapshot } from '../../src/engine/types.ts';
import { verifyReplay, checkOutcome } from '../../src/sim/verify.ts';
import { AIR_TEAM, WATER_TEAM, harness } from './helpers.ts';

describe('server lag compensation input', () => {
  it('turns client timestamps into match time, capped by measured RTT', () => {
    const h = harness();
    const { a, b, code } = h.startMatch();
    const session = h.manager.getRoom(code)!.session!;
    h.advance(1000);
    const lastAt = () => {
      h.advance(50);
      const entry = session.commandLog.at(-1)!;
      return entry.command.type === 'FORFEIT' ? null : entry.command.atMs;
    };

    a.rttMs = 100; // cap = min(200, 100/2 + 50) = 100ms
    let elapsed = session.elapsedMs;
    h.send(a, { event: 'CAST_SKILL', timestamp: h.clock.t - 500 });
    assert.equal(lastAt(), elapsed - 100);

    elapsed = session.elapsedMs;
    h.send(a, { event: 'SWAP_PET', timestamp: h.clock.t + 300 }); // clock ahead: no compensation
    assert.equal(lastAt(), elapsed);

    elapsed = session.elapsedMs;
    h.send(b, { event: 'CAST_SKILL', timestamp: h.clock.t - 150 }); // RTT unknown: window cap 200ms
    assert.equal(lastAt(), elapsed - 150);

    h.send(b, { event: 'SWAP_PET' });
    assert.equal(lastAt(), undefined);
  });

  it('scales the claimed lag into match time when the room runs time-scaled', () => {
    const h = harness({ timeScale: 4 });
    const { a, code } = h.startMatch();
    const session = h.manager.getRoom(code)!.session!;
    h.advance(250); // = 1000ms of match time
    assert.equal(session.elapsedMs, 1000);
    h.send(a, { event: 'CAST_SKILL', timestamp: h.clock.t - 40 });
    h.advance(50);
    const entry = session.commandLog.at(-1)!;
    assert.equal(entry.command.type !== 'FORFEIT' && entry.command.atMs, 1000 - 160);
  });
});

describe('MATCH_END replay', () => {
  it('lets a client re-simulate the match and match every tick it received', () => {
    const h = harness();
    const { a, b } = h.startMatch(AIR_TEAM, WATER_TEAM);
    for (let i = 0; i < 40; i++) {
      h.advance(250);
      h.send(i % 3 ? a : b, { event: i % 4 ? 'CAST_SKILL' : 'SWAP_PET', ability_index: i % 3, timestamp: h.clock.t - 30 });
    }
    h.send(b, { event: 'LEAVE_ROOM' });

    const ticks = a.all('STATE_TICK').map((m) => m.tick);
    assert.equal(new Set(ticks).size, ticks.length, 'no tick number is broadcast twice');
    const states = new Map<number, GameStateSnapshot>(a.all('STATE_TICK').map((m) => [m.tick, m.state]));
    const end = a.last('MATCH_END');
    assert.equal(end.reason, 'FORFEIT');
    assert.deepEqual(end.replay.players.p2.pets, WATER_TEAM);
    const report = verifyReplay(end, states);
    assert.deepEqual(report.mismatches, []);
    assert.equal(report.ticksCompared, ticks.length);
    assert.deepEqual(checkOutcome(end), []);
    void b;
  });
});
