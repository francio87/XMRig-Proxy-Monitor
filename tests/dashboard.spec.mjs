import { expect, test } from '@playwright/test'

const proxy = {
  host: '127.0.0.1',
  port: '18080',
  token: 'xmrig-proxy-dev-token-change-me',
}

async function connectToDevelopmentProxy(page) {
  await page.goto('/')
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible()
  await expect(page.getByRole('button', { name: 'Forget connection' })).toBeHidden()
  const [box, viewport] = await Promise.all([dialog.boundingBox(), page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }))])
  expect(box).not.toBeNull()
  expect(Math.abs(box.x - (viewport.width - box.width) / 2)).toBeLessThanOrEqual(2)
  expect(Math.abs(box.y - (viewport.height - box.height) / 2)).toBeLessThanOrEqual(2)
  await page.getByLabel('Proxy address (IP or host:port)').fill(`${proxy.host}:${proxy.port}`)
  await page.getByLabel('Bearer token (optional)').fill(proxy.token)
  await page.getByRole('button', { name: 'Save and connect' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByText('Proxy / Stratum')).toBeVisible()
}

test('renders XMRig Proxy data after a direct browser connection', async ({ page }, testInfo) => {
  await mockProxyApi(page)
  await connectToDevelopmentProxy(page)
  await expect(page.locator('#proxyStatus')).toHaveText('System operational')
  await expect(page.locator('#proxyStatus')).toHaveClass(/is-operational/)
  await expect(page.locator('#summaryStats .stat')).toHaveCount(4)
  await expect(page.locator('#summarySecondary .stat')).toHaveCount(4)
  await expect(page.locator('#workersTable tr')).not.toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true })
})

test('renders the 30-worker large-fleet development fixture', async ({ page }) => {
  await page.goto('/?fixture=large-fleet')

  await expect(page.locator('#workersTable .worker-row')).toHaveCount(30)
  await expect(page.locator('#workersTable .worker-status.online')).toHaveCount(12)
  await expect(page.locator('#workersTable .worker-status.recently-offline')).toHaveCount(9)
  await expect(page.locator('#workersTable .worker-status.offline')).toHaveCount(9)
  await expect(page.locator('#workerCount')).toHaveText('12 active')
})

test('shows warning and error proxy states from the summary', async ({ page }) => {
  let summary = { ...fixtureSummary, miners: { now: 0, max: 2 } }
  await mockProxyApi(page, fixtureWorkers, fixtureMiners, () => summary)
  await connectToDevelopmentProxy(page)
  await expect(page.locator('#proxyStatus')).toHaveText('Miners below 50% peak')
  await expect(page.locator('#proxyStatus')).toHaveClass(/is-warning/)

  summary = { ...fixtureSummary, upstreams: { ...fixtureSummary.upstreams, active: 0 } }
  await page.getByRole('button', { name: 'Refresh now' }).click()
  await expect(page.locator('#proxyStatus')).toHaveText('Proxy offline')
  await expect(page.locator('#proxyStatus')).toHaveClass(/is-error/)
})

test('submits a valid connection form with Enter', async ({ page }) => {
  await mockProxyApi(page)
  await page.goto('/')
  await page.getByLabel('Proxy address (IP or host:port)').fill(`${proxy.host}:${proxy.port}`)
  await page.getByLabel('Bearer token (optional)').fill(proxy.token)
  await page.getByLabel('Bearer token (optional)').press('Enter')

  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.locator('#proxyStatus')).toHaveText('System operational')
})

test('maps every positional worker field before rendering it', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Payload mapping is pure module logic and does not vary by viewport.')
  await page.goto('/')
  const worker = await page.evaluate(async () => {
    const { parseWorkers } = await import('/js/api.js')
    return parseWorkers({ workers: [[
      'rig-alpha', '192.168.1.10', 2, 104, 1, 3, 3012000, 1700000000000,
      614, 580, 542, 500, 480,
    ]] })[0]
  })

  expect(worker).toEqual({
    name: 'rig-alpha', ip: '192.168.1.10', connections: 2, accepted: 104,
    rejected: 1, invalid: 3, hashes: 3012000, lastSubmittedHash: 1700000000000,
    hashrate1m: 614, hashrate10m: 580, hashrate1h: 542, hashrate12h: 500, hashrate24h: 480,
  })
})

