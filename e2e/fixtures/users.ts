import { test as base, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { ApiClient } from '../helpers/api';

const here = dirname(fileURLToPath(import.meta.url));
const userAState = resolve(here, '..', 'auth', 'userA.json');
const userBState = resolve(here, '..', 'auth', 'userB.json');

export interface UserHandle {
  page: Page;
  context: BrowserContext;
  api: ApiClient;
  email: string;
  userId: string;
  displayName: string;
  role: string;
}

interface UsersFixtures {
  pageA: UserHandle;
  pageB: UserHandle;
}

async function buildHandle(
  browser: Browser,
  storageState: string,
  email: string,
  password: string,
): Promise<UserHandle> {
  const context = await browser.newContext({ storageState });
  const page = await context.newPage();
  // Login via API to get a fresh session for the API client (used for setup/cleanup).
  const { client, session } = await ApiClient.login(email, password);
  return {
    page,
    context,
    api: client,
    email,
    userId: session.userId,
    displayName: session.displayName,
    role: session.role,
  };
}

export const test = base.extend<UsersFixtures>({
  pageA: async ({ browser }, use) => {
    const email = required('USER_A_EMAIL');
    const password = required('USER_A_PASSWORD');
    const handle = await buildHandle(browser, userAState, email, password);
    await use(handle);
    await handle.api.dispose();
    await handle.context.close();
  },
  pageB: async ({ browser }, use) => {
    const email = required('USER_B_EMAIL');
    const password = required('USER_B_PASSWORD');
    const handle = await buildHandle(browser, userBState, email, password);
    await use(handle);
    await handle.api.dispose();
    await handle.context.close();
  },
});

export const expect = test.expect;

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`missing required env var ${name}`);
  return v;
}
