// One data source for current development notifications and historical release notes.
export const RELEASE_NOTES = [
  {
    id: 'current-source',
    title: 'Current Toolbox development',
    state: 'Source changes; installer and native acceptance pending',
    current: true,
    changes: [
      { id: 'themes', title: 'Light and dark, one coherent Toolbox', summary: 'Settings now offers Light, Dark and Follow Windows, saved locally with independent frosted or solid surfaces.', detail: 'Dark uses charcoal glass, warm gold details and readable status colors across the directory, Apps, Bible, Windows settings, workspace graph and globe controls. Globe skies change without rebuilding terrain or discarding edits. Accent highlights adapt for contrast while preserving the saved color. Light remains the first-run default; no Windows preference is changed. Native installer and AME acceptance remain separate delivery gates.' },
      { id: 'unified-playbook', title: 'CapsuleOSv2 test delivery', summary: 'The unified APBX brings together 73 settings, four browser choices, 13 optional app packs and the repair toolkit without bundling model weights.', detail: 'npm run export:playbook builds CapsuleOSv2.apbx and CapsuleOSv2.zip with usage instructions and SHA-256 checksums. Recovery captures same-account HKCU settings, machine settings and the fixed Edge blocking policies; rollback restores captured values instead of guessed defaults. Pack uninstall excludes pre-existing apps and retires successful removals. Manager and restore-point tests are mocked; real AME/UAC acceptance remains pending. This is not a new native Windows installer. External browsing is the recommended first-release boundary; existing Browser code is not removed by this delivery.' },
      { id: 'spacing', title: 'A tighter, balanced workspace', summary: 'Directory cards now fill their grid instead of stacking beside empty space. Run controls, form fields and text spacing share one cleaner rhythm.', detail: 'Explicit inner grids fix Chromium details layout without shrinking text or hiding captions. Category boxes, repeated prose and duplicate footer branding are reduced. Automatic work has a focused composer and aligned controls; Stop and authority retain their actual limits. Page-by-page review right-sizes activity graphs, aligns cards, centers Browser startup and replaces the duplicate Settings directory with the shared searchable one. Desktop appearance settings use app cards. Mobile Browser gives the address its own row, World controls wrap, and long breadcrumbs yield space to navigation. Source/preview checks do not certify installed device actions.' },
      { id: 'app-cards', title: 'A coherent app-card Toolbox', summary: 'Bible home and the app directory use recognizable icon cards. Shared pages have compact spacing and a consistent reading hierarchy.', detail: 'The Android Bible foundation informs six real app cards rather than an always-open wall of reader controls. The directory uses icon tiles and short searchable captions. Common typography uses normal font stretch and letter spacing, distinct page/section headings and consistent card corners. Kernel integration/source details and individual release records expand without hiding action warnings. The local rendered design gate requires all 224 declared page/Bible/Directory cases across seven widths; missing, failing or stale evidence blocks the normal native, offline and APBX publication paths. This is not a universal visual, accessibility or functionality score, and does not certify installed workflows.' },
      { id: 'bible-foundation', title: 'Your Bible app, inside the Toolbox', summary: 'The header opens a Bible home adapted from your Android foundation: parchment cards, serif scripture, daily verse and prayer, book browsing and local saved passages.', detail: 'The supplied Toolbox-Bible.apk was inspected without installing it or executing its Android/JavaScript code. Its 66 books and 31,098 verse texts match the imported Toolbox Bible edition. The Toolbox adopts its cream/gold/crimson visual foundation with Home, Books, Your verses and Search, chapter navigation and a verse-action sheet. Bookmarks/highlights stay on-device and out of agent context; malformed or unsavable notes are reported, not silently reset. Location/weather, sharing, Android data and other APK workflows were not imported.' },
      { id: 'bible-principles', title: 'Christian principles with observable checks', summary: 'Orchestrator reviews use cited Bible principles. Notifications distinguish checked quotations, matched technical evidence and real checkpointed edits.', detail: 'Truthfulness, discernment, care, stewardship and humility are tied to exact Toolbox Bible references. The host checks a structured reviewer citation before eligible document changes; an incorrect or missing quotation is refused and feeds the next refinement. Scripture does not replace source checks, permission grants or tests. Personal selections never enter this context. Bible reference context can be paused locally; full learning-loop and installed real-model acceptance remain separate open gates.' },
      { id: 'kernel-provenance', title: 'Kernel authorship corrected', summary: 'The kernel library now identifies these as your original projects, supplied by their creator for integration.', detail: 'The supplied kernel projects are user-authored, not third-party kernels assembled by the user. Source provenance and supplied build evidence remain recorded separately from live Toolbox validation. Any separately attributed reference datasets retain their own provenance; that does not change authorship of the kernel implementations.' },
      { id: 'ringflow', title: 'RingFlow evidence stages', summary: 'Workflow stages now check non-empty, exact source quotations before eligible document edits. Failed checks feed the next bounded refinement.', detail: 'RingFlow.zip was inspected as inert source: seven files and a 66-book/1,189-chapter/31,098-verse canon. The Toolbox adopts stage/evidence concepts with full SHA-256 source binding, not the bundled canon as a software oracle. The supplied 29-check battery was not run. Original empty-claim, caller-label approval and partial-fingerprint limitations are recorded in the Kernel library and roadmap.' },
      { id: 'balanced', title: 'Less approval fatigue', summary: 'Authorize a document folder once. Routine edits get checkpoints and Undo, not repeated permission prompts.', detail: 'Routine inspection, draft refinement and bounded disposable-cache housekeeping can run automatically. A native folder picker grants standing permission for checkpointed edits to existing HTML/CSS/Markdown/text documents; Pause edits and Undo remain available. No folder is authorized by the conversation alone. Destructive changes, private-data transfers and administrator changes remain individually gated.' },
      { id: 'readability', title: 'Clearer pages throughout the Toolbox', summary: 'Compact reading text, distinct section headings and visible selected navigation are shared across pages.', detail: 'Shared body typography, section spacing, headings, keyboard focus and selected navigation are being polished across all pages. The later app-card pass replaces oversized padding/headings rather than returning to legacy microtext. Notifications separates Toolbox updates, automatic agent work and optional proposal reference; Activity and Release Notes have distinct selected states. Source/preview checks do not certify every installed workflow.' },
      { id: 'notifications', title: 'Notifications & release history', summary: 'Activity shows current work. Release Notes holds the consolidated older changes and delivery caveats.', detail: 'Development updates, bounded orchestrator events and saved proposal versions share Notifications & changes. Older delivery notes are consolidated under Release Notes.' },
      { id: 'orchestrator', title: 'Bounded local orchestration', detail: 'Genki Builder and Sentinel refine work serially for 1-3 cycles, with Stop, a ten-minute budget and source/model checks. Eligible document edits use a prior named workspace grant and checkpoints, not repeated approvals. Imported packages stay draft-only. This source integration still needs real packaged native-model acceptance.' },
      { id: 'muse', title: 'MUSE homepage; project link moved to About', detail: 'Browser startup, address field and Home use www.muse.ai. www.n8toriousai.com is in Settings > About. MUSE is the AI, not Voxel World. The provider-neutral account/local-storage connector remains planned, not connected by a webpage login.' },
      { id: 'world', title: 'A denser globe with shader lighting', summary: 'The spherical world defaults to an 80-cell grid, with soft directional shadows and screen-space ambient occlusion between blocks.', detail: 'A 16-sample SSAO shader pass adds contact depth; PCF-filtered directional shadows and ACES tone mapping preserve readable faces. Pixel ratio is capped, render targets resize with the canvas and cached shadows refresh after geometry edits. Existing saved globe generation and lower-density choices remain intact. Orbit, terrain erase, Undo and user-chosen structures remain available; no creator stations or buildings are generated automatically. This is source/preview work, not a rebuilt native installer or device-performance guarantee.' },
      { id: 'scene', title: 'One HTML workspace', detail: 'Scene Studio owns HTML loading, editing, component deconstruction, approved reuse and isolated preview. Mod Forge is package-only. Advanced HTML controls are folded rather than duplicated on separate pages.' },
      { id: 'learning', title: 'Learning consent and evidence boundaries', detail: 'Usage suggestions are opt-in, spaced, bounded and expiring; idle polling is removed. Explicit decisions, reset/forget, schema validation and local decision receipts distinguish workspace organization from cited approved knowledge. Relevant lesson retrieval and outcome evaluation remain open roadmap gates.' },
      { id: 'nimbusis', title: 'Nimbusis Phase 4 reference home', detail: 'The Kernel library carries source/archive provenance and a data-only review workflow. Supplied QEMU logs contain all 32/32 and 11/11 expected markers. This review did not rerun QEMU; the archive is not a Windows/WSL runtime or an implemented learning engine.' },
      { id: 'polish', title: 'Reduced repeated navigation', detail: 'The global shortcut row contains World, Browser, Scene Studio, the user-requested Bible icon and Settings. Secondary pages remain in the directory. WSL owns its host/routing/setup controls; Settings links there instead of duplicating them.' }
    ]
  },
  {
    id: 'standalone-delivery-correction',
    title: 'Standalone model delivery correction',
    state: 'Portable model evidence recorded; current setup still needs rebuilding',
    current: false,
    changes: [
      { id: 'runtime', title: 'Native-owned offline runtime', detail: 'The standalone Windows runtime and both pinned Phi models were added after installed Load failures. Both models completed real portable UI Load, bounded HTML-edit generation and Unload in the earlier acceptance run. That evidence does not certify the current installer bytes.' },
      { id: 'linux', title: 'WSL offline setup implementation', detail: 'Linux runtime payload, explicit provisioning review and receipt wiring exist in source. Full native Pengwin provisioning and installed WSL acceptance remain open. No automatic Linux installation, root access or speed gain is claimed.' },
      { id: 'repair', title: 'Exact-action repair approvals', detail: 'Fixed Windows repair/security actions use a native preview, single-use expiring approval and same-user UAC helper with receipts. Real UAC consent/cancellation and repair effectiveness remain separate target-machine gates.' }
    ]
  },
  {
    id: '2026-11-01-pre-release',
    title: 'November 1, 2026 pre-release',
    state: 'Historical small installer/APBX; superseded for standalone AI/WSL testing',
    current: false,
    changes: [
      { id: 'branding', title: 'Capsule branding and compact directory', detail: 'Capsule artwork covers the header/favicon, native icon and installer. The historical redesign replaced header/sidebar clutter with a searchable grouped directory, fixed detached page containers and added serialized lazy-loading failure/retry states. Current shortcuts supersede its older navigation layout.' },
      { id: 'settings', title: 'Settings and supported Windows choices', detail: 'Accent/sound/model/cache controls were centralized; accent selection gained validated full-spectrum persistence and accessible names. Windows exposes 51 supported tweaks in eight groups. Tweak+ stores supported selections or review-only ideas without expanding native authority. Apply uses exact-value review, UAC, receipts and guarded Undo; unresolved recovery blocks later batches.' },
      { id: 'scene', title: 'Scene isolation, approved lessons and disposable cache', detail: 'Historical source checks covered explicit HTML Run, real GLB/glTF geometry and folder-relative assets, reviewed edits/Undo/save-copy, opaque origin, host/IPC/network denial and cleanup. Explicit cited lessons influence later review, not model weights or permissions. The separate 2 GiB/seven-day cache excludes durable approvals and model weights. Current Scene Studio consolidation supersedes the older duplicate HTML entry points.' },
      { id: 'agents', title: 'Persistent proposals and read-only discussions', detail: 'Saved package findings gained persistent pending/reviewed/dismissed history and synchronized badges. Rule-based performance advice uses read-only registry and power/memory evidence with separate battery/AC goals, not benchmarks or model responses. Discussion review/defer/dismiss never approves execution. Agent motifs are opt-in and bounded; floating notes do not infer emotions.' },
      { id: 'browser', title: 'Guarded Browser and voxel tools', detail: 'Browser gained HTTPS upgrading, tracker-parameter stripping and URL guard feedback; on-device AI hints remained patterns, not an external AI connection. Voxel tools gained shadows, rounded blocks, Walk/Fly, seed controls and shape editing. The older N8torious Browser homepage and shape-cycle controls are superseded by current MUSE/World changes.' },
      { id: 'system', title: 'Internet, Repair and native boundaries', detail: 'Internet groups DNS providers; Repair exposes fixed DISM/SFC/CHKDSK and security actions. Native elevation uses same-user/peer checks, fixed target validation and receipts, not an arbitrary shell. Preview behavior does not prove actual DNS, repair or UAC effectiveness. Imported packages remain bounded inert source with path:line findings and Markdown export.' },
      { id: 'ame', title: 'AME packaging and optional installation', detail: 'Historical package: 51 selectable tweaks, 24 defaults, 17 option pages, optional unchecked Toolbox installation. Its manifest records archive integrity and 11-file byte matching, not installed model readiness.' },
      { id: 'source', title: 'Scoped source/native checks', detail: 'The historical manifest recorded 157 Node tests, 23 native tests and both frontend builds. Scene geometry/isolation checks were scoped to their harness. The old 8-of-10 installed-delivery claim was withdrawn after missing runtime/weights were found.' },
      { id: 'limits', title: 'What that package did not include', detail: 'The small installer/APBX did not bundle the roughly 5 GB of model weights or required standalone/Linux runtime payloads. Its setup hashes remain historical evidence in pre-release\\MANIFEST.md, not the latest source release.' }
    ]
  }
];

