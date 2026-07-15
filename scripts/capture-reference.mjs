import { chromium, devices } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const url = process.env.P2POOL_REFERENCE_URL || 'http://100.106.206.58:3380/'
const output = 'test-results/reference'
await mkdir(output, { recursive: true })

const browser = await chromium.launch()
try {
  for (const [name, viewport] of Object.entries({ desktop: devices['Desktop Chrome'], tablet: devices['iPad Pro 11'], mobile: devices['iPhone 13'] })) {
    const context = await browser.newContext({ ...viewport })
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30_000 })
    await page.screenshot({ path: `${output}/p2pool-${name}.png`, fullPage: true })
    await context.close()
  }
} finally {
  await browser.close()
}

console.log(`Reference screenshots written to ${output}`)
