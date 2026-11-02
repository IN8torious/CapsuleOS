# Capsule Toolbox — What It Does and Why It Exists

*Pre-release. This document is written to be honest: every feature is marked **Working**, **Prototype**, or **Not verified**, so you always know what you are relying on.*

---

## Why this was made

Most Windows tools ask for blind trust: a button says "Optimize", something changes, and you never learn what. Browsers are the same — you cannot see what is blocked or rewritten.

Capsule Toolbox was built on the opposite idea:

1. **You can read it.** Every change the app can make is a short, named item with a plain description, shown before you approve it.
2. **You decide.** Agents (the "crew") may *propose*. Only a human approving can change anything.
3. **It cannot do more than it says.** There is no free-form shell or PowerShell box in the Toolbox. Its Windows actions are a fixed list of named actions, each taking only an id and needing explicit confirmation.
4. **Web pages stay in a cage.** Pages load in a separate webview with no access to the app's internals.

This rule set comes from the **SI Core** kernel and playbook (`PLAYBOOK.md`, `kernel/si-kernel.js`, `agents/crew-manifest.json`), which act as the governance layer.

### The safety law (fixed)
- Mod Forge and Kernel library imports stay **inert** (viewed, never run). Scene Studio is a separate, explicitly started HTML preview; it runs reviewed source in an opaque-origin sandbox without host tools.
- Agents **only propose**; a human approves.
- Registry settings are **fixed-allowlist, explicitly reviewed, verified by read-back, receipted, and rollback-guarded**. Catalog options can include HKLM machine-wide settings; Appearance preferences remain HKCU.
- New registry approvals and Undo request **Windows UAC** through a fixed native helper. The main app and its browser are not relaunched elevated. The helper accepts only compiled catalog targets, checks both pipe peer process IDs and the Windows user identity, and exposes no arbitrary shell. UAC cancellation changes nothing. Elevation using another Windows account is rejected rather than changing the wrong user's preferences.
- The separate AME Wizard playbook is different: checked options can make fixed registry changes, including some HKLM machine-wide settings. Its optional bundled Toolbox installer runs only if explicitly checked in AME Wizard.
- **No free-form shell.**

---

## What it can do

### Optional WSL2 agent inference host

**Implemented; both approved models verified with real Pengwin WSL2 CPU inference.** Each loaded from hash-verified ext4 assets and returned `4` for a bounded `2 + 2` request; test workers closed afterward. This is a functional check, not a speed comparison or GPU claim. Windows remains the default. The header's terminal/monitor icon opens **WSL management**, also available in the directory. It shows registered WSL2 hosts and a running/stopped snapshot, with explicitly confirmed per-distro Start and Stop. Start runs only `/bin/true` to launch the selected distro and can idle down afterward; Stop terminates every process in that distro, including work outside Capsule. Save Linux work first. Neither global shutdown nor unregister, deletion, installation or shell commands are exposed. These controls currently require the Browser companion to be running.

Settings > Workload runtime offers Windows-only (the default) or an explicitly selected existing WSL2 distribution with Windows fallback. Refresh reads inventory without launching a distro. It excludes WSL1 and Docker-managed distributions. Setup links open Ubuntu's official GitHub project (the beginner recommendation), Pengwin's Store page, or the supplied Pistachio Linux Store page. They do not download or install anything. Pistachio runtime compatibility is unverified.

Inventory cross-checks WSL's verbose listing against its registered-distro listing. Entries still installing or being removed appear as **Unavailable**, without lifecycle controls or inference selection; they are not mislabeled Stopped. Complete setup in the distribution's own application and Refresh.

Opting in saves a preference in the Browser companion's user-data directory and stops any loaded model. Loading an approved model then starts one shared Linux CPU inference worker on demand. No arbitrary commands, agent scripts, systemd services, GPU setup, distro installation, package installation, model copying, or `.wslconfig` changes are exposed. This hosts inference workloads, not the animated graph agents or a replacement operating-system kernel. SI Kernel remains the application governance layer; its JavaScript rules are not Linux process isolation.

The chosen distro must already have **Node.js 22+ on its default PATH**, **`@huggingface/transformers` 4.3.2 and its Linux dependencies** installed under `~/.local/share/capsule-agent`, and the approved pinned model files in `~/.local/share/capsule-agent/models/<catalog-id>/`. Preparing those dependencies and copying model files is manual and outside this existing-distro-only feature. Do not copy Windows `node_modules` into Linux. The runtime verifies ext4 residency, disallows model symlinks, and checks every required file's size and catalog hash before inference. It uses the same worker source, role prompts, offline-only model loading, and host-side proposal validation as Windows. The cache stays in the Linux runtime directory.

