import { sfx } from '../audio.ts';
import type { Net } from '../net.ts';
import { savePrefs, type Prefs } from '../storage.ts';
import { spriteImage } from '../sprites.ts';
import type { GameStateSnapshot, Msg, PetSnapshot, PlayerId, PlayerSnapshot } from '../types.ts';
import { h } from '../ui/dom.ts';
import { playEvents } from './fx.ts';
import { describeEvent, type LogClass } from './log.ts';
import { ArenaRenderer, GCD_SEC } from './renderer.ts';
import { StatusTray } from './statusTray.ts';

const SWAP_LOCK_SEC = 1.5;
const MAX_LOG = 150;
const ABILITY_KEYS = [['Digit1', 'KeyQ'], ['Digit2', 'KeyW'], ['Digit3', 'KeyE']];
const ABILITY_KEY_LABELS = ['1 / Q', '2 / W', '3 / E'];

interface ActionView {
  root: HTMLButtonElement;
  art: HTMLElement;
  name: HTMLElement;
  sub: HTMLElement;
  num: HTMLElement;
  artKey: string;
}

/** Why an action is blocked right now, and the timer behind it (if any). */
interface Block {
  reason: string | null;
  left: number;
  total: number;
}

/** Reasons that are only a timer running out: the button shows a countdown for them. */
const TIMED = new Set(['Cooldown', 'Jeda skill', 'Jeda swap']);

function actionButton(kicker: string, key: string, label: string, onPress: () => void): ActionView {
  const art = h('div', { class: 'action-art' });
  const name = h('div', { class: 'action-name' });
  const sub = h('div', { class: 'action-sub' });
  const num = h('div', { class: 'cd-num' });
  const root = h(
    'button',
    { class: 'action', type: 'button', 'aria-label': label, onclick: onPress },
    art,
    h('div', { class: 'action-text' }, h('div', { class: 'action-kicker' }, kicker), name, sub),
    h('div', { class: 'cd-mask' }),
    h('div', { class: 'cd-bar' }),
    num,
    h('span', { class: 'key', 'aria-hidden': 'true' }, key),
  );
  return { root, art, name, sub, num, artKey: '' };
}

export class GameScreen {
  readonly el: HTMLElement;
  private readonly net: Net;
  private readonly prefs: Prefs;
  private readonly onExit: () => void;
  private readonly renderer: ArenaRenderer;
  private state: GameStateSnapshot;
  private stateAt = performance.now();
  private you: PlayerId;
  private matchId: string;
  private ended = false;
  private readonly cdTotals = new Map<string, number>();
  private readonly prevCd = new Map<string, number>();
  private hudTimer: ReturnType<typeof setInterval>;

  private readonly whoL = h('div', { class: 'who' });
  private readonly whoR = h('div', { class: 'who right' });
  private readonly timerEl = h('div', { class: 'timer', role: 'timer', 'aria-label': 'Lama pertandingan' });
  private readonly weatherEl = h('div', { class: 'weather hidden' });
  private readonly pingEl = h('div', { class: 'ping' });
  private readonly bannerEl = h('div', { class: 'stage-banner hidden', role: 'status' });
  private readonly resultEl = h('div', { class: 'result hidden' });
  private readonly logEl = h('div', { class: 'log', role: 'log', 'aria-live': 'polite' });
  private readonly chatInput = h('input', { class: 'input', maxlength: 200, placeholder: 'Ketik pesan… (Enter)', 'aria-label': 'Pesan chat' });
  private readonly skills: ActionView[];
  private readonly trays = { L: new StatusTray('L'), R: new StatusTray('R') };
  private readonly swapBtn: ActionView;
  /** Which ability button the last cast came from, to shake it on rejection. */
  private lastCastIndex = 0;
  private readonly muteBtn: HTMLButtonElement;
  private readonly forfeitBtn: HTMLButtonElement;
  private readonly keyHandler = (e: KeyboardEvent) => this.onKey(e);

