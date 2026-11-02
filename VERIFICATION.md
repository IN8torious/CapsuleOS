# CapsuleOS 0.1.0 — Verification Record

Independent static audit of the playbook package, run 2026-11-01 before
publication. The bundled installer was **never executed**; every check
below is structural or cryptographic.

## The package as received

- SHA-256: `a8171017f33b11bcefd00b205cee1b05a4e5b640fdeab01f0377ec90db573848`
  — matches `MANIFEST.md` exactly.
- Official 7-Zip test (password `malte`): **Everything is Ok.**
  11 files, contents intact.
- Format as built: `LZMA2 · LZMA · BCJ2 · 7zAES`, **2 blocks**.

## The container fix (why the published .apbx differs)

BCJ-family filters plus a multi-block layout are the exact variant AME
Wizard's extractor failed to load in this project's own history
(Raijin-Gaming playbook, 2026-10-18: 7-Zip auto-applied the executable
filter because the package contains an .exe; the working recipe is
filters off, plain LZMA2 + AES, single block).

The published `CapsuleOS.apbx` is therefore a **container rebuild**:
identical contents, repacked to the proven variant.

- Rebuilt format: `LZMA2 · 7zAES`, **1 block**, solid, password `malte`
- Rebuilt SHA-256: `d9c72f43e46735cec115b5091ec50c8e0ed6b55e58b9714597576b3a0c2cbcdd`
- Official 7-Zip test on the rebuild: **Everything is Ok**
- Full extraction diffed against the original: **all 11 files
  byte-identical**

## Claims checked against TOOLBOX.md / MANIFEST.md

All passed:

- **51 selectable tweaks** — the playbook.conf option set and the
  internal manifest's tweak list agree exactly.
- **17 option pages, at most 4 choices each** (16 tweak pages + the
  installer page); every page's options counted.
- **24 options checked by default** — the conf's checked set and the
  manifest's `defaultTweaks` list are the same 24.
- **Every action is gated by its option** — 76 of 76 actions in
  apply.yml (75 `registryValue` + 1 `powerShell`) carry a matching
  `option:`; every referenced option exists in the conf; every tweak
  option drives at least one action. Unchecked means skipped.
- **Revert mirrors apply** — the (path, value) sets are identical
  across all 75 registry values; policy values revert by deletion,
  preference values revert to Windows defaults.
- **Installer flow** — gated by `install-capsule-toolbox` (unchecked by
  default), `runas: currentUserElevated`, `wait: true`,
  `errorAction: Halt`, and a non-zero exit code throws. The fixed
  script refuses service accounts, checks the setup exit code, then
  verifies the per-user uninstall registration and the installed
  `capsule_toolbox.exe` before reporting success. Its
  `-ExecutionPolicy Bypass` is scoped to that one process invocation.
- **Security law holds** — no action touches Defender, Windows Update,
  the firewall, SmartScreen, or their services; no apps or services are
  removed; the only action types present are `registryValue` and the
  single gated `powerShell`.
- **Bundled setup** — SHA-256 matches `MANIFEST.md`
  (`29253e94…`); it is an NSIS installer; it is **unsigned** (no
  Authenticode certificate), consistent with the manifest's
  no-signing statement.
- **Icon** — `playbook.png` is 512×512 as documented.
- **Medium-risk count** — 12, matching the manifest; risk and
  needs-admin annotations in the YAML agree with the README's lists.

## Not verified here (stated plainly)

- **AME Wizard has not loaded this build on a target machine.** The
  container now matches the variant AME accepted before, but a load
  test of these exact bytes is still owed — `MANIFEST.md` says the
  same.
- **The Toolbox app itself** (browser, WSL inference host, Scene
  Studio, Mod Forge) is outside this package audit; only its playbook
  claims were checked. Its status labels live in `TOOLBOX.md`.
- **Doc drift:** `TOOLBOX.md`'s checking section cites 108 Node / 19
  Rust tests; `MANIFEST.md` cites the newer 157 Node / 23 native.
  The manifest is the current record.
- Registry read-back proves a value was written, not that Windows
  honors every policy on every edition — `TOOLBOX.md` says this too.
