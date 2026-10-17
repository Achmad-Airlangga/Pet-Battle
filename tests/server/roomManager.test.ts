import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EARTH_TEAM, harness } from './helpers.ts';

describe('private rooms', () => {
  it('CREATE_ROOM + JOIN_ROOM seats both players and starts the match', () => {
    const h = harness();
    const { a, b, code } = h.startMatch();
    assert.match(code, /^\d{6}$/);
    assert.equal(a.last('ROOM_JOINED').player_id, 'p1');
    assert.equal(b.last('ROOM_JOINED').player_id, 'p2');
    const startA = a.last('MATCH_START');
    const startB = b.last('MATCH_START');
    assert.equal(startA.you, 'p1');
    assert.equal(startB.you, 'p2');
    assert.equal(startA.match_id, startB.match_id);
    assert.equal(startA.tick_rate_hz, 20);
    assert.equal(startA.state.players.p2.user_id, 'USER_B');
    assert.equal(startA.state.players.p1.pets[0].current_hp, 150); // full HP reset
    assert.equal(h.manager.getRoom(code)?.status, 'IN_PROGRESS');
  });

  it('broadcasts STATE_TICK to both players every 50ms', () => {
    const h = harness();
    const { a, b } = h.startMatch();
    h.advance(100);
    assert.deepEqual(a.all('STATE_TICK').map((m) => m.tick), [1, 2]);
    assert.deepEqual(b.all('STATE_TICK').map((m) => m.tick), [1, 2]);
    assert.equal(a.last('STATE_TICK').state.elapsed_sec, 0.1);
  });

  it('CAST_SKILL and SWAP_PET are resolved by the server and seen identically by both', () => {
    const h = harness();
    const { a, b } = h.startMatch();
    h.advance(5000); // Swoop starting cooldown
    a.clear();
    b.clear();
    h.send(a, { event: 'CAST_SKILL', pet_index: 0, timestamp: 123 });
    h.advance(50);
    const eventsA = a.last('STATE_TICK').events;
    assert.deepEqual(eventsA, b.last('STATE_TICK').events);
    assert.ok(eventsA.some((e) => e.type === 'SKILL_CAST'));
    assert.equal(a.last('STATE_TICK').state.players.p2.pets[0].current_hp, 131); // 15 x 1.25

    h.send(b, { event: 'SWAP_PET' });
    h.advance(50);
    assert.equal(a.last('STATE_TICK').state.players.p2.active_pet_index, 1);
  });

  it('ACTION_REJECTED is only sent to the player who acted', () => {
    const h = harness();
    const { a, b } = h.startMatch();
    h.send(a, { event: 'CAST_SKILL' }); // still on starting cooldown
    h.advance(50);
    const rejected = a.last('STATE_TICK').events.find((e) => e.type === 'ACTION_REJECTED');
    assert.equal(rejected?.type === 'ACTION_REJECTED' && rejected.reason, 'ON_COOLDOWN');
    assert.equal(b.last('STATE_TICK').events.some((e) => e.type === 'ACTION_REJECTED'), false);
  });

  it('reports errors for invalid requests', () => {
    const h = harness();
    const { a, code } = h.startMatch();
    const c = h.connect();

    h.send(c, { event: 'JOIN_ROOM', room_code: '999999', user_id: 'C', pets: EARTH_TEAM });
    assert.equal(c.last('ERROR').code, h.manager.getRoom('999999') ? 'ROOM_FULL' : 'ROOM_NOT_FOUND');
    h.send(c, { event: 'JOIN_ROOM', room_code: code, user_id: 'C', pets: EARTH_TEAM });
    assert.equal(c.last('ERROR').code, 'ROOM_FULL');
    h.send(c, { event: 'CREATE_ROOM', user_id: 'C', pets: [['puppy_leash', 'puddy_leash', 'missingno'], EARTH_TEAM[1]] });
    assert.equal(c.last('ERROR').code, 'INVALID_PETS');
    h.send(c, { event: 'CAST_SKILL' });
    assert.equal(c.last('ERROR').code, 'NOT_IN_ROOM');
    h.manager.handleRaw(c, '{oops');
    assert.equal(c.last('ERROR').code, 'BAD_MESSAGE');

    h.send(a, { event: 'CREATE_ROOM', user_id: 'A', pets: EARTH_TEAM });
    assert.equal(a.last('ERROR').code, 'ALREADY_IN_ROOM');
    h.send(a, { event: 'CAST_SKILL', match_id: 'MATCH_OTHER' });
    assert.equal(a.last('ERROR').code, 'WRONG_MATCH');
  });

  it('commands in the lobby are rejected; leaving an empty lobby deletes the room', () => {
    const h = harness();
    const a = h.connect();
    h.send(a, { event: 'CREATE_ROOM', user_id: 'A', pets: EARTH_TEAM });
    h.send(a, { event: 'CAST_SKILL' });
    assert.equal(a.last('ERROR').code, 'MATCH_NOT_STARTED');
    assert.equal(h.manager.stats().rooms, 1);
    h.send(a, { event: 'LEAVE_ROOM' });
    assert.equal(a.last('LEFT_ROOM').room_code.length, 6);
    assert.equal(h.manager.stats().rooms, 0);
  });

  it('accepts battle pets that mix elements', () => {
    const h = harness();
    const mixed = [['puppy_leash', 'mid_pacific_owl', 'fiery_dragon_leash'], ['penguin_leash', 'calf_leash', 'zorbnik_leash']];
    const { a } = h.startMatch(mixed as never, EARTH_TEAM);
    assert.deepEqual(a.last('ROOM_JOINED').room.players.p1?.pets, mixed);
    const pet = a.last('MATCH_START').state.players.p1.pets[0];
    assert.equal(pet.element, 'Earth'); // base pet decides the defending element
    assert.deepEqual(pet.abilities.map((x) => x.element), ['Earth', 'Air', 'Fire']);
  });

  it('CAST_SKILL ability_index selects which of the 3 abilities is used', () => {
    const h = harness();
    const { a } = h.startMatch(EARTH_TEAM, EARTH_TEAM);
    h.advance(7500); // all starting cooldowns elapsed
    h.send(a, { event: 'CAST_SKILL', ability_index: 2 });
    h.advance(50);
    const cast = a.last('STATE_TICK').events.find((e) => e.type === 'SKILL_CAST');
    assert.equal(cast?.type === 'SKILL_CAST' && cast.skill, 'Big Sharp Pointy Teeth');
    const abilities = a.last('STATE_TICK').state.players.p1.pets[0].abilities;
    assert.deepEqual(abilities.map((x) => x.cooldown_remaining > 0), [false, false, true]);
  });

  it('relays CHAT to both players with control characters stripped', () => {
    const h = harness();
    const { a, b } = h.startMatch();
    h.send(a, { event: 'CHAT', text: '  gg\n\twp  ' });
    assert.deepEqual(b.last('CHAT'), { event: 'CHAT', player_id: 'p1', user_id: 'USER_A', text: 'gg wp', server_time: 0 });
    assert.equal(a.last('CHAT').text, 'gg wp');
    h.send(a, { event: 'CHAT', text: 'x'.repeat(201) });
    assert.equal(a.last('ERROR').code, 'BAD_MESSAGE');
  });

  it('answers PING with PONG and server time', () => {
    const h = harness();
    const a = h.connect();
    h.clock.t = 777;
    h.send(a, { event: 'PING', timestamp: 42 });
    assert.deepEqual(a.last('PONG'), { event: 'PONG', timestamp: 42, server_time: 777 });
  });
});

