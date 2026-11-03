import { invoke, readWithDeadline } from './bridge.js';
import { rollbackTweaks } from './tweak-actions.js';
import { comparisonDeltas, createPerformanceHistory, readPerformanceHistory, savePerformanceHistory, validResourceSample } from './performance-history.js';
import { PERFORMANCE_RULES } from '../app/performance-advisor.js';
import { TWEAKS } from '../app/playbook.js';

const svgNS = 'http://www.w3.org/2000/svg';
const node = (tag, className, text) => {
  const element = document.createElement(tag);
  element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
};

export function createPerformanceDashboard() {
  const root = node('article', 'live-performance performance-dashboard panel glass-bezel');
  root.dataset.performanceDashboard = '';
  root.innerHTML = `
    <div class="panel-heading"><div><div class="eyebrow">MEASURED OUTCOMES</div><h2>Gains, losses &amp; trade-offs</h2></div><span class="read-only-label">READ-ONLY METRICS</span></div>
    <p>See what changed after approved settings batches. Lower resource pressure can be useful; higher usage can also mean useful work. These graphs do not measure app speed, FPS, thermals or battery life.</p>
    <div class="resource-values"><span>CPU <strong data-cpu-value>SAMPLING</strong></span><span>RAM <strong data-memory-value>SAMPLING</strong></span></div>
    <div class="inline-status" data-resource-status role="status">Waiting for native resource counters.</div>
    <div class="resource-plot">
      <div class="resource-legend"><span>CPU</span><span>RAM</span></div>
      <div class="resource-chart-frame"><div class="resource-axis" aria-hidden="true"><span>100%</span><span>50%</span><span>0%</span></div>
        <svg class="resource-chart" viewBox="0 0 400 80" preserveAspectRatio="none" role="img" aria-label="CPU and RAM history; no measurements yet"><path data-cpu-line fill="none" stroke="#f6b471" stroke-width="1.5"/><path data-memory-line fill="none" stroke="#83c7ff" stroke-width="1.5"/></svg>
      </div>
      <div class="resource-chart-range" data-chart-range></div><p data-chart-summary>No measured history yet.</p>
    </div>
    <h3>Before &amp; after each settings batch</h3>
    <p>Each comparison uses the preceding minute and up to the following minute, with at least five samples on each side. Keep the workload comparable. Unrelated apps, delayed policy activation and restarts can affect the result. Dashed chart markers identify actual settings receipts.</p>
    <div data-resource-comparisons></div>
    <p class="resource-retention">Local history: up to 24 hours of sampled minutes and 20 comparisons. No process names, page content or browsing history. Sampling pauses while the app is hidden. Use Undo last batch below to review a guarded rollback.</p>
    <div class="inline-status" data-history-status role="status"></div>
    <details data-resource-error-panel hidden><summary>Connection details</summary><pre data-resource-error></pre></details>`;
  return root;
}

