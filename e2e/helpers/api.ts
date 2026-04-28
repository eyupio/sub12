import { request, type APIRequestContext } from '@playwright/test';

export interface AuthSession {
  userId: string;
  email: string;
  displayName: string;
  role: string;
  accessToken: string;
  refreshCookie: string;
}

export interface CreatedLeague {
  id: string;
  name: string;
  joinCode?: string;
}

const API_URL = process.env.API_URL ?? 'http://localhost:8080/api/v1';

export class ApiClient {
  private constructor(
    private readonly ctx: APIRequestContext,
    public readonly accessToken: string,
  ) {}

  async rawDelete(path: string): Promise<{ status: number; body: string }> {
    const res = await this.ctx.delete(`${API_URL}${path}`, { headers: this.headers() });
    return { status: res.status(), body: await res.text() };
  }

  static async login(email: string, password: string): Promise<{ client: ApiClient; session: AuthSession }> {
    const ctx = await request.newContext();
    const res = await ctx.post(`${API_URL}/auth/login`, {
      data: { email, password },
    });
    if (!res.ok()) {
      throw new Error(`login failed (${res.status()}): ${await res.text()}`);
    }
    const body = (await res.json()) as {
      user?: { id: string; email: string; display_name: string; role?: string };
      tokens?: { access_token: string };
      requires_2fa?: boolean;
    };
    if (body.requires_2fa) {
      throw new Error(`E2E test user ${email} has 2FA enabled — disable it for test accounts`);
    }
    if (!body.user || !body.tokens) {
      throw new Error('login response missing user or tokens');
    }

    const setCookie = res.headersArray().filter((h) => h.name.toLowerCase() === 'set-cookie');
    const refreshCookie = setCookie.map((h) => h.value).find((v) => v.startsWith('sub12_refresh=')) ?? '';

    const client = new ApiClient(ctx, body.tokens.access_token);
    return {
      client,
      session: {
        userId: body.user.id,
        email: body.user.email,
        displayName: body.user.display_name,
        role: body.user.role ?? 'user',
        accessToken: body.tokens.access_token,
        refreshCookie,
      },
    };
  }

  async dispose(): Promise<void> {
    await this.ctx.dispose();
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  async createLeague(payload: {
    name: string;
    description?: string;
    type?: 'public' | 'private';
    scoring_rule?: 'highest' | 'average';
    join_policy?: 'open' | 'invite_code' | 'approval';
  }): Promise<CreatedLeague> {
    const res = await this.ctx.post(`${API_URL}/leagues`, {
      headers: this.headers(),
      data: payload,
    });
    if (!res.ok()) throw new Error(`createLeague failed (${res.status()}): ${await res.text()}`);
    const body = (await res.json()) as { id: string; name: string; join_code?: string };
    return { id: body.id, name: body.name, joinCode: body.join_code };
  }

  async getLeague(id: string): Promise<{ id: string; join_code?: string }> {
    const res = await this.ctx.get(`${API_URL}/leagues/${id}`, { headers: this.headers() });
    if (!res.ok()) throw new Error(`getLeague failed (${res.status()}): ${await res.text()}`);
    return (await res.json()) as { id: string; join_code?: string };
  }

  async ensureDefaultRound(leagueId: string): Promise<string> {
    const res = await this.ctx.post(`${API_URL}/leagues/${leagueId}/ensure-round`, {
      headers: this.headers(),
      data: {},
    });
    if (!res.ok()) throw new Error(`ensureDefaultRound failed (${res.status()}): ${await res.text()}`);
    const body = (await res.json()) as { round_id: string };
    return body.round_id;
  }

  async adminDeleteLeague(id: string): Promise<void> {
    const res = await this.ctx.delete(`${API_URL}/admin/leagues/${id}`, { headers: this.headers() });
    if (!res.ok() && res.status() !== 404) {
      throw new Error(`adminDeleteLeague failed (${res.status()}): ${await res.text()}`);
    }
  }

  async tryJoinLeague(id: string, joinCode?: string): Promise<{ status: number; body: string }> {
    const res = await this.ctx.post(`${API_URL}/leagues/${id}/join`, {
      headers: this.headers(),
      data: { join_code: joinCode },
    });
    return { status: res.status(), body: await res.text() };
  }

  async createRifle(payload: { make: string; model: string; calibre?: string }): Promise<{ id: string }> {
    const res = await this.ctx.post(`${API_URL}/rifles`, { headers: this.headers(), data: payload });
    if (!res.ok()) throw new Error(`createRifle failed (${res.status()}): ${await res.text()}`);
    return (await res.json()) as { id: string };
  }

  async deleteRifle(id: string): Promise<void> {
    const res = await this.ctx.delete(`${API_URL}/rifles/${id}`, { headers: this.headers() });
    if (!res.ok() && res.status() !== 404) {
      throw new Error(`deleteRifle failed (${res.status()}): ${await res.text()}`);
    }
  }

  async createPellet(payload: { brand: string; model: string }): Promise<{ id: string }> {
    const res = await this.ctx.post(`${API_URL}/pellets`, { headers: this.headers(), data: payload });
    if (!res.ok()) throw new Error(`createPellet failed (${res.status()}): ${await res.text()}`);
    return (await res.json()) as { id: string };
  }

  async deletePellet(id: string): Promise<void> {
    const res = await this.ctx.delete(`${API_URL}/pellets/${id}`, { headers: this.headers() });
    if (!res.ok() && res.status() !== 404) {
      throw new Error(`deletePellet failed (${res.status()}): ${await res.text()}`);
    }
  }
}
