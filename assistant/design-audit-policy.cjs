const PAGES = Object.freeze(['bible', 'world', 'cockpit', 'agents', 'workflows', 'mod-forge', 'kernel-library', 'auditor', 'settings', 'wsl', 'windows', 'memory', 'performance', 'playbook', 'internet', 'repair', 'apps', 'scene-studio', 'capsules', 'marketplace']);
const VIEWPORTS = Object.freeze([
  { width: 1440, height: 1000 }, { width: 390, height: 844 },
  { width: 320, height: 844 }, { width: 768, height: 1024 },
  { width: 620, height: 900 }, { width: 1024, height: 768 },
  { width: 1920, height: 1080 },
]);
const DIRECTORY_STATES = Object.freeze(['open', 'caption-search']);
const BIBLE_STATES = Object.freeze(['home', 'books', 'chapters', 'read', 'selection', 'reader-options', 'prayer', 'saved', 'search', 'search-results', 'principles']);
const LIMITS = Object.freeze({
  prose: [-0.025, 0.05], heading: [-0.05, 0.05], control: [-0.025, 0.06],
  scripture: [-0.025, 0.05], metadata: [0, 0.2], brand: [0, 0.2],
});
const requiredCaseIds = () => VIEWPORTS.flatMap(viewport => [
  ...PAGES.flatMap(page => (page === 'bible' ? BIBLE_STATES : ['default']).map(state => `${page}/${state}/${viewport.width}x${viewport.height}`)),
  ...DIRECTORY_STATES.map(state => `directory/${state}/${viewport.width}x${viewport.height}`),
]);

function typographyChecks(sample) {
  const bounds = LIMITS[sample.role];
  if (!bounds) throw new Error(`Unknown typography role: ${sample.role}`);
  const spacing = sample.letterSpacing === 'normal' ? 0 : Number.parseFloat(sample.letterSpacing) / sample.fontSize;
  const stretch = sample.fontStretch === 'normal' || sample.fontStretch === '100%';
  const checks = [
    { check: 'font-stretch-normal', pass: stretch, value: sample.fontStretch },
    { check: 'letter-spacing-by-role', pass: Number.isFinite(spacing) && spacing >= bounds[0] - 0.0001 && spacing <= bounds[1] + 0.0001, value: { em: spacing, allowed: bounds } },
  ];
  if (sample.role === 'scripture') checks.push({ check: 'scripture-serif', pass: /(?:^|,)\s*(?:Georgia|"Times New Roman"|serif)\s*(?:,|$)/i.test(sample.fontFamily), value: sample.fontFamily });
  if (sample.bibleUI) checks.push({ check: 'bible-ui-sans', pass: /sans-serif/i.test(sample.fontFamily), value: sample.fontFamily });
  return checks;
}

function summarize(requiredCases, cases, extraChecks = []) {
  const checks = [...extraChecks];
  for (const id of requiredCases) {
    const matches = cases.filter(entry => entry.id === id);
    checks.push({ check: 'required-case-complete', selector: ':case', page: id, pass: matches.length === 1 && matches[0].complete === true && matches[0].textNodes > 0, value: matches.length });
  }
  for (const entry of cases) checks.push(...entry.checks);
  const passed = checks.filter(check => check.pass === true).length;
  const failed = checks.length - passed;
  const complete = requiredCases.length === cases.length && requiredCases.every(id => cases.some(entry => entry.id === id && entry.complete && entry.textNodes > 0));
  return { complete, required: checks.length, passed, failed, score: checks.length ? passed / checks.length * 100 : 0, pass: complete && failed === 0, violationCount: failed, violations: checks.filter(check => !check.pass).slice(0, 250) };
}
function gateEvidenceValid(report, live) {
  const expected = requiredCaseIds();
  return report.version === 1 && report.summary?.pass === true && report.summary.complete === true &&
    report.summary.failed === 0 && report.summary.score === 100 && report.summary.required > 0 &&
    report.summary.required === report.summary.passed &&
    JSON.stringify(report.requiredCases) === JSON.stringify(expected) &&
    report.coverage?.length === expected.length &&
    expected.every(id => report.coverage.filter(entry => entry.id === id && entry.complete === true &&
      entry.textNodes > 0 && entry.required > 0 && entry.required === entry.passed).length === 1) &&
    Object.keys(live).every(key => report.fingerprints?.[key] === live[key]);
}
module.exports = { PAGES, VIEWPORTS, BIBLE_STATES, DIRECTORY_STATES, LIMITS, requiredCaseIds, typographyChecks, summarize, gateEvidenceValid };
