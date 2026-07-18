import { getJson, parseMiners, parseWorkers } from './api.js';
import { escapeHtml, formatBytes, formatDifficulty, formatDuration, formatHashrate, formatNumber, minerState, timeAgo } from './formatters.js';

const SETTINGS_KEY = 'xmrig-proxy-monitor.connection.v1';
const HISTORY_KEY = 'xmrig-proxy-monitor.history.v1';
const DEFAULT_REFRESH_MS = 10_000;
const REFRESH_INTERVALS = [10_000, 30_000, 60_000, 300_000];
const $ = (selector) => document.querySelector(selector);

const ui = {
  dialog: $('#connectionDialog'), form: $('#connectionForm'), result: $('#connectionResult'),
  connectionButton: $('#connectionButton'), testButton: $('#testConnection'), forgetButton: $('#forgetConnection'), refreshButton: $('#refreshButton'),
  refreshBar: $('#refreshProgressBar'), refreshRate: $('#refreshRate'), notice: $('#notice'), updated: $('#lastUpdate'),
  proxyStatus: $('#proxyStatus'), summary: $('#summaryStats'), summarySecondary: $('#summarySecondary'), workers: $('#workersTable'), workersMobile: $('#workersMobile'), workerCount: $('#workerCount'),
  snapshot: $('#proxySnapshot'), network: $('#networkStats'),
  hashrateChart: $('#hashrateChart'), chartDescription: $('#hashrateChartDescription'), chartWrap: $('.chart-wrap'), forgetDialog: $('#forgetConnectionDialog'), confirmForgetButton: $('#confirmForgetConnection'),
};

let settings = readSettings();
let refreshTimer = null;
let refreshing = false;
let hashrateChart = null;
let expandedWorkerName = null;
let hasSnapshot = false;
const workerLastActiveAt = new Map();