test('validates the connection before saving it', async ({ page }) => {
  await mockUnauthorizedProxyApi(page)
  await page.goto('/')
  await page.getByLabel('Proxy address (IP or host:port)').fill(`${proxy.host}:${proxy.port}`)
  await page.getByLabel('Bearer token (optional)').fill(proxy.token)
  await page.getByRole('button', { name: 'Save and connect' }).click()

  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.locator('#connectionResult')).toContainText('Validation failed: 401: Missing or invalid token')
  await expect(page.getByLabel('Bearer token (optional)')).toHaveClass(/has-error/)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('xmrig-proxy-monitor.connection.v1'))).toBeNull()
})

test('highlights the proxy address after a network validation failure', async ({ page }) => {
  await mockNetworkFailure(page)
  await page.goto('/')
  await page.getByLabel('Proxy address (IP or host:port)').fill(`${proxy.host}:${proxy.port}`)
  await page.getByRole('button', { name: 'Save and connect' }).click()

  await expect(page.locator('#connectionResult')).toHaveClass(/is-error/)
  await expect(page.locator('#connectionResult')).toContainText('Network request failed')
  await expect(page.getByLabel('Proxy address (IP or host:port)')).toHaveClass(/has-error/)
})

test('highlights the token for a forbidden response', async ({ page }) => {
  await mockForbiddenProxyApi(page)
  await page.goto('/')
  await page.getByLabel('Proxy address (IP or host:port)').fill(`${proxy.host}:${proxy.port}`)
  await page.getByLabel('Bearer token (optional)').fill(proxy.token)
  await page.getByRole('button', { name: 'Save and connect' }).click()

  await expect(page.locator('#connectionResult')).toContainText('403: Unauthorized token')
  await expect(page.getByLabel('Bearer token (optional)')).toHaveClass(/has-error/)
})

test('reports invalid JSON against the proxy address', async ({ page }) => {
  await mockInvalidJsonProxyApi(page)
  await page.goto('/')
  await page.getByLabel('Proxy address (IP or host:port)').fill(`${proxy.host}:${proxy.port}`)
  await page.getByRole('button', { name: 'Save and connect' }).click()

  await expect(page.locator('#connectionResult')).toContainText('The proxy returned invalid JSON.')
  await expect(page.getByLabel('Proxy address (IP or host:port)')).toHaveClass(/has-error/)
})

test('reports a proxy timeout', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'One timeout check is enough; it uses the real request timeout.')
  await mockTimeoutProxyApi(page)
  await page.goto('/')
  await page.getByLabel('Proxy address (IP or host:port)').fill(`${proxy.host}:${proxy.port}`)
  await page.getByRole('button', { name: 'Save and connect' }).click()

  await expect(page.locator('#connectionResult')).toContainText('The proxy did not respond within 8 seconds', { timeout: 12_000 })
})

test('selects and persists the auto-refresh interval', async ({ page }) => {
  await mockProxyApi(page)
  await connectToDevelopmentProxy(page)

  await page.getByLabel('Auto-refresh interval').selectOption('30000')
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('xmrig-proxy-monitor.connection.v1')).refreshIntervalMs)).toBe(30_000)

  await page.reload()
  await expect(page.getByLabel('Auto-refresh interval')).toHaveValue('30000')
})

test('keeps an empty workers response usable', async ({ page }) => {
  await mockProxyApi(page, { ...fixtureWorkers, workers: [] })
  await connectToDevelopmentProxy(page)

  await expect(page.locator('#proxyStatus')).toHaveText('System operational')
  await expect(page.locator('#workersTable')).toContainText('No workers connected.')
})

test('classifies and hides disconnected workers by the configured thresholds', async ({ page }) => {
  const now = Date.now()
  await mockProxyApi(page, {
    ...fixtureWorkers,
    workers: [
      ['rig-online', '192.168.1.10', 1, 0, 0, 0, 0, now, 100, 100, 100, 100, 100],
      ['rig-recent', '192.168.1.11', 0, 0, 0, 0, 0, now - 120_000, 0, 0, 0, 0, 0],
      ['rig-offline', '192.168.1.12', 0, 0, 0, 0, 0, now - 600_000, 0, 0, 0, 0, 0],
      ['rig-hidden', '192.168.1.13', 0, 0, 0, 0, 0, now - 3_700_000, 0, 0, 0, 0, 0],
    ],
  }, { format: fixtureMiners.format, miners: [] })
  await connectToDevelopmentProxy(page)

  await expect(page.locator('#workersTable')).toContainText('Recently offline')
  await expect(page.locator('#workersTable')).toContainText('Offline')
  await expect(page.locator('#workersTable')).not.toContainText('rig-hidden')
})

