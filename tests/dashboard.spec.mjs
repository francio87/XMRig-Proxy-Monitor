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
  await page.getByLabel('Host or IP').fill(proxy.host)
  await page.getByLabel('API port').fill(proxy.port)
  await page.getByLabel('Bearer token (optional)').fill(proxy.token)
  await page.getByRole('button', { name: 'Save and connect' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(page.getByText('Proxy / Stratum')).toBeVisible()
  await expect(page.locator('#endpointChip')).toHaveText('http://127.0.0.1:18080')
}

test('renders XMRig Proxy data after a direct browser connection', async ({ page }, testInfo) => {
  await mockProxyApi(page)
  await connectToDevelopmentProxy(page)
  await expect(page.locator('#statusBadge')).toHaveText('Online')
  await expect(page.locator('#summaryStats .stat')).toHaveCount(4)
  await expect(page.locator('#workersTable tr')).not.toHaveCount(0)
  await page.screenshot({ path: testInfo.outputPath('dashboard.png'), fullPage: true })
})

test('forgets saved settings from the connection dialog', async ({ page }) => {
  await mockProxyApi(page)
  await connectToDevelopmentProxy(page)
  await page.getByRole('button', { name: 'Connection settings' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'Forget connection' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByLabel('Bearer token (optional)')).toHaveValue('')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('xmrig-proxy-monitor.connection.v1'))).toBeNull()
})

test('keeps the dashboard usable at the current viewport', async ({ page }, testInfo) => {
  await mockProxyApi(page)
  await connectToDevelopmentProxy(page)
  await expect(page.locator('.header-bar')).toBeVisible()
  await expect(page.locator('.worker-layout')).toBeVisible()
  await expect(page.locator('.table-wrap').first()).toBeVisible()

  const dimensions = await page.evaluate(() => ({ clientWidth: document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth }))
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth)
  await page.screenshot({ path: testInfo.outputPath('responsive-dashboard.png'), fullPage: true })
})

const fixtureSummary = {
  version: '6.26.0', uptime: 90184, hashrate: { total: [1152, 1096, 1040, 1001, 976] },
  miners: { now: 2, max: 2 }, workers: 2,
  upstreams: { active: 1, sleep: 0, error: 0, total: 1, ratio: 1 },
  results: { accepted: 184, rejected: 2, invalid: 0, expired: 0, avg_time: 29, latency: 107, hashes_total: 5261900 },
}
const fixtureMiners = {
  format: ['id', 'ip', 'tx', 'rx', 'state', 'diff', 'user', 'password', 'rig_id', 'agent'],
  miners: [[1, '192.168.1.10', 12000, 6400, 2, 15000, 'wallet', 'secret', 'rig-alpha', 'XMRig/6.26.0']],
}
const fixtureWorkers = {
  mode: 'rig_id', hashrate: fixtureSummary.hashrate,
  workers: [
    ['rig-alpha', '192.168.1.10', 1, 104, 1, 0, 3012000, Date.now(), 614, 580, 542, 0, 0],
    ['rig-beta', '192.168.1.11', 0, 80, 1, 0, 2249900, Date.now() - 600_000, 538, 516, 498, 0, 0],
  ],
}

async function mockProxyApi(page) {
  const fulfill = (body) => ({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) })
  await page.route('http://127.0.0.1:18080/1/summary', (route) => route.fulfill(fulfill(fixtureSummary)))
  await page.route('http://127.0.0.1:18080/1/workers', (route) => route.fulfill(fulfill(fixtureWorkers)))
  await page.route('http://127.0.0.1:18080/1/miners', (route) => route.fulfill(fulfill(fixtureMiners)))
}

test('matches the approved desktop dashboard composition', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'Visual baseline is maintained for the desktop composition.')
  await mockProxyApi(page)
  await connectToDevelopmentProxy(page)
  await expect(page.locator('#workersTable')).toContainText('rig-alpha')
  await expect(page.locator('#workersTable tr').first()).toContainText('rig-alpha')
  await expect(page.locator('#workersTable')).toContainText('Offline')
  await expect(page).toHaveScreenshot('market-dark-desktop.png', { fullPage: true, animations: 'disabled', mask: [page.locator('#lastUpdate'), page.locator('#refreshProgressBar')] })
  await page.getByRole('button', { name: 'rig-alpha' }).click()
  await expect(page.getByRole('dialog')).toContainText('XMRig/6.26.0')
  await expect(page.getByRole('dialog')).not.toContainText('secret')
})
