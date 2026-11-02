# The Capsule family — variants

Capsule ships in three forms. Same law, same catalog, three bodies.

## 1. The Playbook — CapsuleOS (this repo)

An AME Wizard playbook: hardening, privacy defaults, and repair —
audited before publication, every action gated and mirrored by a
revert. Current build line: **0.2.2** (85 options, 619 actions, exact
apply/revert parity except one known apply-only install step).
Published release: v0.1.0. Security features are never disabled;
nothing locks the user out of settings; everything is undoable from
inside Windows.

## 2. The Tauri app — Capsule Toolbox (built with Copilot)

The original Windows app form of the toolbox, built by Nathan with
Copilot: a Tauri shell with a Node sidecar — hardened browser, voxel
home world, Scene Studio, Mod Forge, model runtime. It rides inside
the refresh playbook build. This is the app the variant below
descends from.

## 3. The Muse Windows app variant — Capsule Ecology

The native Windows app variant of the Tauri toolbox, built with
Muse: a single WinUI 3 / .NET 8 application — no Tauri shell, no
Node sidecar. It carries the same substance as data, unchanged:

- the 0.2.2 tweak catalog (parity exact against this playbook line)
- the Toolbox Bible (66 books / 31,098 verses, on-device)
- both Phi model cards, with hash-verified adoption
- the repair toolkit (DISM → SFC, restore points, baselines)

Plus what the native form adds: Environment Capsules — app packs
through winget + Chocolatey (13 packs, 105 apps; **Add Back Edge**
leads), every install sealed into the SI receipt ledger.

Repo: https://github.com/IN8torious/CapsuleEcology
Pre-release: https://github.com/IN8torious/CapsuleEcology/releases/tag/v0.1.0-pre

## The law all three answer to

1. Windows is the foundation, not the enemy.
2. Observe before you modify — no change without a baseline.
3. Receipt, or it didn't happen.
4. No rollback, no ship.
5. Compatibility outranks speed.

Above all five, D7: humans are sources of authority; systems never are.
