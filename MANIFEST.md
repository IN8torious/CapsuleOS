# Capsule Toolbox - pre-release testing refresh

Rebuilt November 1, 2026 on the user's explicit instruction to refresh now.
This overrides the packaging wait, not the two outstanding polish gates.
The top-level `release\` folder remains untouched.

## Files

| File | SHA-256 |
|---|---|
| CapsuleOS.apbx | `A8171017F33B11BCEFD00B205CEE1B05A4E5B640FDEAB01F0377EC90DB573848` |
| Capsule Toolbox_0.1.0_x64-setup.exe | `29253E94759216F22755EA0DA7DF19F3686F971CC806F285F7CC969389E88C4B` |
| Capsule Toolbox_0.1.0_x64_en-US.msi | `C1EC09632D30085EACF4BE9CA3B67E31472DB69B9E0A191CFF00376BD709F803` |

Use `CapsuleOS.apbx` in AME Wizard. The optional Toolbox installation choice
starts unchecked; select it to install the newly bundled Toolbox.
The playbook has 51 selectable tweaks, 24 checked by default, and 17 option
pages with at most four choices each. Review the Windows changes before
running it; this is not a read-only test.

The refreshed Toolbox includes the WSL management page, optional existing-WSL2
inference integration, performance outcome graphs, and Scene Studio HTML,
GLB/glTF and reviewed local-AI editing surfaces. See `TOOLBOX.md`.

The small installer/APBX does **not** contain the Electron Browser companion,
the roughly 5 GB of approved model files, a Linux distribution, or Linux
runtime dependencies. Companion-dependent AI/WSL controls need that companion
running and the separately prepared models/runtime. The package does not
silently install them.

## Verification and remaining gates

- Production Tauri build produced both NSIS setup and MSI.
- Encrypted 7z archive integrity check passed.
- All 11 APBX files match current generated/source bytes, including the
  newly built setup executable and fixed installation-verification script.
- Latest source regression: 157 Node tests, 23 native tests and both frontend
  builds passed. Native Scene checks cover actual geometry, isolation,
  lifecycle cleanup and reviewed edits.
- Eight of ten polish passes are verified. The all-page responsive/accessibility
  audit and final whole-toolbox acceptance remain open.
- This newly rebuilt package has not been installed through AME Wizard on a
  target machine. Prior installation success is not a test of these new bytes.

No signing or production-ready privacy-browser claim is made.
