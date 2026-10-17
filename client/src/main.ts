import './styles.css';
import { sfx } from './audio.ts';
import { GameScreen } from './game/GameScreen.ts';
import { Net } from './net.ts';
import { getRoster, loadRoster } from './pets.ts';
import { spriteImage } from './sprites.ts';
import { loadPrefs, loadTicket, saveTicket } from './storage.ts';
import type { ErrorCode, ServerMessage } from './types.ts';
import { h, toast } from './ui/dom.ts';
import { LobbyScreen } from './ui/lobby.ts';
import { WaitingDialog } from './ui/waiting.ts';

const ERROR_TEXT: Partial<Record<ErrorCode, string>> = {
  ROOM_NOT_FOUND: 'Room tidak ditemukan. Periksa lagi kodenya.',
  ROOM_FULL: 'Room sudah penuh atau match sudah dimulai.',
  INVALID_PETS: 'Pilihan pet tidak valid.',
  RATE_LIMITED: 'Terlalu banyak aksi, pelan-pelan sedikit.',
  ALREADY_IN_ROOM: 'Kamu sudah berada di sebuah room.',
  ALREADY_QUEUED: 'Kamu sedang mengantre Quick Match.',
};

const app = document.getElementById('app')!;
const prefs = loadPrefs();
sfx.muted = prefs.muted;
const net = new Net();
const waiting = new WaitingDialog(() => cancelWaiting());
let waitingFor: 'none' | 'room' | 'queue' = 'none';
let lobby: LobbyScreen | null = null;
let game: GameScreen | null = null;
let rejoining = false;

function showLobby(): void {
  game?.destroy();
  game = null;
  waiting.hide();
  waitingFor = 'none';
  lobby = new LobbyScreen(prefs, getRoster(), {
    create: (name, pets) => net.send({ event: 'CREATE_ROOM', user_id: name, pets }),
    join: (code, name, pets) => net.send({ event: 'JOIN_ROOM', room_code: code, user_id: name, pets }),
    quick: (name, pets) => net.send({ event: 'QUICK_MATCH', user_id: name, pets }),
  });
  lobby.setConnection(net.status === 'open');
  app.replaceChildren(lobby.el);
  window.scrollTo({ top: 0 });
}

/** Dev view (#galeri): every pet sprite large, alive and K.O., to review the designs. */
function showGallery(): void {
  const cards = getRoster().map((p) =>
    h('figure', { class: 'gallery-card' },
      spriteImage(p.id, p.element, 128),
      spriteImage(p.id, p.element, 64, true),
      h('figcaption', {}, h('b', {}, `${p.no ?? ''} ${p.name}`), h('span', {}, p.visualDescription ?? ''))),
  );
  app.replaceChildren(h('main', { class: 'gallery' }, h('h1', { class: 'logo' }, 'Galeri Pet'), h('div', { class: 'gallery-grid' }, ...cards)));
}

function cancelWaiting(): void {
  if (waitingFor === 'queue') net.send({ event: 'CANCEL_QUICK_MATCH' });
  else if (waitingFor === 'room') net.send({ event: 'LEAVE_ROOM' });
  saveTicket(null);
  waiting.hide();
  waitingFor = 'none';
}

function leaveToLobby(): void {
  net.send({ event: 'LEAVE_ROOM' });
  saveTicket(null);
  showLobby();
}

function handle(msg: ServerMessage): void {
  switch (msg.event) {
    case 'ROOM_JOINED':
      rejoining = false;
      saveTicket({ room_code: msg.room_code, player_token: msg.player_token });
      if (msg.room.status === 'LOBBY') {
        waitingFor = 'room';
        waiting.showRoom(msg.room_code);
      }
      return;
    case 'QUEUED':
      waitingFor = 'queue';
      waiting.showQueue();
      return;
    case 'QUEUE_LEFT':
      waitingFor = 'none';
      waiting.hide();
      return;
    case 'MATCH_START':
      waiting.hide();
      waitingFor = 'none';
      if (game && game.currentMatchId === msg.match_id) {
        game.resync(msg);
        return;
      }
      game?.destroy();
      lobby = null;
      game = new GameScreen(net, msg, prefs, leaveToLobby);
      app.replaceChildren(game.el);
      return;
    case 'STATE_TICK':
      game?.onTick(msg);
      return;
    case 'MATCH_END':
      saveTicket(null);
      game?.onEnd(msg);
      return;
    case 'PLAYER_DISCONNECTED':
      game?.onPeer(msg.player_id, true, msg.grace_ms);
      return;
    case 'PLAYER_RECONNECTED':
      game?.onPeer(msg.player_id, false);
      return;
    case 'CHAT':
      game?.onChat(msg);
      return;
    case 'LEFT_ROOM':
      saveTicket(null);
      if (waitingFor !== 'none') {
        waiting.hide();
        waitingFor = 'none';
      }
      return;
    case 'ERROR':
      if (rejoining && (msg.code === 'INVALID_TOKEN' || msg.code === 'ROOM_NOT_FOUND')) {
        rejoining = false;
        saveTicket(null);
        if (game) {
          toast('Match sebelumnya sudah berakhir.', 'info');
          showLobby();
        }
        return;
      }
      toast(ERROR_TEXT[msg.code] ?? msg.message);
      return;
    default:
      return;
  }
}

async function boot(): Promise<void> {
  app.replaceChildren(h('p', { class: 'subtitle' }, 'Memuat data pet…'));
  try {
    await loadRoster();
  } catch {
    app.replaceChildren(
      h('div', { class: 'panel dialog', style: 'margin:40px auto' },
        h('h2', { class: 'panel-title' }, 'Server tidak bisa dihubungi'),
        h('p', { class: 'subtitle' }, 'Pastikan server berjalan (npm run server), lalu coba lagi.'),
        h('button', { class: 'btn btn-gold', type: 'button', onclick: () => void boot() }, 'Coba lagi')),
    );
    return;
  }
  if (location.hash === '#galeri') return showGallery();
  document.body.append(waiting.el);
  showLobby();

  net.on(handle);
  net.onStatus((status) => {
    const online = status === 'open';
    lobby?.setConnection(online);
    game?.setConnection(online);
    if (!online && waitingFor === 'queue') {
      waiting.hide();
      waitingFor = 'none';
      toast('Koneksi terputus, antrean Quick Match dibatalkan.');
    }
    if (online) {
      const ticket = loadTicket();
      if (ticket) {
        rejoining = true;
        net.send({ event: 'REJOIN_ROOM', room_code: ticket.room_code, player_token: ticket.player_token });
      }
    }
  });
  net.connect();
  window.addEventListener('pointerdown', () => sfx.unlock(), { once: true });
}

void boot();
