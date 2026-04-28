import { expect, type Page } from '@playwright/test';

export class ScoreEntryPage {
  constructor(private readonly page: Page) {}

  async expectLoaded(): Promise<void> {
    await expect(this.page.getByText(/Shot grid/i)).toBeVisible();
  }

  // Pick the per-user gear we created in the gear fixture. The selects are
  // native <select> elements next to "Rifle" / "Pellet" labels.
  async selectGearByName(opts: { rifleName: string; pelletName: string }): Promise<void> {
    const rifleSelect = this.page.locator('label', { hasText: /^Rifle$/ }).locator('..').locator('select');
    const pelletSelect = this.page.locator('label', { hasText: /^Pellet$/ }).locator('..').locator('select');
    await rifleSelect.selectOption({ label: new RegExp(opts.rifleName).source });
    await pelletSelect.selectOption({ label: new RegExp(opts.pelletName).source });
  }

  // Fill all 25 shot cells with the same score. The cell buttons have aria-labels
  // "Shot 1: not entered", and the value pad inside the panel has buttons labeled
  // "0".."10" and "X".
  async enterUniformShots(value: number | 'X'): Promise<void> {
    // Shot-grid buttons have aria-label "Shot N: ...". The value pad buttons
    // (rendered after a cell is selected) have no aria-label, so their
    // accessible name is just their visible text — getByRole disambiguates.
    const valueName = new RegExp(`^${String(value)}$`);
    for (let i = 0; i < 25; i++) {
      await this.page.getByRole('button', { name: new RegExp(`^Shot ${i + 1}:`) }).click();
      await this.page.getByRole('button', { name: valueName }).click();
    }
  }

  async submit(): Promise<void> {
    await this.page.getByRole('button', { name: /^Submit Score$/i }).click();
    await this.page.waitForURL(/\/(scores|leagues)\//);
  }

  async expectSubmissionError(message: RegExp): Promise<void> {
    await expect(this.page.getByText(message)).toBeVisible();
  }
}