function readSettings() { try { const saved = JSON.parse(localStorage.getItem(SETTINGS_KEY)); return saved?.endpoint ? saved : null; } catch { return null; } }
function refreshInterval() { return REFRESH_INTERVALS.includes(Number(settings?.refreshIntervalMs)) ? Number(settings.refreshIntervalMs) : DEFAULT_REFRESH_MS; }
function renderRefreshRate() { ui.refreshRate.value = String(refreshInterval()); }
function readHistory() { try { const value = JSON.parse(localStorage.getItem(HISTORY_KEY)); return Array.isArray(value) ? value : []; } catch { return []; } }
function recordHistory(hashrate1m, hashrate10m) { const history = readHistory(); const point = { timestamp: Date.now(), hashrate1m: Number(hashrate1m || 0), hashrate10m: Number(hashrate10m || 0) }; history.push(point); const retained = history.slice(-180); try { localStorage.setItem(HISTORY_KEY, JSON.stringify(retained)); } catch { /* Keep the current chart usable when storage is unavailable or full. */ } return retained; }
function renderCharts(history) { if (!window.Chart) return; ui.chartWrap.setAttribute('aria-busy', 'false'); const latest = history.at(-1); ui.chartDescription.textContent = latest ? `Current proxy hashrate: 1 minute ${formatHashrate(latest.hashrate1m)}; 10 minutes ${formatHashrate(latest.hashrate10m)}.` : 'Waiting for hashrate data.'; const labels = history.map((point) => new Date(point.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })); const common = { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { color: '#a1a1aa', boxWidth: 10, usePointStyle: true } }, tooltip: { backgroundColor: '#121212', borderColor: '#353535', borderWidth: 1, titleColor: '#f4f4f5', bodyColor: '#f4f4f5', callbacks: { label: (context) => `${context.dataset.label}: ${formatHashrate(context.parsed.y)}` } } }, scales: { x: { ticks: { color: '#8e8e96', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,.08)' } }, y: { ticks: { color: '#8e8e96', callback: (value) => formatHashrate(value) }, grid: { color: 'rgba(255,255,255,.08)' } } } }; if (hashrateChart) { hashrateChart.data.labels = labels; hashrateChart.data.datasets[0].data = history.map((point) => point.hashrate1m ?? 0); hashrateChart.data.datasets[1].data = history.map((point) => point.hashrate10m ?? point.hashrate ?? 0); hashrateChart.update('none'); return; } hashrateChart = new window.Chart(ui.hashrateChart, { type: 'line', data: { labels, datasets: [{ label: '1m Hashrate', data: history.map((point) => point.hashrate1m ?? 0), borderColor: '#ff9900', backgroundColor: 'rgba(255,153,0,.05)', fill: false, tension: .28, pointRadius: 0, pointHoverRadius: 5, borderWidth: 2 }, { label: '10m Hashrate', data: history.map((point) => point.hashrate10m ?? point.hashrate ?? 0), borderColor: '#ff7a00', backgroundColor: 'rgba(255,122,0,.10)', fill: true, tension: .28, pointRadius: 0, pointHoverRadius: 5, borderWidth: 2 }] }, options: common }); }
function stat(label, value, extraClass = '') { return `<div class="stat ${extraClass}"><span class="label">${label}</span><span class="value">${value}</span></div>`; }
function longHashrateStack(total = []) { return `<span class="hashrate-triplet"><span class="hashrate-row"><span class="hashrate-tag">12H</span><span class="hashrate-value">${formatHashrate(total[3])}</span></span><span class="hashrate-row"><span class="hashrate-tag">24H</span><span class="hashrate-value">${formatHashrate(total[4])}</span></span><span class="hashrate-row"><span class="hashrate-tag">ALL</span><span class="hashrate-value">${formatHashrate(total[5])}</span></span></span>`; }
function hashrateTriplet(total = []) { return `<span class="hashrate-triplet"><span class="hashrate-row"><span class="hashrate-tag">1M</span><span class="hashrate-value">${formatHashrate(total[0])}</span></span><span class="hashrate-row"><span class="hashrate-tag">10M</span><span class="hashrate-value">${formatHashrate(total[1])}</span></span><span class="hashrate-row"><span class="hashrate-tag">1H</span><span class="hashrate-value">${formatHashrate(total[2])}</span></span></span>`; }
function sharesTriplet(results = {}) { return `<span class="shares-triplet"><span class="shares-row"><span class="shares-tag">ACCEPTED</span><span class="shares-value">${formatNumber(results.accepted)}</span></span><span class="shares-row"><span class="shares-tag">REJECTED</span><span class="shares-value ${results.rejected ? 'danger' : ''}">${formatNumber(results.rejected)}</span></span><span class="shares-row"><span class="shares-tag">INVALID / EXPIRED</span><span class="shares-value ${results.invalid || results.expired ? 'danger' : ''}">${formatNumber(results.invalid)} / ${formatNumber(results.expired)}</span></span><span class="shares-row"><span class="shares-tag">BEST</span><span class="shares-value">${formatDifficulty(Math.max(...(results.best || [0])))}</span></span></span>`; }
function bestDifficulties(best = []) { const values = best.filter((value) => Number(value) > 0); return values.length ? values.map((value, index) => `<span class="node-row"><span class="node-tag">#${index + 1}</span><span class="node-value">${formatDifficulty(value)}</span></span>`).join('') : '—'; }
function minerMatchesWorker(worker, miner, mode) {
  const workerName = String(worker.name ?? '');
  switch (String(mode ?? '').toLowerCase().replace(/-/g, '_')) {
    case 'rig_id': return miner.rigId === workerName;
    case 'user': return miner.user === workerName;
    case 'agent': return miner.agent === workerName;
    case 'ip': return miner.ip === worker.ip;
    default: return miner.rigId === workerName;
  }
}
function hasActiveMiner(worker, miners, mode) { return miners.some((miner) => Number(miner.state) !== 3 && minerMatchesWorker(worker, miner, mode)); }
function workerActivityTimestamp(worker) { return Math.max(Number(worker.lastSubmittedHash) || 0, workerLastActiveAt.get(worker.name) || 0); }
function workerHashrate(worker) {
  const windows = [worker.hashrate1m, worker.hashrate10m, worker.hashrate1h, worker.hashrate12h, worker.hashrate24h];
  return windows.some((value) => Number(value) > 0) ? formatHashrate(worker.hashrate1m) : '<span class="muted">Waiting for first share</span>';
}
function workerAgentDetails(miners) {
  const agent = miners.find((miner) => miner.agent)?.agent;
  if (!agent) return null;
  const version = String(agent).match(/XMRig\/([^\s(]+)/i)?.[1] || String(agent);
  const os = String(agent).match(/\(([^)]+)\)/)?.[1] || '';
  return { version, os };
}

function workerDiagnostics(worker, miners) {
  const row = (label, value, extraClass = '') => `<span class="node-row"><span class="node-tag">${label}</span><span class="node-value ${extraClass}">${value}</span></span>`;
  const workerDetails = `<div class="stat worker-diagnostic-card"><span class="label">Proxy metrics</span><span class="node-stack">${[
    row('IP address', escapeHtml(worker.ip)), row('Connections', formatNumber(worker.connections)), row('Shares · A / R / I', `${formatNumber(worker.accepted)} / ${formatNumber(worker.rejected)} / ${formatNumber(worker.invalid)}`, worker.rejected || worker.invalid ? 'danger' : ''), row('Total hashes', formatNumber(worker.hashes)), row('Last submission', timeAgo(worker.lastSubmittedHash)), row('Hashrate · 1m', formatHashrate(worker.hashrate1m)), row('Hashrate · 10m', formatHashrate(worker.hashrate10m)), row('Hashrate · 1h', formatHashrate(worker.hashrate1h)), row('Hashrate · 12h / 24h', `${formatHashrate(worker.hashrate12h)} / ${formatHashrate(worker.hashrate24h)}`),
  ].join('')}</span></div>`;
  const minerDetails = miners.length ? miners.map((miner) => {
    const agent = workerAgentDetails([miner]);
    return `<div class="stat worker-diagnostic-card"><span class="label">Active miner · ${escapeHtml(miner.ip)} · ${minerState(miner.state)}</span><span class="node-stack">${[
      row('Miner ID', formatNumber(miner.id)), row('User', escapeHtml(miner.user)), row('XMRig version', escapeHtml(agent?.version || '—')), row('Operating system', escapeHtml(agent?.os || '—')), row('Difficulty', formatDifficulty(miner.diff)), row('Received', formatBytes(miner.rx)), row('Sent', formatBytes(miner.tx)),
    ].join('')}</span></div>`;
  }).join('') : '<p class="muted">No active miner connection is currently associated with this worker.</p>';
  return `<div class="worker-diagnostics"><div class="worker-diagnostics-heading"><p>ACTIVE WORKER DETAILS</p><strong>${escapeHtml(worker.name)}</strong></div><div class="diagnostic-list">${workerDetails}${minerDetails}</div></div>`;
}
function render(summary, workersPayload, minersPayload) {
  const total = summary.hashrate?.total || [];
  const allWorkers = parseWorkers(workersPayload);
  const offlineAfterSeconds = Math.max(60, Number(settings.offlineAfterMinutes || 5) * 60);
  const hideAfterSeconds = Math.max(offlineAfterSeconds, Number(settings.hideAfterMinutes || 60) * 60);
  const now = Date.now();
  const miners = parseMiners(minersPayload);
  allWorkers.forEach((worker) => {
    if (hasActiveMiner(worker, miners, workersPayload.mode) || Number(worker.connections) > 0) workerLastActiveAt.set(worker.name, now);
  });
  const workers = allWorkers.filter((worker) => hasActiveMiner(worker, miners, workersPayload.mode) || Number(worker.connections) > 0 || (workerActivityTimestamp(worker) > 0 && now - workerActivityTimestamp(worker) <= hideAfterSeconds * 1_000)).sort((left, right) => Number(hasActiveMiner(right, miners, workersPayload.mode)) - Number(hasActiveMiner(left, miners, workersPayload.mode)) || Number(right.connections) - Number(left.connections) || workerActivityTimestamp(right) - workerActivityTimestamp(left) || String(left.name).localeCompare(String(right.name)));
  const online = workers.filter((worker) => hasActiveMiner(worker, miners, workersPayload.mode) || Number(worker.connections) > 0).length;
  const upstream = summary.upstreams || {};
  const results = summary.results || {};

  ui.summary.innerHTML = [
    stat('Hashrate', hashrateTriplet(total), 'primary hashrate-compact'),
    stat('Workers', `${online} online / ${formatNumber(summary.workers)} known`),
    stat('Miner Connections', `${formatNumber(summary.miners?.now)} / ${formatNumber(summary.miners?.max)} peak`),
    stat('Shares', sharesTriplet(results), 'shares-compact'),
  ].join('');
  ui.summary.setAttribute('aria-busy', 'false');
  ui.summarySecondary.innerHTML = [
    stat('Upstream Connections', `<span class="node-stack"><span class="node-row"><span class="node-tag">ACTIVE / TOTAL</span><span class="node-value">${formatNumber(upstream.active)} / ${formatNumber(upstream.total)}</span></span><span class="node-row"><span class="node-tag">SLEEP / FAILED</span><span class="node-value ${upstream.error ? 'danger' : ''}">${formatNumber(upstream.sleep)} / ${formatNumber(upstream.error)}</span></span><span class="node-row"><span class="node-tag">RATIO</span><span class="node-value">${((upstream.ratio || 0) * 100).toFixed(0)}%</span></span></span>`),
    stat('Share Timing', `<span class="node-stack"><span class="node-row"><span class="node-tag">MEDIAN LATENCY</span><span class="node-value">${results.latency ? `${formatNumber(results.latency)} ms` : '—'}</span></span><span class="node-row"><span class="node-tag">AVG SUBMIT</span><span class="node-value">${results.avg_time ? `${formatNumber(results.avg_time)} s` : '—'}</span></span></span>`),
    stat('Hash Totals', `<span class="node-stack"><span class="node-row"><span class="node-tag">ALL</span><span class="node-value">${formatNumber(results.hashes_total)}</span></span><span class="node-row"><span class="node-tag">DONATED</span><span class="node-value">${formatNumber(results.hashes_donate)}</span></span></span>`),
    stat('Best Share Difficulties', `<span class="node-stack">${bestDifficulties(results.best)}</span>`),
  ].join('');

  const workerViews = workers.map((worker, index) => {
    const isOnline = hasActiveMiner(worker, miners, workersPayload.mode) || Number(worker.connections) > 0;
    const activityTimestamp = workerActivityTimestamp(worker);
    const ageSeconds = Math.max(0, Math.floor((now - activityTimestamp) / 1_000));
    const state = isOnline ? 'online' : ageSeconds <= offlineAfterSeconds ? 'recently-offline' : 'offline';
    const status = isOnline ? 'Online' : state === 'recently-offline' ? 'Recently offline' : 'Offline';
    const isExpanded = expandedWorkerName === worker.name;
    const detailsId = `worker-details-${index}`;
    const name = escapeHtml(worker.name);
    const associatedMiners = miners.filter((miner) => minerMatchesWorker(worker, miner, workersPayload.mode));
    const agent = workerAgentDetails(associatedMiners);
    const diagnostics = workerDiagnostics(worker, associatedMiners);
    const toggle = `<button class="worker-toggle" type="button" data-worker="${name}" aria-expanded="${isExpanded}" aria-controls="${detailsId}"><span class="worker-toggle-name" title="${name}">${name}</span><span aria-hidden="true">›</span><span class="sr-only">${isExpanded ? 'Collapse' : 'Expand'} active details</span></button>`;
    const table = `<tr class="${state} worker-row${isExpanded ? ' is-expanded' : ''}" data-worker="${name}"><td>${toggle}</td><td>${escapeHtml(worker.ip)}</td><td><span class="worker-hashrate">${workerHashrate(worker)}</span></td><td><span class="worker-shares"><span>A</span> ${formatNumber(worker.accepted)} <span>R/I</span> <strong class="${worker.rejected || worker.invalid ? 'danger' : ''}">${formatNumber(worker.rejected)} / ${formatNumber(worker.invalid)}</strong></span></td><td><span class="worker-hashes">${formatNumber(worker.hashes)}</span></td><td><span class="worker-status ${state}">${status}</span></td><td><span class="worker-last-seen">${isOnline ? 'Now' : timeAgo(activityTimestamp)} <span>· share ${timeAgo(worker.lastSubmittedHash)}</span></span></td></tr>${isExpanded ? `<tr class="worker-detail-row"><td colspan="7" id="${detailsId}">${diagnostics}</td></tr>` : ''}`;
    const mobile = `<article class="worker-card is-${state}"><button class="worker-card-toggle" type="button" data-worker="${name}" aria-expanded="${isExpanded}" aria-controls="${detailsId}-mobile"><span class="worker-card-identity"><span class="worker-card-name">${name}</span><span class="worker-card-meta">${escapeHtml(worker.ip)} · ${isOnline ? 'seen now' : timeAgo(activityTimestamp)}</span></span><span class="worker-card-summary"><span><b>1m</b>${workerHashrate(worker)}</span><span class="${worker.rejected || worker.invalid ? 'danger' : ''}"><b>Shares A/R/I</b>${formatNumber(worker.accepted)} / ${formatNumber(worker.rejected)} / ${formatNumber(worker.invalid)}</span><span><b>Last</b>${timeAgo(worker.lastSubmittedHash)}</span></span><span class="worker-card-action"><span class="worker-status ${state}">${status}</span><span class="worker-card-chevron" aria-hidden="true">›</span></span><span class="sr-only">${isExpanded ? 'Collapse' : 'Expand'} worker diagnostics</span></button>${isExpanded ? `<div class="worker-card-diagnostics" id="${detailsId}-mobile">${diagnostics}</div>` : ''}</article>`;
    return { table, mobile };
  });
  ui.workers.innerHTML = workerViews.length ? workerViews.map((view) => view.table).join('') : '<tr><td colspan="7" class="empty-state">No workers connected.</td></tr>';
  ui.workersMobile.innerHTML = workerViews.length ? workerViews.map((view) => view.mobile).join('') : '<p class="empty-state">No workers connected.</p>';
  ui.workerCount.textContent = `${online} active`;

  ui.snapshot.innerHTML = [
    stat('Version', escapeHtml(summary.version)), stat('Kind / Mode', `${escapeHtml(summary.kind)} / ${escapeHtml(summary.mode)}`), stat('Uptime', formatDuration(summary.uptime)), stat('Algorithm', escapeHtml(summary.algo)), stat('Hashrate Windows', longHashrateStack(total), 'hashrate-compact'), stat('Worker Mode', escapeHtml(workersPayload.mode)), stat('API Restricted', summary.restricted ? 'Yes' : 'No'), stat('Donation', `${formatNumber(summary.donate_level)}% configured / ${Number(summary.donated || 0).toFixed(2)}% actual`), stat('API Features', Array.isArray(summary.features) && summary.features.length ? summary.features.map(escapeHtml).join(', ') : '—'), stat('API ID', escapeHtml(summary.id)), stat('API Worker ID', escapeHtml(summary.worker_id)), stat('Proxy User Agent', `<span title="${escapeHtml(summary.ua)}">${escapeHtml(summary.ua)}</span>`),
  ].join('');
  const resources = summary.resources || {}; const memory = resources.memory || {};
  ui.network.innerHTML = [stat('Load Average', Array.isArray(resources.load_average) ? resources.load_average.map((value) => Number(value).toFixed(2)).join(' / ') : '—'), stat('Memory Free / Total', `${formatBytes(memory.free)} / ${formatBytes(memory.total)}`), stat('Proxy RSS', formatBytes(memory.resident_set_memory)), stat('CPU Threads', formatNumber(resources.hardware_concurrency)), stat('Sleeping / Failed Upstreams', `${formatNumber(upstream.sleep)} / ${formatNumber(upstream.error)}`, upstream.error ? 'danger' : '')].join('');
  renderCharts(recordHistory(total[0], total[1]));

  const healthy = Boolean(upstream.active);
  const minersNow = Number(summary.miners?.now) || 0;
  const minersPeak = Number(summary.miners?.max) || 0;
  const minersBelowHalfPeak = minersPeak > 0 && minersNow < minersPeak * 0.5;
  const proxyState = !healthy ? ['error', 'Proxy offline'] : minersBelowHalfPeak ? ['warning', 'Miners below 50% peak'] : ['operational', 'System operational'];
  ui.proxyStatus.className = `meta-chip proxy-status is-${proxyState[0]}`;
  ui.proxyStatus.lastElementChild.textContent = proxyState[1];
  ui.updated.textContent = new Date().toLocaleString('en-US');
  hasSnapshot = true;
  ui.notice.style.display = 'none';
}

function showError(message) { ui.proxyStatus.className = 'meta-chip proxy-status is-error'; ui.proxyStatus.lastElementChild.textContent = 'Proxy connection error'; const staleNote = hasSnapshot ? ' The dashboard is showing the last successful snapshot.' : ''; ui.notice.innerHTML = `<strong>Data warning:</strong> ${escapeHtml(message)}${staleNote} <span class="notice-actions"><button class="notice-action" type="button" data-notice-action="retry">Retry now</button><button class="notice-action" type="button" data-notice-action="settings">Connection settings</button></span>`; ui.notice.style.display = 'block'; }
function resetProgress() {
  ui.refreshBar.style.transition = 'none';
  ui.refreshBar.style.transform = 'scaleX(1)';
  // Force the full state to be painted before starting a new countdown.
  void ui.refreshBar.offsetWidth;
  ui.refreshBar.style.transition = `transform ${refreshInterval()}ms linear`;
  ui.refreshBar.style.transform = 'scaleX(0)';
}
function setRefreshing(isRefreshing) {
  ui.refreshButton.disabled = isRefreshing;
  ui.refreshButton.classList.toggle('is-refreshing', isRefreshing);
  ui.refreshButton.setAttribute('aria-busy', String(isRefreshing));
  ui.refreshButton.title = isRefreshing ? 'Refreshing…' : 'Refresh now';
}

async function refresh() {
  if (!settings || refreshing) return false;
  refreshing = true; setRefreshing(true);
  try {
    const [summary, workers, miners] = await Promise.all([getJson('/1/summary', settings), getJson('/1/workers', settings), getJson('/1/miners', settings)]);
    render(summary, workers, miners);
    return true;
  } catch (error) {
    showError(error.message || 'Unable to read the proxy API.');
    return false;
  } finally {
    refreshing = false; setRefreshing(false);
  }
}

function clearValidation() {
  ui.form.querySelectorAll('.has-error').forEach((field) => field.classList.remove('has-error'));
  ui.result.className = 'settings-result';
}
function showValidationError(fieldName, message) {
  clearValidation();
  ui.form.elements[fieldName]?.classList.add('has-error');
  ui.result.textContent = `Validation failed: ${message}`;
  ui.result.classList.add('is-error');
}
function isEndpointValid(endpoint) {
  try {
    const url = new URL(`http://${endpoint}`);
    return Boolean(url.hostname && url.port) && url.pathname === '/';
  } catch { return false; }
}
function populateForm() { const defaults = { endpoint: '127.0.0.1:18080', protocol: 'http', token: '', offlineAfterMinutes: '5', hideAfterMinutes: '60' }; const value = { ...defaults, ...(settings || {}) }; for (const field of Object.keys(defaults)) ui.form.elements[field].value = value[field] || defaults[field]; ui.forgetButton.hidden = !settings; clearValidation(); ui.result.textContent = ''; }
function formConfig() { return Object.fromEntries(new FormData(ui.form)); }
async function validateConnection(config) {
  clearValidation();
  if (!config.endpoint?.trim()) { showValidationError('endpoint', 'Enter the proxy address and API port.'); return null; }
  if (!isEndpointValid(config.endpoint.trim())) { showValidationError('endpoint', 'Use an IP or host followed by a port, for example 127.0.0.1:18080.'); return null; }
  if (window.location.protocol === 'https:' && config.protocol === 'http') { showValidationError('endpoint', 'Mixed content is blocked: an HTTPS dashboard requires an HTTPS Proxy API or reverse proxy.'); return null; }
  if (!ui.form.reportValidity()) return null;
  ui.result.textContent = 'Testing connection…';
  try {
    const summary = await getJson('/1/summary', config);
    ui.result.textContent = `Connected to XMRig Proxy ${summary.version}.`;
    ui.result.classList.add('is-success');
    return summary;
  } catch (error) {
    const message = error.message || 'Connection test failed.';
    const field = /^(401|403):/.test(message) ? 'token' : 'endpoint';
    showValidationError(field, message);
    return null;
  }
}
async function testConnection() { await validateConnection(formConfig()); }
function startRefresh() {
  window.clearTimeout(refreshTimer);
  if (!settings) return;
  resetProgress();
  // Schedule only after the previous request has completed. This prevents a
  // slow or failed request from leaving the bar at zero or skipping a cycle.
  refreshTimer = window.setTimeout(async () => {
    await refresh();
    startRefresh();
  }, refreshInterval());
}
async function refreshNow() {
  await refresh();
  startRefresh();
}

ui.connectionButton.addEventListener('click', () => { populateForm(); ui.dialog.showModal(); });
$('#closeConnectionDialog').addEventListener('click', () => ui.dialog.close());
ui.refreshButton.addEventListener('click', refreshNow);
ui.refreshRate.addEventListener('change', () => {
  if (!settings) return;
  settings = { ...settings, refreshIntervalMs: Number(ui.refreshRate.value) };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  startRefresh();
});
ui.testButton.addEventListener('click', testConnection);
ui.form.addEventListener('input', () => clearValidation());
function toggleWorkerDetails(row) {
  const workerName = row?.dataset.worker;
  if (!workerName) return;
  expandedWorkerName = expandedWorkerName === workerName ? null : workerName;
  refreshNow();
}
function workerToggleFromEvent(event) {
  const target = event.target.closest('[data-worker], .worker-row');
  if (target && (target.matches('[data-worker]') || target.classList.contains('worker-row'))) toggleWorkerDetails(target);
}
ui.workers.addEventListener('click', workerToggleFromEvent);
ui.workersMobile.addEventListener('click', workerToggleFromEvent);
ui.notice.addEventListener('click', (event) => { const action = event.target.closest('[data-notice-action]')?.dataset.noticeAction; if (action === 'retry') refreshNow(); if (action === 'settings') { populateForm(); ui.dialog.showModal(); } });
ui.forgetButton.addEventListener('click', () => ui.forgetDialog.showModal());
ui.confirmForgetButton.addEventListener('click', () => { localStorage.removeItem(SETTINGS_KEY); localStorage.removeItem(HISTORY_KEY); window.location.reload(); });
ui.form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const config = formConfig();
  ui.form.querySelectorAll('button').forEach((button) => { button.disabled = true; });
  const summary = await validateConnection(config);
  ui.form.querySelectorAll('button').forEach((button) => { button.disabled = false; });
  if (!summary) return;
  settings = { ...config, refreshIntervalMs: refreshInterval() };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  renderRefreshRate();
  ui.dialog.close();
  refreshNow();
});
renderRefreshRate();
if (settings) { void refresh().then(startRefresh); } else { populateForm(); ui.dialog.showModal(); }
