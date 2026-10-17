import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseClientMessage } from '../../src/server/protocol.ts';

const parse = (v: unknown) => parseClientMessage(typeof v === 'string' ? v : JSON.stringify(v));

describe('parseClientMessage', () => {
  it('accepts the PRD CAST_SKILL message', () => {
    const r = parse({ event: 'CAST_SKILL', match_id: 'MATCH_88392', player_id: 'P1_USER', pet_index: 0, timestamp: 1729168800000 });
    assert.deepEqual(r, {
      ok: true,
      message: { event: 'CAST_SKILL', match_id: 'MATCH_88392', player_id: 'P1_USER', pet_index: 0, ability_index: undefined, timestamp: 1729168800000 },
    });
  });

  it('accepts lobby messages', () => {
    const team = [['a', 'b', 'c'], ['d', 'e', 'f']];
    assert.equal(parse({ event: 'CREATE_ROOM', user_id: 'A', pets: team }).ok, true);
    assert.equal(parse({ event: 'JOIN_ROOM', room_code: '012345', user_id: 'B', pets: team }).ok, true);
    assert.equal(parse({ event: 'QUICK_MATCH', user_id: 'B', pets: team, mmr: 1200 }).ok, true);
    assert.deepEqual(parse({ event: 'CAST_SKILL', ability_index: 2 }), { ok: true, message: { event: 'CAST_SKILL', match_id: undefined, player_id: undefined, pet_index: undefined, ability_index: 2, timestamp: undefined } });
    assert.equal(parse({ event: 'SWAP_PET' }).ok, true);
  });

  it('rejects malformed input with a reason', () => {
    assert.deepEqual(parse('not json'), { ok: false, code: 'BAD_MESSAGE', message: 'Message is not valid JSON' });
    assert.equal(parse({ foo: 1 }).ok, false);
    assert.deepEqual(parse({ event: 'DANCE' }), { ok: false, code: 'UNKNOWN_EVENT', message: 'Unknown event "DANCE"' });
    const bad = [
      { event: 'CREATE_ROOM', user_id: '', pets: [['a', 'b', 'c'], ['d', 'e', 'f']] },
      { event: 'CREATE_ROOM', user_id: 'A', pets: ['a', 'b'] },
      { event: 'CREATE_ROOM', user_id: 'A', pets: [['a', 'b'], ['d', 'e', 'f']] },
      { event: 'CREATE_ROOM', user_id: 'A', pets: [['a', 'b', 'c']] },
      { event: 'CREATE_ROOM', user_id: 'x'.repeat(65), pets: [['a', 'b', 'c'], ['d', 'e', 'f']] },
      { event: 'JOIN_ROOM', room_code: '12345', user_id: 'A', pets: [['a', 'b', 'c'], ['d', 'e', 'f']] },
      { event: 'CAST_SKILL', ability_index: 3 },
      { event: 'CAST_SKILL', pet_index: 2 },
      { event: 'CAST_SKILL', timestamp: 'now' },
      { event: 'PING' },
    ];
    for (const m of bad) {
      const r = parse(m);
      assert.equal(r.ok, false, JSON.stringify(m));
      if (!r.ok) assert.equal(r.code, 'BAD_MESSAGE');
    }
  });
});