describe('disconnects', () => {
  it('a player can REJOIN_ROOM with its token within the grace period', () => {
    const h = harness();
    const { a, b, code } = h.startMatch();
    const token = b.last('ROOM_JOINED').player_token;
    h.manager.disconnect(b);
    assert.equal(a.last('PLAYER_DISCONNECTED').player_id, 'p2');
    h.advance(500);

    const b2 = h.connect();
    h.send(b2, { event: 'REJOIN_ROOM', room_code: code, player_token: 'wrong' });
    assert.equal(b2.last('ERROR').code, 'INVALID_TOKEN');
    h.send(b2, { event: 'REJOIN_ROOM', room_code: code, player_token: token });
    assert.equal(b2.last('ROOM_JOINED').player_id, 'p2');
    assert.equal(b2.last('MATCH_START').you, 'p2'); // full state resync
    assert.equal(a.last('PLAYER_RECONNECTED').player_id, 'p2');

    h.advance(2000);
    assert.equal(h.manager.getRoom(code)?.status, 'IN_PROGRESS');
    h.send(b2, { event: 'SWAP_PET' });
    h.advance(50);
    assert.equal(b2.last('STATE_TICK').state.players.p2.active_pet_index, 1);
  });

  it('a second connection with the same token takes over the seat', () => {
    const h = harness();
    const { b, code } = h.startMatch();
    const b2 = h.connect();
    h.send(b2, { event: 'REJOIN_ROOM', room_code: code, player_token: b.last('ROOM_JOINED').player_token });
    assert.equal(b.last('LEFT_ROOM').room_code, code);
    h.send(b, { event: 'SWAP_PET' });
    assert.equal(b.last('ERROR').code, 'NOT_IN_ROOM');
  });

  it('forfeits a player who does not come back in time', () => {
    const h = harness();
    const { a, code } = h.startMatch();
    h.manager.disconnect(a);
    const b = h.manager.getRoom(code)!;
    h.advance(1000);
    assert.equal(b.status, 'FINISHED');
    assert.equal(b.session?.winner, 'p2');
    assert.equal(b.session?.endReason, 'FORFEIT');
  });

  it('LEAVE_ROOM during a match forfeits it', () => {
    const h = harness();
    const { a, b } = h.startMatch();
    h.send(b, { event: 'LEAVE_ROOM' });
    const end = a.last('MATCH_END');
    assert.equal(end.winner, 'p1');
    assert.equal(end.reason, 'FORFEIT');
  });

  it('a lobby disconnect frees the seat and removes the empty room', () => {
    const h = harness();
    const a = h.connect();
    h.send(a, { event: 'CREATE_ROOM', user_id: 'A', pets: EARTH_TEAM });
    h.manager.disconnect(a);
    assert.deepEqual(h.manager.stats(), { rooms: 0, clients: 0, queue: 0 });
  });
});