test('keeps a worker online when its active miner is connected but its share timestamp is stale', async ({ page }) => {
  await mockProxyApi(page, {
    ...fixtureWorkers,
    workers: [['rig-alpha', '192.168.1.10', 0, 0, 0, 0, 0, Date.now() - 600_000, 0, 0, 0, 0, 0]],
  })
  await connectToDevelopmentProxy(page)

  await expect(page.locator('#workersTable')).toContainText('Online')
  await expect(page.locator('#workersTable')).toContainText('Now · share')
  await expect(page.locator('#workerCount')).toHaveText('1 active')
})

test('does not keep an old rig online merely because a new rig shares its IP', async ({ page }) => {
  const now = Date.now()
  await mockProxyApi(page, {
    mode: 'rig_id',
    workers: [
      ['old-rig', '192.168.1.10', 0, 0, 0, 0, 0, now - 600_000, 0, 0, 0, 0, 0],
      ['new-rig', '192.168.1.10', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    ],
  }, {
    format: fixtureMiners.format,
    miners: [[1, '192.168.1.10', 0, 0, 2, 0, 'wallet', 'secret', 'new-rig', 'XMRig/6.26.0']],
  })
  await connectToDevelopmentProxy(page)

  await expect(page.locator('.worker-row', { has: page.locator('[data-worker="old-rig"]') })).toContainText('Offline')
  await expect(page.locator('.worker-row', { has: page.locator('[data-worker="new-rig"]') })).toContainText('Online')
  await expect(page.locator('#workerCount')).toHaveText('1 active')
})

test('keeps a worker recently offline after it disconnects before submitting a share', async ({ page }) => {
  let workers = { mode: 'rig_id', workers: [['new-rig', '192.168.1.10', 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]] }
  let miners = { format: fixtureMiners.format, miners: [[1, '192.168.1.10', 0, 0, 2, 0, 'wallet', 'secret', 'new-rig', 'XMRig/6.26.0']] }
  await mockProxyApi(page, () => workers, () => miners)
  await connectToDevelopmentProxy(page)

  workers = { ...workers, workers: [['new-rig', '192.168.1.10', 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]] }
  miners = { ...miners, miners: [] }
  await page.getByRole('button', { name: 'Refresh now' }).click()

  await expect(page.locator('.worker-row', { has: page.locator('[data-worker="new-rig"]') })).toContainText('Recently offline')
  await expect(page.locator('#workerCount')).toHaveText('0 active')
})

test('retains only the latest 180 chart samples', async ({ page }) => {
  await mockProxyApi(page)
  await connectToDevelopmentProxy(page)
  await page.evaluate(() => localStorage.setItem('xmrig-proxy-monitor.history.v1', JSON.stringify(Array.from({ length: 180 }, (_, index) => ({ timestamp: index, hashrate1m: index, hashrate10m: index })))))

  await page.getByRole('button', { name: 'Refresh now' }).click()
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('xmrig-proxy-monitor.history.v1')).length)).toBe(180)
})

test('continues rendering when chart history cannot be saved', async ({ page }) => {
  await mockProxyApi(page)
  await connectToDevelopmentProxy(page)
  await page.evaluate(() => {
    const setItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'xmrig-proxy-monitor.history.v1') throw new DOMException('Storage full', 'QuotaExceededError')
      return setItem.call(this, key, value)
    }
  })

  await page.getByRole('button', { name: 'Refresh now' }).click()
  await expect(page.locator('#proxyStatus')).toHaveText('System operational')
})

test('forgets saved settings from the connection dialog', async ({ page }) => {
  await mockProxyApi(page)
  await connectToDevelopmentProxy(page)
  await page.getByRole('button', { name: 'Connection settings' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Forget connection' }).click()
  await expect(page.getByRole('dialog', { name: 'Forget this connection?' })).toBeVisible()
  await page.getByRole('button', { name: 'Forget connection', exact: true }).last().click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('xmrig-proxy-monitor.connection.v1'))).toBeNull()
})