function renderComparisons(root, changes) {
  root.replaceChildren();
  if (!changes.length) {
    root.append(node('p', 'resource-empty', 'No measured gains or losses yet. Leave Capsule visible to collect a baseline, then review and apply a supported settings batch. No change or benefit is assumed.'));
    return;
  }
  for (const change of changes.slice(-5).reverse()) {
    const card = node('article', 'resource-comparison');
    const title = node('div', 'resource-comparison-head');
    title.append(node('strong', '', change.kind === 'apply' ? 'Settings applied' : 'Settings rolled back'),
      node('time', '', new Date(change.at).toLocaleString()));
    card.append(title, node('code', 'resource-receipt', change.id));
    const deltas = comparisonDeltas(change);
    if (deltas) {
      const plots = node('div', 'resource-comparison-plots');
      for (const [key, label] of [['cpu', 'CPU'], ['memory', 'RAM']]) {
        const values = deltas[key];
        const delta = Number(values.delta.toFixed(1));
        const plot = node('div', 'resource-comparison-plot');
        plot.append(node('strong', '', label), node('span', `resource-delta ${delta < 0 ? 'pressure-lower' : delta > 0 ? 'pressure-higher' : ''}`,
          `${delta > 0 ? '+' : ''}${delta.toFixed(1)} pp · ${delta < 0 ? 'lower' : delta > 0 ? 'higher' : 'unchanged'} pressure`));
        for (const [period, value] of [['Before', values.before], ['After', values.after]]) {
          const row = node('div', 'resource-bar-row');
          const track = node('span', 'resource-bar-track');
          const bar = node('span', `resource-bar ${period === 'After' ? 'is-after' : ''}`);
          bar.style.width = `${value}%`;
          track.setAttribute('aria-hidden', 'true');
          track.append(bar);
          row.append(node('span', '', period), track, node('b', '', `${value.toFixed(1)}%`));
          plot.append(row);
        }
        plots.append(plot);
      }
      card.append(plots, node('p', 'resource-sample-note', `${change.before.samples} before / ${change.after.samples} after samples. Differences are percentage points (pp), not percentage speed gains.`));
    }
    const state = change.state === 'sampling' && Date.now() > change.at + 60000 ? 'interrupted' : change.state;
    card.append(node('p', 'resource-comparison-state', !change.before
      ? 'No measured baseline: at least five readings were needed before this change. A before/after result cannot be established.'
      : state === 'sampling'
        ? 'Measuring the following minute. Any comparison shown is provisional.'
        : state === 'interrupted'
          ? 'Observation window interrupted by another batch, a restart or a sampling gap. Any comparison shown is partial.'
          : !change.after
            ? 'Not enough readings in the following minute. No outcome is inferred.'
            : 'Observed resource pressure only; this does not establish that the setting caused the change.'));
    if (change.ids?.length) {
      const context = node('details', 'resource-tradeoffs');
      context.append(node('summary', '', 'Settings, expected benefits & trade-offs'));
      for (const id of change.ids) {
        const tweak = TWEAKS.find(item => item.id === id);
        const rule = PERFORMANCE_RULES.find(item => item.tweakId === id);
        context.append(node('strong', '', tweak?.title || id));
        if (rule) {
          if (change.kind === 'rollback') context.append(node('p', '', 'Rollback restores the prior registry request. The earlier expected benefit and trade-off were:'));
          context.append(node('p', '', `Expected, not measured: ${rule.benefit}`), node('p', '', `Trade-off: ${rule.tradeoff}`));
        } else context.append(node('p', '', 'No performance gain has been established for this setting.'));
      }
      card.append(context);
    }
    root.append(card);
  }
}

