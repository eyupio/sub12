import { LeagueDetailPage } from './LeagueDetailPage';
import type { Page } from '@playwright/test';

// "Join" is rendered on the league detail page when the viewer is not yet a
// member (see frontend/src/pages/LeagueDetail.tsx). There's no separate /join
// route, so this POM wraps detail and exposes only the join-related actions.
export class LeagueJoinPage {
  private readonly detail: LeagueDetailPage;

  constructor(private readonly page: Page) {
    this.detail = new LeagueDetailPage(page);
  }

  async goto(leagueId: string): Promise<void> {
    await this.page.goto(`/leagues/${leagueId}`);
  }

  async joinWithCode(code: string): Promise<void> {
    await this.detail.joinByCode(code);
  }

  async expectError(message: RegExp): Promise<void> {
    await this.detail.expectJoinError(message);
  }

  async expectMember(): Promise<void> {
    await this.detail.expectMember();
  }
}
