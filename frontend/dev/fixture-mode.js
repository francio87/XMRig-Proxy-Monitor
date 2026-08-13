const SETTINGS_KEY = 'xmrig-proxy-monitor.connection.v1';
const HISTORY_KEY = 'xmrig-proxy-monitor.history.v1';
const STASH_KEY = 'xmrig-proxy-monitor.fixture-settings.v1';
const HISTORY_STASH_KEY = 'xmrig-proxy-monitor.fixture-history.v1';
const scenario = new URLSearchParams(window.location.search).get('fixture');

const now = Date.now();
// Production-shaped values: one active miner and one recently offline worker.
// Worker names, addresses, and user remain synthetic fixture data.
const summary = {
  version: '6.26.0-fixture', uptime: 90_184, hashrate: { total: [0.46, 0.66, 0.22, 0.01, 0, 0.06] },
  miners: { now: 1, max: 1 }, workers: 2,
  upstreams: { active: 1, sleep: 0, error: 0, total: 1, ratio: 1 },
  results: { accepted: 70, rejected: 0, invalid: 0, expired: 0, avg_time: 183, latency: 81, hashes_total: 793_893, hashes_donate: 0, best: [560_082, 381_940, 228_388] },
};
const minerFormat = ['id', 'ip', 'tx', 'rx', 'state', 'diff', 'user', 'password', 'rig_id', 'agent'];
const onlineWorkers = [['rig-alpha', '192.168.1.10', 1, 10, 0, 0, 136_837, now, 0.46, 0.22, 0.03, 0, 0]];
// Kept two minutes in the past so this fixture reliably remains recently offline.
const recentlyOfflineWorkers = [['rig-beta', '192.168.1.11', 0, 60, 0, 0, 657_056, now - 120_000, 0, 0.43, 0.18, 0.01, 0]];
const onlineMiners = [[2, '192.168.1.10', 12_546, 3_496, 2, 13_891, 'fixture-user', '', 'rig-alpha', 'XMRig/6.26.0 (Linux x86_64)']];

// A dense fleet lets the worker table and mobile cards be inspected with a
// realistic mix of active and retained workers. It intentionally has exactly
// 30 worker identities: 12 online, 9 recently offline, and 9 offline.
const largeFleetOnline = Array.from({ length: 12 }, (_, index) => {
  const number = index + 1;
  const hasRejectedShares = number % 5 === 0;
  const hasInvalidShares = number % 7 === 0;
  const hashrate = 180 + index * 37;
  return [`fleet-online-${String(number).padStart(2, '0')}`, `10.42.0.${number}`, number % 3 === 0 ? 2 : 1, 120 + index * 31, hasRejectedShares ? number % 4 + 1 : 0, hasInvalidShares ? 1 : 0, 2_800_000 + index * 641_000, now - index * 15_000, hashrate, hashrate * 0.94, hashrate * 0.88, hashrate * 0.81, hashrate * 0.75];
});
const largeFleetRecentlyOffline = Array.from({ length: 9 }, (_, index) => {
  const number = index + 1;
  const hashrate = index % 2 ? 0 : 95 + index * 18;
  return [`fleet-recent-${String(number).padStart(2, '0')}`, `10.42.1.${number}`, 0, 60 + index * 19, index === 4 ? 2 : 0, index === 7 ? 1 : 0, 1_400_000 + index * 287_000, now - (45 + index * 28) * 1_000, hashrate, hashrate * 0.86, hashrate * 0.72, hashrate * 0.55, hashrate * 0.44];
});
const largeFleetOffline = Array.from({ length: 9 }, (_, index) => {
  const number = index + 1;
  const hashrate = index < 3 ? 40 + index * 15 : 0;
  return [`fleet-offline-${String(number).padStart(2, '0')}`, `10.42.2.${number}`, 0, 25 + index * 11, index === 2 ? 3 : 0, index === 5 ? 2 : 0, 800_000 + index * 203_000, now - (7 + index * 5) * 60_000, hashrate, hashrate * 0.78, hashrate * 0.52, hashrate * 0.31, hashrate * 0.18];
});
const largeFleetMiners = largeFleetOnline.map((worker, index) => [
  100 + index, worker[1], 7_200 + index * 410, 2_100 + index * 235, 2, 8_000 + index * 1_750,
  `fleet-user-${String(index + 1).padStart(2, '0')}`, '', worker[0], `XMRig/6.${24 + index % 3}.0 (Linux ${index % 2 ? 'aarch64' : 'x86_64'})`,
]);
const largeFleetSummary = {
  ...summary,
  hashrate: { total: [5_460, 5_210, 4_830, 4_200, 3_750, 3_120] },
  miners: { now: 12, max: 18 }, workers: 30,
  results: { accepted: 4_820, rejected: 13, invalid: 4, expired: 1, avg_time: 27, latency: 96, hashes_total: 61_920_000, hashes_donate: 0, best: [2_810_000, 2_460_000, 2_120_000] },
};
// Keep the relative last-share ages stable across fixture refreshes.
function refreshLargeFleetTimestamps(workers) {
  const currentTime = Date.now();
  return workers.map((worker) => [...worker.slice(0, 7), currentTime - (now - worker[7]), ...worker.slice(8)]);
}
const fixtures = {
  operational: () => ({ summary, workers: { mode: 'rig_id', workers: [...onlineWorkers, ...recentlyOfflineWorkers] }, miners: { format: minerFormat, miners: onlineMiners } }),
  'low-miners': () => ({ summary: { ...summary, miners: { now: 0, max: 2 }, workers: 0 }, workers: { mode: 'rig_id', workers: [] }, miners: { format: minerFormat, miners: [] } }),
  'upstream-offline': () => ({ summary: { ...summary, upstreams: { ...summary.upstreams, active: 0, sleep: 1 } }, workers: { mode: 'rig_id', workers: onlineWorkers }, miners: { format: minerFormat, miners: onlineMiners } }),
  'mixed-rigs': () => ({ summary, workers: { mode: 'rig_id', workers: [...onlineWorkers, ['rig-recent', '192.168.1.11', 0, 80, 0, 0, 2_249_900, now - 120_000, 0, 0, 0, 0, 0], ['rig-offline', '192.168.1.12', 0, 40, 1, 0, 1_100_000, now - 600_000, 0, 0, 0, 0, 0]] }, miners: { format: minerFormat, miners: onlineMiners } }),
  'large-fleet': () => ({ summary: largeFleetSummary, workers: { mode: 'rig_id', workers: refreshLargeFleetTimestamps([...largeFleetOnline, ...largeFleetRecentlyOffline, ...largeFleetOffline]) }, miners: { format: minerFormat, miners: largeFleetMiners } }),
};

