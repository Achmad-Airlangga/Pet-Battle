import type { StatusSnapshot } from '../types.ts';

export interface StatusIcon {
  abbr: string;
  color: string;
  name: string;
  /** One line for the tooltip: what the status does. */
  desc: string;
}

const icon = (abbr: string, color: string, name: string, desc: string): StatusIcon => ({ abbr, color, name, desc });

const BY_LABEL: Record<string, StatusIcon> = {
  FREEZE: icon('ICE', '#8fd8ff', 'Freeze', 'Membeku: tidak bisa skill maupun swap.'),
  SLEEP: icon('Zz', '#9fa8ff', 'Sleep', 'Tertidur: tidak bisa skill maupun swap. Sugar Rush membangunkan 2x lebih cepat.'),
  ENTHRALL: icon('LUV', '#ff8fc7', 'Enthrall', 'Terpikat: tidak bisa skill, masih bisa swap.'),
  DANCE: icon('DNC', '#ff8fc7', 'Just Dance', 'Menari: tidak bisa skill dan terkena damage tiap detik.'),
  BUBBLE: icon('BBL', '#7fc8ff', 'Bubble Trap', 'Terperangkap gelembung: tidak bisa swap.'),
  STICKY_WEB: icon('WEB', '#e8d36a', 'Sticky Web', 'Terjerat jaring: tidak bisa swap.'),
  SMOKE: icon('SMK', '#d6e2ff', 'Smoke · Defend Dodge', 'Asap tebal: menghindari semua serangan biasa.'),
  BUILD: icon('BLD', '#c9b08a', 'Build (Block)', 'Memblokir semua serangan biasa.'),
  SHELL: icon('SHL', '#7fd1a0', 'Shell Defense', 'Damage yang diterima jauh berkurang.'),
  BURN: icon('BRN', '#ff8a3c', 'Burn', 'Terbakar: damage Fire tiap interval.'),
  SPORES: icon('SPR', '#a5d36a', 'Spores', 'Spora: damage Earth tiap interval.'),
  HOWL: icon('ATK', '#ff6b6b', 'Howl', 'Damage keluar +25%.'),
  SPICY: icon('SPC', '#ff5a36', 'Spicy Ignite', 'Serangan Fire berikutnya lebih kuat.'),
  MUD: icon('MUD', '#a1785a', 'Mud', 'Lumpur: skill, swap dan jeda skill seluruh tim recharge 2x lebih lambat.'),
  SUGAR_RUSH: icon('SGR', '#ffb3d9', 'Sugar Rush', 'Cooldown skill 2x lebih cepat, dan bangun dari Sleep 2x lebih cepat.'),
  LOCKJAW: icon('LCK', '#ff4d6d', 'Lockjaw', 'Kalau swap, pet ini dan kawannya kena damage.'),
  NEEDLES: icon('NDL', '#b6d36a', 'Needles', 'Memantulkan damage ke penyerang.'),
  SPIKEY_SHIELD: icon('SPK', '#d3c36a', 'Spikey Shield', 'Memantulkan damage ke penyerang.'),
  BOUNCY_BARRIER: icon('BNC', '#7fb8ff', 'Bouncy Barrier', 'Memantulkan damage ke penyerang.'),
  PHANTOM_REGEN: icon('RGN', '#7fe08f', 'Regen', 'Memulihkan HP tiap interval.'),
  DRAINING_ROOTS: icon('RGN', '#7fe08f', 'Regen', 'Memulihkan HP tiap interval.'),
  SHADOW_REALM: icon('SHD', '#9b59ff', 'Shadow Realm', 'Efek dunia bayangan.'),
  DISCO: icon('DSC', '#ff8fc7', 'Disco Fever', 'Efek disko.'),
  INSPIRED: icon('INS', '#ffe066', 'Inspired', 'Buff acak dari kuas inspirasi.'),
  SUPERCHARGE: icon('SUP', '#ff6b6b', 'Supercharge', 'Damage keluar meningkat.'),
  LOCKDOWN: icon('LKD', '#ffd54f', 'Lockdown', 'Terkunci.'),
  ACID_SPIT: icon('ACD', '#8fd36a', 'Acid Spit', 'Asam: damage tiap interval.'),
  DIAMOND: icon('DEF', '#a8e6ff', 'Diamond', 'Damage yang diterima -50%.'),
  DIAMOND_SHIELD: icon('DIA', '#a8e6ff', 'Diamond Shield', 'Memantulkan sebagian damage ke penyerang.'),
};

const BY_STATUS: Record<string, StatusIcon> = {
  STUN: icon('STN', '#ffd54f', 'Stun', 'Tidak bisa skill maupun swap.'),
  SILENCE: icon('SIL', '#ff8fc7', 'Silence', 'Tidak bisa skill, masih bisa swap.'),
  ROOT: icon('RT', '#c9a46a', 'Root', 'Tidak bisa swap.'),
  DODGE: icon('DGE', '#bfefff', 'Dodge', 'Menghindari semua serangan kecuali Undodgeable.'),
  BLOCK: icon('BLK', '#c7ccd9', 'Block', 'Memblokir semua serangan kecuali Unblockable.'),
  DAMAGE_REDUCTION: icon('DEF', '#7fd1a0', 'Damage reduction', 'Damage yang diterima berkurang.'),
  THORNS: icon('THR', '#b6d36a', 'Thorns', 'Memantulkan damage ke penyerang.'),
  DECOY: icon('DCY', '#e8f0ff', 'Decoy (rahasia)', 'Serangan berikutnya dihindari, lalu otomatis swap dan meninggalkan Smoke. Lawan tidak bisa melihat status ini.'),
  REBIRTH: icon('RBR', '#ffcf3f', 'Rebirth', 'Bangkit lagi saat K.O.'),
  DOT: icon('DOT', '#c18bff', 'Damage over time', 'Kena damage tiap interval.'),
  HOT: icon('HOT', '#7fe08f', 'Heal over time', 'Pulih tiap interval.'),
  TRAUMA: icon('TRM', '#b33b4f', 'Trauma', 'Tidak bisa di-heal.'),
  DAMAGE_BOOST: icon('ATK', '#ff6b6b', 'Damage boost', 'Damage keluar meningkat.'),
  RAGE: icon('RAG', '#ff4d4d', 'Rage', 'Damage keluar naik per stack.'),
  NEXT_ELEMENT_BOOST: icon('BST', '#ff8a3c', 'Next attack boost', 'Serangan berikutnya lebih kuat.'),
  DOUBLE_DAMAGE_CHANCE: icon('2X', '#ffe066', 'Double damage', 'Peluang damage x2.'),
  COOLDOWN_SLOW: icon('SLW', '#a1785a', 'Cooldown lambat', 'Recharge seluruh tim lebih lambat.'),
  COOLDOWN_HASTE: icon('HST', '#ffb3d9', 'Cooldown cepat', 'Recharge skill lebih cepat.'),
  DOOM: icon('DOOM', '#9b59ff', 'Doom', 'K.O. saat waktunya habis. Swap untuk membersihkan.'),
  SWAP_PUNISH: icon('LCK', '#ff4d6d', 'Lockjaw', 'Kalau swap, pet ini dan kawannya kena damage.'),
};

export function statusIcon(s: StatusSnapshot): StatusIcon {
  return BY_LABEL[s.type] ?? BY_STATUS[s.status] ?? icon(s.type.slice(0, 3), '#c18bff', s.type, '');
}
