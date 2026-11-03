# Capsule Toolbox — What It Does and Why It Exists

## Windows MSI

The unified APBX also has unchecked WinGet/Chocolatey setup options before app
installation. Its companion ZIP includes `Package-Managers\Install-WinGet.cmd`
and `Install-Chocolatey.cmd`: extract the entire folder, double-click the desired
launcher and approve UAC. Internet is required. WinGet follows Microsoft's
PowerShell Gallery repair/bootstrap instructions; Chocolatey uses its official
WinGet package, installing WinGet first if absent. Existing managers are kept.
No security policy or repository trust is changed. These installers have source
and PowerShell syntax checks only until target-machine setup is exercised.
Local script execution is currently restricted; the launchers do not override
that policy. A policy block stops with an error and requires the policy owner's
supported approval rather than changing security controls.

The Windows build now targets a native x64 WiX `.msi` alongside the existing
NSIS setup EXE. The MSI installs CapsuleOSv2 and its bundled Windows Node and
production dependency runtime; it is not an EXE wrapped in an MSI. Its upgrade
identity is pinned across future releases.

The MSI is the Windows application package, not the complete offline/AME
distribution: model weights and the optional Linux runtime are not inside it.
Use explicit in-app approved-model downloads or provision verified models
separately before inference. It does not run the NSIS sidecar-copy hooks.
WebView2 is still required; Tauri's default installer bootstrapper can download
it if missing. CI checks the MSI file table for the app, Node and runtime
entry point without installing it. Target-machine install, repair, upgrade and
uninstall acceptance remain unverified until performed. — What It Does and Why It Exists

*Pre-release. This document is written to be honest: every feature is marked **Working**, **Prototype**, or **Not verified**, so you always know what you are relying on.*

---

## Why this was made

Most Windows tools ask for blind trust: a button says "Optimize", something changes, and you never learn what. Browsers are the same — you cannot see what is blocked or rewritten.

Capsule Toolbox was built on the opposite idea:

1. **You can read it.** Pages share readable text, section headings and clear selected navigation. Notifications & changes records current work and a separate Release Notes tab holds older delivery notes.
2. **You set the boundaries once.** Routine inspection and bounded housekeeping need no repeated permission. A named document workspace can receive standing permission for reversible, checkpointed edits; destructive changes, private-data transfers and administrator actions remain individually approved.
3. **It cannot do more than it says.** There is no free-form shell or PowerShell box in the Toolbox. Its Windows actions are a fixed list of named actions, each taking only an id and needing explicit confirmation.
4. **Web pages stay in a cage.** Pages load in a separate webview with no access to the app's internals.

This rule set comes from the **SI Core** kernel and playbook (`PLAYBOOK.md`, `kernel/si-kernel.js`, `agents/crew-manifest.json`), which act as the governance layer.

### Balanced autonomy and safety boundaries
- Mod Forge and Kernel library imports stay **inert** (viewed, never run). Scene Studio is a separate, explicitly started HTML preview; it runs reviewed source in an opaque-origin sandbox without host tools.
- Agents may inspect/refine automatically. The native **Authorize a folder**
  picker grants document-edit permission once; no folder is authorized by a chat
  preference alone. Currently supported: existing top-level `.html`, `.css`,
  `.md` and `.txt` files, one per refinement, at most 32 KiB each. No deletion,
  script execution, network transfer or privileged operation is available to
  this document worker. Toolbox/runtime/system folders and linked files are excluded.
- The local context is bounded to eight documents / 12,000 characters, with
  larger documents omitted rather than requiring users to prune the folder.
  Exact source quotes and full SHA-256 checks precede an eligible edit.
  Checkpoint recovery is persisted before writing; the newest ten checkpoints
  are retained automatically. **Pause edits** revokes future edits; **Undo last
  edit** refuses to overwrite a newer external change.
- A run uses one loaded local model for Genki Builder and Sentinel serially,
  at most three passes / six model calls, with a ten-minute scheduling budget. Start is the action,
  not another confirmation dialog. Stop prevents new work; in-flight work may
  finish. No idle autorun, per-agent model processes or automatic restart/resume.