Initialization failures or missing prerequisites produce an explicit reason and attempt the verified Windows model instead. That fallback still requires the approved model files on Windows. Requests that fail after the Linux worker becomes ready are **not automatically replayed**, avoiding duplicate work. One model and one inference request run at a time; no performance gain, GPU acceleration, OS sandbox, or per-agent resource quota is claimed. Runtime status reports the actual backend and phase separately from simulated agent activity.

Changing the preference or exiting the Browser companion closes only Capsule's worker; it does not shut down WSL or other services. The worker is not an always-on daemon. WSL integration can expose Windows files and executable interoperability; it is not inherently a sandbox for untrusted agent code. Neither Linux output nor imported source receives tool or Windows-settings authority.

### 1. Browser (home = voxel world)
| Feature | Status |
|---|---|
| Single address/search bar (pre-filled with `www.n8toriousai.com`) | Working in preview; real page loads **not verified on screen** |
| Typing a web address opens it; plain text is treated as a private search query | Working (tested logic) |
| Automatic HTTPS upgrade (except localhost) | Working in Rust + tests |
| Strips tracking parameters (`utm_*` and 12 known others) before navigating | Working in Rust + tests |
| "URL GUARDS" chip listing URL protections (not a full privacy guarantee) | Working |
| Hint dropdown ("Open example.com", "Upgraded to HTTPS", "Strip 1 tracker") | Working |
| Pages run in a child webview with **no IPC access** | Designed so; needs real-app verification |

**Honesty note:** the "AI" in search is **on-device pattern hints only** — no model, no network. A real AI search would need a model or API you choose and would change the privacy story.
**Not Brave:** this is a Tauri/WebView2 shell, not a Chromium fork. It hardens URLs; it does not yet have full ad-blocking, fingerprint protection, or extensions.

### 2. Voxel home board
- Procedural, seeded, chunked world with biomes, rivers, water waves, wind-swayed grass and flowers, soft shadows.
- 🎲 **New world** button creates a fresh seed at will.
- **Shape cycling** (tap the icon; right-click goes back) to change the block shape.
- **Walk / Fly:** Walk uses gravity and jumping (Space); clicking it again or pressing **V** switches to Fly and back. **Esc** leaves first person and glides to a zoomed-out overview.
- SI Core drives waves, wind, and gusts, and the HUD line.
- **Not verified:** first-person modes need pointer lock, which the preview cannot test.

### 3. Windows tweaks (Appearance)
- Dark/light mode, transparency, and window animations are per-user (HKCU) preferences. Switches stage changes; **Apply settings** shows exact current and proposed values before confirmation and UAC. **Discard** only clears the staged selection.
- Appearance, Tweak+, Internet catalog hardening and Performance advisor share **Undo last batch**, not unlimited history. Older individual Appearance receipts retain their separate legacy rollback controls.
- Windows settings includes eight collapsible groups with all 51 fixed catalog tweaks. Selecting a checkbox preserves the open group and does not apply the setting.
- Exact original registry values are journaled before writes. A failed operation attempts guarded recovery, and unresolved recovery blocks new batches. Undo refuses to overwrite a newer value. Registry read-back does not prove Windows honors a policy or that performance improved.
- **Not verified:** live-apply of transparency and window animation on your machine.

