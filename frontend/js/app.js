import { getEndpoint, getJson, parseMiners } from './api.js';
import { escapeHtml, formatBytes, formatDifficulty, formatDuration, formatHashrate, formatNumber, minerState, timeAgo } from './formatters.js';

const SETTINGS_KEY = 'xmrig-proxy-monitor.connection.v1';
const HISTORY_KEY = 'xmrig-proxy-monitor.history.v1';
const REFRESH_MS = 10_000;
const $ = (selector) => document.querySelector(selector);

const ui = {
  dialog: $('#connectionDialog'), form: $('#connectionForm'), result: $('#connectionResult'),
  connectionButton: $('#connectionButton'), testButton: $('#testConnection'), forgetButton: $('#forgetConnection'), refreshButton: $('#refreshButton'),
  refreshBar: $('#refreshProgressBar'), status: $('#statusBadge'), notice: $('#notice'), updated: $('#lastUpdate'),
  endpoint: $('#endpointChip'), summary: $('#summaryStats'), workers: $('#workersTable'), workerCount: $('#workerCount'),
  snapshot: $('#proxySnapshot'), network: $('#networkStats'), miners: $('#minersTable'), minerCount: $('#minerCount'),
  workerDialog: $('#workerDialog'), workerDialogContent: $('#workerDialogContent'),
  hashrateChart: $('#hashrateChart'),
};

let settings = readSettings();
let refreshTimer = null;
let refreshing = false;
let hashrateChart = null;
let latestMiners = [];

function readSettings() { try { return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || null; } catch { return null; } }
function readHistory() { try { const value = JSON.parse(localStorage.getItem(HISTORY_KEY)); return Array.isArray(value) ? value : []; } catch { return []; } }
function recordHistory(hashrate1m, hashrate10m) { const history = readHistory(); const point = { timestamp: Date.now(), hashrate1m: Number(hashrate1m || 0), hashrate10m: Number(hashrate10m || 0) }; history.push(point); const retained = history.slice(-180); localStorage.setItem(HISTORY_KEY, JSON.stringify(retained)); return retained; }
function renderCharts(history) { if (!window.Chart) return; const labels = history.map((point) => new Date(point.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })); const common = { responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false }, plugins: { legend: { labels: { color: '#a1a1aa', boxWidth: 10, usePointStyle: true } }, tooltip: { backgroundColor: '#121212', borderColor: '#353535', borderWidth: 1, titleColor: '#f4f4f5', bodyColor: '#f4f4f5', callbacks: { label: (context) => `${context.dataset.label}: ${formatHashrate(context.parsed.y)}` } } }, scales: { x: { ticks: { color: '#8e8e96', maxTicksLimit: 8 }, grid: { color: 'rgba(255,255,255,.08)' } }, y: { ticks: { color: '#8e8e96', callback: (value) => formatHashrate(value) }, grid: { color: 'rgba(255,255,255,.08)' } } } }; if (hashrateChart) hashrateChart.destroy(); hashrateChart = new window.Chart(ui.hashrateChart, { type: 'line', data: { labels, datasets: [{ label: '1m Hashrate', data: history.map((point) => point.hashrate1m ?? 0), borderColor: '#ff9900', backgroundColor: 'rgba(255,153,0,.05)', fill: false, tension: .28, pointRadius: 0, pointHoverRadius: 5, borderWidth: 2 }, { label: '10m Hashrate', data: history.map((point) => point.hashrate10m ?? point.hashrate ?? 0), borderColor: '#ff7a00', backgroundColor: 'rgba(255,122,0,.10)', fill: true, tension: .28, pointRadius: 0, pointHoverRadius: 5, borderWidth: 2 }] }, options: common }); }
function stat(label, value, extraClass = '') { return `<div class="stat ${extraClass}"><span class="label">${label}</span><span class="value">${value}</span></div>`; }
function longHashrateStack(total = []) { return `<span class="hashrate-triplet"><span class="hashrate-row"><span class="hashrate-tag">12H</span><span class="hashrate-value">${formatHashrate(total[3])}</span></span><span class="hashrate-row"><span class="hashrate-tag">24H</span><span class="hashrate-value">${formatHashrate(total[4])}</span></span><span class="hashrate-row"><span class="hashrate-tag">ALL</span><span class="hashrate-value">${formatHashrate(total[5])}</span></span></span>`; }
function hashrateTriplet(total = []) { return `<span class="hashrate-triplet"><span class="hashrate-row"><span class="hashrate-tag">1M</span><span class="hashrate-value">${formatHashrate(total[0])}</span></span><span class="hashrate-row"><span class="hashrate-tag">10M</span><span class="hashrate-value">${formatHashrate(total[1])}</span></span><span class="hashrate-row"><span class="hashrate-tag">1H</span><span class="hashrate-value">${formatHashrate(total[2])}</span></span></span>`; }
function sharesTriplet(results = {}) { return `<span class="shares-triplet"><span class="shares-row"><span class="shares-tag">ACCEPTED</span><span class="shares-value">${formatNumber(results.accepted)}</span></span><span class="shares-row"><span class="shares-tag">REJECTED</span><span class="shares-value ${results.rejected || results.invalid ? 'danger' : ''}">${formatNumber(Number(results.rejected || 0) + Number(results.invalid || 0))}</span></span><span class="shares-row"><span class="shares-tag">BEST</span><span class="shares-value">${formatDifficulty(Math.max(...(results.best || [0])))}</span></span></span>`; }