function setFixtureSettings() {
  if (!sessionStorage.getItem(STASH_KEY)) {
    sessionStorage.setItem(STASH_KEY, localStorage.getItem(SETTINGS_KEY) ?? '');
    sessionStorage.setItem(HISTORY_STASH_KEY, localStorage.getItem(HISTORY_KEY) ?? '');
    localStorage.removeItem(HISTORY_KEY);
  }
  if (!localStorage.getItem(SETTINGS_KEY)) localStorage.setItem(SETTINGS_KEY, JSON.stringify({ endpoint: 'fixture.local:18080', protocol: 'http', token: '', offlineAfterMinutes: '5', hideAfterMinutes: '60', refreshIntervalMs: 10_000 }));
}
function restoreSettings() {
  const saved = sessionStorage.getItem(STASH_KEY);
  if (saved === null) return;
  if (saved) localStorage.setItem(SETTINGS_KEY, saved); else localStorage.removeItem(SETTINGS_KEY);
  const history = sessionStorage.getItem(HISTORY_STASH_KEY);
  if (history) localStorage.setItem(HISTORY_KEY, history); else localStorage.removeItem(HISTORY_KEY);
  sessionStorage.removeItem(STASH_KEY);
  sessionStorage.removeItem(HISTORY_STASH_KEY);
}
function json(body) { return new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }); }

if (scenario) {
  setFixtureSettings();
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const path = new URL(typeof input === 'string' ? input : input.url).pathname;
    if (!path.startsWith('/1/')) return originalFetch(input, init);
    if (scenario === 'network-error') return Promise.reject(new TypeError('Fixture network error'));
    if (scenario === 'unauthorized') return Promise.resolve(new Response('{}', { status: 401 }));
    if (scenario === 'invalid-json') return Promise.resolve(new Response('not json', { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const data = fixtures[scenario]?.();
    if (!data) return originalFetch(input, init);
    return Promise.resolve(json(path === '/1/summary' ? data.summary : path === '/1/workers' ? data.workers : data.miners));
  };
} else {
  restoreSettings();
}

const options = [
  ['', 'Live Proxy (no fixture)'], ['operational', 'Operational'], ['low-miners', 'Warning: low miners'], ['upstream-offline', 'Error: upstream offline'], ['mixed-rigs', 'Mixed rigs'], ['large-fleet', 'Large fleet · 30 workers'], ['network-error', 'Error: network'], ['unauthorized', 'Error: unauthorized'], ['invalid-json', 'Error: invalid JSON'],
];
window.addEventListener('DOMContentLoaded', () => {
  const controls = document.querySelector('.header-controls');
  if (!controls) return;
  const wrapper = document.createElement('label');
  wrapper.className = 'fixture-controls';
  wrapper.innerHTML = `Dev fixture: <select aria-label="Development fixture">${options.map(([value, label]) => `<option value="${value}"${value === scenario ? ' selected' : ''}>${label}</option>`).join('')}</select>`;
  wrapper.querySelector('select').addEventListener('change', (event) => {
    const url = new URL(window.location.href);
    if (event.target.value) url.searchParams.set('fixture', event.target.value); else url.searchParams.delete('fixture');
    window.location.assign(url);
  });
  controls.prepend(wrapper);
});

const style = document.createElement('style');
style.textContent = '.fixture-controls { color: var(--accent); font-size: .7rem; white-space: nowrap; } .fixture-controls select { margin-left: .25rem; max-width: 150px; color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--surface-elev); padding: .18rem .35rem; font: inherit; }';
document.head.append(style);
