import { sfx } from '../audio.ts';
import { cooldownLabel, petById } from '../pets.ts';
import { savePrefs, type Prefs } from '../storage.ts';
import { spriteImage } from '../sprites.ts';
import type { Element, PetInfo, TeamPick } from '../types.ts';
import { h, toast } from './dom.ts';

export interface LobbyActions {
  create(name: string, pets: TeamPick): void;
  join(code: string, name: string, pets: TeamPick): void;
  quick(name: string, pets: TeamPick): void;
}

const FILTERS: (Element | 'All')[] = ['All', 'Air', 'Earth', 'Fire', 'Water'];
const BATTLE_PET_ROLE = ['Aktif', 'Cadangan'];
const SLOT_ROLE = ['Pet dasar', 'Ability 2', 'Ability 3'];

/**
 * Lobby with a Battle Leash builder: 2 battle pets, each spliced from 3 pets of
 * any element (the base pet gives name, look and defending element; all 3 give abilities).
 */
export class LobbyScreen {
  readonly el: HTMLElement;
  private readonly prefs: Prefs;
  private readonly roster: PetInfo[];
  private readonly actions: LobbyActions;
  /** Slot being filled: 0-2 battle pet 1, 3-5 battle pet 2. */
  private target = 0;
  private filter: Element | 'All' = 'All';
  private query = '';
  private readonly slotsEl = h('div', { class: 'team-slots' });
  private readonly hintEl = h('p', { class: 'pick-hint', 'aria-live': 'polite' });
  private readonly inspectEl = h('div', { class: 'inspect', 'aria-live': 'polite' });
  private readonly rosterEl = h('div', { class: 'roster' });
  private readonly countEl = h('span', { class: 'roster-count' });
  private readonly tabsEl = h('div', { class: 'tabs', role: 'group', 'aria-label': 'Filter elemen' });
  private readonly connEl = h('span', { class: 'conn-pill' });
  private readonly nameInput: HTMLInputElement;
  private readonly codeInput: HTMLInputElement;
  private readonly playButtons: HTMLButtonElement[] = [];

