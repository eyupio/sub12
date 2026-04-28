import { test, expect } from '../../fixtures/gear';
import { LeagueDetailPage, ScoreEntryPage } from '../../pages/league';

test.describe('league edge cases', () => {
  test('joining with an invalid invite code shows an error', async ({ pageB, leagueFactory }) => {
    const league = await leagueFactory.create({ join_policy: 'invite_code' });
    const detail = new LeagueDetailPage(pageB.page);
    await detail.goto(league.id);
    await detail.joinByCode('NOTREAL1');
    await detail.expectJoinError(/invalid|missing|invite/i);
  });

  test('duplicate score submission for the same round is rejected', async ({
    pageB,
    gearB,
    leagueFactory,
  }) => {
    // Open league so User B can join without a code; less ceremony per case.
    const league = await leagueFactory.create({ join_policy: 'open' });
    const detail = new LeagueDetailPage(pageB.page);
    await detail.goto(league.id);
    await pageB.api.tryJoinLeague(league.id);

    await detail.goto(league.id);
    await detail.clickSubmitScore();
    let entry = new ScoreEntryPage(pageB.page);
    await entry.expectLoaded();
    await entry.selectGearByName({ rifleName: gearB.rifleName, pelletName: gearB.pelletName });
    await entry.enterUniformShots(8);
    await entry.submit();

    // Second submission for the same default round should fail.
    await detail.goto(league.id);
    await detail.clickSubmitScore();
    entry = new ScoreEntryPage(pageB.page);
    await entry.expectLoaded();
    await entry.selectGearByName({ rifleName: gearB.rifleName, pelletName: gearB.pelletName });
    await entry.enterUniformShots(7);
    await entry.submit().catch(() => undefined); // submit may not navigate on error
    await entry.expectSubmissionError(/limit|already|duplicate/i);
  });

  // The "End league" UI does not exist yet (see SELECTORS_TODO.md). Once it does,
  // unfixme this test: a non-owner clicking End should be blocked client-side
  // and 403 server-side.
  test.fixme('non-owner cannot end the league', async ({ pageB, leagueFactory }) => {
    const league = await leagueFactory.create();
    const detail = new LeagueDetailPage(pageB.page);
    await detail.goto(league.id);
    // TODO: assert no "End League" / "Finalise" button visible to non-owner.
    expect(league.id).toBeTruthy();
  });

  test('non-owner cannot delete the league (admin route is gated)', async ({ pageB, leagueFactory }) => {
    const league = await leagueFactory.create();
    // User B is a regular user; the only delete path is /admin/leagues/{id}
    // which RequireAdmin middleware gates. Expect 401/403.
    const res = await pageB.api.rawDelete(`/admin/leagues/${league.id}`);
    expect([401, 403]).toContain(res.status);
  });
});
