export const sourceArchive = {
  name: 'raijin-kernels.zip',
  sha256: '337d8e1e99a3ddb061c02ad2679f2b78a116fa2f6f605f64437e18e467afa81f',
  entryCount: 497,
  expandedBytes: 6138757,
  reviewNote: 'User-authored kernel projects, supplied by their creator for Toolbox integration. Source inspection and carried build evidence are distinguished from tests run in this Toolbox session; reference status is not a claim of third-party authorship.'
};

export const nimbusisArchive = {
  name: 'Nimbusis-Kernel-Phase4.zip',
  sha256: '0d194055836e8ab478ffc92def4ad9e0988edbaeb8f6e428666bc778175ac53f',
  reviewNote: 'An original kernel project supplied by its creator. QEMU-verified Phase 4 according to its build card and supplied boot logs: 32/32 boot-one and 11/11 boot-two markers independently matched. This review did not rerun QEMU.'
};

export const kernelLibrary = [
  {
    id: 'ringflow',
    name: 'RingFlow / v0.1',
    family: 'Evidence-driven cyclic workflows',
    status: 'Source and canon data inspected; supplied 29-check battery not executed',
    summary: 'A small JavaScript ring/station engine with exact Bible-quotation checks, optional human gates and local FNV receipt chains. Independently counted 66 books, 1,189 chapters and 31,098 verses in the supplied data.',
    use: 'The Toolbox adapts non-empty exact source evidence, explicit stages and bounded refinement, not a religious canon as a software-correctness oracle. Empty-claim advancement, caller-provided approval labels, partial fingerprint coverage and an in-memory ledger prevent using this library unchanged as a permission or durable-learning system.',
    archive: {
      name: 'RingFlow.zip',
      sha256: '69b7d1178f5e337b039c39616c3a58db947df8c588706b7003242a22745eb7e5',
      reviewNote: 'Original workflow-kernel project supplied by its creator: seven files, 1,330,742 archive bytes. No archive code was executed. Full source and canon hashes were computed; its shape/edge fingerprint misses equal-length interior text changes. Bundled reference data and kernel implementation have separate provenance; canon data is not bundled into the Toolbox.'
    },
    sourcePath: 'RingFlow/ringflow.js',
    sourceSha256: '767ba0bca321479caae88ead65d906c58a716dcdf2302341bc1a954e29b684ce',
    workflow: {
      name: 'Refine work using RingFlow evidence stages',
      description: 'Data-only checklist; SI Core and native workspace permissions remain the authority.',
      steps: [
        'Inspect a bounded source snapshot and bind its complete text to SHA-256.',
        'Draft one improvement with non-empty exact path, line range and source quotation.',
        'Review the draft; model confidence or a correct quotation does not prove semantic correctness.',
        'Automatically check evidence and the existing standing workspace grant; refuse missing, stale or mismatched evidence without writing.',
        'Checkpoint eligible document edits and record the actual result; retain Undo and explicit external-change conflicts.',
        'Feed the host result into the next bounded pass. Reaching a lap does not grant capabilities, update weights or prove an outcome.',
        'Reserve individual approval for destructive changes, private-data transfers and administrator actions; never accept an actor label as authentication.'
      ]
    }
  },
  {
    id: 'nimbusis-phase4',
    name: 'Nimbusis / Phase 4',
    family: 'x86_64 capability-kernel research',
    status: 'QEMU-verified Phase 4; packaged boot evidence checked, QEMU not rerun here',
    summary: 'A Zig prototype with separate user processes, leased/revocable capabilities, a constitution service and FAT32 storage. Phase 4 logs show file readback after service restart and reboot; the constitution receipt head itself resets on reboot.',
    use: 'Bring the proposal, evidence, approval and receipt discipline into Toolbox learning. This archive does not implement a learning engine, model inference, semantic retrieval or a Linux-compatible WSL runtime. Numeric trust gates and general crew supervision remain roadmap work.',
    archive: nimbusisArchive,
    sourcePath: 'Nimbusis-Kernel-Phase4.zip / KERNEL-SPEC.md',
    sourceSha256: '5d9c077d1e0149c738b7a0b5d9c2858a6f4a6b358b3eaf93653e70f3036cc56d',
    workflow: {
      name: 'Review evidence-backed learning with Nimbusis',
      description: 'Translate governance and recovery contracts, not kernel code, into a reviewed learning design.',
      steps: [
        'Separate usage suggestions from cited knowledge and verified outcomes; clicks are not proof of learning.',
        'Require source fingerprints and exact evidence for each proposed lesson, with the proposing role recorded.',
        'Validate a bounded proposal and obtain explicit approval before adding reference context.',
        'Persist the approved state and its receipt together; test interrupted writes and recovery across restart.',
        'Measure retrieval usefulness and corrections against repeatable tasks; a scheduler score is not answer correctness.',
        'Support forgetting and superseding lessons, without executing the archive or replacing Windows or WSL.'
      ]
    }
  },
  {
    id: 'si-kernel',
    name: 'SI Kernel',
    family: 'Constitutional runtime',
    status: 'Tested JavaScript reference; not imported into this app',
    summary: 'Separates identity, capability, proposals, state, and receipts from the interface. Operator approval remains the authority boundary.',
    use: 'Use its governance concepts when reviewing a proposed workflow or capability—not as permission to execute a kernel action.',
    sourcePath: 'raijin-kernels/si-kernel/README.md',
    sourceSha256: '51049f058aa8b221388aa0656530f894557e4ebfb40c0b9ee6115b1776588e6d',
    workflow: {
      name: 'Review a governed capability proposal',
      description: 'Data-only review checklist inspired by the SI Kernel reference. It does not grant capabilities or execute tasks.',
      steps: [
        'State the user goal and the evidence supporting it.',
        'Name the proposing agent and the exact capability it requests.',
        'Check the request against the existing fixed allowlist and legal state transitions.',
        'Separate the proposal, user decision, resulting state, and audit receipt.',
        'Record unresolved risks and the explicit human approval point.',
        'Do not apply the proposal from this workflow.'
      ]
    }
  },
  {
    id: 'ohiokernel',
    name: 'OhioKernel / Zenki',
    family: 'Service orchestration',
    status: 'Mixed Rust/Python service source and configuration',
    summary: 'Describes a modular service set, configuration, and status-style API routes. The archive also includes install and service-control examples.',
    use: 'Reuse the component-map design for planning user-visible toolbox tasks. Installation, auto-start, service endpoints, and system tuning need their own implementation milestones.',
    sourcePath: 'raijin-kernels/ohiokernel/root_README.md',
    sourceSha256: '65cb1bbeddb9fd6465e7500d4ab585f396d4ba7e952f82073171c0d8541e142c',
    workflow: {
      name: 'Plan a service integration safely',
      description: 'Review an integration as a data-only design; no service, endpoint, installer, or host setting is started.',
      steps: [
        'Describe the user problem and the smallest useful integration.',
        'List proposed components, data flows, and external dependencies.',
        'Identify every network endpoint, permission, and startup behavior in the source documentation.',
        'Flag install, auto-start, and system-tuning requests for separate security review.',
        'Define observable success, failure behavior, and a user-controlled rollback.',
        'Keep the result as a proposal until a separate reviewed implementation exists.'
      ]
    }
  },
  {
    id: 'zenkai-microkernel',
    name: 'ZenKai 13',
    family: 'x86_64 microkernel',
    status: 'README reports M1 complete and later milestones in progress',
    summary: 'The README describes a bootable milestone, future memory management and userland work, plus a planned host-daemon visualization bridge.',
    use: 'Reuse the milestone-and-proof structure from this user-authored project. A boot milestone and a working Toolbox integration remain different deliverables.',
    sourcePath: 'raijin-kernels/polykernel-zenki/1VeY-3_README.md',
    sourceSha256: '4981caa05905bf7effde972aa340fd7586e1e41d7aba08efc0f7cab339c594da',
    workflow: {
      name: 'Review a staged kernel milestone',
      description: 'A review checklist for claims, proof, and host boundaries; it does not build, boot, or install a kernel.',
      steps: [
        'Restate the milestone goal and target architecture.',
        'Separate completed, in-progress, and planned features using the source evidence.',
        'List the build and emulator evidence needed for the claim.',
        'Review any host-daemon or local bridge boundary and its authentication assumptions.',
        'Record missing release artifacts, licensing evidence, and unresolved validation.',
        'Do not boot or install the artifact from this workflow.'
      ]
    }
  },
  {
    id: 'harakiri-gki',
    name: 'Harakiri GKI',
    family: 'Android kernel concept',
    status: 'Concept/architecture notes; implementation and current device status are not verified here',
    summary: 'The SI Core notes distinguish userspace deliberation from kernelspace execution and discuss authority, bridge failure, agent failure, and rate limits.',
    use: 'Reuse only the review categories: privilege boundary, disagreement handling, failure response, and recovery evidence. No kernel module or device bridge is included in Toolbox.',
    sourcePath: 'raijin-kernels/harakiri-gki/si-core-addendum.md',
    sourceSha256: '30d15d10dc93f9035270717018c2ef0ced32d0fa0e88db0b1e0f055df2db0b64',
    workflow: {
      name: 'Assess a privileged-system design',
      description: 'Document trust boundaries and failure cases before any privileged integration is considered.',
      steps: [
        'Draw the user interface, userspace service, and privileged component boundaries.',
        'List each request crossing a boundary and the authority required to accept it.',
        'Describe what happens when the bridge or a worker fails or returns stale data.',
        'Define rate limits, denial behavior, recovery, and user-visible receipts.',
        'Identify tests that prove isolation and safe rollback.',
        'Keep privileged actions disabled until separately designed and approved.'
      ]
    }
  },
  {
    id: 'poetchi-zig',
    name: 'PoeTchi (Zig)',
    family: 'Visual kernel prototype',
    status: 'Archive manifest reports a frozen v1.0 and pending v1.1 QEMU re-run',
    summary: 'The build card emphasizes a shared projection implementation and behavior-preserving refactoring, while explicitly noting validation still owed.',
    use: 'Adapt the change-proof discipline to Toolbox extensions and kernel proposals: preserve behavior, measure tests, and disclose missing proof.',
    sourcePath: 'raijin-kernels/poetchi-zig/BUILD-CARD-v1.1.md',
    sourceSha256: '935ed73d74e81dc917198740c226c65ce3d58f12ce894d5556447222280987a6',
    workflow: {
      name: 'Verify a behavior-preserving refactor',
      description: 'Review a proposed change and its proof without invoking build scripts or running artifacts.',
      steps: [
        'Record the existing behavior and the baseline checks.',
        'Describe the duplicated logic and the shared replacement.',
        'Identify callers that must remain behaviorally unchanged.',
        'List repeatable tests, build checks, and any emulator proof required.',
        'Compare results against the baseline and disclose checks not yet run.',
        'Require human review before accepting the change.'
      ]
    }
  },
  {
    id: 'kido',
    name: 'Kido',
    family: 'Architecture and conformance scaffold',
    status: 'Archive manifest says scaffold only; not assembled or booted',
    summary: 'Keeps module architecture, design deliberations, conformance notes, and a change ledger together; the README reserves first boot for its author.',
    use: 'Use the design-to-conformance trail for organizing complex user workflows and documenting what has not been verified.',
    sourcePath: 'raijin-kernels/kido/README.md',
    sourceSha256: '46c040babd5941b80d4aee074db0effbc8e9cd395d705e6f4b09b4aaa7a9f7e7',
    workflow: {
      name: 'Turn a design into a conformance review',
      description: 'A traceable documentation workflow for large designs; it does not assemble or run source modules.',
      steps: [
        'Write the design goal, constraints, and non-goals.',
        'Split the design into named modules with explicit interfaces.',
        'Capture decisions and alternatives with their evidence.',
        'Map every requirement to a conformance check.',
        'Record proof status, assumptions, and work still outstanding.',
        'Request the owner’s approval before any implementation is promoted.'
      ]
    }
  },
  {
    id: 'bubo',
    name: 'BUBO',
    family: 'Bare-metal and knowledge-graph concept',
    status: 'Archive manifest reports a small QEMU-tested build; device status not verified',
    summary: 'An integration note connects language knowledge nodes to interactive tools and explicitly identifies that browsers cannot run a bare-metal ARM64 kernel natively.',
    use: 'Borrow the learning flow—read, map, then create a safe prototype—without embedding a kernel, emulator, terminal, or executable code in the Browser.',
    sourcePath: 'raijin-kernels/bubo/RAIJINSOCIAL-INTEGRATION.md',
    sourceSha256: '5c77a78562d229f3f4bb19ce1ea8673dfc04bbceabade633ed50c814936eea3d',
    workflow: {
      name: 'Map a learning resource to a safe prototype',
      description: 'Convert a knowledge-graph concept into a documented, non-executable Capsule idea.',
      steps: [
        'Choose one knowledge topic and state the learner outcome.',
        'Link the source material and distinguish verified facts from proposals.',
        'Design a read-only explanation or visual prototype first.',
        'List any proposed runtime, emulator, or bridge as a separate capability decision.',
        'Check whether the Browser can support the idea without native execution.',
        'Keep the prototype data-only until a reviewed sandbox exists.'
      ]
    }
  },
  {
    id: 'unified-kernel-scaffold',
    name: 'Unified kernel scaffold',
    family: 'Modular project taxonomy',
    status: 'Scaffold / integration draft',
    summary: 'Groups kernel work into foundation, orchestration, time-bounded tasks, monitoring, and shared-core concerns.',
    use: 'Use these as planning categories only; this archive does not establish that the scaffold is production-ready or safe to run.',
    sourcePath: 'raijin-kernels/kernels-scaffold/README.md',
    sourceSha256: '39715b45b8f842c3ce326bceb475ea8e6b253fe24d1de1ecc16b9f1f7ea75daf',
    workflow: {
      name: 'Break down a modular capability',
      description: 'Organize an idea into reviewable components before implementing any capability.',
      steps: [
        'Define the user outcome and the limits of the requested capability.',
        'Separate interface, shared data, orchestration, monitoring, and optional execution.',
        'Assign one accountable owner and a clear input/output to each component.',
        'Identify dependencies and trust boundaries between components.',
        'Define acceptance checks and safe failure behavior for each component.',
        'Keep execution and host changes disabled unless separately approved.'
      ]
    }
  }
];
