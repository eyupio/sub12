import { test } from './fixtures';
import { DEMO_USER, DemoApi, ensureAccount, signIn } from './session';
import {
  adminDeleteLeague,
  createLeague,
  joinWithCard,
  setDisplayName,
  setLeagueVerification,
} from './seed';

const ADMIN = { email: 'admin@sub12.local', password: 'password123', displayName: 'Admin' };
const USER_B = { email: 'userb@sub12.local', password: 'password123', displayName: 'E2E User B' };

// Storyboard #5 in docs/demo-recordings.md — the organiser's weekly loop:
// seasons and rounds in settings, then reviewing pending cards. Filmed as
// the league owner.
test('howto-run-league', async ({ page, demo }) => {
  const adminSession = await ensureAccount(ADMIN.email, ADMIN.password, ADMIN.displayName);
  const adminApi = await DemoApi.for(adminSession);
  const demoSession = await ensureAccount(DEMO_USER.email, DEMO_USER.password, DEMO_USER.displayName);
  const demoApi = await DemoApi.for(demoSession);
  const userBSession = await ensureAccount(USER_B.email, USER_B.password, USER_B.displayName);
  const userBApi = await DemoApi.for(userBSession);

  let leagueId = '';
  try {
    await setDisplayName(userBApi, 'Marcus Webb').catch(() => {});
    const league = await createLeague(adminApi, 'Ridgeway Air Rifle League');
    leagueId = league.id;
    // Verification on BEFORE members submit, so their cards arrive pending.
    await setLeagueVerification(adminApi, leagueId, true, 1);
    await joinWithCard(demoApi, league, 9.3);
    await joinWithCard(userBApi, league, 8.8);

    await signIn(page, adminSession);
    await page.goto(`/leagues/${leagueId}`);
    await page.getByText('Ridgeway Air Rifle League').first().waitFor();

    await demo.title('How-to', 'Run a league: seasons, rounds, verification');
    await demo.caption("Your league's engine room is behind the settings gear.");
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.getByRole('heading', { name: 'Settings' }).waitFor();

    await demo.caption('Each season holds its rounds — add the winter one.', 1200);
    const seasonsHeading = page.getByRole('heading', { name: 'Seasons & Rounds' });
    await seasonsHeading.scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: '+ Add season' }).click();
    await page.getByPlaceholder('Season name (e.g. Winter 2026)').pressSequentially('Winter 2026', { delay: 90 });
    await page.locator('#season-starts-on').fill(new Date().toISOString().slice(0, 10));
    await demo.beat(500);
    await page.getByRole('button', { name: 'Add Season', exact: true }).click();
    await page.getByText('Winter 2026').first().waitFor();
    await demo.caption('Now give it a round for this week.', 1000);

    await page.getByRole('button', { name: '+ Add round' }).click();
    await page.getByPlaceholder('Round name').pressSequentially('Round 1', { delay: 90 });
    await demo.beat(500);
    await page.getByRole('button', { name: 'Add Round', exact: true }).click();
    await page.getByText('Round 1').first().waitFor();
    await demo.caption('Rounds can open and close on a schedule — or stay open.', 2200);

    await page.goto(`/leagues/${leagueId}`);
    await page.getByText('Submitted Scores').waitFor();
    await demo.caption('Two cards are waiting for review.');
    const reviewBanner = page.getByRole('button', { name: /pending review — review now/ });
    await reviewBanner.scrollIntoViewIfNeeded();
    await reviewBanner.click();
    await demo.beat(900);

    // Open the first pending card.
    await page.getByRole('tab', { name: /Pending/ }).click();
    await page.locator('#league-submitted-scores').getByRole('link').first().click();
    await page.getByText('Verification Audit Trail').waitFor();
    await demo.caption('Happy with the card? Confirm it and it counts.', 1400);
    const confirm = page.getByRole('button', { name: 'Confirm Score' });
    await confirm.scrollIntoViewIfNeeded();
    await confirm.click();
    await page.getByText('Verified').first().waitFor();
    await demo.caption('Verified — straight into the standings.');

    await page.goto(`/leagues/${leagueId}`);
    await page.getByText('Standings').first().waitFor();
    await demo.caption('The table only ever shows scores you have signed off.', 800);
    await demo.saveMoment();
    await demo.beat(1800);

    await demo.clearCaption();
    await demo.end('Open a round. Review the cards. Done.', 'League → Settings → Seasons & Rounds');
  } finally {
    if (leagueId) await adminDeleteLeague(adminApi, leagueId).catch(() => {});
    await demoApi.dispose();
    await userBApi.dispose();
    await adminApi.dispose();
  }
});
