import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1900 } });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
if (page.url().includes('/login')) {
  await page.getByText('Sign in with Keycloak').click();
  await page.waitForLoadState('networkidle');
  await page.locator('#username').fill('raymon');
  await page.locator('#password').fill('Factory-raymon-2026');
  await page.locator('#kc-login').click();
  await page.waitForLoadState('networkidle');
}
await page.getByRole('button', { name: 'Run' }).click();
console.log('clicked Run (retry) —', new Date().toISOString());
await browser.close();