test('keeps the dashboard usable at the current viewport', async ({ page }, testInfo) => {
  await mockProxyApi(page)
  await connectToDevelopmentProxy(page)
  await expect(page.locator('.header-bar')).toBeVisible()
  await expect(page.locator('.worker-layout')).toBeVisible()
  await expect(page.locator(testInfo.project.name === 'desktop' ? '.table-wrap' : '.workers-mobile')).toBeVisible()
  if (testInfo.project.name !== 'desktop') {
    await expect(page.locator('.workers-mobile')).toContainText('1m')
    await expect(page.locator('.workers-mobile')).toContainText('Shares A/R/I')
  }

  const dimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
  await page.screenshot({ path: testInfo.outputPath('responsive-dashboard.png'), fullPage: true })
})

// Baseline captured from a real production-shaped Proxy response: one active
// miner and one worker recently offline. Names, addresses, and user are synthetic.
const fixtureSummary = {
  version: '6.26.0', uptime: 90184, hashrate: { total: [0.46, 0.66, 0.22, 0.01, 0, 0.06] },
  miners: { now: 1, max: 1 }, workers: 2,
  upstreams: { active: 1, sleep: 0, error: 0, total: 1, ratio: 1 },
  results: { accepted: 70, rejected: 0, invalid: 0, expired: 0, avg_time: 183, latency: 81, hashes_total: 793893, hashes_donate: 0, best: [560082, 381940, 228388] },
}
const fixtureMiners = {
  format: ['id', 'ip', 'tx', 'rx', 'state', 'diff', 'user', 'password', 'rig_id', 'agent'],
  miners: [[2, '192.168.1.10', 12546, 3496, 2, 13891, 'fixture-user', 'secret', 'rig-alpha', 'XMRig/6.26.0 (Linux x86_64)']],
}
const fixtureWorkers = {
  mode: 'rig_id', hashrate: fixtureSummary.hashrate,
  workers: [
    ['rig-alpha', '192.168.1.10', 1, 10, 0, 0, 136837, Date.now(), 0.46, 0.22, 0.03, 0, 0],
    // Normalized to two minutes so the fixture remains recently offline for a full test run.
    ['rig-beta', '192.168.1.11', 0, 60, 0, 0, 657056, Date.now() - 120_000, 0, 0.43, 0.18, 0.01, 0],
  ],
}

async function mockProxyApi(page, workers = fixtureWorkers, miners = fixtureMiners, summary = fixtureSummary) {
  const fulfill = (body) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(typeof body === 'function' ? body() : body) })
  await page.route('http://127.0.0.1:18080/1/summary', (route) => route.fulfill(fulfill(summary)))
  await page.route('http://127.0.0.1:18080/1/workers', (route) => route.fulfill(fulfill(workers)))
  await page.route('http://127.0.0.1:18080/1/miners', (route) => route.fulfill(fulfill(miners)))
}

async function mockUnauthorizedProxyApi(page) {
  await page.route('http://127.0.0.1:18080/1/**', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: '{}' }))
}

async function mockNetworkFailure(page) {
  await page.route('http://127.0.0.1:18080/1/**', (route) => route.abort('failed'))
}

async function mockForbiddenProxyApi(page) {
  await page.route('http://127.0.0.1:18080/1/**', (route) => route.fulfill({ status: 403, contentType: 'application/json', body: '{}' }))
}

async function mockInvalidJsonProxyApi(page) {
  await page.route('http://127.0.0.1:18080/1/**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: 'not-json' }))
}

async function mockTimeoutProxyApi(page) {
  await page.route('http://127.0.0.1:18080/1/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 8_500))
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
  })
}

test('matches the approved desktop dashboard composition', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Visual baseline is maintained for the desktop composition.')
  await mockProxyApi(page)
  await connectToDevelopmentProxy(page)
  await expect(page.locator('#workersTable')).toContainText('rig-alpha')
  await expect(page.locator('#workersTable tr').first()).toContainText('rig-alpha')
  await expect(page.locator('#workersTable')).toContainText('Recently offline')
  await expect(page).toHaveScreenshot('market-dark-desktop.png', { fullPage: true, animations: 'disabled', mask: [page.locator('#lastUpdate'), page.locator('#refreshProgressBar')] })
  await page.locator('.worker-row', { hasText: 'rig-alpha' }).locator('td').nth(2).click()
  await expect(page.locator('[id^="worker-details-"]').first()).toContainText('XMRig version')
  await expect(page.locator('[id^="worker-details-"]').first()).toContainText('6.26.0')
  await expect(page.locator('[id^="worker-details-"]').first()).not.toContainText('secret')
})