export function mountLivePerformance(hosts, invokeCommand = invoke, storage = localStorage) {
  const roots = Array.isArray(hosts) ? hosts : [hosts];
  const text = (selector, value) => roots.forEach(root => { root.querySelector(selector).textContent = value; });
  let history, persist = true, busy = false, reset = true, lastSave = 0, lastAttempt = 0, failed = false;
  try { history = readPerformanceHistory(storage); }
  catch (error) {
    history = createPerformanceHistory();
    persist = false;
    text('[data-history-status]', `History unavailable: ${error.message}. Live readings can continue without overwriting saved data.`);
  }
  function save() {
    if (!persist) return;
    try { savePerformanceHistory(history, storage); }
    catch (error) {
      persist = false;
      text('[data-history-status]', `History could not be saved: ${error.message}. Live readings continue for this session only.`);
    }
  }
  function renderHistory() {
    const data = history.snapshot();
    const span = data.minutes.length > 1 ? data.minutes.at(-1).minute - data.minutes[0].minute : 0;
    const x = minute => span > 0 ? (minute - data.minutes[0].minute) / span * 400 : 0;
    for (const root of roots) {
      const chart = root.querySelector('.resource-chart');
      for (const [key, selector, color] of [['cpu', '[data-cpu-line]', '#f6b471'], ['memory', '[data-memory-line]', '#83c7ff']]) {
        const path = data.minutes.map((m, i) => `${i === 0 || m.minute - data.minutes[i - 1].minute > 60000 ? 'M' : 'L'}${x(m.minute)} ${80 - m[key] * .8}`).join(' ');
        root.querySelector(selector).setAttribute('d', path);
        let point = chart.querySelector(`[data-resource-point="${key}"]`);
        if (!point) {
          point = document.createElementNS(svgNS, 'circle');
          point.dataset.resourcePoint = key;
          point.setAttribute('r', '1.4');
          point.setAttribute('fill', color);
          chart.append(point);
        }
        point.style.display = data.minutes.length ? '' : 'none';
        if (data.minutes.length) {
          point.setAttribute('cx', x(data.minutes.at(-1).minute));
          point.setAttribute('cy', 80 - data.minutes.at(-1)[key] * .8);
        }
      }
      let markers = chart.querySelector('[data-resource-markers]');
      if (!markers) {
        markers = document.createElementNS(svgNS, 'g');
        markers.dataset.resourceMarkers = '';
        chart.prepend(markers);
      }
      markers.replaceChildren();
      if (span > 0) for (const change of data.changes) {
        if (change.at < data.minutes[0].minute || change.at > data.minutes.at(-1).minute) continue;
        const marker = document.createElementNS(svgNS, 'line');
        for (const [key, value] of Object.entries({ x1: x(change.at), x2: x(change.at), y1: 0, y2: 80, stroke: '#b5a9c2', 'stroke-width': '.6', 'stroke-dasharray': '2 2' })) marker.setAttribute(key, value);
        const title = document.createElementNS(svgNS, 'title');
        title.textContent = `${change.kind}: ${change.id} · ${new Date(change.at).toLocaleString()}`;
        marker.append(title);
        markers.append(marker);
      }
      const range = root.querySelector('[data-chart-range]');
      if (range) range.textContent = data.minutes.length ? `${new Date(data.minutes[0].minute).toLocaleTimeString()} — ${new Date(data.minutes.at(-1).minute).toLocaleTimeString()}` : '';
      root.querySelector('[data-chart-summary]').textContent = data.minutes.length
        ? `${data.minutes.length} sampled minute averages. CPU and RAM: 0–100%. Lines break where measurements are missing.`
        : 'No measured resource history yet. The graph stays empty until Windows returns valid samples.';
      chart.setAttribute('aria-label', `CPU and RAM pressure from zero to one hundred percent. ${data.minutes.length} measured minute averages. Exact before/after values follow.`);
      renderComparisons(root.querySelector('[data-resource-comparisons]'), data.changes);
    }
  }
  async function sample() {
    if (busy || document.hidden || failed && Date.now() - lastAttempt < 10000) return;
    busy = true;
    lastAttempt = Date.now();
    try {
      const reading = await readWithDeadline(invokeCommand('inspect_performance_telemetry', { reset }), 5000, 'Windows resource sampling');
      if (!validResourceSample(reading)) throw new Error('The native resource reading is invalid.');
      reset = false;
      failed = false;
      text('[data-cpu-value]', reading.cpuPercent === null ? 'SAMPLING' : `${reading.cpuPercent.toFixed(1)}%`);
      text('[data-memory-value]', `${reading.memoryPercent.toFixed(1)}%`);
      text('[data-resource-status]', `Windows readings · ${new Date(reading.timestamp).toLocaleTimeString()} · about every 2 seconds. Separate from kernel health.`);
      roots.forEach(root => { root.querySelector('[data-resource-error-panel]').hidden = true; });
      history.add(reading);
      renderHistory();
      if (Date.now() - lastSave >= 30000) { save(); lastSave = Date.now(); }
    } catch (error) {
      failed = true;
      reset = true;
      text('[data-cpu-value]', 'UNAVAILABLE');
      text('[data-memory-value]', 'UNAVAILABLE');
      text('[data-resource-status]', 'Windows readings unavailable. Use the Capsule desktop app; saved history, if any, is not a live reading.');
      text('[data-resource-error]', typeof error === 'string' ? error : error.message);
      roots.forEach(root => { root.querySelector('[data-resource-error-panel]').hidden = false; });
    } finally { busy = false; }
  }
  const onChange = event => {
    try { history.mark(event.detail); save(); renderHistory(); }
    catch (error) { text('[data-history-status]', `Unable to record settings comparison: ${error.message}`); }
  };
  window.addEventListener('capsule-settings-changed', onChange);
  const rollback = roots.flatMap(root => [...root.querySelectorAll('[data-resource-rollback]')]);
  const onRollback = async () => {
    rollback.forEach(button => { button.disabled = true; });
    try { text('[data-history-status]', await rollbackTweaks(invokeCommand)); }
    catch (error) { text('[data-history-status]', `Rollback unavailable: ${typeof error === 'string' ? error : error.message}`); }
    finally { rollback.forEach(button => { button.disabled = false; }); }
  };
  rollback.forEach(button => button.addEventListener('click', onRollback));
  const onVisibility = () => {
    reset = true;
    if (document.hidden) save();
    else { lastAttempt = 0; void sample(); }
  };
  document.addEventListener('visibilitychange', onVisibility);
  const timer = window.setInterval(sample, 2000);
  renderHistory();
  void sample();
  return () => {
    save();
    window.clearInterval(timer);
    rollback.forEach(button => button.removeEventListener('click', onRollback));
    document.removeEventListener('visibilitychange', onVisibility);
    window.removeEventListener('capsule-settings-changed', onChange);
  };
}
