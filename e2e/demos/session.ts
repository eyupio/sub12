import { request, type Page } from '@playwright/test';

const API_URL = process.env.API_URL ?? 'http://localhost:8080/api/v1';

/** The account the recordings are filmed as — a realistic name, no e2e noise. */
export const DEMO_USER = {
  email: 'demo@sub12.local',
  password: 'password123',
  displayName: 'Alex Whittaker',
};

interface LoginResult {
  user: { id: string; email: string; display_name: string; role?: string };
  accessToken: string;
  refreshCookie: string;
}

async function login(email: string, password: string): Promise<LoginResult | null> {
  const ctx = await request.newContext();
  try {
    const res = await ctx.post(`${API_URL}/auth/login`, { data: { email, password } });
    if (!res.ok()) return null;
    const body = (await res.json()) as {
      user?: LoginResult['user'];
      tokens?: { access_token: string };
    };
    if (!body.user || !body.tokens) return null;
    const refreshCookieRaw = res
      .headersArray()
      .filter((h) => h.name.toLowerCase() === 'set-cookie')
      .map((h) => h.value)
      .find((v) => v.startsWith('sub12_refresh='));
    if (!refreshCookieRaw) return null;
    return {
      user: body.user,
      accessToken: body.tokens.access_token,
      refreshCookie: refreshCookieRaw.split(';')[0]!.split('=').slice(1).join('='),
    };
  } finally {
    await ctx.dispose();
  }
}

/** Login, registering the account first if it doesn't exist yet. */
export async function ensureAccount(
  email: string,
  password: string,
  displayName: string,
): Promise<LoginResult> {
  const existing = await login(email, password);
  if (existing) return existing;

  const ctx = await request.newContext();
  try {
    const res = await ctx.post(`${API_URL}/auth/register`, {
      data: { email, password, display_name: displayName },
    });
    if (!res.ok() && res.status() !== 409) {
      throw new Error(`register ${email} failed (${res.status()}): ${await res.text()}`);
    }
  } finally {
    await ctx.dispose();
  }

  const created = await login(email, password);
  if (!created) throw new Error(`could not log in as ${email} after registering`);
  return created;
}

/**
 * Make the recorded page start signed in, the same way the e2e global-setup
 * does: refresh cookie on the API path + the persisted Zustand auth state
 * planted before any page script runs. No login form ever appears on film.
 */
export async function signIn(page: Page, session: LoginResult): Promise<void> {
  const apiUrl = new URL(API_URL);
  await page.context().addCookies([
    {
      name: 'sub12_refresh',
      value: session.refreshCookie,
      domain: apiUrl.hostname,
      path: '/api/v1/auth',
      httpOnly: true,
      secure: apiUrl.protocol === 'https:',
      sameSite: 'Lax',
    },
  ]);
  await page.context().addInitScript((user) => {
    localStorage.setItem(
      'sub12-auth',
      JSON.stringify({ state: { user, accessToken: null, refreshToken: null }, version: 0 }),
    );
  }, session.user);
}

/** Minimal authed API access for seeding/cleaning demo data. */
export class DemoApi {
  private constructor(
    private readonly ctx: Awaited<ReturnType<typeof request.newContext>>,
    private readonly token: string,
    public readonly userId: string,
  ) {}

  static async for(session: LoginResult): Promise<DemoApi> {
    return new DemoApi(await request.newContext(), session.accessToken, session.user.id);
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }

  private headers(): Record<string, string> {
    return { Authorization: `Bearer ${this.token}`, 'Content-Type': 'application/json' };
  }

  async get<T>(path: string): Promise<T> {
    const res = await this.ctx.get(`${API_URL}${path}`, { headers: this.headers() });
    if (!res.ok()) throw new Error(`GET ${path} failed (${res.status()}): ${await res.text()}`);
    return (await res.json()) as T;
  }

  async post<T>(path: string, data: unknown): Promise<T> {
    const res = await this.ctx.post(`${API_URL}${path}`, { headers: this.headers(), data });
    if (!res.ok()) throw new Error(`POST ${path} failed (${res.status()}): ${await res.text()}`);
    return (await res.json().catch(() => ({}))) as T;
  }

  async delete(path: string): Promise<void> {
    const res = await this.ctx.delete(`${API_URL}${path}`, { headers: this.headers() });
    if (!res.ok() && res.status() !== 404) {
      throw new Error(`DELETE ${path} failed (${res.status()}): ${await res.text()}`);
    }
  }
}