describe('match end and cleanup', () => {
  it('has no timer; a surrender ends it for both players, then the room is deleted after its TTL', () => {
    const h = harness();
    const { a, b, code } = h.startMatch(EARTH_TEAM, EARTH_TEAM);
    h.advance(180_000); // well past the old 120s limit
    assert.equal(a.all('MATCH_END').length, 0);
    h.send(b, { event: 'LEAVE_ROOM' });
    assert.equal(a.last('MATCH_END').reason, 'FORFEIT');
    assert.equal(b.last('MATCH_END').winner, 'p1'); // the one who gives up also sees the result
    assert.ok(b.messages.findIndex((m) => m.event === 'MATCH_END') < b.messages.findIndex((m) => m.event === 'LEFT_ROOM'));
    const ticks = a.all('STATE_TICK').length;
    h.advance(100);
    assert.equal(a.all('STATE_TICK').length, ticks); // no ticks after the end
    assert.ok(h.manager.getRoom(code));
    h.advance(5000);
    assert.equal(h.manager.getRoom(code), undefined);
  });

  it('a player can start a new room straight after a finished match', () => {
    const h = harness();
    const { a, b } = h.startMatch();
    h.send(b, { event: 'LEAVE_ROOM' });
    h.send(a, { event: 'CREATE_ROOM', user_id: 'A', pets: EARTH_TEAM });
    assert.equal(a.all('ROOM_JOINED').length, 2);
  });
});

describe('quick match', () => {
  it('pairs players with close MMR on the next tick', () => {
    const h = harness();
    const a = h.connect();
    const b = h.connect();
    h.send(a, { event: 'QUICK_MATCH', user_id: 'A', pets: EARTH_TEAM, mmr: 1000 });
    h.send(b, { event: 'QUICK_MATCH', user_id: 'B', pets: EARTH_TEAM, mmr: 1050 });
    assert.equal(b.last('QUEUED').queue_size, 2);
    h.advance(50);
    assert.equal(a.last('ROOM_JOINED').room.mode, 'QUICK');
    assert.equal(a.last('MATCH_START').match_id, b.last('MATCH_START').match_id);
    assert.equal(h.manager.stats().queue, 0);
  });

  it('widens the MMR window over time and prefers the closest opponent', () => {
    const h = harness();
    const [a, far, near] = [h.connect(), h.connect(), h.connect()];
    h.send(a, { event: 'QUICK_MATCH', user_id: 'A', pets: EARTH_TEAM, mmr: 1000 });
    h.send(far, { event: 'QUICK_MATCH', user_id: 'F', pets: EARTH_TEAM, mmr: 1500 });
    h.advance(4000); // window 100 + 50/s x 4s = 300 < 500
    assert.equal(a.all('ROOM_JOINED').length, 0);
    h.send(near, { event: 'QUICK_MATCH', user_id: 'N', pets: EARTH_TEAM, mmr: 1200 });
    h.advance(50);
    assert.equal(a.last('MATCH_START').match_id, near.last('MATCH_START').match_id);
    assert.equal(far.all('ROOM_JOINED').length, 0);
  });

  it('CANCEL_QUICK_MATCH leaves the queue; queued players cannot create rooms', () => {
    const h = harness();
    const a = h.connect();
    h.send(a, { event: 'QUICK_MATCH', user_id: 'A', pets: EARTH_TEAM });
    h.send(a, { event: 'CREATE_ROOM', user_id: 'A', pets: EARTH_TEAM });
    assert.equal(a.last('ERROR').code, 'ALREADY_QUEUED');
    h.send(a, { event: 'CANCEL_QUICK_MATCH' });
    assert.equal(a.last('QUEUE_LEFT').event, 'QUEUE_LEFT');
    h.send(a, { event: 'CANCEL_QUICK_MATCH' });
    assert.equal(a.last('ERROR').code, 'NOT_QUEUED');
    assert.equal(h.manager.stats().queue, 0);
  });
});
