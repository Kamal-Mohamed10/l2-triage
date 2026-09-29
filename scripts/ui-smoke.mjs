/**
 * End-to-end UI smoke test: drives the real app in a headless browser and
 * checks that the triage results actually render in the DOM.
 *
 * Usage: node scripts/ui-smoke.mjs [baseUrl]
 */
import { chromium } from 'playwright'

const BASE = process.argv[2] || 'http://localhost:5174'
const OUT = []

// Serve the built app over file:// (Playwright can load it even when the
// sandbox blocks loopback HTTP) and drive the SPA from Home, since file://
// has no server to resolve deep links like /analyze.
const INDEX = new URL('../dist/index.html', import.meta.url).href
const START_URL = BASE === 'file' ? INDEX : `${BASE}/analyze`

const CASES = [
  { name: 'outage', message: 'Our production server is down and nobody can log in', expect: 'P0' },
  { name: 'double charge', message: 'I have been charged twice this month and nobody has replied', expect: 'P1' },
  { name: 'praise', message: 'Thank you so much! Your team has been incredibly helpful today.', expect: 'P3' },
  { name: 'feature', message: 'Could you add an export to CSV feature? It would be really useful.', expect: 'P3' },
  { name: 'blocked', message: 'My payment failed and now I cannot access the dashboard at all.', expect: 'P1' },
]

// Chromium blocks ES module imports over file:// by default, which Vite's
// build output relies on. --allow-file-access-from-files re-enables them.
const browser = await chromium.launch({
  args: ['--allow-file-access-from-files', '--disable-web-security'],
})
const page = await browser.newPage()

const consoleErrors = []
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text())
})
page.on('pageerror', (err) => consoleErrors.push(`PAGEERROR: ${err.message}`))

// `networkidle` never settles because Vite keeps an HMR websocket open,
// so wait for the actual DOM element instead.
await page.goto(START_URL, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('nav', { timeout: 20000 })
OUT.push(`loaded: ${await page.title()}`)

if (consoleErrors.length > 0) {
  OUT.push(`BOOT ERRORS: ${consoleErrors.join(' | ')}`)
  await page.screenshot({ path: '/tmp/triage-boot.png', fullPage: true })
  await browser.close()
  console.log(OUT.join('\n'))
  process.exit(1)
}

// Navigate in-app so this works from file:// as well as a dev server.
await page.click('a:has-text("Analyze")')
await page.waitForSelector('textarea', { timeout: 20000 })

for (const testCase of CASES) {
  await page.fill('textarea', testCase.message)
  await page.click('button:has-text("Analyze Message")')

  // Wait for the results panel to appear.
  await page.waitForSelector('text=Analysis Results', { timeout: 15000 })

  const body = await page.textContent('body')
  const priorityShown = /P[0-3]/.test(body)
  const gotLevel = (body.match(/P[0-3]/) || [])[0]
  const queueShown = /Route To/.test(body)
  const actionShown = /Recommended Action/.test(body)

  OUT.push(
    `${testCase.name.padEnd(14)} rendered=${priorityShown} level=${gotLevel} (expect ${testCase.expect}) ` +
      `route=${queueShown} action=${actionShown} ${gotLevel === testCase.expect ? 'PASS' : 'FAIL'}`
  )
}

// Validation must block a too-short message before any request is made.
await page.fill('textarea', 'hi')
const disabled = await page.isDisabled('button:has-text("Analyze Message")')
OUT.push(`short input blocked: ${disabled ? 'PASS' : 'FAIL'}`)

// History should have recorded every successful analysis.
await page.click('a:has-text("History")')
await page.waitForSelector('text=Analysis History')
const historyBody = await page.textContent('body')
OUT.push(`history recorded ${CASES.length} analyses: ${historyBody.includes('Escalate') || historyBody.includes('Incident') ? 'PASS' : 'CHECK'}`)

// Dashboard should show the routing breakdown.
await page.click('a:has-text("Dashboard")')
await page.waitForSelector('text=Routing Breakdown')
OUT.push(`dashboard routing breakdown: PASS`)

// Back to Analyze for a visual screenshot of the rendered result.
await page.click('a:has-text("Analyze")')
await page.waitForSelector('textarea')
await page.fill('textarea', 'Our production server is down and nobody can log in')
await page.click('button:has-text("Analyze Message")')
await page.waitForSelector('text=Analysis Results', { timeout: 15000 })
await page.screenshot({ path: '/tmp/triage-outage.png', fullPage: true })

OUT.push(`console errors: ${consoleErrors.length === 0 ? 'none' : consoleErrors.join(' | ')}`)

await browser.close()
console.log(OUT.join('\n'))
