# CapsuleOS

**A selectable, reversible Windows playbook — governed, not blind.**

CapsuleOS is an [AME Wizard](https://ameliorated.io) playbook generated
by the Capsule Toolbox: **51 Windows settings**, each one a named
checkbox with a plain description, grouped on 17 option pages. Only
what you check is applied. Every setting has a mirrored revert.
Optionally — and only if you check the box — it also installs the
Capsule Toolbox companion app for your Windows account.

> **Status: pre-release (0.1.0).** The package passed an independent
> static audit and container verification — see
> [VERIFICATION.md](VERIFICATION.md). It has **not** yet been loaded
> through AME Wizard on a target machine in this exact build. Review
> the list, keep a restore point.

## Download

Grab `CapsuleOS.apbx` from the
[latest release](../../releases), then open it in AME Wizard
(password `malte`, which AME requires).

- Published package SHA-256:
  `d9c72f43e46735cec115b5091ec50c8e0ed6b55e58b9714597576b3a0c2cbcdd`
- Format: 7z · LZMA2 + AES-256 · single block · filters off — the
  variant AME Wizard's extractor accepts.

## The law it runs under

- Agents propose; **a human approves**. Nothing here runs until you
  select it in AME Wizard.
- **Security is never touched** — no Defender, Windows Update,
  firewall, or SmartScreen changes; no apps or services removed.
- **Reversible by construction** — `revert.yml` mirrors every value
  `apply.yml` sets.
- **No free-form shell** — the only executable action is the one
  gated installer task, running a fixed script as your own user
  (`currentUserElevated`), halting on any failure.

## What's in the playbook

Appearance · Privacy · Debloat-lite · File Explorer · Performance ·
Gaming · Hardening · Internet — dark theme, Copilot/Recall off,
advertising ID off, Start/web-search cleanup, Explorer sanity, Game
DVR off, DNS hardening, and 43 more, each labeled with its risk and
whether it needs admin. 24 balanced defaults start checked; the 12
medium-risk settings never do.

## Repository contents

| Path | What it is |
|---|---|
| `playbook/` | The playbook source exactly as packaged: `playbook.conf`, `Configuration/` YAML (apply / revert / tasks), the fixed installer script, the internal manifest |
| `TOOLBOX.md` | The Capsule Toolbox — what it does, with honest Working / Prototype / Not verified labels |
| `MANIFEST.md` | The pre-release build record: file hashes and remaining gates |
| `VERIFICATION.md` | The independent audit: what was checked, what passed, what is still owed |

The bundled Toolbox setup executable ships inside the `.apbx` release
asset; it is unsigned, and no signing claim is made.

---

Part of the [N8torious AI portfolio](https://github.com/IN8torious/n8torious-ai_portfolio) ·
[n8toriousai.com](https://n8toriousai.com)
