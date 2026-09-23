// Captures the main screens in demo mode on an iPhone-sized viewport.
// Usage: npm run build && npx vite preview --port 4173, then
//        CHROMIUM_PATH=/path/to/chromium node scripts/screenshots.mjs [light|dark]
import { chromium } from 'playwright';

const scheme = process.argv[2] ?? 'light';
const base = process.env.BASE_URL ?? 'http://localhost:4173';
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const context = await browser.newContext({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  colorScheme: scheme,
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));

const shot = async (name) => {
  await page.waitForTimeout(600);
  await page.screenshot({ path: `screenshots/${scheme}-${name}.png` });
};

await page.goto(base);
await page.waitForSelector('.scoreboard', { timeout: 120000 });
await page.waitForSelector('.section .row .points', { timeout: 60000 });
await shot('1-matchup');

await page.click('text=My Team');
await page.waitForSelector('text=Forwards');
await shot('2-team');
await page.locator('.section').filter({ hasText: 'Forwards' }).locator('.row').nth(1).click();
await page.waitForSelector('.menu');
await shot('2b-menu');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

await page.click('.tab >> text=Players');
await page.waitForSelector('text=Free Agents');
await page.waitForSelector('.section .row .points');
await shot('3-players');
await page.mouse.wheel(0, 900);
await page.waitForTimeout(400);
await shot('3b-players-scrolled');
await page.evaluate(() => window.scrollTo(0, 0));
await page.locator('.section .row').first().click();
await page.waitForSelector('.sheet .stat-grid');
await shot('4-player-sheet');
await page.click('.sheet [aria-label="Close"]');
await page.waitForTimeout(400);

await page.click('.tab >> text=Trades');
await page.waitForSelector('text=Offers for You');
await shot('5-trades');
await page.click('.trade-actions button:text-is("Accept")');
await page.waitForSelector('.alert');
await shot('5b-alert');
await page.click('.alert-actions button:text-is("Cancel")');

await page.click('.tab >> text=League');
await page.waitForSelector('text=Standings');
await shot('6-league');

await page.goto(`${base}/trades/new`);
await page.waitForSelector('text=Trade With');
await page.locator('.row').nth(1).click();
await page.waitForSelector('text=You receive');
await page.locator('.section').nth(0).locator('.row').nth(0).click();
await page.locator('.section').nth(1).locator('.row').last().click();
await shot('7-trade-builder');

console.log(errors.length ? `Errors:\n${errors.join('\n')}` : 'No page errors');
await browser.close();