### 3a. Performance advisor and directory
- The header **app-grid icon** opens the directory, grouping pages by purpose with search. Its tooltip names the control; `/` opens it and Escape closes it. The native browser child is hidden while the directory is open.
- Beside it, globe, cube, storefront, gauge, cog and terminal/monitor shortcuts open **Browser**, **Scene Studio**, **Marketplace preview**, **Performance advisor**, **Toolbox settings** and **WSL management**. Each has a tooltip, keyboard focus indicator and active-page highlight. The Capsule logo returns to the cockpit; HTML-source import opens inert review.
- The bell opens **Agent Proposals**. Its pending badge is synchronized with the app-grid and Directory entry; unavailable native storage shows an explicit unavailable state, not a false zero. Opening the page does not mark findings reviewed.
- Settings has unlabeled color swatches and a full-spectrum native color picker, persisted locally. Screen readers retain color names. Custom accents use validated six-digit RGB values, readable highlight shades and contrasting button text. Existing saved profile choices still work. A compact, local Windows font stack keeps system text narrow; no web-font download is required.
- All 18 pages remain direct children of the workspace. Navigation validates the target before hiding the current page and returns to the top. Lazy module failures show a message and Retry instead of an empty page. Graph/browser errors are visible; Scene Studio's file opener is keyboard accessible and reports unreadable or oversized files.
- Visual hierarchy keeps secondary metrics and task activity subdued, the graph in a raised frame, and header shortcuts in a compact group. Hover transitions respect reduced-motion preferences.
- The cockpit keeps the graph central, groups metrics into one strip, and folds starter routes and recent receipts under **Task activity**. Browser connection state appears once in the header; the graph retains an explicit connection error with expandable technical details. Disconnected metrics show unavailable values rather than misleading zeroes or stale counts.
- **Performance advisor** on the cockpit opens Corvus's advisor. Five goals cover desktop responsiveness, gaming, background activity, battery use, and plugged-in laptop performance.
- This is a **rule-based local advisor**, not a model response or an autonomous optimizer. It inspects actual fixed registry values, AC/battery/Energy Saver status, and a single memory snapshot. Already-matching settings are skipped. Unconfigured values are labeled unknown, not assumed active.
- Proposals explain possible gains, losses and how to check the outcome; none start checked. A fresh exact-value preview and UAC are required to apply selected proposals.
- The optional power-throttling override is offered only for the plugged-in goal with inspected AC power and Energy Saver off. The elevated helper checks AC again before applying it. **This is a persistent machine-wide policy, not an automatic AC-only profile:** undo it before unplugging if you do not want its battery/thermal trade-offs.
- A **Windows power settings** button opens the supported Power & battery page without changing anything. Best performance can increase heat and power use; battery and sustained thermal performance need separate consideration. No page-file, memory-compression, Defender, timer, overclock, or CPU-parking changes are recommended.
- Registry research: Microsoft documents that `SystemResponsiveness` below 10 is clamped to 20, and MMCSS `GPU Priority`/`SFIO Priority` are unused. More keys are not proof of more performance. The shipped `C:\Windows\PolicyDefinitions\Power.admx` confirms `PowerThrottlingTurnOff` maps to the existing catalog target; it does not establish a performance gain on build 26300.
- References: [Microsoft performance guidance](https://support.microsoft.com/en-us/windows/experience/performance-optimization/tips-to-improve-pc-performance-in-windows), [MMCSS registry semantics](https://learn.microsoft.com/en-us/windows/win32/procthread/multimedia-class-scheduler-service), [Energy Saver](https://learn.microsoft.com/en-us/windows-hardware/design/component-guidelines/energy-saver), [supported power-setting controls](https://learn.microsoft.com/en-us/windows-hardware/customize/power-settings/configure-power-settings).

### 4. Internet (privacy and DNS)
- One-click DNS profiles: **Windows default, Cloudflare, Cloudflare Family, Quad9, AdGuard, Mullvad, Google** — each showing what it blocks and its logging policy in plain words.
- Changes go through fixed Rust commands (`dns.rs`) and need confirmation.
- Read-only on this machine: Wi-Fi adapter is up and DNS is currently handed out by the router.
- **Not verified:** actually applying a profile (needs admin).

### 5. Repair (Windows itself)
Fixed list, with time estimates, admin requirement, and a flag for whether it changes anything:
| Action | Changes system? |
|---|---|
| Quick image check (DISM CheckHealth) | No |
| Deep image scan (DISM ScanHealth) | No |
| Repair Windows image (DISM RestoreHealth) | Yes |
| Verify system files (SFC verify) | No |
| Repair system files (SFC scan) | Yes |
| Scan system disk (CHKDSK, online, report only) | No |

Security fixes, offered **only when the check finds a problem**: turn firewall on, turn on Defender real-time protection, update virus definitions, turn on UAC.
**Not verified:** running these on your machine.

### 6. Tweak+ and the AME playbook
- Tweak+ stores explicitly approved supported catalog proposals and review-only ideas. Approval adds to the list; it does not change Windows. Unknown ideas never enter the executable selection. Removing an idea is not registry Undo.
- The Capsule OS `.apbx` offers its catalog settings as AME Wizard checkbox options, grouped by category with no more than four choices per page. The Balanced choices start checked; optional/medium-risk settings start unchecked. Each registry action is gated by its matching option, so deselected settings are skipped.
- The package can include the Capsule Toolbox installer as an optional unchecked choice. It installs only if the user checks that option in AME Wizard. The installer is Capsule's own; ReviOS is a format/schema reference only, and its scripts and executables are not copied.
- Select **Install Capsule Toolbox for my Windows account** to install it. The fixed installer task uses AME's `currentUserElevated` context, checks the setup exit code and the current user's registered executable, and halts with an error on failure. Its bundled verification script uses a process-only execution-policy override; it does not change Windows execution-policy settings.
- `npm.cmd run export:apbx` builds the encrypted 7z package with the current Capsule Toolbox setup executable. It requires 7-Zip and the setup file in `pre-release\`.
- The package's root `playbook.png` is an original 512×512 Capsule emblem, also kept as editable SVG in `assets\capsule-playbook-icon.svg`.
- The user confirmed that AME Wizard loaded the playbook and that the corrected optional Toolbox task installed the app. The latest rebuilt app and full policy effectiveness still need target-machine verification before promotion from pre-release.

### 7. Scene Studio, Engine core, Musicode, Learning
- **Scene Studio:** 3D scene editing with tested scene format and operations.
- **HTML/model workspace — working in the native Toolbox:** open HTML without running it, select GLB or glTF with its local buffers/textures, then choose **Run isolated scene**. The included viewer provides offline Three.js r160, OrbitControls and GLTFLoader. `CapsuleScene.loadModel(name)` resolves dependencies relative to the selected model's folder; duplicate filenames in other folders are not substituted for exact paths. HTML is limited to 256 KiB; assets to 128 files, 32 MiB each and 64 MiB total.
- The preview uses `sandbox="allow-scripts"` without same-origin permission. Its CSP permits bundled/selected blob resources, not remote libraries, network requests, nested frames or workers. Native checks exercise actual GLB/glTF geometry, blocked parent/native/raw IPC access and denied external connections. Stylesheets use CSSOM adoption; style attributes are permitted explicitly, while inline scripts in the host remain forbidden. This is not a CPU/memory quota or a guarantee against malicious Chromium exploits: run only scenes you trust. Stop, changing scene mode, leaving the page or hiding the window removes the preview.
- **Real local AI editing:** the approved shared model receives source and a goal, not a path or write permission. A real Pengwin CPU inference produced a valid red-to-blue HTML edit. Exact, bounded JSON replacements must be reviewed and accepted into the draft; Reject, Undo and stale-source checks preserve user edits. Run and **Save HTML copy** are separate decisions. Original files are never overwritten automatically. Full-source AI editing is limited to 8,000 characters; larger sources are rejected rather than truncated. Pasted edits from another AI use the same validation/review path.
- Save-copy exports HTML only, not a self-contained executable bundle; retain the selected model files. HTML opened outside Capsule does not inherit Capsule's bundled runtime or isolation. Mod Forge's HTML importer remains an inert source reviewer.
- **Engine core graph:** 3D activity graph with zoom, pan, fly-to and labels. The roster now opens at the bottom right. The **Discussion & decisions** drawer shows actual routed-task events and rule-based Corvus/Veda/Gaven deliberation from inspected performance proposals. It labels potential gains/losses and evidence limits; no model conversation or measured improvement is invented.
- The speech-bubble and player/roster icons sit together at the graph's bottom right; the sound-note icon is in the right corner. All retain accessible labels and tooltips.
- Graph discussion is bounded to this app session. Users can **propose a change** in up to 240 characters. Vera routes supported performance intent to read-only inspection; Corvus/Veda/Gaven return labeled rule-based proposals, evidence limits and approval boundaries. Unsupported requests remain discussion, never commands. **Review settings**, **Defer**, and **Dismiss** record user direction, never grant execution. Direction selection opens a fresh read-only inspection; actual application still requires review and UAC.
- **Musicode:** only highlighted agents play short, distinctive activity-based motifs (idle/busy/completed/blocked). States come from that agent's recorded task events, not claimed emotions. Click an agent or **Enable agent sound** first to unlock browser audio; hovering floating notes, workflows and lattice points stays silent. Motifs do not loop or stack, and mute stops active playback. Floating notes remain decorative; there is no composer or real mood-song library yet.
- **Learning loop:** 5-minute cycle producing ideas; accepted ideas become kernel planets. Not verified over a real cycle.

### 9. Mod Forge (static package review)
- The header **HTML-source icon** or **Import HTML** opens a local `.html`/`.htm` picker. Files must be regular UTF-8 text up to 512 KiB. Import shows a fingerprint, line count, approximate structure counts and source-pattern flags without a model. HTML is never rendered: scripts, event handlers, frames and linked assets are not executed or loaded.
- Existing local models can run four HTML-specific review passes: structure, styling/behavior, learning outline and evidence review. Inference source is capped at 30,000 numbered characters and truncation is disclosed. Review findings can become user-reviewed workflow drafts or saved Agent Proposals; this is not model training or automatic changes. The Browser companion must be running for inspection; agent passes additionally require a loaded local model. Optional model downloads retain explicit user controls.
- **Works without any AI model:** pick a `.zip/.jar/.mrpack/.mcpack`; it reads metadata and names only. Nothing is extracted or run.
- Parses Fabric, Quilt, Forge/NeoForge, legacy Forge, Modrinth packs, Bedrock manifests and resource/data packs: id, name, version, authors, license, Minecraft version, dependencies.
- Contents inventory: textures, models, sounds, languages, recipes, loot tables, worldgen, mixins, native libraries, nested jars.
- Flags by pattern in readable source (process launching, network, dynamic code loading, file deletion, registry, hidden-text decoding, token/password mentions), plus shipped native binaries and scripts, each with `path:line`.
- Verdict (no flags / check details / review carefully) and **Copy report (Markdown)**. Flags are patterns, not proof; compiled code is never read.
- Approved ONNX catalog downloads/load/cancel controls live in **Toolbox settings**, not an arbitrary model-file picker. All source-review roles share one loaded model. The package inspection goes through the companion browser bridge.
- **Approved learning:** an explicit confirmation, current source fingerprint and valid cited finding are required before a lesson is stored. Up to 40 lessons persist separately; the latest eight enter future reviews as untrusted reference context. Memory stars visualize the approved library without changing tools, training weights or rewriting the kernel. Forget affects future context, not old outputs or drafts.
- **Review cache:** disposable source reports and model results persist up to 2 GiB (not preallocated), with 1 MiB per item and a secondary 4,096-item limit. Least-recently-used entries are evicted; seven-day inactivity expiry runs on cache operations and a single five-minute Toolbox timer while visible. Resuming the window triggers another check. Clear requires confirmation and leaves approved lessons, workflows, weights, original files and settings receipts untouched. Local files are not application-encrypted.
- **Agent Proposals** keeps saved Mod Forge findings newest-first, with All/Pending/Reviewed/Dismissed filters and persistent review states. Performance graph discussions and browser-agent drafts remain separate; they are not silently included in this timeline.
- **Build district in world:** one click turns the report into buildings on the voxel home (asset warehouse sized by art/sound count, code tower by source count with a red/yellow/green beacon, dependency gate with one arch per dependency, docs & license house, review beacons for flags). Data only; nothing is placed from package code. Verified in the preview with a sample report; not yet with a real package in the desktop app.

### 8. Crew and kernel
- 14 agents shown read-only. Gate flow: Vera → Mira → Gaven → Veda → human → Merlin → Witness.
- Kernel library and Mod Forge are **inert** viewers.

---

## What it deliberately does *not* do
- No arbitrary shell or PowerShell.
- No running imported mods, Java jars, or scripts.
- No silent changes: each action is named, confirmed, and receipted.
- No data collection: the on-device assistant makes no network calls.

---

## How it was checked (this pre-release)
- 108 Node tests pass; 19 Rust tests pass; `cargo check` is clean.
- A debug Tauri build compiles to `src-tauri\target\debug\capsule_toolbox.exe`.
- Preview checks covered layout and rendering.

## Known gaps before a public release
1. Launch the real app and verify page loads, hardening on real navigation, and the walk/fly/Esc behaviours.
2. Apply DNS and repair actions on a real machine with admin rights.
3. Confirm Windows UAC consent/cancellation and real registry effects for the new native helper on the target machine. Automated registry transaction tests use fakes; they do not apply Windows tweaks.
4. Capsule PNG/ICO/ICNS replace the old Tauri artwork in the header, desktop application and NSIS installer/uninstaller. Windows may retain an old pinned shortcut icon until it is re-pinned after updating the app.
5. Split `toolbox/main.js` and simplify UI.
6. Ideas on the table: modder workspace (chunks as mod packages, structures holding files, shareable worlds), onboarding and health score, stronger tracker/ad blocking.
