/**
 * Status chips for one side's active pet, laid over the canvas just under its
 * HP / energy bars. Each chip shows a countdown ring and opens a small tooltip
 * on hover, keyboard focus or tap.
 */
import type { PetSnapshot, StatusSnapshot } from '../types.ts';
import { h } from '../ui/dom.ts';
import { ACTIVE_X, H, STATUS_TRAY_Y, W, type Side } from './renderer.ts';
import { statusIcon } from './statusIcons.ts';

interface Chip {
  root: HTMLButtonElement;
  time: HTMLElement;
  stacks: HTMLElement;
  tipTime: HTMLElement;
  /** Longest remaining time seen, so the ring drains from full. */
  total: number;
}

const MAX_CHIPS = 8;

export class StatusTray {
  readonly el: HTMLElement;
  private readonly chips = new Map<string, Chip>();
  private petKey = '';
  /** Tap outside closes an open tooltip. */
  private readonly outside = (e: PointerEvent) => {
    if (!this.el.contains(e.target as Node)) this.closeAll();
  };

  constructor(side: Side) {
    this.el = h('div', { class: `status-tray side-${side}`, role: 'list', 'aria-label': side === 'L' ? 'Status pet kamu' : 'Status pet lawan' });
    this.el.style.left = `${(ACTIVE_X[side] / W) * 100}%`;
    this.el.style.top = `${(STATUS_TRAY_Y / H) * 100}%`;
    document.addEventListener('pointerdown', this.outside);
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.outside);
  }

  update(pet: PetSnapshot | null, petKey: string, since: number): void {
    if (petKey !== this.petKey) {
      this.petKey = petKey;
      this.chips.clear();
      this.el.replaceChildren();
    }
    const list = pet && !pet.is_ko ? [...pet.active_debuffs.map((s) => [s, true] as const), ...pet.active_buffs.map((s) => [s, false] as const)] : [];
    const seen = new Map<string, number>();
    const live = new Set<string>();
    for (const [s, debuff] of list.slice(0, MAX_CHIPS)) {
      const base = `${s.status}:${s.type}`;
      const n = seen.get(base) ?? 0;
      seen.set(base, n + 1);
      const key = `${base}:${n}`;
      live.add(key);
      const chip = this.chips.get(key) ?? this.create(key, s, debuff);
      this.paint(chip, s, since);
    }
    for (const [key, chip] of this.chips) {
      if (!live.has(key)) {
        chip.root.remove();
        this.chips.delete(key);
      }
    }
  }

  private create(key: string, s: StatusSnapshot, debuff: boolean): Chip {
    const icon = statusIcon(s);
    const time = h('span', { class: 'chip-time' });
    const stacks = h('span', { class: 'chip-stacks' });
    const tipTime = h('span', { class: 'tip-time' });
    const tip = h(
      'span',
      { class: 'status-tip', role: 'tooltip' },
      h('span', { class: 'tip-head' }, h('b', {}, icon.name), h('span', { class: `tip-kind ${debuff ? 'debuff' : 'buff'}` }, debuff ? 'Debuff' : 'Buff')),
      icon.desc ? h('span', { class: 'tip-desc' }, icon.desc) : false,
      tipTime,
    );
    const root = h(
      'button',
      {
        class: `status-chip ${debuff ? 'debuff' : 'buff'} pop-in`,
        type: 'button',
        role: 'listitem',
        'aria-label': `${icon.name}${icon.desc ? `: ${icon.desc}` : ''}`,
        onclick: (e: Event) => {
          e.stopPropagation();
          const open = !root.classList.contains('open');
          this.closeAll();
          root.classList.toggle('open', open);
        },
      },
      h('span', { class: 'chip-abbr' }, icon.abbr),
      time,
      stacks,
      tip,
    ) as HTMLButtonElement;
    root.style.setProperty('--c', icon.color);
    this.el.append(root);
    const chip: Chip = { root, time, stacks, tipTime, total: 0 };
    this.chips.set(key, chip);
    return chip;
  }

  private paint(chip: Chip, s: StatusSnapshot, since: number): void {
    if (s.duration === null) {
      chip.root.style.setProperty('--left', '100%');
      chip.time.textContent = '∞';
      chip.tipTime.textContent = 'Sampai terpakai';
    } else {
      const left = Math.max(0, s.duration - since);
      chip.total = Math.max(chip.total, s.duration);
      chip.root.style.setProperty('--left', `${chip.total > 0 ? (left / chip.total) * 100 : 0}%`);
      chip.time.textContent = left >= 10 ? String(Math.ceil(left)) : left.toFixed(1);
      chip.tipTime.textContent = `Sisa ${left.toFixed(1)} detik`;
      chip.root.classList.toggle('ending', left < 1.5);
    }
    chip.stacks.textContent = s.stacks && s.stacks > 1 ? `x${s.stacks}` : '';
  }

  private closeAll(): void {
    for (const chip of this.chips.values()) chip.root.classList.remove('open');
  }
}