- RingFlow's workflow-law ideas enforce non-empty exact source evidence in
  this orchestrator. Model review cannot create a workspace grant. A quotation
  proves source fidelity, not a successful fix; complete outcome-based learning
  and approved-lesson integration remain open roadmap work. RingFlow and the
  other supplied kernel projects are original projects supplied by their creator.
- **Toolbox Bible:** the gold header icon opens a Christian Bible home adapted
  from the user's Android app: parchment app cards, serif scripture, books and
  chapters, bounded search, daily verse, original daily prayer and local saved
  passages. Both complete text assets are SHA-256 verified. Bookmarks/highlights
  never enter agent context, and malformed or unsavable notes are reported rather
  than discarded. Daily chapter indexing continues across years without a DST reset.
- **Principles in action:** local orchestrator reviews receive exact canonical
  references for truthfulness, discernment, care, stewardship and humility. A host
  checks the review quotation before eligible document changes; technical source
  evidence, the named folder grant and checkpoints remain independent requirements.
  Notifications distinguish reference checks, matched source evidence and actual
  edits. The Bible page can pause reference context. Broader learning-loop and
  installed-model acceptance remain open; this is not a faith or correctness score.
- Registry settings are **fixed-allowlist, explicitly reviewed, verified by read-back, receipted, and rollback-guarded**. Catalog options can include HKLM machine-wide settings; Appearance preferences remain HKCU.
- New registry approvals and Undo request **Windows UAC** through a fixed native helper. The main app and its browser are not relaunched elevated. The helper accepts only compiled catalog targets, checks both pipe peer process IDs and the Windows user identity, and exposes no arbitrary shell. UAC cancellation changes nothing. Elevation using another Windows account is rejected rather than changing the wrong user's preferences.
- The separate AME Wizard playbook is different: checked options can make fixed registry changes, including some HKLM machine-wide settings. Its optional bundled Toolbox installer runs only if explicitly checked in AME Wizard.
- **No free-form shell.**

---

## What it can do

### Complete offline model distribution

New Toolbox distributions must include **both approved Phi models**, their pinned assets/licenses, and the standalone Windows Node/ONNX runtime. `npm run toolbox:build` (also `npm run package:offline`) builds setup and assembles `pre-release\Capsule Toolbox Offline`; packaging fails if either model is missing or fails its catalog hashes. An existing output folder is never silently replaced.

