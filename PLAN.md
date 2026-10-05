# BANDZ SHELL — Plan v2 (saved 2026-10-04, upgraded with Claude's ideas, reviewed by bands)

Working title: **Bandz Shell** ("Bandz Terminal" is taken by the market dashboard).
Status: PLAN ONLY — waiting on Tbandz's go.

## Vision
His own terminal. Phone-first web app: his branding, his commands, his games,
his projects — mission control for his world. No other terminal knows his
projects, his bot, his games. That's the moat.

## v1 — Phone-only, no backend (shippable in phases)

### Shell core (phase 1)
- **Plugin architecture from day one**: every command is a module with
  `name`, `help`, `explain`, `run`. Games and tools become drop-ins.
  `explain` ships in the contract, so Learn mode is nearly free.
- **Phone-native input (highest-impact mobile feature)**: custom key bar above
  the keyboard (Tab, Ctrl, arrows, |, /, ~); swipe left/right on the prompt to
  move the cursor; tap any past output line to re-run it.
- **Gold-on-charcoal default theme** (his pick) + `theme matrix`,
  `theme "daily corrosion"` (rust/acid/concrete), amber monochrome, vaporwave,
  `theme random`, time-of-day auto theme.
- **Boot sequence**: ~2s gold "BANDZ" ASCII logo + CRT flicker + sound.
  (No haptics — iOS Safari has no vibration API. The "tap to enter" also
  satisfies Apple's audio-autoplay rule.)
- **CRT shader toggle**: scanlines, glow, curvature, intensity slider
  (cheap CSS overlays).
- **Fake window chrome**: status bar with time + P&L ticker.
  (No battery — iOS Safari doesn't expose it.)
- **Offline PWA**: service worker caches the SHELL for instant open with no
  signal. Game/WASM cores (10–40MB+) stream on demand, never cached.
- `help`, `about` (neofetch-style), `clear`, `fortune`, easter eggs
  (`sudo make money`, etc.).

### Commands (phase 2–3)
- `stackz` — paper-trading HUD: ASCII sparkline of P&L, progress bar to the
  100-trade gate ([██████░░░░] 62/100), green/red flash on new fills
  (polls the snapshot). ALWAYS labeled "paper trading" — never mistaken
  for real money. Data: bot publishes a small JSON snapshot; shell fetches it.
- `games` — launcher for LAST SHIFT, CARRIER, idle garage game, with update notes.
- `halo` — opens the Halo browser fan port while alive. LINK ONLY, never bundled.
- `dungeon` — OUR OWN roguelike (phase 4, below).
- `note` / `todo` — local notes, works in v1 (small + exportable; iOS may evict
  storage after 7 idle days).
- `weather`, `pomodoro`, `ideas` (quick-capture inbox for content ideas),
  `clip`, `slate` (parlay calculator).
- `alias` / `macro` — user-defined commands. This is "custom commands as apps"
  made real.
- Learn mode: `explain <cmd>` (what it does + real syntax + tiny quiz),
  `learn` (daily 2-min missions with XP and ranks — "use grep to find the
  secret"), `why` (plain-English explanation after an error), every Bandz
  command can show its own source code.

### Dungeon — our roguelike (phase 4)
ASCII crawler, terminal-native (no emulator needed):
- Daily seeded run (same dungeon for everyone) + shareable result string.
- Bandz-flavored loot (items named after his brand/games); currency carries over.
- Fog of war + line-of-sight; one-thumb control scheme (swipe to move).
- Hall of fame saved locally; permadeath tombstones.

### Arcade (phase 5, lazy-loaded `arcade` command so the shell stays fast)
- Shooters: DOOM (Freedoom — free/legal/shippable; shareware Ep1 free;
  commercial WADs only if he owns them) via Dwasm; Quake 1/2; RtCW.
  Test DOOM + SuperTuxKart on phone FIRST (Quake 2 / RTCW can be heavy).
- Fighters: FBNeo/MAME browser cores — MK arcade, SF2, KOF, Killer Instinct.
  Touchscreen controller overlay (or Bluetooth pad) is REQUIRED — design it
  before fighters ship, not after.
- Racing: SuperTuxKart (free/open-source, browser builds exist, online
  multiplayer) = headliner; arcade racers (Out Run, Cruis'n) via emulator.
- Roguelikes: Shattered Pixel Dungeon (open source, browser fork,
  touch-designed), DCSS webtiles, Nethack/Brogue.
- ROM loading: "pick file from phone" (file picker) — game data is NEVER
  shipped in our build.

### Phone-as-app + widget
- Add to Home Screen → fullscreen icon, no App Store. Same trick works for
  the Bandz Terminal stock dashboard today.
- Scriptable iPhone widget: Stackz P&L / morning briefing on the home screen.

## v2 — Laptop backend (optional later upgrade)
Phone browser can't run Windows commands (sandboxed). Tiny backend on his
laptop over Tailscale (no open ports) + PIN/biometric gate unlocks:
- Real shell: type on phone → runs on laptop → output streams back.
- `ship`: bug-check + deploy pipeline from his phone. ALWAYS requires confirm.
- Persistent notes; ask-me-anything AI inside the terminal.

## Legal lines (do not cross)
- Freedoom: shippable. Shareware DOOM: free to use. Commercial WADs/ROMs:
  bring-your-own from copies he owns. Never bundle commercial game data.
- Halo browser port: link only. Unofficial fan project, unstable hosting
  (phishing flags), Microsoft's assets.
- GTA Vice City browser port: SKIP (Take-Two DMCA'd the re3/reVC code).
- Emulators are legal; game files must be his.

## Tech notes
- Single-page web app, static hosting (GitHub Pages). Canvas for game embeds.
- Static = no durable server persistence; saves are localStorage (small +
  exportable) until the v2 backend exists.
- 2D-era games fly on iPhone; PS1-era 3D and Morrowind-class are stretch goals
  (Morrowind via OpenMW-Web needs owned files + desktop Chrome works best).
- Roblox Studio on phone: NOT POSSIBLE, ever (Windows/Mac GUI-only).
  Real path is remote desktop to his laptop.
- Standing rule: EVERY build gets a bug-check pass before delivery, no exceptions.

## Build order
1. Shell core + key bar + plugin system + gold theme
2. Boot screen + PWA
3. `stackz` + `games`
4. Learn mode missions (`explain`/`why` ride free with plugins)
5. `dungeon`
6. Arcade — DOOM first, then the rest
7. v2 backend (only if he asks)

## Parked / cut
- Boot haptics, status-bar battery: impossible on iOS Safari. Cut.
- `ledger` (Ledger Live portfolio): no public API — cut unless manual entry.
- `drop` (streetwear countdown): Tbandz has no known streetwear launch — parked
  until he confirms it's real.
