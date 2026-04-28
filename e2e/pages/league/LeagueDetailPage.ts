import { expect, type Page } from '@playwright/test';

export interface StandingRow {
  rank: number;
  name: string;
}

export class LeagueDetailPage {
  constructor(private readonly page: Page) {}

  async goto(leagueId: string): Promise<void> {
    await this.page.goto(`/leagues/${leagueId}`);
    // The detail header is the league name; we don't know it here, so just wait
    // for the standings section to render.
    await expect(this.page.getByText(/Standings/i).first()).toBeVisible();
  }

  async getInviteCode(): Promise<string> {
    // Member-only: rendered as a button with text "Code: XXXXXXXX".
    const codeButton = this.page.getByRole('button', { name: /^Code:\s/i });
    await expect(codeButton).toBeVisible();
    const text = (await codeButton.textContent()) ?? '';
    const match = /Code:\s*([A-Z0-9]+)/i.exec(text);
    if (!match) throw new Error(`could not parse invite code from "${text}"`);
    return match[1]!;
  }

  async joinByCode(code: string): Promise<void> {
    const input = this.page.getByPlaceholder('Enter invite code');
    await expect(input).toBeVisible();
    await input.fill(code);
    await this.page.getByRole('button', { name: /^Join$/i }).click();
  }

  async expectJoinError(message: RegExp): Promise<void> {
    await expect(this.page.getByText(message)).toBeVisible();
  }

  async expectMember(): Promise<void> {
    // Once joined, the "Submit Score" CTA becomes visible.
    await expect(this.page.getByRole('link', { name: /Submit Score/i })).toBeVisible();
  }

  async clickSubmitScore(): Promise<void> {
    await this.page.getByRole('link', { name: /Submit Score/i }).click();
    await this.page.waitForURL(/\/scores\/new/);
  }

  async getStandings(): Promise<StandingRow[]> {
    // The standings table renders rows containing rank + display name. We grab
    // the standings section and read one row per shooter.
    const section = this.page.getByText(/Standings/i).first().locator('xpath=ancestor::*[contains(@class, "lc-section") or self::section][1]');
    const rows = section.locator('[role="row"], tr, li').filter({ hasNot: this.page.locator('thead, [role="columnheader"]') });
    const out: StandingRow[] = [];
    const count = await rows.count();
    for (let i = 0; i < count; i++) {
      const text = (await rows.nth(i).textContent())?.trim() ?? '';
      // Standings rows look like "1 Display Name 3 cards 250 ...". Skip empty/header rows.
      const m = /^(\d+)\s+(.+?)(?:\s+\d|$)/.exec(text);
      if (m) out.push({ rank: Number(m[1]), name: m[2]!.trim() });
    }
    return out;
  }
}
