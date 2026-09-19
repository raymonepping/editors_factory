import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 2000 } });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
if (page.url().includes('/login')) {
  await page.getByText('Sign in with Keycloak').click();
  await page.waitForLoadState('networkidle');
  await page.locator('#username').fill('raymon');
  await page.locator('#password').fill('Factory-raymon-2026');
  await page.locator('#kc-login').click();
  await page.waitForLoadState('networkidle');
}
await page.waitForTimeout(1500);
await page.screenshot({ path: '/Users/raymon.epping/Documents/VSC/HashiCorp/editors_factory/docs/validation/evidence/01_03/phase5-02-bad-complete.png', fullPage: true });
await browser.close();