function renderMiners(miners) {
  ui.minerCount.textContent = `${miners.length} active`;
  ui.miners.innerHTML = miners.length ? miners.map((miner) => `<tr><td>${escapeHtml(miner.rigId)}</td><td>${escapeHtml(miner.ip)}</td><td title="${escapeHtml(miner.agent)}">${escapeHtml(miner.agent)}</td><td>${formatDifficulty(miner.diff)}</td><td><span class="node-stack"><span class="node-row"><span class="node-tag">RX</span><span class="node-value">${formatBytes(miner.rx)}</span></span><span class="node-row"><span class="node-tag">TX</span><span class="node-value">${formatBytes(miner.tx)}</span></span></span></td><td><span class="worker-status online">${minerState(miner.state)}</span></td></tr>`).join('') : '<tr><td colspan="6" class="empty-state">No active miner connections.</td></tr>';
}
function openWorkerDialog(workerName) {
  const miners = latestMiners.filter((miner) => miner.rigId === workerName);
  const details = miners.length ? miners.map((miner) => `<div class="stat"><span class="label">${escapeHtml(miner.ip)} · ${minerState(miner.state)}</span><span class="value"><span class="node-stack"><span class="node-row"><span class="node-tag">AGENT</span><span class="node-value">${escapeHtml(miner.agent)}</span></span><span class="node-row"><span class="node-tag">DIFF</span><span class="node-value">${formatDifficulty(miner.diff)}</span></span><span class="node-row"><span class="node-tag">RX / TX</span><span class="node-value">${formatBytes(miner.rx)} / ${formatBytes(miner.tx)}</span></span></span></span></div>`).join('') : '<p class="muted">No active miner connection is currently associated with this worker.</p>';
  ui.workerDialogContent.innerHTML = `<div class="settings-heading"><div><p>WORKER DIAGNOSTICS</p><h2 id="workerDialogTitle">${escapeHtml(workerName)}</h2></div><button class="icon-btn" id="closeWorkerDialog" type="button" aria-label="Close">×</button></div><div class="diagnostic-list">${details}</div>`;
  $('#closeWorkerDialog').addEventListener('click', () => ui.workerDialog.close());
  ui.workerDialog.showModal();
}
function render(summary, workersPayload, minersPayload) {
  const total = summary.hashrate?.total || [];
  const allWorkers = Array.isArray(workersPayload.workers) ? workersPayload.workers : [];
  const offlineAfterSeconds = Math.max(60, Number(settings.offlineAfterMinutes || 5) * 60);
  const hideAfterSeconds = Math.max(offlineAfterSeconds, Number(settings.hideAfterMinutes || 60) * 60);
  const now = Date.now();
  const workers = allWorkers.filter((worker) => Number(worker[2]) > 0 || (Number(worker[7]) > 0 && now - Number(worker[7]) <= hideAfterSeconds * 1_000)).sort((left, right) => Number(right[2]) - Number(left[2]) || Number(right[7]) - Number(left[7]) || String(left[0]).localeCompare(String(right[0])));
  const online = workers.filter((worker) => Number(worker[2]) > 0).length;
  const upstream = summary.upstreams || {};
  const results = summary.results || {};
  latestMiners = parseMiners(minersPayload);

  ui.summary.innerHTML = [
    stat('Hashrate', hashrateTriplet(total), 'primary hashrate-compact'),
    stat('Workers Online', `${online}/${workers.length || 0}`),
    stat('Shares', sharesTriplet(results), 'shares-compact'),
    stat('Upstream', `<span class="node-stack"><span class="node-row"><span class="node-tag">ACTIVE</span><span class="node-value">${upstream.active || 0}/${upstream.total || 0}</span></span><span class="node-row"><span class="node-tag">LATENCY</span><span class="node-value">${results.latency ? `${results.latency} ms` : '—'}</span></span><span class="node-row"><span class="node-tag">RATIO</span><span class="node-value">${((upstream.ratio || 0) * 100).toFixed(0)}%</span></span></span>`),
  ].join('');

  ui.workers.innerHTML = workers.length ? workers.map((row) => {
    const [name, ip, connections, accepted, rejected, invalid, hashes, lastHash, h1m, h10m, h1h] = row;
    const isOnline = Number(connections) > 0;
    const ageSeconds = Math.max(0, Math.floor((now - Number(lastHash || 0)) / 1_000));
    const state = isOnline ? 'online' : ageSeconds <= offlineAfterSeconds ? 'recently-offline' : 'offline';
    const status = isOnline ? 'Online' : state === 'recently-offline' ? 'Recently offline' : 'Offline';
    return `<tr class="${state}"><td><button class="worker-link" type="button" data-worker="${escapeHtml(name)}">${escapeHtml(name)}</button></td><td>${escapeHtml(ip)}</td><td><span class="hashrate-triplet"><span class="hashrate-row"><span class="hashrate-tag">1M</span><span class="hashrate-value">${formatHashrate(h1m)}</span></span><span class="hashrate-row"><span class="hashrate-tag">10M</span><span class="hashrate-value">${formatHashrate(h10m)}</span></span><span class="hashrate-row"><span class="hashrate-tag">1H</span><span class="hashrate-value">${formatHashrate(h1h)}</span></span></span></td><td><span class="worker-status ${state}">${status}</span></td><td>${timeAgo(lastHash)}</td></tr>`;
  }).join('') : '<tr><td colspan="5" class="empty-state">No workers connected.</td></tr>';
  ui.workerCount.textContent = `${online} active`;

  ui.snapshot.innerHTML = [
    stat('Version', summary.version || '—'), stat('Uptime', formatDuration(summary.uptime)), stat('Hashrate Windows', longHashrateStack(total), 'hashrate-compact'), stat('Worker Mode', workersPayload.mode || '—'),
  ].join('');
  const resources = summary.resources || {}; const memory = resources.memory || {};
  ui.network.innerHTML = [stat('Load Average', Array.isArray(resources.load_average) ? resources.load_average.map((value) => Number(value).toFixed(2)).join(' / ') : '—'), stat('Memory Free / Total', `${formatBytes(memory.free)} / ${formatBytes(memory.total)}`), stat('Proxy RSS', formatBytes(memory.resident_set_memory)), stat('CPU Threads', formatNumber(resources.hardware_concurrency)), stat('Sleeping / Failed Upstreams', `${formatNumber(upstream.sleep)} / ${formatNumber(upstream.error)}`, upstream.error ? 'danger' : '')].join('');
  renderMiners(latestMiners);
  renderCharts(recordHistory(total[0], total[1]));

  const healthy = Boolean(upstream.active);
  ui.status.className = `badge ${healthy ? 'badge-online' : 'badge-warning'}`;
  ui.status.textContent = healthy ? 'Online' : 'Upstream Offline';
  ui.endpoint.textContent = getEndpoint(settings);
  ui.updated.textContent = new Date().toLocaleString('en-US');
  ui.notice.style.display = 'none';
}

