import { chromium, request, type FullConfig } from '@playwright/test';
import { config as loadEnv } from 'dotenv';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { writeFileSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(here, '..', '.env') });

interface UserCreds {
  email: string;
  password: string;
  storagePath: string;
  label: 'A' | 'B';
}

async function loginAndSaveState(creds: UserCreds, baseUrl: string, apiUrl: string): Promise<void> {
  // Hit the API directly to get the user record + httpOnly refresh cookie.
  // We bypass the UI login form on purpose: it's tested separately and is a
  // brittle dependency for every other spec.
  const apiCtx = await request.newContext();
  const res = await apiCtx.post(`${apiUrl}/auth/login`, {
    data: { email: creds.email, password: creds.password },
  });
  if (!res.ok()) {
    throw new Error(
      `[global-setup] login for User ${creds.label} (${creds.email}) failed (${res.status()}): ${await res.text()}`,
    );
  }
  const body = (await res.json()) as {
    user?: { id: string; email: string; display_name: string; role?: string };
    requires_2fa?: boolean;
  };
  if (body.requires_2fa) {
    throw new Error(`[global-setup] User ${creds.label} has 2FA enabled — disable it on the test account`);
  }
  if (!body.user) {
    throw new Error(`[global-setup] login response missing user for User ${creds.label}`);
  }

  // Extract the httpOnly refresh cookie set by the backend.
  const setCookieHeaders = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
  const refreshCookieRaw = setCookieHeaders
    .map((h) => h.value)
    .find((v) => v.startsWith('sub12_refresh='));
  if (!refreshCookieRaw) {
    throw new Error(`[global-setup] backend did not set sub12_refresh cookie for User ${creds.label}`);
  }
  const cookieValue = refreshCookieRaw.split(';')[0]!.split('=').slice(1).join('=');

  const baseUrlObj = new URL(baseUrl);
  const apiUrlObj = new URL(apiUrl);

  // Open a real browser context so localStorage gets written for the right origin.
  const browser = await chromium.launch();
  const context = await browser.newContext();

  // Add the refresh cookie. Path must match backend's cookie path
  // (which is /api/v1/auth — see auth handler). Domain matches API host.
  await context.addCookies([
    {
      name: 'sub12_refresh',
      value: cookieValue,
      domain: apiUrlObj.hostname,
      path: '/api/v1/auth',
      httpOnly: true,
      secure: apiUrlObj.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);

  // Seed localStorage with the persisted user. The Zustand persist key is
  // `sub12-auth` and the shape is `{ state: { user }, version: 0 }`.
  const page = await context.newPage();
  await page.goto(baseUrl);
  await page.evaluate((user) => {
    localStorage.setItem(
      'sub12-auth',
      JSON.stringify({
        state: { user, accessToken: null, refreshToken: null },
        version: 0,
      }),
    );
  }, body.user);

  await context.storageState({ path: creds.storagePath });
  await page.close();
  await context.close();
  await browser.close();
  await apiCtx.dispose();

  // eslint-disable-next-line no-console
  console.info(`[global-setup] saved storage state for User ${creds.label} → ${creds.storagePath}`);
}

export default async function globalSetup(_config: FullConfig): Promise<void> {
  const baseUrl = process.env.BASE_URL ?? 'http://localhost:5173';
  const apiUrl = process.env.API_URL ?? 'http://localhost:8080/api/v1';

  const userA: UserCreds = {
    email: required('USER_A_EMAIL'),
    password: required('USER_A_PASSWORD'),
    storagePath: resolve(here, 'userA.json'),
    label: 'A',
  };
  const userB: UserCreds = {
    email: required('USER_B_EMAIL'),
    password: required('USER_B_PASSWORD'),
    storagePath: resolve(here, 'userB.json'),
    label: 'B',
  };

  // Touch the file to a known empty-state if login fails before we get there,
  // so subsequent spec runs surface a clearer error rather than EONENT.
  for (const u of [userA, userB]) {
    try {
      await loginAndSaveState(u, baseUrl, apiUrl);
    } catch (err) {
      writeFileSync(u.storagePath, '{}');
      throw err;
    }
  }
}

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`[global-setup] missing required env var ${name} (see .env.example)`);
  return v;
}
