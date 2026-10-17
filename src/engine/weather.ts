import type { Element } from './elements.ts';
import type { WeatherType } from './types.ts';

export interface WeatherDefinition {
  type: WeatherType;
  name: string;
  /** Periodic damage to every active pet (Toxic Cloud). */
  tick?: { intervalMs: number; damage: number; element: Element };
  /** Outgoing damage bonus for attacks of one element (Heat Wave). */
  elementBoost?: { element: Element; pct: number };
  /** Added to every cooldown started while active (Hailstorm). */
  cooldownPenaltySec?: number;
  /** Status applied to every active pet when the weather starts (Count Sheep). */
  onStartStun?: { durationSec: number; label: string };
}

export const WEATHER_DEFS: Readonly<Record<WeatherType, WeatherDefinition>> = {
  TOXIC_CLOUD: {
    type: 'TOXIC_CLOUD',
    name: 'Toxic Cloud',
    tick: { intervalMs: 5_000, damage: 4, element: 'Earth' },
  },
  COUNT_SHEEP: {
    type: 'COUNT_SHEEP',
    name: 'Count Sheep',
    onStartStun: { durationSec: 8, label: 'SLEEP' },
  },
  HEAT_WAVE: {
    type: 'HEAT_WAVE',
    name: 'Heat Wave',
    elementBoost: { element: 'Fire', pct: 0.25 },
  },
  HAILSTORM: {
    type: 'HAILSTORM',
    name: 'Hailstorm',
    cooldownPenaltySec: 1.5,
  },
};