function showError(message) { ui.status.className = 'badge badge-warning'; ui.status.textContent = 'Connection Error'; ui.notice.innerHTML = `<strong>Data warning:</strong> ${escapeHtml(message)}`; ui.notice.style.display = 'block'; }
function resetProgress() { ui.refreshBar.style.transition = 'none'; ui.refreshBar.style.transform = 'scaleX(1)'; requestAnimationFrame(() => { ui.refreshBar.style.transition = `transform ${REFRESH_MS}ms linear`; ui.refreshBar.style.transform = 'scaleX(0)'; }); }

async function refresh() {
  if (!settings || refreshing) return;
  refreshing = true; ui.refreshButton.disabled = true;
  try { const [summary, workers, miners] = await Promise.all([getJson('/1/summary', settings), getJson('/1/workers', settings), getJson('/1/miners', settings)]); render(summary, workers, miners); resetProgress(); }
  catch (error) { showError(error.message || 'Unable to read the proxy API.'); }
  finally { refreshing = false; ui.refreshButton.disabled = false; }
}

function populateForm() { const defaults = { host: '127.0.0.1', port: '18080', protocol: 'http', token: '', offlineAfterMinutes: '5', hideAfterMinutes: '60' }; const value = { ...defaults, ...(settings || {}) }; for (const field of Object.keys(defaults)) ui.form.elements[field].value = value[field] || defaults[field]; ui.forgetButton.hidden = !settings; ui.result.textContent = ''; }
async function testConnection() { const config = Object.fromEntries(new FormData(ui.form)); if (!config.host || !config.port) { ui.result.textContent = 'Enter a host and API port.'; return; } ui.result.textContent = 'Testing connection…'; try { const summary = await getJson('/1/summary', config); ui.result.textContent = `Connected to XMRig Proxy ${summary.version}.`; } catch (error) { ui.result.textContent = error.message || 'Connection test failed.'; } }
function startRefresh() { window.clearInterval(refreshTimer); refreshTimer = window.setInterval(refresh, REFRESH_MS); }

ui.connectionButton.addEventListener('click', () => { populateForm(); ui.dialog.showModal(); });
ui.refreshButton.addEventListener('click', refresh);
ui.testButton.addEventListener('click', testConnection);
ui.workers.addEventListener('click', (event) => { const button = event.target.closest('[data-worker]'); if (button) openWorkerDialog(button.dataset.worker); });
ui.forgetButton.addEventListener('click', () => { localStorage.removeItem(SETTINGS_KEY); localStorage.removeItem(HISTORY_KEY); window.location.reload(); });
ui.form.addEventListener('submit', (event) => { if (event.submitter?.value !== 'save') return; event.preventDefault(); settings = Object.fromEntries(new FormData(ui.form)); localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); ui.dialog.close(); refresh(); startRefresh(); });
if (settings) { refresh(); startRefresh(); } else { populateForm(); ui.dialog.showModal(); }
