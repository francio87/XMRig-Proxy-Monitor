const REQUEST_TIMEOUT_MS = 8_000;

export function getEndpoint(config) {
  return `${config.protocol}://${config.endpoint.trim()}`;
}

function headers(config) {
  return config.token ? { Authorization: `Bearer ${config.token}` } : {};
}

export async function getJson(path, config) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${getEndpoint(config)}${path}`, {
      headers: headers(config),
      signal: controller.signal,
    });

    if (!response.ok) {
      const hint = response.status === 401 ? 'Missing or invalid token'
        : response.status === 403 ? 'Unauthorized token'
          : 'Request failed';
      throw new Error(`${response.status}: ${hint}`);
    }

    try {
      return await response.json();
    } catch {
      throw new Error('The proxy returned invalid JSON.');
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`The proxy did not respond within ${REQUEST_TIMEOUT_MS / 1_000} seconds`);
    }
    if (error instanceof TypeError) {
      throw new Error('Network request failed. Check the proxy address, CORS, and HTTP/HTTPS. Ensure the Proxy allows this dashboard origin and Authorization header.');
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

const WORKER_FIELDS = [
  'name', 'ip', 'connections', 'accepted', 'rejected', 'invalid', 'hashes',
  'lastSubmittedHash', 'hashrate1m', 'hashrate10m', 'hashrate1h', 'hashrate12h', 'hashrate24h',
];

// /1/workers rows are positional; keep this API contract in one place.
export function parseWorkers(payload) {
  if (!Array.isArray(payload?.workers)) return [];

  return payload.workers.map((row) => Object.fromEntries(
    WORKER_FIELDS.map((field, index) => [field, row[index]]),
  ));
}

export function parseMiners(payload) {
  const format = Array.isArray(payload.format) ? payload.format : [];
  const index = (field) => format.indexOf(field);

  return Array.isArray(payload.miners)
    ? payload.miners.map((row) => ({
      id: row[index('id')],
      ip: row[index('ip')],
      tx: Number(row[index('tx')] || 0),
      rx: Number(row[index('rx')] || 0),
      state: row[index('state')],
      diff: row[index('diff')],
      user: row[index('user')] || '—',
      rigId: row[index('rig_id')] || '—',
      agent: row[index('agent')] || '—',
    }))
    : [];
}
