/**
 * Bot-vs-bot stress simulation over real WebSockets with artificial latency.
 *
 *   npm run sim                                   # default scenario suite
 *   npm run sim -- --matches 10 --latency 30,150 --jitter 40 --time-scale 1
 *   npm run sim -- --parallel 8 --matches 16      # many rooms at once
 *
 * Matches have no timer; a match still running after --surrender-after match
 * seconds is ended by the side that is behind giving up (LEAVE_ROOM).
 * Every match is verified: deterministic replay of each tick, state invariants,
 * K.O./surrender winner rules and identical state on both clients. Exit code 1 on failure.
 */
import { parseArgs } from 'node:util';
import { Rng } from '../src/engine/rng.ts';
import { GameServer } from '../src/server/GameServer.ts';
import type { Strategy } from '../src/sim/BotClient.ts';
import { runMatch, type MatchReport, type MatchSpec } from '../src/sim/simulation.ts';
import { randomTeam } from '../src/sim/teams.ts';

const { values } = parseArgs({
  options: {
    matches: { type: 'string', default: '' },
    latency: { type: 'string', default: '25,120' },
    jitter: { type: 'string', default: '20' },
    'time-scale': { type: 'string', default: '4' },
    'surrender-after': { type: 'string', default: '240' },
    parallel: { type: 'string', default: '1' },
    seed: { type: 'string', default: '7' },
    json: { type: 'boolean', default: false },
  },
});

const [lat1, lat2] = values.latency.split(',').map(Number);
const jitter = Number(values.jitter);
const timeScale = Number(values['time-scale']);
const seed = Number(values.seed);
const surrenderAfterSec = Number(values['surrender-after']);
const net = (ms: number) => ({ latencyMs: ms, jitterMs: jitter });

/** Hand-picked matchups that exercise the trickiest mechanics, then random teams. */
const SCENARIOS: Omit<MatchSpec, 'latency'>[] = [
  {
    label: 'stun war (lag compensation)',
    pets: [[['zorbnik_leash', 'flying_bell', 'electro_magnifying_glass'], ['mid_pacific_owl', 'sonar_bracelet', 'chick_leash']],
      [['penguin_leash', 'magical_carrot', 'seahorse_companion'], ['robo_shark', 'water_balloon', 'blue_pet_tyrannosaurus']]],
    strategies: ['aggressive', 'aggressive'],
  },
  {
    label: 'burst K.O. + forced swap',
    pets: [[['14devil_s_friendly_doggy_leash', 'calf_leash', 'pet_bunny'], ['growmoji_s_little_friend', 'moose_cap', 'puppy_leash']],
      [['cloud_rabbit', 'butterfly_leash', 'green_floaty_balloon'], ['onisim_s_genie', 'lucky_pendant', 'pineapple_kite']]],
  },
  {
    label: 'weather + possession',
    pets: [[['leashed_silkworm_green', 'zombie_hound', 'dryad'], ['wolf_tamer_s_glove', 'rhino_horn', 'puddy_leash']],
      [['spiritual_resonator', 'thinking_cap', 'haunted_pants'], ['death_s_scarf', 'leashed_silkworm_purple', 'rainbow_kite']]],
  },
  {
    label: 'quick match, DoT vs heal',
    pets: [[['fiery_dragon_leash', 'fire_ants', 'magma_salamander'], ['hot_pepper_leash', 'flame_sprite', 'leashed_silkworm_red']],
      [['piglet_leash', 'dryad', 'mini_mammoth_leash'], ['pet_burrito', 'mickeymay_leash', 'leashed_silkworm_grey']]],
    mode: 'quick',
  },
  {
    label: 'disconnect -> forfeit',
    pets: [[['puppy_leash', 'pet_bunny', 'puddy_leash'], ['moose_cap', 'unicorn_garland', 'calf_leash']],
      [['fire_elemental', 'red_pet_apatosaurus', 'phoenix_pendant'], ['red_pet_tyrannosaurus', 'red_pet_pterosaurus', 'fire_ants']]],
    dropSecondAfterMs: 1500,
  },
  {
    label: 'lag spike 400ms',
    pets: [[['robo_shark', 'magical_carrot', 'leashed_silkworm_blue'], ['baby_turtle', 'blue_pet_pteranodon', 'water_balloon']],
      [['grey_pet_tyrannosaurus', 'grey_pet_apatosaurus', 'cosmic_unicorn_bracelet'], ['haunted_synthoid', 'pineapple_blump_pet', 'chick_leash']]],
    lagSpike: { afterMs: 2000, forMs: 2500, profile: { latencyMs: 400, jitterMs: 80 } },
  },
  {
    label: 'chaos input spam',
    pets: [[['mini_growtopian', 'pet_leprechaun', 'brown_pet_triceratops'], ['lil_sheepers', 'prickly_pet', 'tumbleweed_attractor']],
      [['betty_bluetooth_doll', 'rainbow_kite', 'playful_wind_sprite'], ['discoball_companion', 'pet_hatchley', 'lovebird_pendant']]],
    strategies: ['chaos', 'tactical'],
  },
];

