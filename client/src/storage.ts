/** Browser storage can be unavailable (private mode, blocked cookies): every access is guarded. */

function read<T>(storage: () => Storage, key: string): T | null {
  try {
    const raw = storage().getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(storage: () => Storage, key: string, value: unknown): void {
  try {
    if (value === null) storage().removeItem(key);
    else storage().setItem(key, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}

const local = () => localStorage;
const session = () => sessionStorage;

/** Battle Leash: slots 0-2 = battle pet 1 (base first), 3-5 = battle pet 2. */
export type TeamSlots = (string | null)[];

export interface Prefs {
  name: string;
  team: TeamSlots;
  muted: boolean;
}

const DEFAULT_TEAM: TeamSlots = ['mid_pacific_owl', 'zorbnik_leash', 'chick_leash', 'puppy_leash', 'pet_bunny', 'calf_leash'];

export function loadPrefs(): Prefs {
  const p = read<Partial<Prefs>>(local, 'pb.prefs') ?? {};
  return {
    name: p.name ?? '',
    team: Array.isArray(p.team) && p.team.length === 6 ? p.team : [...DEFAULT_TEAM],
    muted: p.muted ?? false,
  };
}

export function savePrefs(prefs: Prefs): void {
  write(local, 'pb.prefs', prefs);
}

/** Seat credentials for REJOIN_ROOM after a refresh or dropped connection (per tab). */
export interface SeatTicket {
  room_code: string;
  player_token: string;
}

export const loadTicket = (): SeatTicket | null => read<SeatTicket>(session, 'pb.ticket');
export const saveTicket = (ticket: SeatTicket | null): void => write(session, 'pb.ticket', ticket);
