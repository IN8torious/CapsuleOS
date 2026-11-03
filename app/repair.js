// Windows repair catalog. Data only; the desktop app runs fixed, allowlisted tools by id.
export const REPAIR_TASKS = Object.freeze([
  { id: 'dism-check', group: 'image', title: 'Quick image check', description: 'Flags corruption already recorded in the Windows image. Fast, read-only.', minutes: '< 1', admin: true, changes: false },
  { id: 'dism-scan', group: 'image', title: 'Deep image scan', description: 'Scans the Windows component store for corruption. Read-only.', minutes: '5–15', admin: true, changes: false },
  { id: 'dism-restore', group: 'image', title: 'Repair Windows image', description: 'Repairs the component store using Windows Update as the source. Needs internet.', minutes: '10–30', admin: true, changes: true },
  { id: 'sfc-verify', group: 'files', title: 'Verify system files', description: 'Checks protected system files without fixing anything.', minutes: '5–10', admin: true, changes: false },
  { id: 'sfc-scan', group: 'files', title: 'Repair system files', description: 'Replaces damaged protected system files from the local cache. Run the image repair first if this fails.', minutes: '5–15', admin: true, changes: true },
  { id: 'chkdsk-scan', group: 'disk', title: 'Scan the system disk', description: 'Online file-system scan of the Windows drive. Reports problems; it does not fix them.', minutes: '2–10', admin: true, changes: false },
]);

export const REPAIR_GROUPS = Object.freeze({ image: 'Windows image (DISM)', files: 'System files (SFC)', disk: 'Disk' });

// Fixes only turn protections back on or refresh definitions.
export const SECURITY_FIXES = Object.freeze([
  { id: 'firewall-on', title: 'Turn the firewall on', description: 'Enable Windows Firewall for Domain, Private and Public networks.', needs: (r) => (r.firewall || []).some((p) => !p.enabled) },
  { id: 'defender-realtime-on', title: 'Turn on real-time protection', description: 'Re-enable Microsoft Defender real-time scanning.', needs: (r) => r.defenderRealtime === false },
  { id: 'defender-update', title: 'Update virus definitions', description: 'Fetch the latest Microsoft Defender signatures.', needs: (r) => typeof r.signatureAgeDays === 'number' && r.signatureAgeDays > 3 },
  { id: 'uac-on', title: 'Turn User Account Control on', description: 'Re-enable UAC prompts. Takes effect after a restart.', needs: (r) => r.uacEnabled === false },
  { id: 'defender-quick-scan', title: 'Run a quick virus scan', description: 'Start a Microsoft Defender quick scan.', needs: () => false },
]);

export function securityFindings(report = {}) {
  return SECURITY_FIXES.map((fix) => ({ id: fix.id, title: fix.title, description: fix.description, needed: Boolean(fix.needs(report)) }));
}

export function repairTask(id) {
  const found = REPAIR_TASKS.find((entry) => entry.id === id);
  if (!found) throw new Error(`Unknown repair task "${id}".`);
  return found;
}
