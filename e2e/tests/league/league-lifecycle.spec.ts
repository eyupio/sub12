import { test, expect } from '../../fixtures/gear';
import { LeagueCreatePage, LeagueDetailPage, ScoreEntryPage } from '../../pages/league';
import { uniqueLeagueName } from '../../helpers/factories';

// Parametrised so adding more rounds (or asserting different orderings) is one
// edit. For now: a single round, two shooters, User A wins.
const SCORES: Array<{ user: 'A' | 'B'; uniformShot: number }> = [
  { user: 'A', uniformShot: 10 }, // 25 × 10 = 250 (winner)
  { user: 'B', uniformShot: 9 }, //  25 × 9  = 225
];

test.describe('league lifecycle', () => {
  test('User A creates → User B joins by code → both submit → standings reflect winner', async ({
    pageA,
    pageB,
    gearA,
    gearB,
  }) => {
    // 1. User A creates a league.
    const create = new LeagueCreatePage(pageA.page);
    await create.open();
    await create.openCreateModal();
    const name = uniqueLeagueName();
    const leagueId = await create.createLeague({
      name,
      joinPolicy: 'invite_code',
      visibility: 'public',
      scoringRule: 'highest',
    });

    // Cleanup is registered immediately so an early failure still tears down.
    test.info().annotations.push({ type: 'league_id', description: leagueId });

    try {
      // 2. User A reads the invite code from the detail page.
      const detailA = new LeagueDetailPage(pageA.page);
      await detailA.goto(leagueId);
      const inviteCode = await detailA.getInviteCode();
      expect(inviteCode).toMatch(/^[A-Z0-9]{4,}$/);

      // 3. User B joins using the invite code.
      const detailB = new LeagueDetailPage(pageB.page);
      await detailB.goto(leagueId);
      await detailB.joinByCode(inviteCode);
      await detailB.expectMember();

      // 4. Both users submit a score for the default round.
      for (const s of SCORES) {
        const handle = s.user === 'A' ? pageA : pageB;
        const gear = s.user === 'A' ? gearA : gearB;
        const detail = new LeagueDetailPage(handle.page);
        await detail.goto(leagueId);
        await detail.clickSubmitScore();

        const entry = new ScoreEntryPage(handle.page);
        await entry.expectLoaded();
        await entry.selectGearByName({ rifleName: gear.rifleName, pelletName: gear.pelletName });
        await entry.enterUniformShots(s.uniformShot);
        await entry.submit();
      }

      // 5. Assert the standings show the correct winner + ordering.
      await detailA.goto(leagueId);
      const standings = await detailA.getStandings();
      expect(standings.length).toBeGreaterThanOrEqual(2);
      expect(standings[0]?.name).toBe(pageA.displayName);
      const userBRank = standings.find((r) => r.name === pageB.displayName)?.rank;
      expect(userBRank).toBeGreaterThan(1);
    } finally {
      // 6. Cleanup. Admin delete via API regardless of test outcome.
      await pageA.api.adminDeleteLeague(leagueId);
    }
  });
});
