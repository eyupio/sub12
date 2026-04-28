import { expect, type Page } from '@playwright/test';

export type JoinPolicy = 'open' | 'invite_code' | 'approval';
export type ScoringRule = 'highest' | 'average';

export class LeagueCreatePage {
  constructor(private readonly page: Page) {}

  async open(): Promise<void> {
    await this.page.goto('/leagues');
    await expect(this.page.getByRole('heading', { name: /^Leagues$/i })).toBeVisible();
  }

  async openCreateModal(): Promise<void> {
    // The "+ New" button on the leagues page header.
    await this.page.getByRole('button', { name: /^New$/i }).first().click();
    await expect(this.page.getByRole('dialog', { name: /New League/i })).toBeVisible();
  }

  async createLeague(opts: {
    name: string;
    description?: string;
    joinPolicy?: JoinPolicy;
    scoringRule?: ScoringRule;
    visibility?: 'public' | 'private';
  }): Promise<string> {
    const dialog = this.page.getByRole('dialog', { name: /New League/i });
    await dialog.locator('input[type="text"]').first().fill(opts.name);
    if (opts.description) {
      await dialog.locator('textarea').first().fill(opts.description);
    }
    if (opts.visibility) {
      // Toggle buttons literally render the value as label text ("public" / "private").
      await dialog.getByRole('button', { name: new RegExp(`^${opts.visibility}$`, 'i') }).click();
    }
    if (opts.scoringRule) {
      const label = opts.scoringRule === 'highest' ? 'Best Score' : 'Average';
      await dialog.getByRole('button', { name: new RegExp(`^${label}$`, 'i') }).click();
    }
    if (opts.joinPolicy) {
      const map = { open: 'Open', invite_code: 'Invite Code', approval: 'Approval' } as const;
      await dialog.getByRole('button', { name: new RegExp(`^${map[opts.joinPolicy]}\\b`, 'i') }).click();
    }

    await dialog.getByRole('button', { name: /^Create League$/i }).click();
    await expect(dialog).toBeHidden();

    // The toast/redirect doesn't auto-navigate; find the new card and click into it.
    const card = this.page.getByRole('link', { name: new RegExp(opts.name, 'i') });
    await expect(card).toBeVisible();
    await card.click();

    await this.page.waitForURL(/\/leagues\/[^/?]+/);
    const url = new URL(this.page.url());
    const id = url.pathname.split('/').filter(Boolean).pop();
    if (!id) throw new Error(`could not parse league id from ${this.page.url()}`);
    return id;
  }
}