export function mountReleaseNotes(root) {
  const make = (tag, content) => { const element = document.createElement(tag); element.textContent = content; return element; };
  const card = (release, change, compact = false) => {
    const item = make(compact ? 'article' : 'details', '');
    item.className = 'approved-lesson';
    if (compact) item.append(make('strong', change.title), make('p', change.summary || change.detail));
    else item.append(make('summary', change.title), make('small', release.state), make('p', change.detail));
    return item;
  };
  const activity = root.querySelector('[data-development-updates]');
  for (const release of RELEASE_NOTES.filter(item => item.current)) {
    for (const change of release.changes.slice(0, 4)) activity.append(card(release, change, true));
  }
  const notes = root.querySelector('[data-release-notes]');
  for (const release of RELEASE_NOTES) {
    const section = make('details', '');
    section.open = release.current;
    section.append(make('summary', release.title));
    for (const change of release.changes) section.append(card(release, change));
    notes.append(section);
  }
  const buttons = [...root.querySelectorAll('[data-notification-tab]')];
  const panels = [...root.querySelectorAll('[data-notification-panel]')];
  const select = name => {
    buttons.forEach(button => {
      button.setAttribute('aria-selected', String(button.dataset.notificationTab === name));
      button.tabIndex = button.dataset.notificationTab === name ? 0 : -1;
    });
    panels.forEach(panel => { panel.hidden = panel.dataset.notificationPanel !== name; });
    root.dispatchEvent(new CustomEvent('capsule-notification-tab', { bubbles: true }));
  };
  buttons.forEach((button, index) => {
    button.addEventListener('click', () => select(button.dataset.notificationTab));
    button.addEventListener('keydown', event => {
      const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!step) return;
      event.preventDefault();
      const next = buttons[(index + step + buttons.length) % buttons.length];
      select(next.dataset.notificationTab); next.focus();
    });
  });
  select('activity');
}
