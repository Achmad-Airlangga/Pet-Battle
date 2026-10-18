---
title: Pet Battle Arena
emoji: 🐾
colorFrom: yellow
colorTo: blue
sdk: docker
app_port: 7860
pinned: false
---

# Pet Battle Clone — Engine, Server, Web Client & Simulasi (PRD Step 1–5)

Clone Pet Battle Growtopia: engine game murni TypeScript, server multiplayer WebSocket, dan web client (Canvas + HUD). Satu-satunya dependency runtime adalah `ws` untuk server.

## Main cepat

```bash
npm install
npm start          # build client lalu jalankan server -> buka http://localhost:8080
```

Buka dua tab/browser, buat Private Room di tab pertama, lalu masukkan kodenya di tab kedua (atau tekan Quick Match di keduanya).

Mode development (hot reload client, proxy ke server):

```bash
npm run server        # terminal 1: server di :8080
npm run dev:client    # terminal 2: Vite di http://localhost:5173
```

## Deploy online (Hugging Face Spaces, gratis tanpa kartu)

`Dockerfile` menjalankan server + client dalam satu container di port 7860. Blok YAML di paling atas README ini adalah pengaturan Space (SDK Docker, port 7860).

1. Buat akun di [huggingface.co](https://huggingface.co), lalu **New Space**: pilih SDK **Docker** (template *Blank*), hardware **CPU basic (free)**.
2. Kirim kode ke Space: `git remote add space https://huggingface.co/spaces/<user>/<nama-space>` lalu `git push space main --force` (login memakai username Hugging Face dan *access token* dengan izin write sebagai password).
3. Tunggu build selesai (tab *Logs*), lalu buka `https://<user>-<nama-space>.hf.space`.

Space gratis tidur setelah lama tidak dipakai; kunjungan berikutnya membangunkannya lagi.

## Deploy online (Render)

Game ini butuh server Node yang terus hidup untuk WebSocket, jadi tidak bisa jalan di hosting statis/serverless seperti Vercel. `render.yaml` menyiapkan satu web service di [Render](https://render.com) yang menjalankan server dan menyajikan client dari URL yang sama:

1. Di Render: **New → Blueprint**, pilih repo ini. Render membaca `render.yaml` (build `npm ci && npm run build:client`, start `npm run server`, health check `/health`, Node 22).
2. Tunggu deploy selesai, lalu buka URL `https://<nama>.onrender.com`.

Paket gratis Render tidur setelah ~15 menit tanpa pengunjung; kunjungan pertama setelahnya butuh sekitar 1 menit untuk bangun.

## Semua perintah

```bash
npm test           # 131 test (node:test), termasuk 2 match bot lewat socket asli
npm run balance    # analisis DPS + sweep ribuan match headless (lihat "Battle pet & balance")
npm run sim        # simulasi bot vs bot dengan latensi buatan (lihat Step 5)
npm run typecheck  # tsc untuk server + client
npm run simulate   # bot vs bot, cetak log + state JSON
npm run import:pets            # Excel + data/source/extra_pets.json -> src/data/pets_data.json
npm run import:pets -- --check # gagal kalau JSON tidak sinkron dengan Excel
npm run server                 # ws://localhost:8080/ws + client hasil build (PORT / HOST via env)
npm run build:client           # client -> dist/client
```

Butuh Node >= 22.18 (TypeScript dijalankan langsung lewat type stripping bawaan Node).

## Struktur

| File | Isi |
|---|---|
| `src/engine/BattleSession.ts` | Kelas utama: lifecycle match, validasi command, resolusi skill, damage, swap, KO, weather, snapshot state |
| `src/engine/status.ts` | Status effect state machine (`ACTIVE` → `EXPIRED / CONSUMED / PURGED / STOLEN / TRANSFERRED / SWAP_OUT / KO`) + aturan stacking/kontrol per tipe |
| `src/engine/elements.ts` | Matriks elemen PRD 4.2 |
| `src/engine/damage.ts` | `Final = Base × Element × Buff × SkillBonus × Crit × Incoming` |
| `src/engine/TickLoop.ts` | Driver fixed-timestep 50ms (20Hz) berbasis wall clock |
| `src/engine/weather.ts` | Toxic Cloud, Count Sheep, Heat Wave, Hailstorm |
| `src/engine/rng.ts` | RNG ber-seed; match bisa di-replay dari seed + log command |
| `src/data/petCatalog.ts` | 170 pet dari Excel dalam bentuk effect DSL |
| `src/data/pets_data.json` | Hasil import Excel (dibuat otomatis, jangan diedit manual) |
| `src/data/petRepository.ts` | Menghubungkan JSON dengan katalog → `PET_ROSTER`, `getPetInfo()`, `listPets()` |
| `scripts/import-pets.ts` | Importer Excel (reader xlsx tanpa dependency di `scripts/lib/`) |
| `data/source/` | Salinan `growtopia_pet_battle_database.xlsx` |

## Pet tambahan (di luar Excel)

Pet yang tidak ada di Excel ditulis di `data/source/extra_pets.json` (kolom sama seperti sheet), lalu `npm run import:pets` menggabungkannya ke `pets_data.json` dengan `"origin": "manual"`. Mekaniknya tetap di `src/data/petCatalog.ts` dan dicek silang seperti baris Excel. Penomoran dimulai setelah baris terakhir sheet (170), jadi sekarang 171+.

| No | Pet | Elemen | Ability | Cooldown | Efek |
|---|---|---|---|---|---|
| 171 | Pet Frog | Water | Spit Mud | 12 dtk (awal 6) | 20 Water damage; selama 5 dtk semua ability target recharge 2x lebih lambat |
| 172 | Marshmallow Basket | Fire | Sugar Rush | 60 dtk (awal 12) | Selama 10 dtk semua ability **kedua** pet milikmu recharge 2x lebih cepat |

Cooldown awal kedua pet tidak tercantum di kartu ability, jadi diasumsikan (50% untuk Frog, 12 dtk seperti skill 60 dtk lain untuk Marshmallow). Alasannya dicatat di field `note`.

**Windspeed (Summer Kite)** hanya berlaku untuk slot deck (battle pet) yang membawanya: cooldown pet itu -2 dtk, dan swap **masuk ke** pet itu (manual, dipaksa, atau karena K.O.) tidak memicu jeda swap 1,5 dtk. Pet di slot lain tidak mendapat efek apa pun, termasuk kalau Summer Kite hanya menjadi salah satu dari 3 ability sebuah battle pet.

Aturan tambahan:

- **Jeda skill global (GCD) 1 dtk**: setelah memakai skill apa pun, pemain tidak bisa memakai skill lain selama 1 dtk (`GLOBAL_COOLDOWN`). Di HUD terlihat sebagai bar energi di bawah HP.
- **Mud** (Mud Glob, Spit Mud) memperlambat semua timer tim yang terkena: cooldown skill kedua pet, jeda swap, dan GCD.
- **Sugar Rush vs Count Sheep**: pet yang sedang Sugar Rush bangun dari Sleep 2x lebih cepat (8 dtk jadi 4 dtk).
- **Decoy** (Self Sacrifice, Trick Escape) hanya terlihat oleh pemiliknya; server tidak mengirim status maupun event-nya ke lawan. **Smoke** selalu memberi Dodge (Defend Dodge), juga ke pet itu sendiri kalau tidak ada kawan untuk swap.

## Alur data pet (Step 2)

```
data/source/*.xlsx --import:pets--> src/data/pets_data.json --+
                                                              +--> petRepository.ts --> PET_ROSTER (PetInfo[])
src/data/petCatalog.ts (efek skill, ditulis manual) ----------+
```

- `pets_data.json` menyimpan semua kolom Excel: no, id, elemen, nama, deskripsi visual, ability, cooldown, cooldown awal, base damage (raw + min/max), deskripsi efek.
- Katalog menyimpan mekanik yang bisa dieksekusi engine, karena efek skill tidak bisa diturunkan otomatis dari teks deskripsi.
- Saat dimuat, `petRepository` mencocokkan keduanya per baris (id, nama, elemen, ability, pasif, cooldown, cooldown awal, base damage untuk skill damage langsung) dan langsung **throw** kalau ada yang berbeda. Jadi kalau Excel diubah: jalankan `npm run import:pets`, lalu `npm test` akan menunjukkan entri katalog mana yang harus disesuaikan.
- `PetInfo` = `PetDefinition` + `visualDescription`, `effectDescription`, `baseDamage`. Bisa langsung dipakai di `BattleSession` dan dikirim ke frontend.

## Server multiplayer (Step 3)

| File | Isi |
|---|---|
| `src/server/protocol.ts` | Tipe pesan client↔server + validator input |
| `src/server/Room.ts` | Satu room = satu match 1v1: memegang `BattleSession`, broadcast `STATE_TICK`, reconnect, forfeit |
| `src/server/RoomManager.ts` | Private room (kode 6 digit), antrean Quick Match berbasis MMR, satu timer 20Hz untuk semua room, cleanup |
| `src/server/GameServer.ts` | HTTP + WebSocket (`ws`): `/ws`, `GET /health`, `GET /pets`, heartbeat, rate limit, batas payload |

Semua pesan berupa JSON dengan field `event`. Identitas pemain diambil dari koneksinya; `player_id` dari client tidak dipakai server.

**Client → Server**

| event | field |
|---|---|
| `CREATE_ROOM` | `user_id`, `pets: [[a, b, c], [d, e, f]]` (2 battle pet x 3 pet, pet dasar di depan) → membuat private room, kamu jadi `p1` |
| `JOIN_ROOM` | `room_code`, `user_id`, `pets` → masuk sebagai `p2`, match langsung mulai |
| `QUICK_MATCH` / `CANCEL_QUICK_MATCH` | `user_id`, `pets`, `mmr?` (default 1000) |
| `REJOIN_ROOM` | `room_code`, `player_token` (dari `ROOM_JOINED`) |
| `CAST_SKILL` | `ability_index` (0-2, default 0), `match_id?`, `pet_index?`, `timestamp?` (format PRD 3.2) |
| `SWAP_PET` | `match_id?`, `timestamp?` |
| `LEAVE_ROOM` | — (saat match berjalan = menyerah/forfeit) |
| `CHAT` | `text` (1–200 karakter) |
| `PING` | `timestamp` → `PONG` dengan `server_time` (untuk mengukur RTT) |

**Server → Client:** `ROOM_JOINED`, `ROOM_UPDATE`, `MATCH_START` (state awal + `you`), `STATE_TICK` (setiap 50ms: `tick`, `server_time`, `state` PRD 5.1, `events`), `MATCH_END`, `PLAYER_DISCONNECTED` / `PLAYER_RECONNECTED`, `CHAT`, `QUEUED` / `QUEUE_LEFT`, `LEFT_ROOM`, `PONG`, `ERROR` (`code` + `message`).

Aturan server:
- Command masuk ke antrean engine dan diproses di tick berikutnya. `ACTION_REJECTED` hanya dikirim ke pemain yang bersangkutan; event lain identik untuk kedua pemain.
- Kalau koneksi putus saat match, pemain punya **15 detik** untuk `REJOIN_ROOM` (state lengkap dikirim ulang lewat `MATCH_START`). Lewat dari itu, otomatis forfeit. Battle tetap berjalan selama pemain terputus.
- Quick Match memasangkan pemain yang paling lama menunggu dengan MMR terdekat. Jendela MMR mulai dari ±100 dan melebar 50/detik.
- Room yang selesai dihapus setelah 60 detik, atau langsung kalau kedua pemain sudah keluar.
- Rate limit 40 pesan burst / 20 per detik per koneksi, payload maks 4KB, client yang terlalu lambat (backlog > 1MB) diputus.
- MMR masih dikirim oleh client karena belum ada sistem akun.

## Web client (Step 4)

Kode ada di `client/` (Vite + TypeScript + Canvas 2D, tanpa framework). Client hanya mengimpor **tipe** dari `src/`, jadi protokol dan state selalu sinkron dengan server.

| File | Isi |
|---|---|
| `client/src/main.ts` | Alur layar: lobby → menunggu → match → hasil, reconnect otomatis |
| `client/src/net.ts` | WebSocket dengan reconnect (backoff) dan pengukur ping |
| `client/src/ui/lobby.ts` | Nama pemain, perakit Battle Leash (2 battle pet x 3 slot, elemen bebas), filter elemen, cari, detail pet, Quick Match / Private Room |
| `client/src/game/renderer.ts` | Arena 2D side-view: panggung + kuil, pet aktif & cadangan, HP bar, ikon status, cooldown radial, efek cuaca |
| `client/src/game/particles.ts` | Particle system + proyektil per elemen (angin, batu, api, air) |
| `client/src/game/fx.ts` | Event battle → proyektil, floating text (merah damage, hijau heal, ungu DoT, DODGE/BLOCK), suara |
| `client/src/game/GameScreen.ts` | HUD: jam match (menghitung naik), banner cuaca, tombol Skill & Swap dengan overlay cooldown, log, chat, layar hasil |
| `client/src/sprites.ts` | Sprite pixel-art 16×16 yang dibuat prosedural dari id + elemen pet |
| `client/src/audio.ts` | Efek suara disintesis dengan Web Audio (tanpa file audio) |

Kontrol: **1 / Q**, **2 / W**, **3 / E** = ability 1-3, **Space** = swap, **Enter** = chat. Tombol "Menyerah" = forfeit.

Catatan:
- Database tidak punya gambar pet, jadi setiap pet mendapat sprite prosedural yang konsisten (pet yang sama selalu terlihat sama di semua client). Sprite bisa diganti aset asli nanti tanpa mengubah logika.
- Client tidak memprediksi hasil aksi. Tombol hanya menahan aksi yang jelas ditolak (stun, cooldown, swap lock), dan semua hasil berasal dari `STATE_TICK` server.
- Refresh halaman saat match berjalan akan otomatis `REJOIN_ROOM` (token disimpan per tab di `sessionStorage`).
- Protokol mendapat pesan baru `CHAT` (client → server `{ text }`, server → client `{ player_id, user_id, text }`).

## Simulasi & lag compensation (Step 5)

### Lag compensation

Client dan server menyamakan jam lewat `PING`/`PONG` (gaya NTP: offset diambil dari round trip tercepat). Setiap `CAST_SKILL` / `SWAP_PET` membawa `timestamp` = perkiraan `server_time` saat tombol ditekan. Server mengubahnya menjadi waktu match (`atMs`), lalu:

1. **Urutan adil.** Input dalam satu tick diproses menurut kapan ditekan, bukan kapan sampai. Pemain dengan ping tinggi tidak otomatis kalah cepat.
2. **Favour the acting player.** Kalau aksi ditolak hanya karena stun / silence / root / perpanjangan cooldown dari lawan yang mendarat *selagi input masih di jalan*, dan aksi itu valid pada saat ditekan (pet aktif sama), aksi tetap dijalankan. Event `LAG_COMPENSATED` mencatat alasannya dan besar lag-nya.
3. **Batas anti-curang.** Lag yang diakui dibatasi `min(200 ms, RTT/2 + 50 ms)`. RTT diukur server sendiri lewat ping WebSocket, bukan dari klaim client. Timestamp dari masa depan dianggap "sekarang". Kompensasi tidak pernah berlaku terhadap aksi pemain itu sendiri (double-press tidak bisa menembus cooldown), dan tidak berlaku kalau pet aktif sudah berganti.

Validitas aksi disimpan per tick (setelah fase aksi dan di akhir tick) selama jendela kompensasi. Semuanya deterministik, jadi replay tetap identik.

### Replay & verifikasi

`MATCH_END` membawa `replay` (seed, durasi, pet, dan seluruh command log beserta tick dan `atMs`). Siapa pun bisa menjalankan ulang match dengan `replayMatch()` dan membandingkan setiap tick. Bot simulasi melakukan ini untuk setiap match.

### Menjalankan simulasi

```bash
npm run sim                                         # 7 skenario standar
npm run sim -- --matches 20 --parallel 8 --latency 60,200 --jitter 50
npm run sim -- --time-scale 1 --matches 2           # kecepatan asli
npm run sim -- --surrender-after 300                # menyerahkan match buntu setelah 300 detik waktu match (default 240)
```

| Komponen | Isi |
|---|---|
| `src/sim/LatencyProxy.ts` | Proxy TCP yang menunda setiap byte di kedua arah (urutan tetap terjaga seperti TCP), termasuk ping transport, jadi RTT yang diukur server realistis. Latensi bisa diubah saat berjalan (lag spike). |
| `src/sim/BotClient.ts` | Pemain headless via WebSocket asli: sinkronisasi jam, strategi `aggressive` / `tactical` / `chaos` / `idle`, mencatat setiap `STATE_TICK`. |
| `src/sim/verify.ts` | Replay per tick, invariant state (HP, status K.O., cooldown, jam match, pet aktif), aturan pemenang (K.O. / menyerah), dan perbandingan state antar dua client. |
| `src/sim/simulation.ts` | `runMatch()`: proxy + 2 bot + semua pengecekan → laporan PASS/FAIL. |
| `scripts/sim-battle.ts` | CLI: skenario stun war, burst K.O. + forced swap, cuaca + possession, quick match, disconnect → forfeit, lag spike 400 ms, spam input acak, lalu tim acak. |

Setiap match dianggap lulus jika: replay cocok di setiap tick yang diterima, tidak ada tick hilang atau terbalik, kedua client menerima state dan `MATCH_END` yang identik, semua invariant terpenuhi, dan pemenang sesuai aturan K.O./menyerah. Karena tidak ada timer, match yang buntu diakhiri oleh bot yang HP-nya lebih sedikit dengan `LEAVE_ROOM` (menyerah), seperti yang akan dilakukan pemain.

`timeScale` (opsi `RoomManager`) mempercepat match hanya untuk test dan simulasi. Waktu lag diukur dalam ms dunia nyata lalu dikonversi ke waktu match.

## Cara pakai engine

```ts
import { BattleSession, getPet } from './src/index.ts';

const session = new BattleSession({
  matchId: 'ROOM_10293',
  seed: 12345,
  players: {
    // 2 battle pet per pemain, masing-masing 3 pet yang di-splice (pet dasar di depan)
    p1: { userId: 'USER_A', pets: [['Mid-Pacific Owl', 'Zorbnik Leash', 'Chick Leash'].map(getPet), ['Puppy Leash', 'Pet Bunny', 'Calf Leash'].map(getPet)] },
    p2: { userId: 'USER_B', pets: [['Fiery Dragon Leash', 'Fire Ants', 'Hot Pepper Leash'].map(getPet), ['Baby Turtle', 'Penguin Leash', 'Robo Shark'].map(getPet)] },
  },
});
session.start();                                           // HP 100%, cooldown awal
session.submit({ type: 'CAST_SKILL', playerId: 'p1', abilityIndex: 1 }); // Stun Ray
const { events } = session.tick();                         // maju 50ms
const state = session.getState();                          // bentuk PRD 5.1
```

Command divalidasi saat tick berikutnya, sesuai urutan masuk. Kalau tidak valid, keluar event `ACTION_REJECTED` beserta alasannya (`ON_COOLDOWN`, `STUNNED`, `SWAP_LOCK`, …). `canCastSkill()` / `canSwap()` bisa dipakai untuk menampilkan status tombol di HUD.

## Urutan per tick

1. Proses command yang antre → cek KO / auto-swap setelah tiap command
2. Majukan waktu 50ms: jam match, swap lock, GCD, cooldown (Mud memperlambat semuanya, Sugar Rush mempercepat cooldown dan Sleep), regen pet cadangan, tick DoT/HoT, status yang expired, weather
3. Cek KO / auto-swap / akhir match

## Urutan resolusi serangan

Decoy (Self Sacrifice) → Dodge (status atau pasif 25%) kecuali Undodgeable → Block kecuali Unblockable → multiplier → damage → reaksi (Thorns, Static Charge, Rebirth/KO). Kalau serangan meleset, efek tambahan ke musuh (stun, trauma, forced swap, …) dibatalkan. Efek ke diri sendiri tetap berlaku.

## Battle pet & balance

PRD awal memodelkan 1 pet = 1 ability. Di Growtopia, **Battle Leash berisi 2 battle pet, dan setiap battle pet punya 3 ability** hasil gene-splicing 3 pet di Battle Pet Cage ([Growtopia Wiki: Battle Leash](https://growtopiawiki.com/w/Battle_Leash), [Battle Pet Cage](https://growtopiawiki.com/w/Battle_Pet_Cage)). Dengan 1 ability per pet, damage per detik hanya sekitar 1/3 dari aslinya, jadi hampir semua match berakhir karena waktu habis (saat masih ada timer 120 detik).

Model sekarang:
- Satu battle pet = 1–3 pet sumber (server mewajibkan tepat 3), **elemennya boleh campur**. **Pet dasar** (slot pertama) menentukan nama, sprite, elemen bertahan, dan HP dasar 150.
- Setiap ability punya cooldown, cooldown awal, jumlah pemakaian, dan siklus (Mini Growtopian) sendiri. Stun/silence mengunci ketiganya sekaligus; swap lock berlaku untuk semua.
- Damage ability memakai elemen pet sumbernya. Passive dari ketiga pet digabung (mis. Mammoth Heart +30% HP, Stubborn, Soaring).
- Windspeed memotong cooldown semua ability battle pet yang membawanya (tidak untuk partnernya). Draining Beam memperpanjang semua ability musuh yang sedang recharge. Possession memaksa korban memakai salah satu ability-nya **secara acak**.
- Snapshot pet sekarang punya `abilities: [{ name, pet_id, element, is_passive, cooldown_remaining, uses_left }]` (menggantikan `ability`/`cooldown_remaining`/`is_passive` tunggal).

## Akhir pertandingan

Tidak ada timer. Match hanya berakhir dengan dua cara:

- **K.O.**: semua pet satu pihak K.O. (kalau keduanya habis di tick yang sama, hasilnya seri).
- **Menyerah**: tombol "Menyerah" (`LEAVE_ROOM`), atau terputus lebih dari 15 detik tanpa `REJOIN_ROOM`. Pemain yang menyerah tetap menerima `MATCH_END` sebelum `LEFT_ROOM`.

Snapshot state memakai `elapsed_sec` (jam yang menghitung naik) sebagai ganti `timer_remaining_sec`, dan `MATCH_END.replay` membawa `final_tick` agar replay tahu kapan berhenti.

`npm run balance` (1000 match acak per baris, tim elemen campuran, HP 150, tanpa timer):

| Ability per pet | K.O. ≤ 60 dtk | ≤ 120 dtk | ≤ 300 dtk | Buntu (> 600 dtk) | Median sampai K.O. |
|---|---|---|---|---|---|
| 1 (model lama) | 1% | 8% | 81% | 9% | 190 dtk |
| **3 (Battle Leash)** | **16%** | **87%** | **99%** | **0%** | **80 dtk** |

Dengan 3 ability, match hampir selalu selesai sendiri. Untuk kasus langka yang buntu (mis. dua tim penyembuh), pemain bisa menyerah.

## Asumsi (data PRD/Excel tidak eksplisit)

- **Elemen battle pet bebas**: ketiga pet dalam satu battle pet boleh berbeda elemen (keputusan desain game ini; di Growtopia mencampur butuh CRISPR Technology). Pet dasar menentukan elemen bertahan; setiap ability menyerang dengan elemen pet asalnya.

- **Max HP 150** per battle pet (Excel tidak punya kolom HP). Mammoth +30% = 195. Angka ini cocok dengan batas PRD dan dengan laporan pemain Growtopia (150, atau 195 dengan Mammoth Heart).
- **Toxic Cloud**: 4 dmg / 5 detik selama 60 detik = 48 total. Kolom Excel menulis "88", tapi angka itu tidak cocok dengan mekanik yang dijelaskan.
- **Swap lock 1.5 detik** juga berlaku untuk forced swap dan auto-swap setelah KO.
- Status tetap berjalan saat pet ada di cadangan, kecuali Doom dan tanda Lockjaw yang hilang saat swap out.
- Thorns hanya memantul kalau serangan kena (tidak saat di-dodge/block).
- Reduksi Stubborn/Shell Defense hanya untuk serangan langsung, tidak untuk DoT, weather, atau Doom.
- Possession: pet musuh memakai skill-nya sendiri dengan target terbalik, tanpa memicu cooldown-nya.
- Wish hanya bisa dipakai kalau partner sedang KO.
- Face Slap memberi Rage ke **musuh** (+25% per stack, maks 20), sesuai teks Excel.

## Revisi database (Edisi "Database Pet Battle Final")

Sheet baru (`growtopia_pet_battle_database_revised.xlsx`) berisi **170 pet** (dulu 140). Selain 31 pet baru, nomor `No` banyak yang bergeser; `no` di katalog mengikuti sheet, sedangkan `id`/nama tidak berubah sehingga tim yang sudah ada tetap valid.

Perubahan skill pada pet lama:

- **Leashed Silkworm - Red**: dulu skill cuaca Heat Wave (60 dtk). Sekarang "Death Ray / Heat Wave" 13 dtk / 24 Fire damage. Yang dipakai hanya bagian Death Ray (damage), karena efek cuaca 60 dtk tidak masuk akal di cooldown 13 dtk. Karena tidak ada pet lain yang memanggil Heat Wave, cuaca Heat Wave tetap ada di engine dan diuji lewat definisi pet inline di `tests/session.test.ts`.
- **Flame Sprite → "Flame Sprite / Playful Fire Sprite"**: ability "Wildfire" (15 dtk / 12 damage) menjadi "Playful Fire / Wildfire" (8 dtk / 15 damage) + peluang Double Damage.

Mekanik baru yang ditambahkan ke engine untuk pet baru:

- `perEnemyDebuff` (Unearthly Beam): +15 base damage per status negatif pada musuh.
- `reflectPct` pada status Thorns (Diamond Shield): memantulkan sebagian damage yang masuk, bukan angka tetap.
- `randomBuff` (Hit by Inspiration): memberi satu buff acak dari `RANDOM_BUFFS` di `BattleSession.ts` (Damage Boost +25%/10 dtk, Dodge 3 dtk, Block 3 dtk, Damage Reduction 50%/5 dtk, Double Damage 25%/8 dtk, Cooldown Haste 2x/8 dtk, Heal 5/dtk selama 5 dtk).

Angka yang tidak disebutkan di deskripsi (dipilih agar sebanding dengan skill sejenis, dicatat juga di komentar `petCatalog.ts`):

- **To The Shadow Realm!** (Lantern's ChronoReaper): Silence 6 dtk, sama seperti Enthrall.
- **Supercharge** (Captain Bark): Damage Boost +50% selama 15 dtk (Howl adalah +25% selama 30 dtk).
- **Lockdown** (Toy Lock-Bot): Stun 2 dtk (Shock Blast 1 dtk, Stun Ray 3 dtk).
- **Diamond Shield** (Diamond Block): damage masuk -50% dan 50% dari damage yang kena dipantulkan.
- **Unearthly Beam** (Unearthly Synthoid): kolom Base Damage sheet menulis 25, sedangkan teksnya "10 + 15 per status negatif". Kolom Base Damage yang dipakai (repository mengeceknya), lalu +15 per debuff ditambahkan di atasnya.