  constructor(prefs: Prefs, roster: PetInfo[], actions: LobbyActions) {
    this.prefs = prefs;
    this.roster = roster;
    this.actions = actions;
    this.target = Math.max(0, prefs.team.findIndex((id) => !id));

    this.nameInput = h('input', {
      class: 'input',
      id: 'player-name',
      maxlength: 24,
      placeholder: 'Nama pemain',
      autocomplete: 'nickname',
      value: prefs.name,
    });
    this.nameInput.addEventListener('input', () => this.persist());

    this.codeInput = h('input', {
      class: 'input',
      id: 'room-code',
      inputmode: 'numeric',
      maxlength: 6,
      placeholder: 'Kode room (6 digit)',
      'aria-label': 'Kode room',
    });
    this.codeInput.addEventListener('input', () => {
      this.codeInput.value = this.codeInput.value.replace(/\D/g, '').slice(0, 6);
    });
    this.codeInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.submit('join');
    });

    const search = h('input', { class: 'input', type: 'search', placeholder: 'Cari pet atau skill…', 'aria-label': 'Cari pet' });
    search.addEventListener('input', () => {
      this.query = search.value.trim().toLowerCase();
      this.renderRoster();
    });

    const button = (label: string, cls: string, kind: 'quick' | 'create' | 'join') => {
      const b = h('button', { class: `btn ${cls}`, type: 'button', onclick: () => this.submit(kind) }, label);
      this.playButtons.push(b);
      return b;
    };

    this.el = h(
      'main',
      { class: 'lobby' },
      h(
        'header',
        { class: 'lobby-head' },
        h('div', {}, h('h1', { class: 'logo' }, 'PET BATTLE ARENA'), h('p', { class: 'subtitle' }, 'Rakit 2 battle pet (masing-masing 3 ability), lalu tantang temanmu atau cari lawan acak.')),
        this.connEl,
      ),
      h(
        'div',
        { class: 'lobby-grid' },
        h(
          'div',
          { class: 'side-stack' },
          h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, 'Pemain'), h('label', { class: 'label', for: 'player-name' }, 'Nama'), this.nameInput),
          h(
            'section',
            { class: 'panel' },
            h('h2', { class: 'panel-title' }, 'Battle Leash'),
            this.slotsEl,
            h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => this.swapOrder(), style: 'width:100%;margin-top:10px' }, 'Tukar aktif ↔ cadangan'),
          ),
          h('section', { class: 'panel' }, h('h2', { class: 'panel-title' }, 'Detail'), this.inspectEl),
          h(
            'section',
            { class: 'panel play-actions' },
            h('h2', { class: 'panel-title', style: 'margin-bottom:2px' }, 'Main'),
            button('Quick Match', 'btn-gold', 'quick'),
            button('Buat Private Room', '', 'create'),
            h('div', { class: 'join-row' }, this.codeInput, button('Gabung', '', 'join')),
            h('div', { class: 'matrix' }, h('b', { style: 'color:var(--air)' }, 'Air'), ' › ', h('b', { style: 'color:var(--earth)' }, 'Earth'), ' › ',
              h('b', { style: 'color:var(--fire)' }, 'Fire'), ' › ', h('b', { style: 'color:var(--water)' }, 'Water'), ' › ', h('b', { style: 'color:var(--air)' }, 'Air'),
              h('div', { style: 'font-size:11px;margin-top:2px' }, 'Unggul +25% damage · lemah -25%')),
          ),
        ),
        h(
          'section',
          { class: 'panel' },
          h('h2', { class: 'panel-title' }, 'Koleksi pet'),
          this.hintEl,
          h('div', { class: 'roster-tools' }, this.tabsEl, search, this.countEl),
          this.rosterEl,
        ),
      ),
    );

    this.renderTabs();
    this.renderSlots();
    this.renderRoster();
    this.inspect(petById(prefs.team[0] ?? '') ?? roster[0]);
  }

  setConnection(online: boolean): void {
    this.connEl.replaceChildren(h('span', { class: `dot ${online ? 'on' : 'wait'}` }), online ? 'Terhubung ke server' : 'Menghubungkan…');
    for (const b of this.playButtons) b.disabled = !online;
  }

  // -------------------------------------------------------------------------

  private teamPick(): TeamPick | null {
    const t = this.prefs.team;
    if (t.some((id) => !id)) return null;
    return [[t[0]!, t[1]!, t[2]!], [t[3]!, t[4]!, t[5]!]];
  }

  private submit(kind: 'quick' | 'create' | 'join'): void {
    sfx.unlock();
    sfx.play('click');
    const team = this.teamPick();
    if (!team) return toast('Lengkapi 6 slot: 2 battle pet x 3 pet.');
    const name = this.nameInput.value.trim() || `Player${Math.floor(1000 + Math.random() * 9000)}`;
    this.nameInput.value = name;
    this.persist();
    if (kind === 'quick') this.actions.quick(name, team);
    else if (kind === 'create') this.actions.create(name, team);
    else {
      const code = this.codeInput.value;
      if (!/^\d{6}$/.test(code)) {
        this.codeInput.focus();
        return toast('Kode room harus 6 digit.');
      }
      this.actions.join(code, name, team);
    }
  }

  private persist(): void {
    this.prefs.name = this.nameInput.value.trim();
    savePrefs(this.prefs);
  }

  private pick(pet: PetInfo): void {
    sfx.unlock();
    const slot = this.target;
    const first = Math.floor(slot / 3) * 3;
    const sameBattlePet = this.prefs.team.slice(first, first + 3);
    if (sameBattlePet.some((id, i) => id === pet.id && first + i !== slot)) {
      sfx.play('denied');
      return toast('Pet ini sudah ada di battle pet yang sama.');
    }
    sfx.play('click');
    const team = this.prefs.team;
    team[slot] = pet.id;
    const nextEmpty = [1, 2, 3, 4, 5].map((d) => (slot + d) % 6).find((i) => !team[i]);
    this.target = nextEmpty ?? (slot + 1) % 6;
    this.persist();
    this.renderSlots();
    this.renderRoster();
    this.inspect(pet);
  }

  private swapOrder(): void {
    const t = this.prefs.team;
    this.prefs.team = [...t.slice(3), ...t.slice(0, 3)];
    this.persist();
    this.renderSlots();
  }

  private renderTabs(): void {
    this.tabsEl.replaceChildren(
      ...FILTERS.map((f) =>
        h('button', {
          class: 'tab',
          type: 'button',
          'aria-pressed': String(this.filter === f),
          onclick: () => {
            this.filter = f;
            this.renderTabs();
            this.renderRoster();
          },
        }, f === 'All' ? 'Semua' : f),
      ),
    );
  }

  private renderSlots(): void {
    this.slotsEl.replaceChildren(
      ...[0, 1].map((b) => {
        const base = petById(this.prefs.team[b * 3] ?? '');
        return h(
          'div',
          { class: 'bp-group' },
          h('div', { class: 'bp-head' },
            h('span', { class: 'slot-role' }, `Battle pet ${b + 1} · ${BATTLE_PET_ROLE[b]}`),
            base ? h('span', { class: 'bp-def' }, 'Bertahan sebagai ', h('span', { class: `el-badge el-${base.element}` }, base.element)) : null),
          h('div', { class: 'bp-slots' }, ...[0, 1, 2].map((s) => this.slotButton(b * 3 + s))),
        );
      }),
    );
    this.hintEl.textContent = `Mengisi: battle pet ${Math.floor(this.target / 3) + 1} · ${SLOT_ROLE[this.target % 3]} (elemen bebas)`;
  }

  private slotButton(slot: number): HTMLButtonElement {
    const pet = petById(this.prefs.team[slot] ?? '');
    return h(
      'button',
      {
        class: `slot mini ${pet ? 'filled' : ''} ${this.target === slot ? 'target' : ''}`,
        type: 'button',
        'aria-label': `${SLOT_ROLE[slot % 3]} battle pet ${Math.floor(slot / 3) + 1}${pet ? `: ${pet.name}` : ' kosong'}`,
        'aria-pressed': String(this.target === slot),
        onclick: () => {
          this.target = slot;
          this.renderSlots();
          this.renderRoster();
          if (pet) this.inspect(pet);
        },
      },
      h('div', { class: 'slot-art' }, pet ? spriteImage(pet.id, pet.element, 44) : '+'),
      h('div', { class: 'slot-kicker' }, SLOT_ROLE[slot % 3]),
      pet ? h('span', { class: `el-badge el-${pet.element}` }, pet.element) : null,
      h('div', { class: 'slot-ability' }, pet ? pet.ability : 'Kosong'),
    );
  }

  private renderRoster(): void {
    const q = this.query;
    const list = this.roster.filter(
      (p) =>
        (this.filter === 'All' || p.element === this.filter) &&
        (!q || p.name.toLowerCase().includes(q) || p.ability.toLowerCase().includes(q)),
    );
    this.countEl.textContent = `${list.length} pet`;
    this.rosterEl.replaceChildren(
      ...list.map((pet) => {
        const picked = this.prefs.team.includes(pet.id);
        const card = h(
          'button',
          {
            class: `card ${picked ? 'picked' : ''}`,
            type: 'button',
            'aria-pressed': String(picked),
            title: pet.effectDescription,
            onclick: () => this.pick(pet),
          },
          h('div', { class: 'card-top' }, spriteImage(pet.id, pet.element, 48), h('span', { class: `el-badge el-${pet.element}` }, pet.element)),
          h('div', { class: 'card-name' }, pet.name),
          h('div', { class: 'card-ability' }, `${pet.ability} · ${cooldownLabel(pet)}`),
        );
        card.addEventListener('mouseenter', () => this.inspect(pet));
        card.addEventListener('focus', () => this.inspect(pet));
        return card;
      }),
    );
  }

  private inspect(pet: PetInfo | undefined): void {
    if (!pet) return;
    const dmg = pet.baseDamage.raw && pet.baseDamage.raw !== '0' ? ` · Damage ${pet.baseDamage.raw}` : '';
    this.inspectEl.replaceChildren(
      h('h4', {}, pet.name),
      h('div', {}, h('span', { class: `el-badge el-${pet.element}` }, pet.element), ` ${pet.ability} · ${cooldownLabel(pet)}${dmg}`),
      h('p', { style: 'margin:8px 0 0' }, pet.effectDescription),
      h('p', { class: 'visual' }, pet.visualDescription),
    );
  }
}