  constructor(net: Net, start: Msg<'MATCH_START'>, prefs: Prefs, onExit: () => void) {
    this.net = net;
    this.prefs = prefs;
    this.onExit = onExit;
    this.you = start.you;
    this.matchId = start.match_id;
    this.state = start.state;

    const canvas = h('canvas', { role: 'img', 'aria-label': 'Arena pertarungan pet' });
    this.renderer = new ArenaRenderer(canvas, {
      cooldownTotal: (player, pet, ability) => this.cdTotals.get(`${player}:${pet}:${ability}`) ?? 0,
      abilityLeft: (player, pet, ability) => this.abilityLeft(player, pet, ability),
      gcdLeft: (player) => this.gcdLeft(player),
      sinceState: () => (performance.now() - this.stateAt) / 1000,
    });

    this.skills = [0, 1, 2].map((i) => actionButton(`Ability ${i + 1}`, ABILITY_KEY_LABELS[i], `Gunakan ability ${i + 1}`, () => this.cast(i)));
    this.swapBtn = actionButton('Swap pet', 'SPACE', 'Ganti pet', () => this.swap());
    this.muteBtn = h('button', { class: 'btn stage-btn mute', type: 'button', onclick: () => this.toggleMute() });
    this.renderMute();
    this.forfeitBtn = h('button', {
      class: 'btn stage-btn forfeit',
      type: 'button',
      onclick: () => {
        if (!this.ended && confirm('Menyerah? Lawan akan langsung menang.')) this.onExit();
      },
    }, 'Menyerah');

    const send = () => this.sendChat();
    this.chatInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') send();
      if (e.key === 'Escape') this.chatInput.blur();
    });

    this.el = h(
      'main',
      { class: 'game' },
      h(
        'div',
        { class: 'stage' },
        canvas,
        h('div', { class: 'topbar' }, this.whoL, h('div', { class: 'clock' }, this.timerEl, h('div', {}, this.weatherEl)), h('div', {}, this.whoR, this.pingEl)),
        this.trays.L.el,
        this.trays.R.el,
        this.bannerEl,
        this.muteBtn,
        this.forfeitBtn,
        this.resultEl,
      ),
      h(
        'section',
        { class: 'hud', 'aria-label': 'Kontrol' },
        ...this.skills.map((v) => v.root),
        this.swapBtn.root,
        h('div', { class: 'panel feed' }, this.logEl, h('div', { class: 'chat-row' }, this.chatInput, h('button', { class: 'btn', type: 'button', onclick: send }, 'Kirim'))),
      ),
    );

    this.applyState(start.state);
    this.renderer.start();
    if (start.state.tick === 0) {
      this.renderer.showBanner('FIGHT!', '#ffcf3f', 1200);
      sfx.play('start');
      this.log('Match dimulai! Semua pet pulih 100% HP.', 'sys');
    } else {
      this.log('Tersambung kembali ke match.', 'sys');
    }
    window.addEventListener('keydown', this.keyHandler);
    this.hudTimer = setInterval(() => this.updateHud(), 50);
  }

  get currentMatchId(): string {
    return this.matchId;
  }

  /** Full resync after a reconnect (REJOIN_ROOM answers with MATCH_START). */
  resync(start: Msg<'MATCH_START'>): void {
    this.you = start.you;
    this.matchId = start.match_id;
    this.applyState(start.state);
    this.log('Tersambung kembali.', 'sys');
  }

  onTick(msg: Msg<'STATE_TICK'>): void {
    if (msg.match_id !== this.matchId) return;
    this.applyState(msg.state);
    // A hidden tab does not animate; queued projectiles would all fire at once on return.
    if (!document.hidden) playEvents(msg.events, msg.state, this.renderer, this.you);
    for (const e of msg.events) {
      const line = describeEvent(e, msg.state, this.you);
      if (line) this.log(line.text, line.cls, e.t);
      if (e.type === 'ACTION_REJECTED' && e.player === this.you) this.deny(e.action === 'SWAP_PET' ? this.swapBtn : this.skills[this.lastCastIndex]);
    }
  }

  onEnd(msg: Msg<'MATCH_END'>): void {
    if (msg.match_id !== this.matchId) return;
    this.ended = true;
    this.applyState(msg.state);
    const won = msg.winner === this.you;
    const draw = msg.winner === 'DRAW';
    const reason = {
      KO: draw ? 'Semua pet K.O. bersamaan' : won ? 'Semua pet lawan K.O.' : 'Semua pet kamu K.O.',
      FORFEIT: won ? 'Lawan menyerah atau terputus' : 'Kamu meninggalkan match',
    }[msg.reason];
    this.forfeitBtn.classList.add('hidden');
    this.resultEl.className = `result ${draw ? '' : won ? 'win' : 'lose'}`;
    const back = h('button', { class: 'btn btn-gold', type: 'button', onclick: () => this.onExit() }, 'Kembali ke lobby');
    this.resultEl.replaceChildren(h('div', {}, h('h2', {}, draw ? 'SERI' : won ? 'MENANG!' : 'KALAH'), h('p', {}, reason), back));
    back.focus();
    this.log(`Match selesai: ${draw ? 'seri' : won ? 'kamu menang' : 'kamu kalah'} (${reason}).`, 'sys');
    sfx.play(won ? 'win' : 'lose');
    this.updateHud();
  }

  onChat(msg: Msg<'CHAT'>): void {
    const line = h('div', { class: 'line chat' }, h('b', {}, `${msg.user_id}${msg.player_id === this.you ? ' (kamu)' : ''}: `), msg.text);
    this.appendLog(line);
  }

  onPeer(player: PlayerId, disconnected: boolean, graceMs = 0): void {
    if (player === this.you || this.ended) return;
    if (disconnected) {
      this.bannerEl.textContent = `Lawan terputus. Menunggu ${Math.round(graceMs / 1000)} detik sebelum dinyatakan menyerah…`;
      this.bannerEl.classList.remove('hidden');
    } else {
      this.bannerEl.classList.add('hidden');
      this.log('Lawan tersambung kembali.', 'sys');
    }
  }

  setConnection(online: boolean): void {
    if (this.ended) return;
    if (!online) {
      this.bannerEl.textContent = 'Koneksi terputus. Menyambung ulang…';
      this.bannerEl.classList.remove('hidden');
    } else {
      this.bannerEl.classList.add('hidden');
    }
  }

  destroy(): void {
    window.removeEventListener('keydown', this.keyHandler);
    clearInterval(this.hudTimer);
    this.renderer.stop();
    this.trays.L.destroy();
    this.trays.R.destroy();
  }

  // -------------------------------------------------------------------------

  private applyState(state: GameStateSnapshot): void {
    this.state = state;
    this.stateAt = performance.now();
    for (const id of ['p1', 'p2'] as PlayerId[]) {
      state.players[id].pets.forEach((pet, i) => {
        pet.abilities.forEach((ability, j) => {
          const key = `${id}:${i}:${j}`;
          const prev = this.prevCd.get(key);
          // A cooldown that jumps up has just (re)started: remember its full length for the radial.
          if (prev === undefined || ability.cooldown_remaining > prev + 0.1) {
            this.cdTotals.set(key, ability.cooldown_remaining + (prev === undefined ? 0 : 0.05));
          }
          this.prevCd.set(key, ability.cooldown_remaining);
        });
      });
    }
    this.renderer.setState(state, this.you);
    this.renderPlayers();
    this.updateHud();
  }

  private renderPlayers(): void {
    const opp: PlayerId = this.you === 'p1' ? 'p2' : 'p1';
    this.whoL.replaceChildren(h('span', { class: 'you-tag' }, 'KAMU'), h('span', {}, this.state.players[this.you].user_id));
    this.whoR.replaceChildren(h('span', {}, this.state.players[opp].user_id));
  }

  private since(): number {
    return (performance.now() - this.stateAt) / 1000;
  }

  private me() {
    const p = this.state.players[this.you];
    return { player: p, active: p.pets[p.active_pet_index], reserve: p.pets[p.active_pet_index === 0 ? 1 : 0] };
  }

  // --- Timer prediction between server states (mirrors BattleSession.advanceTime) ---

  /** Mud on any living pet slows every timer of that team. */
  private teamSlow(p: PlayerSnapshot): number {
    return Math.max(1, ...p.pets.filter((pet) => !pet.is_ko).map((pet) => pet.active_debuffs.find((d) => d.status === 'COOLDOWN_SLOW')?.value ?? 1));
  }

  private abilityLeft(id: PlayerId, petIndex: number, abilityIndex: number): number {
    const p = this.state.players[id];
    const pet = p.pets[petIndex];
    const ability = pet?.abilities[abilityIndex];
    if (!ability) return 0;
    const haste = pet.active_buffs.find((b) => b.status === 'COOLDOWN_HASTE')?.value ?? 1;
    return Math.max(0, ability.cooldown_remaining - (this.since() * haste) / this.teamSlow(p));
  }

  private gcdLeft(id: PlayerId): number {
    const p = this.state.players[id];
    return this.ended ? 0 : Math.max(0, p.global_cooldown_remaining - this.since() / this.teamSlow(p));
  }

  private swapLeft(id: PlayerId): number {
    const p = this.state.players[id];
    return Math.max(0, p.swap_cooldown_remaining - this.since() / this.teamSlow(p));
  }

  /** Local prediction of why an action would be rejected (the server stays authoritative). */
  private castBlock(index: number): Block {
    const { player, active } = this.me();
    const ability = active.abilities[index];
    const cdLeft = this.abilityLeft(this.you, player.active_pet_index, index);
    const cdTotal = this.cdTotals.get(`${this.you}:${player.active_pet_index}:${index}`) ?? 1;
    const swapLeft = this.swapLeft(this.you);
    const gcdLeft = this.gcdLeft(this.you);
    const no = (reason: string): Block => ({ reason, left: 0, total: 1 });
    if (this.ended || this.state.status !== 'IN_PROGRESS') return no('Match selesai');
    if (active.is_ko) return no('K.O.');
    if (!ability) return no('Slot kosong');
    if (ability.is_passive) return no('Pasif (selalu aktif)');
    if (ability.uses_left === 0) return no('Sudah dipakai');
    if (swapLeft > 0) return { reason: 'Jeda swap', left: Math.max(cdLeft, swapLeft), total: cdLeft > swapLeft ? cdTotal : SWAP_LOCK_SEC };
    if (active.active_debuffs.some((d) => d.status === 'STUN')) return no('Stun!');
    if (active.active_debuffs.some((d) => d.status === 'SILENCE')) return no('Tidak bisa skill');
    // Show whichever timer ends last: the ability's own cooldown or the 1s global one.
    if (cdLeft > 0 && cdLeft >= gcdLeft) return { reason: 'Cooldown', left: cdLeft, total: cdTotal };
    if (gcdLeft > 0) return { reason: 'Jeda skill', left: gcdLeft, total: GCD_SEC };
    return { reason: null, left: 0, total: 1 };
  }

  private swapBlock(): Block {
    const { active, reserve } = this.me();
    const left = this.swapLeft(this.you);
    const no = (reason: string): Block => ({ reason, left: 0, total: 1 });
    if (this.ended || this.state.status !== 'IN_PROGRESS') return no('Match selesai');
    if (reserve.is_ko) return no('Cadangan K.O.');
    if (left > 0) return { reason: 'Jeda swap', left, total: SWAP_LOCK_SEC };
    if (active.active_debuffs.some((d) => d.status === 'STUN')) return no('Stun!');
    if (active.active_debuffs.some((d) => d.status === 'ROOT')) return no('Terkunci');
    return { reason: null, left: 0, total: 1 };
  }

  private cast(index: number): void {
    sfx.unlock();
    const { reason, left } = this.castBlock(index);
    // Allow sending in the last 150ms of a timer: the server may already be there.
    if (reason && !(TIMED.has(reason) && left < 0.15)) return this.deny(this.skills[index], reason);
    this.lastCastIndex = index;
    this.net.send({
      event: 'CAST_SKILL',
      match_id: this.matchId,
      pet_index: this.state.players[this.you].active_pet_index,
      ability_index: index,
      timestamp: this.net.serverNow(),
    });
  }

  private swap(): void {
    sfx.unlock();
    const { reason, left } = this.swapBlock();
    if (reason && !(TIMED.has(reason) && left < 0.15)) return this.deny(this.swapBtn, reason);
    this.net.send({ event: 'SWAP_PET', match_id: this.matchId, timestamp: this.net.serverNow() });
  }

  private deny(view: ActionView, reason?: string): void {
    view.root.classList.remove('denied');
    void view.root.offsetWidth; // restart the animation
    view.root.classList.add('denied');
    if (reason) sfx.play('denied');
  }

  private onKey(e: KeyboardEvent): void {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
    if (e.repeat) return;
    const ability = ABILITY_KEYS.findIndex((codes) => codes.includes(e.code));
    if (ability >= 0) {
      e.preventDefault();
      this.cast(ability);
    } else if (e.code === 'Space') {
      e.preventDefault();
      this.swap();
    } else if (e.code === 'Enter') {
      e.preventDefault();
      this.chatInput.focus();
    }
  }

  private sendChat(): void {
    const text = this.chatInput.value.trim();
    if (!text) return;
    if (this.net.send({ event: 'CHAT', text: text.slice(0, 200) })) this.chatInput.value = '';
  }

  private toggleMute(): void {
    sfx.unlock();
    this.prefs.muted = !this.prefs.muted;
    sfx.muted = this.prefs.muted;
    savePrefs(this.prefs);
    this.renderMute();
  }

  private renderMute(): void {
    this.muteBtn.textContent = this.prefs.muted ? 'Suara: mati' : 'Suara: nyala';
    this.muteBtn.setAttribute('aria-pressed', String(this.prefs.muted));
  }

  private updateHud(): void {
    const since = this.since();
    // No time limit: the clock only shows how long the match has been running.
    const secs = Math.floor(this.state.elapsed_sec + (this.ended ? 0 : since));
    this.timerEl.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;

    const w = this.state.active_weather;
    this.weatherEl.classList.toggle('hidden', !w);
    if (w) this.weatherEl.textContent = `Cuaca: ${w.name} · ${Math.ceil(Math.max(0, w.duration_remaining - since))}s`;
    this.pingEl.textContent = this.net.rttMs !== null ? `Ping ${this.net.rttMs} ms` : '';

    const { active, reserve } = this.me();
    this.skills.forEach((view, i) => {
      const ability = active.abilities[i];
      view.root.classList.toggle('hidden', !ability);
      if (!ability) return;
      const cast = this.castBlock(i);
      view.root.classList.toggle('gcd', cast.reason === 'Jeda skill');
      this.paintAction(view, ability.pet_id, ability.element, active.is_ko, ability.name, cast);
    });
    const sw = this.swapBlock();
    this.paintAction(this.swapBtn, reserve.id, reserve.element, reserve.is_ko, reserve.name, sw, `${reserve.current_hp}/${reserve.max_hp} HP`);

    const opp: PlayerId = this.you === 'p1' ? 'p2' : 'p1';
    for (const [side, id] of [['L', this.you], ['R', opp]] as const) {
      const p = this.state.players[id];
      this.trays[side].update(p.pets[p.active_pet_index], `${id}:${p.active_pet_index}`, since);
    }
  }

  private paintAction(
    view: ActionView,
    spriteId: string,
    element: PetSnapshot['element'],
    ko: boolean,
    title: string,
    block: Block,
    readyText = 'Siap!',
  ): void {
    const { reason, left, total } = block;
    const artKey = `${spriteId}|${ko}`;
    if (view.artKey !== artKey) {
      view.art.replaceChildren(spriteImage(spriteId, element, 48, ko));
      view.artKey = artKey;
    }
    view.name.textContent = title;
    view.sub.textContent = reason ? (left > 0 && TIMED.has(reason) ? `${reason} ${left.toFixed(1)}s` : reason) : readyText;
    view.root.style.setProperty('--el', `var(--${element.toLowerCase()})`);
    view.root.classList.toggle('ready', !reason);
    view.root.classList.toggle('locked', !!reason);
    view.root.setAttribute('aria-disabled', String(!!reason));
    const pct = left > 0 && total > 0 ? Math.min(100, (left / total) * 100) : reason ? 100 : 0;
    view.root.style.setProperty('--cd', `${reason && left <= 0 ? 0 : pct}%`);
    view.num.textContent = left >= 0.05 ? (left < 3 ? left.toFixed(1) : String(Math.ceil(left))) : '';
  }

  private log(text: string, cls: LogClass, t?: number): void {
    const ms = t ?? this.state.elapsed_sec * 1000;
    const s = Math.floor(ms / 1000);
    this.appendLog(h('div', { class: `line ${cls}` }, h('span', { class: 't' }, `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`), text));
  }

  private appendLog(line: HTMLElement): void {
    const el = this.logEl;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    el.append(line);
    while (el.childElementCount > MAX_LOG) el.firstElementChild?.remove();
    if (atBottom) el.scrollTop = el.scrollHeight;
  }
}

