import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { GameServer } from '../../src/server/GameServer.ts';
import { runMatch, type MatchReport } from '../../src/sim/simulation.ts';

/** Two bots over real sockets with artificial latency; the server runs 10x faster. */
describe('bot vs bot simulation over real WebSockets', () => {
  let server: GameServer;
  let port: number;

  before(async () => {
    server = new GameServer({
      port: 0,
      host: '127.0.0.1',
      staticDir: null,
      pingIntervalMs: 200,
      managerOptions: { timeScale: 10, graceMs: 300 },
    });
    ({ port } = await server.listen());
  });

  after(async () => {
    await server.close();
  });

  const expectPassed = (r: MatchReport) => assert.ok(r.passed, `${r.label} failed:\n  ${r.failures.join('\n  ')}`);

  it('plays to a K.O. win and both clients verify the whole match', async () => {
    const r = await runMatch(port, {
      label: 'K.O.',
      pets: [
        [['14devil_s_friendly_doggy_leash', 'pet_bunny', 'puppy_leash'], ['moose_cap', 'calf_leash', 'puddy_leash']],
        [['baby_bunny', 'piglet_leash', 'pet_burrito'], ['mickeymay_leash', 'wolf_tamer_s_glove', 'mini_mammoth_leash']],
      ],
      strategies: ['aggressive', 'idle'],
      latency: [{ latencyMs: 10, jitterMs: 5 }, { latencyMs: 60, jitterMs: 20 }],
    }, 30_000);
    expectPassed(r);
    assert.equal(r.reason, 'KO');
    assert.equal(r.winner, 'p1');
    assert.equal(r.syncedTicks, r.ticks, 'both clients saw every tick');
    assert.equal(r.bots[0].replay?.ticksCompared, r.ticks);
    assert.equal(r.bots[1].replay?.ticksCompared, r.ticks);
    assert.ok(r.bots[1].rttMs >= 120, `latency proxy applied (rtt ${r.bots[1].rttMs}ms)`);
  });

  it('a client that drops and never returns forfeits after the grace period', async () => {
    const r = await runMatch(port, {
      label: 'drop',
      pets: [
        [['puppy_leash', 'pet_bunny', 'puddy_leash'], ['moose_cap', 'calf_leash', 'unicorn_garland']],
        [['penguin_leash', 'water_balloon', 'robo_shark'], ['baby_turtle', 'magical_carrot', 'seahorse_companion']],
      ],
      latency: [{ latencyMs: 20 }, { latencyMs: 40 }],
      dropSecondAfterMs: 400,
    }, 15_000);
    expectPassed(r);
    assert.equal(r.reason, 'FORFEIT');
    assert.equal(r.winner, 'p1');
  });
});
