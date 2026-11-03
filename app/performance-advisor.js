import { TWEAKS } from './playbook.js';

export const PERFORMANCE_GOALS = Object.freeze({
  responsiveness: 'Desktop responsiveness',
  gaming: 'Gaming without background capture',
  background: 'Reduce background app activity',
  'laptop-battery': 'Laptop: responsiveness on battery',
  'laptop-ac': 'Laptop: plugged-in performance',
});

export const PERFORMANCE_RULES = Object.freeze([
  {
    tweakId: 'no-transparency', goals: ['responsiveness', 'gaming', 'laptop-battery', 'laptop-ac'],
    benefit: 'Can reduce desktop compositing work by removing translucent effects; most useful on limited graphics hardware.',
    tradeoff: 'Windows and taskbar surfaces become opaque. This is not a guaranteed FPS improvement.',
    measure: 'Compare desktop responsiveness and GPU usage with the same apps open.',
  },
  {
    tweakId: 'no-window-animations', goals: ['responsiveness', 'laptop-battery', 'laptop-ac'],
    benefit: 'Removes the wait for minimize and restore animations, making window switching feel more immediate.',
    tradeoff: 'Removes motion cues. It changes perceived responsiveness, not application compute speed.',
    measure: 'Compare minimize and restore behavior; do not interpret shorter animations as higher processing throughput.',
  },
  {
    tweakId: 'fast-menus', goals: ['responsiveness', 'laptop-battery', 'laptop-ac'],
    benefit: 'Requests a shorter classic-menu opening delay.',
    tradeoff: 'Submenus may open too readily. Modern Windows menus may ignore this setting.',
    measure: 'Compare classic submenu opening before and after signing out and back in.',
  },
  {
    tweakId: 'no-game-dvr', goals: ['gaming', 'background', 'laptop-battery', 'laptop-ac'],
    benefit: 'Can avoid capture overhead when Windows game recording is active.',
    tradeoff: 'Disables Windows Game DVR capture. If capture is already inactive, there may be no performance benefit.',
    measure: 'Compare frame times in the same game and scene; verify that capture is no longer available as expected.',
  },
  {
    tweakId: 'no-background-apps', goals: ['background', 'laptop-battery'],
    benefit: 'Requests that supported Store apps stop running while closed.',
    tradeoff: 'May delay notifications and background sync. It does not stop every desktop app, and Windows may ignore the legacy preference.',
    measure: 'Compare idle CPU and memory with the same apps closed; check notifications and sync still meet your needs.',
  },
  {
    tweakId: 'no-power-throttling', goals: ['laptop-ac'], requiresAc: true,
    benefit: 'Optional: allow background work to run without the system power-throttling policy. The registry target is present in Windows Power.admx, but workload benefit is not established.',
    tradeoff: 'Machine-wide and persistent, not an AC-only profile. More heat and battery drain can reduce sustained performance. Undo before unplugging; this does not disable every app-specific Efficiency Mode.',
    measure: 'Restart if needed and compare the same background workload, fan noise and sustained foreground frame times while plugged in. Undo if foreground performance or thermals worsen.',
  },
]);

export const performanceSettingIds = () => PERFORMANCE_RULES.map((rule) => rule.tweakId);

function sameValue(before, after) {
  return before !== null && before.kind === after.kind
    && before.bytes.length === after.bytes.length
    && before.bytes.every((byte, index) => byte === after.bytes[index]);
}

export function proposePerformanceSettings(goal, snapshot, device = null) {
  if (!Object.hasOwn(PERFORMANCE_GOALS, goal)) throw new Error('Choose a supported performance goal.');
  if (!snapshot || !Array.isArray(snapshot.changes)) throw new Error('Windows settings inspection is missing.');
  if (goal.startsWith('laptop-') && (!device || typeof device.onAc !== 'boolean')) {
    throw new Error('AC/battery status is unavailable. Inspect device power before choosing a laptop goal.');
  }
  if (goal === 'laptop-ac' && !device.onAc) {
    throw new Error('This device is on battery. Plug it in or choose the battery goal; no changes were proposed.');
  }
  return PERFORMANCE_RULES.filter((rule) => rule.goals.includes(goal)
    && (!rule.requiresAc || (device?.onAc === true && device.energySaver === false))).flatMap((rule) => {
    const tweak = TWEAKS.find((entry) => entry.id === rule.tweakId);
    const changes = snapshot.changes.filter((change) => change.tweakId === rule.tweakId);
    if (changes.length !== tweak.values.length
      || changes.some((change, index) => change.index !== index || !change.after || !Array.isArray(change.after.bytes)
        || (change.before !== null && (!change.before || !Array.isArray(change.before.bytes))))) {
      throw new Error(`Incomplete Windows evidence for ${tweak.title}. Inspect again.`);
    }
    if (changes.every((change) => sameValue(change.before, change.after))) return [];
    return [{
      ...rule, title: tweak.title, risk: tweak.risk,
      evidence: changes,
      unsetValues: changes.filter((change) => change.before === null).length,
    }];
  });
}
