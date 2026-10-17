import type { ServerMessage, TeamPick } from '../../src/server/protocol.ts';
import type { ClientConnection } from '../../src/server/Room.ts';
import { RoomManager, type RoomManagerOptions } from '../../src/server/RoomManager.ts';

/** Battle Leash teams (2 battle pets x 3 same-element pets) used across server tests. */
export const AIR_TEAM: TeamPick = [['mid_pacific_owl', 'chick_leash', 'pineapple_kite'], ['zorbnik_leash', 'sonar_bracelet', 'lucky_pendant']];
export const EARTH_TEAM: TeamPick = [['puppy_leash', 'puddy_leash', 'pet_bunny'], ['piglet_leash', 'calf_leash', 'moose_cap']];
export const WATER_TEAM: TeamPick = [['seahorse_companion', 'penguin_leash', 'water_balloon'], ['magical_carrot', 'robo_shark', 'baby_turtle']];

type Msg<E extends ServerMessage['event']> = Extract<ServerMessage, { event: E }>;

let n = 0;

export class FakeConnection implements ClientConnection {
  readonly id = `fake_${++n}`;
  messages: ServerMessage[] = [];
  rttMs: number | null = null;

  send(message: ServerMessage): void {
    // Round-trip through JSON like a real socket would.
    this.messages.push(JSON.parse(JSON.stringify(message)));
  }

  all<E extends ServerMessage['event']>(event: E): Msg<E>[] {
    return this.messages.filter((m): m is Msg<E> => m.event === event);
  }

  last<E extends ServerMessage['event']>(event: E): Msg<E> {
    const found = this.all(event).at(-1);
    if (!found) throw new Error(`${this.id} never received ${event}; got ${this.messages.map((m) => m.event).join(', ')}`);
    return found;
  }

  clear(): void {
    this.messages = [];
  }
}

export interface Harness {
  manager: RoomManager;
  clock: { t: number };
  connect(): FakeConnection;
  send(conn: FakeConnection, message: object): void;
  /** Advance the fake clock in 50ms server ticks. */
  advance(ms: number): void;
  /** Two players in a private room with a running match. */
  startMatch(p1Pets?: TeamPick, p2Pets?: TeamPick): { a: FakeConnection; b: FakeConnection; code: string };
}

export function harness(options: RoomManagerOptions = {}): Harness {
  const clock = { t: 0 };
  const manager = new RoomManager({ now: () => clock.t, graceMs: 1000, finishedRoomTtlMs: 5000, ...options });
  const h: Harness = {
    manager,
    clock,
    connect() {
      const c = new FakeConnection();
      manager.connect(c);
      return c;
    },
    send(conn, message) {
      manager.handleRaw(conn, JSON.stringify(message));
    },
    advance(ms) {
      for (let elapsed = 0; elapsed < ms; elapsed += 50) {
        clock.t += 50;
        manager.tick();
      }
    },
    startMatch(p1Pets = AIR_TEAM, p2Pets = EARTH_TEAM) {
      const a = h.connect();
      const b = h.connect();
      h.send(a, { event: 'CREATE_ROOM', user_id: 'USER_A', pets: p1Pets });
      const code = a.last('ROOM_JOINED').room_code;
      h.send(b, { event: 'JOIN_ROOM', room_code: code, user_id: 'USER_B', pets: p2Pets });
      return { a, b, code };
    },
  };
  return h;
}
