import { chromium } from '@playwright/test';

async function loginAs(page, username, password) {
  await page.goto('http://localhost:3000/', { waitUntil: 'networkidle' });
  await page.getByText('Sign in with Keycloak').click();
  await page.waitForLoadState('networkidle');
  await page.locator('#username').fill(username);
  await page.locator('#password').fill(password);
  await page.locator('#kc-login').click();
  await page.waitForLoadState('networkidle');
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
const page = await ctx.newPage();

// Claire = factory-viewer. Attempt operator-only actions using her REAL
// session (server-side check, not a UI-hidden-button check).
await loginAs(page, 'claire', 'Factory-claire-2026');

const results = {};
const reset = await page.request.post('http://localhost:3000/gateway/api/demo/reset');
results.viewer_reset_status = reset.status();
const mode = await page.request.put('http://localhost:3000/gateway/api/demo/mode', { data: { profile: 'good' } });
results.viewer_profile_switch_status = mode.status();
const task = await page.request.post('http://localhost:3000/gateway/api/agents/agent-a/tasks', { data: { goal: 'viewer attempt' } });
results.viewer_task_creation_status = task.status();
const telemetry = await page.request.get('http://localhost:3000/gateway/api/factory-state');
results.viewer_telemetry_status = telemetry.status();

// Logout, then confirm the SAME cookie no longer authorizes anything.
await page.request.post('http://localhost:3000/gateway/api/v1/auth/logout');
const afterLogout = await page.request.get('http://localhost:3000/gateway/api/v1/auth/me');
results.after_logout_me_status = afterLogout.status();
const afterLogoutReset = await page.request.post('http://localhost:3000/gateway/api/demo/reset');
results.after_logout_reset_status = afterLogoutReset.status();

console.log(JSON.stringify(results, null, 2));
await browser.close();