Run `Capsule Toolbox.exe` from that complete folder, or run its `Install Capsule Toolbox.exe`. Keep `models\` and `runtime\` with the portable application. Setup embeds the runtime but takes the multi-gigabyte weights from its adjacent `models\` directory, copies only catalog-pinned assets, and verifies both installed models before reporting success. Distributing the setup executable alone is not supported. The AME exporter requires the complete folder and includes both models beside setup under `Executables\models\`; the optional installation choice remains unchecked.

The models total approximately 5.05 GB (decimal) before the runtime and setup. No Browser app, system Node installation, or model download is needed for Windows inference; Windows WebView2 is still required. One model worker is loaded on demand, not one background process per agent. Download controls are recovery options, not the standard delivery path. Models remain in the installation's `models\` folder after uninstall so multi-gigabyte data is not silently deleted. WSL2 still needs separate Linux prerequisites. Packaging/source checks do not prove target-machine installation or a working native Load action.

### Optional WSL2 agent inference host

**Implemented; both approved models previously verified with direct Pengwin WSL2 CPU inference. Installed native workflow acceptance remains open.** Each loaded from hash-verified ext4 assets and returned `4` for a bounded `2 + 2` request; test workers closed afterward. This is a functional check, not a speed comparison or GPU claim. Windows remains the default. The header's terminal/monitor icon opens **WSL management**, also available in the directory. It shows registered WSL2 hosts and a running/stopped snapshot, with explicitly confirmed per-distro Start and Stop. Start runs only `/bin/true` to launch the selected distro and can idle down afterward; Stop terminates every process in that distro, including work outside Capsule. Save Linux work first. Neither global shutdown nor unregister, deletion, installation or shell commands are exposed. These controls use the Toolbox's bundled on-demand runtime, not the Browser companion.

**WSL management** owns host inventory, runtime routing and reviewed offline setup in one place. Settings shows the current runtime and links there instead of duplicating its controls. Windows-only remains the default; Linux requires an explicitly selected existing WSL2 distribution. Refresh does not launch a distro. The collapsed host-installation section links to Ubuntu's official GitHub project, Pengwin's Store page and the supplied Pistachio Linux Store page; those links do not install anything. Pistachio runtime compatibility is unverified.

Inventory cross-checks WSL's verbose listing against its registered-distro listing. Entries still installing or being removed appear as **Unavailable**, without lifecycle controls or inference selection; they are not mislabeled Stopped. Complete setup in the distribution's own application and Refresh.

Opting in saves a preference in the Toolbox runtime's user-data directory and stops any loaded model. Loading an approved model then starts one shared Linux CPU inference worker on demand. No arbitrary commands, agent scripts, systemd services, GPU setup, distro installation, package installation, model copying, or `.wslconfig` changes are exposed. This hosts inference workloads, not the animated graph agents or a replacement operating-system kernel. SI Kernel remains the application governance layer; its JavaScript rules are not Linux process isolation.

The chosen distro must already have **Node.js 22+ on its default PATH**, **`@huggingface/transformers` 4.3.2 and its Linux dependencies** installed under `~/.local/share/capsule-agent`, and the approved pinned model files in `~/.local/share/capsule-agent/models/<catalog-id>/`. Preparing those dependencies and copying model files is manual and outside this existing-distro-only feature. Do not copy Windows `node_modules` into Linux. The runtime verifies ext4 residency, disallows model symlinks, and checks every required file's size and catalog hash before inference. It uses the same worker source, role prompts, offline-only model loading, and host-side proposal validation as Windows. The cache stays in the Linux runtime directory.

Initialization failures or missing prerequisites produce an explicit reason and attempt the verified Windows model instead. That fallback still requires the approved model files on Windows. Requests that fail after the Linux worker becomes ready are **not automatically replayed**, avoiding duplicate work. One model and one inference request run at a time; no performance gain, GPU acceleration, OS sandbox, or per-agent resource quota is claimed. Runtime status reports the actual backend and phase separately from simulated agent activity.

Changing the preference or exiting Toolbox closes only Capsule's worker; it does not shut down WSL or other services. The worker is not an always-on daemon. WSL integration can expose Windows files and executable interoperability; it is not inherently a sandbox for untrusted agent code. Neither Linux output nor imported source receives tool or Windows-settings authority.

### 1. Browser (home = MUSE)
| Feature | Status |
|---|---|
| Single address/search bar (pre-filled with `www.muse.ai`) | Source/preview; native external-page acceptance remains separate |
| Typing a web address opens it; plain text is treated as a private search query | Working (tested logic) |
| Automatic HTTPS upgrade (except localhost) | Working in Rust + tests |
| Strips tracking parameters (`utm_*` and 12 known others) before navigating | Working in Rust + tests |
| "URL GUARDS" chip listing URL protections (not a full privacy guarantee) | Working |
| Hint dropdown ("Open example.com", "Upgraded to HTTPS", "Strip 1 tracker") | Working |
| Pages run in a child webview with **no IPC access** | Designed so; needs real-app verification |

**Honesty note:** the "AI" in search is **on-device pattern hints only** — no model, no network. A real AI search would need a model or API you choose and would change the privacy story.
**Not Brave:** this is a Tauri/WebView2 shell, not a Chromium fork. It hardens URLs; it does not yet have full ad-blocking, fingerprint protection, or extensions.

### 2. Voxel World
- Procedural, seeded, chunked world with biomes, rivers, water waves, wind-swayed grass and flowers, soft shadows.
- 🎲 **New world** button creates a fresh seed at will.
- One named shape selector replaces duplicate shape cycling/grid controls.
- Terrain starts without huts or creator stations. Add a selected seeded
  structure or a reviewed package district explicitly from the Build dock.
  Recognizable tree forms, some optional district roofs and comprehensive
  placement/Walk-mode acceptance remain open; see `MANIFEST.md`.
- **Walk / Fly:** Walk uses gravity and jumping (Space); clicking it again or pressing **V** switches to Fly and back. **Esc** leaves first person and glides to a zoomed-out overview.
- SI Core drives waves, wind, and gusts, and the HUD line.
- **Not verified:** first-person modes need pointer lock, which the preview cannot test.

### 3. Windows tweaks (Appearance)
- Dark/light mode, transparency, and window animations are per-user (HKCU) preferences. Switches stage changes; **Apply settings** shows exact current and proposed values before confirmation and UAC. **Discard** only clears the staged selection.
- Appearance, Tweak+, Internet catalog hardening and Performance advisor share **Undo last batch**, not unlimited history. Older individual Appearance receipts retain their separate legacy rollback controls.
- Windows settings includes eight collapsible groups with all 51 fixed catalog tweaks. Selecting a checkbox preserves the open group and does not apply the setting.
- Exact original registry values are journaled before writes. A failed operation attempts guarded recovery, and unresolved recovery blocks new batches. Undo refuses to overwrite a newer value. Registry read-back does not prove Windows honors a policy or that performance improved.
- **Not verified:** live-apply of transparency and window animation on your machine.

### Voxel Globe (current source preview)
- New worlds default to an 80-cell grid, up from 64, for finer visible surface detail at the same apparent planet size. The filled spherical terrain, original seed rules, saved globe format and lower-density options are preserved.
- Lighting uses Three.js shader-based screen-space ambient occlusion, a softened 2048-pixel directional shadow map and ACES tone mapping. Contact shading emphasizes steps between neighboring blocks without increasing terrain relief into a jagged silhouette.
- The postprocessing chain is RenderPass → SSAOPass (16 samples, local 1.4-cell radius) → OutputPass. Resize updates the camera and shader render targets together. Pixel ratio is capped at 1.5; cached shadows refresh after building, erasing, Undo, reset and reseeding rather than regenerating every orbit frame.
- Globe rendering pauses when its page or document is hidden. Shader compilation failures are reported in the page instead of silently switching off the requested effects. Graphics performance still depends on the device; this is source/web-preview functionality, not a rebuilt or accepted Windows installer.

### Light and dark appearance
- Settings > Appearance offers Light, Dark and Follow Windows. Light remains the first-run default; the explicit selection persists on this device. Follow Windows responds to system theme changes, while explicit Light/Dark choices stay unchanged. No Windows registry preference is modified.
- Dark appearance uses charcoal surfaces, warm gold details, readable status colors and the same frosted materials as Light. Solid surfaces and the system reduced-transparency preference remain supported in both themes. The Bible reader, Apps script panels, Windows settings, directory, graph overlays and globe controls follow the choice; imported Scene Studio content is not recolored.
- The globe sky follows the active theme without rebuilding terrain or losing edits. Custom accent highlights adapt for contrast in both themes without replacing the saved accent.

### Windows security blocks
Settings includes **Windows blocked an app or build?** with read-only guidance
for Protection history and CodeIntegrity event 3077. It distinguishes Capsule
consent, UAC elevation and Application Control enforcement. Error 4551 requires
review through the applicable administrator/publisher approval process or an
approved build environment; Capsule cannot create an exception. The guidance
does not execute commands, inspect logs automatically or alter security policy.

The local `.github\workflows\windows-build.yml` prepares a Windows 2022
GitHub Actions build using the existing Tauri/Rust stack, locked dependencies,
pinned-model verification, native tests and both rendered theme audits. It
does not publish a release or install anything on the user's PC. Its short-lived
artifact contains checksummed native build outputs, not a complete offline or
AME distribution; existing payload packaging and installed acceptance still
follow. It permits manual dispatch and pushes to the dedicated
`capsule-v2-windows-build-20261103` branch only. The user explicitly authorized
publishing source to the public `IN8torious/CapsuleOS` repository and running
this Windows workflow. Models, runtime binaries and local data are not uploaded.

### 3a. Performance advisor and directory
- The header **app-grid icon** opens the directory, grouping pages by purpose with search. Its tooltip names the control; `/` opens it and Escape closes it. The native browser child is hidden while the directory is open.
- Visible header shortcuts open **Voxel Globe**, **Scene Studio**, **Toolbox Bible** and **Toolbox settings**. Bible and the Settings gear remain visible on narrow screens; other pages remain in the directory. Each shortcut has a tooltip, keyboard focus indicator and active-page highlight. The Capsule logo returns Home; HTML-source import opens inert review. There is no embedded browser.
- Settings > Interface includes an app-only surface preference: Follow Windows, Frosted glass or Solid light surfaces. It never changes Windows transparency settings; explicit frosting can override the reduced-transparency styling inside the Toolbox only.
- The bell opens **Notifications & changes**, with Activity and Release Notes. Its pending proposal badge is synchronized with the Directory entry; unavailable native storage shows an explicit unavailable state, not a false zero. Opening the page does not mark findings reviewed.
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
Virus-definition updates and quick scans can also be requested explicitly. **Review and run** obtains an exact native command preview and an expiring, single-use, action-bound approval. Windows UAC elevates a fixed same-user helper, not the whole Toolbox. The helper accepts only compiled action IDs, resolves tools from the Windows system directory and never accepts user/model shell text. Results are saved in the application's `repair-receipt.json`; inspection failures and uncertain outcomes are surfaced instead of shown as success. A pending/uncertain receipt blocks duplicate work until manually investigated. DISM/SFC/security actions have no automatic rollback.

**Not verified:** real UAC consent/cancellation or running these repairs on your machine. Source/native tests do not establish repair effectiveness.

### 6. Tweak+ and the AME playbook
- Tweak+ stores explicitly approved supported catalog proposals and review-only ideas. Approval adds to the list; it does not change Windows. Unknown ideas never enter the executable selection. Removing an idea is not registry Undo.
- The Capsule OS `.apbx` offers its catalog settings as AME Wizard checkbox options, grouped by category with no more than four choices per page. The Balanced choices start checked; optional/medium-risk settings start unchecked. Each registry action is gated by its matching option, so deselected settings are skipped.
- The package can include the Capsule Toolbox installer as an optional unchecked choice. It installs only if the user checks that option in AME Wizard. The installer is Capsule's own; ReviOS is a format/schema reference only, and its scripts and executables are not copied.
- Select **Install Capsule Toolbox for my Windows account** to install it, including both approved local models. The fixed installer task uses AME's `currentUserElevated` context, checks the setup exit code, registered executable, bundled runtime and installed model hashes, and halts with an error on failure. Its bundled verification script uses a process-only execution-policy override; it does not change Windows execution-policy settings.
- `npm.cmd run export:apbx` builds the encrypted 7z package with setup and both verified models. It requires 7-Zip and `pre-release\Capsule Toolbox Offline`, created by `npm.cmd run toolbox:build`. Setup and its adjacent `models\` payload stay together.
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
- **HTML lives in Scene Studio, not a second importer in Mod Forge.** The header HTML shortcut opens Scene Studio's HTML workspace. Open one UTF-8 `.html`/`.htm` file up to 256 KiB, edit its draft, deconstruct reusable components and preview only when explicitly requested. Opening, parsing, retaining and running remain separate operations.
- **Reuse selected components** parses the current draft with source ranges and fingerprints. Genki may propose component IDs using the shared loaded local model; selections are editable. Review exact source before explicitly approving retention or saving a separate CSP-restricted reduced HTML copy. Parents include nested source; shared scripts/styles are indivisible and dependency completeness is not guaranteed. The approved library holds at most 20 components / 512 KiB. Draft changes invalidate selections; Clear review does not erase the editor, approved library or saved copies. Full source is not placed in the disposable review cache.
- **Works without any AI model:** pick a `.zip/.jar/.mrpack/.mcpack`; it reads metadata and names only. Nothing is extracted or run.
- Parses Fabric, Quilt, Forge/NeoForge, legacy Forge, Modrinth packs, Bedrock manifests and resource/data packs: id, name, version, authors, license, Minecraft version, dependencies.
- Contents inventory: textures, models, sounds, languages, recipes, loot tables, worldgen, mixins, native libraries, nested jars.
- Flags by pattern in readable source (process launching, network, dynamic code loading, file deletion, registry, hidden-text decoding, token/password mentions), plus shipped native binaries and scripts, each with `path:line`.
- Verdict (no flags / check details / review carefully) and **Copy report (Markdown)**. Flags are patterns, not proof; compiled code is never read.
- Approved ONNX model controls live in **Toolbox settings**, not an arbitrary model-file picker. All source-review roles share one loaded model. Package inspection and component review use the bundled Toolbox runtime; the Browser app is not required.
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
