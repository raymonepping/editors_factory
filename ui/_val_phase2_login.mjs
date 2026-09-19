import { chromium } from '@playwright/test';

async function loginAndCheck(username, password) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.getByText('Sign in with Keycloak').click();
  await page.waitForLoadState('networkidle');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForLoadState('networkidle');
  const landedUrl = page.url();

  const meResp = await page.request.get('http://localhost:3000/gateway/api/v1/auth/me');
  const me = await meResp.json();

  const cookies = await ctx.cookies();
  const sessionCookie = cookies.find(c => c.name === 'factory_session');

  await browser.close();
  return { username, landedUrl, me, hasSessionCookie: !!sessionCookie, cookieValue: sessionCookie?.value };
}

const results = {};
results.raymon = await loginAndCheck('raymon', 'Factory-raymon-2026');
results.barend = await loginAndCheck('barend', 'Factory-barend-2026');
results.claire = await loginAndCheck('claire', 'Factory-claire-2026');

console.log(JSON.stringify(results, (k, v) => k === 'cookieValue' ? '[REDACTED]' : v, 2));
