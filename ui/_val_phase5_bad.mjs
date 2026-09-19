import { chromium } from '@playwright/test';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1900 } });
await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
await page.getByText('Sign in with Keycloak').click();
await page.waitForLoadState('networkidle');
await page.locator('#username').fill('raymon');
await page.locator('#password').fill('Factory-raymon-2026');
await page.locator('#kc-login').click();
await page.waitForLoadState('networkidle');
console.log('logged in:', page.url());

// Ensure BAD profile is selected (per the UI's own profile switch control)
const badButton = page.getByText('BAD', { exact: true });
if (await badButton.count() > 0) await badButton.click();
await page.waitForTimeout(500);

await page.screenshot({ path: '/Users/raymon.epping/Documents/VSC/HashiCorp/editors_factory/docs/validation/evidence/01_03/phase5-00-before-run.png', fullPage: true });

await page.getByRole('button', { name: 'Run' }).click();
console.log('clicked Run —', new Date().toISOString());
await page.screenshot({ path: '/Users/raymon.epping/Documents/VSC/HashiCorp/editors_factory/docs/validation/evidence/01_03/phase5-01-just-triggered.png', fullPage: true });
await browser.close();