function buildSpecs(count: number): MatchSpec[] {
  const rng = new Rng(seed);
  const strategies: Strategy[] = ['aggressive', 'tactical'];
  return Array.from({ length: count }, (_, i) => {
    const base = SCENARIOS[i] ?? {
      label: `random #${i - SCENARIOS.length + 1}`,
      pets: [randomTeam(rng), randomTeam(rng)] as MatchSpec['pets'],
      strategies: [rng.pick(strategies), rng.pick(strategies)] as [Strategy, Strategy],
    };
    return { ...base, latency: [net(lat1), net(lat2)], seed: seed + i, surrenderAfterMs: (surrenderAfterSec * 1000) / timeScale };
  });
}

function printReport(r: MatchReport, i: number): void {
  const [a, b] = r.bots;
  const status = r.passed ? 'PASS' : 'FAIL';
  const ending = r.surrendered ? `${r.surrendered} gave up` : (r.reason ?? '-');
  console.log(
    `${String(i + 1).padStart(2)}. [${status}] ${r.label.padEnd(30)} ${String(r.winner ?? '-').padEnd(4)} ${ending.padEnd(11)} ` +
      `ticks=${String(r.ticks).padStart(4)} synced=${String(r.syncedTicks).padStart(4)} ` +
      `rtt=${a.rttMs}/${b.rttMs}ms act=${a.actionLatencyMs}/${b.actionLatencyMs}ms ` +
      `sent=${a.actionsSent}/${b.actionsSent} rej=${a.rejected}/${b.rejected} comp=${a.compensated}/${b.compensated} ` +
      `replay=${a.replay?.ticksCompared ?? 0}/${b.replay?.ticksCompared ?? 0}`,
  );
  for (const f of r.failures) console.log(`      ! ${f}`);
}

const server = new GameServer({
  port: 0,
  host: '127.0.0.1',
  staticDir: null,
  pingIntervalMs: 500,
  managerOptions: { timeScale, graceMs: 1000 },
});
const { port } = await server.listen();
const specs = buildSpecs(values.matches ? Number(values.matches) : SCENARIOS.length);
const parallel = Math.max(1, Number(values.parallel));
console.log(`Simulating ${specs.length} matches on :${port} | latency ${lat1}/${lat2}ms ±${jitter} | time x${timeScale} | parallel ${parallel}\n`);

const reports: MatchReport[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: parallel }, async () => {
    while (next < specs.length) {
      const i = next++;
      const report = await runMatch(port, specs[i]);
      reports[i] = report;
      if (!values.json) printReport(report, i);
    }
  }),
);
await server.close();

const failed = reports.filter((r) => !r.passed).length;
if (values.json) console.log(JSON.stringify(reports, null, 2));
const endingOf = (r: MatchReport) => (r.surrendered ? 'SURRENDER' : (r.reason ?? 'none'));
const reasons = reports.reduce<Record<string, number>>((acc, r) => ((acc[endingOf(r)] = (acc[endingOf(r)] ?? 0) + 1), acc), {});
const compensated = reports.reduce((n, r) => n + r.bots[0].compensated + r.bots[1].compensated, 0);
console.log(`\n${reports.length - failed}/${reports.length} matches passed | endings ${JSON.stringify(reasons)} | lag-compensated actions: ${compensated}`);
process.exit(failed ? 1 : 0);
