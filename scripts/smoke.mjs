// Browser smoke test against the production build.
// Usage:  npm run build && npm run preview &   then:  npm run smoke
// Requires Google Chrome installed (playwright-core drives it, no browser download).
// Optional: SHOTS=/some/dir to save screenshots of each step.
import { chromium } from 'playwright-core'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.env.BASE_URL || 'http://localhost:4173'
const SHOTS = process.env.SHOTS || mkdtempSync(join(tmpdir(), 'maplenest-smoke-'))
const errors = []

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } })
const page = await ctx.newPage()
page.on('console', m => { if (m.type() === 'error') errors.push(`[console] ${m.text().slice(0, 200)}`) })
page.on('pageerror', e => errors.push(`[pageerror] ${String(e).slice(0, 200)}`))

const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: false })
const log = (...a) => console.log(...a)

// 1. Homepage
await page.goto(BASE, { waitUntil: 'networkidle' })
log('home title:', await page.title())
log('home hero:', await page.locator('h1').first().innerText().then(t => t.replace(/\n/g, ' ')))
await shot('01-home')

// 2. Listings + live data
await page.goto(`${BASE}/listings`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1500)
const cards = await page.locator('a[href^="/listings/"]').count()
log('listing cards:', cards)
await shot('02-listings')

// 3. Search filter
await page.fill('input[placeholder*="Search"]', 'charlottetown')
await page.click('button[type="submit"]')
await page.waitForTimeout(1200)
log('after search url:', page.url())
await shot('03-search')

// 4. Listing detail
await page.goto(`${BASE}/listings`, { waitUntil: 'networkidle' })
await page.waitForTimeout(1000)
const first = page.locator('a[href^="/listings/"]').first()
const href = await first.getAttribute('href')
await first.click()
await page.waitForTimeout(1500)
log('detail url:', page.url(), '(from', href, ')')
log('detail h1:', await page.locator('h1').first().innerText().catch(() => 'N/A'))
await shot('04-detail')

// 5. 404 page
await page.goto(`${BASE}/this/does/not/exist`, { waitUntil: 'networkidle' })
log('404 text present:', await page.locator('text=Page not found').count() > 0)
await shot('05-404')

// 6. Auth pages
await page.goto(`${BASE}/signup`, { waitUntil: 'networkidle' })
log('signup renders:', await page.locator('text=Join MapleNest').count() > 0)
await shot('06-signup')
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' })
log('login renders:', await page.locator('text=Welcome back').count() > 0)

// 7. Protected route redirect
await page.goto(`${BASE}/messages`, { waitUntil: 'networkidle' })
await page.waitForTimeout(800)
log('protected /messages redirected to:', page.url())

// 8. Mobile viewport
const mob = await browser.newContext({ viewport: { width: 375, height: 720 } })
const mp = await mob.newPage()
mp.on('pageerror', e => errors.push(`[mobile pageerror] ${String(e).slice(0, 200)}`))
await mp.goto(`${BASE}/listings`, { waitUntil: 'networkidle' })
await mp.waitForTimeout(1200)
const hscroll = await mp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)
log('mobile horizontal scroll:', hscroll)
await mp.screenshot({ path: `${SHOTS}/07-mobile-listings.png` })
// hamburger menu
await mp.goto(BASE, { waitUntil: 'networkidle' })
await mp.click('button[aria-label="Toggle menu"]')
await mp.waitForTimeout(300)
log('mobile menu shows Browse:', await mp.locator('text=Browse Listings').count() > 0)
await mp.screenshot({ path: `${SHOTS}/08-mobile-menu.png` })

log('\nscreenshots:', SHOTS)
log('CONSOLE/PAGE ERRORS:', errors.length ? errors.join('\n') : 'none')
await browser.close()
if (errors.length) process.exit(1)
