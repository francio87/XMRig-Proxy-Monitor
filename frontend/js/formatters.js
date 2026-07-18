export function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = String(value ?? '—');
  return element.innerHTML;
}

export function formatNumber(value) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

export function formatHashrate(value) {
  const number = Number(value || 0);
  if (number >= 1_000_000) return `${(number / 1_000_000).toFixed(2)} MH/s`;
  if (number >= 1_000) return `${(number / 1_000).toFixed(2)} kH/s`;
  return `${number.toFixed(2)} H/s`;
}

export function formatDuration(value) {
  const seconds = Number(value || 0);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return `${days ? `${days}d ` : ''}${hours}h ${minutes}m`;
}

export function timeAgo(timestamp) {
  if (!timestamp) return '—';
  const seconds = Math.max(0, Math.floor((Date.now() - Number(timestamp)) / 1_000));
  if (seconds < 10) return 'now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3_600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3_600)}h ago`;
}

export function formatBytes(value) {
  const bytes = Number(value || 0);
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KiB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MiB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GiB`;
}

export function formatDifficulty(value) {
  return formatNumber(value || 0);
}

export function minerState(value) {
  const states = ['Waiting for login', 'Waiting for job', 'Ready', 'Closing'];
  return states[Number(value)] || `State ${value ?? '—'}`;
}
