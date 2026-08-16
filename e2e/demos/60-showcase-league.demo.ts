import { test } from './fixtures';
import { DEMO_USER, DemoApi, ensureAccount, signIn } from './session';
import { adminDeleteLeague, createLeague, joinWithCard, setDisplayName } from './seed';

const ADMIN = { email: 'admin@sub12.local', password: 'password123', displayName: 'Admin' };
const USER_B = { email: 'userb@sub12.local', password: 'password123', displayName: 'E2E User B' };
const DEV = { email: 'dev@sub12.local', password: 'password123', displayName: 'Dev User' };

// Storyboard #6 in docs/demo-recordings.md — a populated league page with
// live standings, filmed as an ordinary member.
test('showcase-league', async ({ page, demo }) => {
  const adminSession = await ensureAccount(ADMIN.email, ADMIN.password, ADMIN.displayName);
  const adminApi = await DemoApi.for(adminSession);
  const demoSession = await ensureAccount(DEMO_USER.email, DEMO_USER.password, DEMO_USER.displayName);
  const demoApi = await DemoApi.for(demoSession);
  const userBSession = await ensureAccount(USER_B.email, USER_B.password, USER_B.displayName);
  const userBApi = await DemoApi.for(userBSession);
  const devSession = await ensureAccount(DEV.email, DEV.password, DEV.displayName);
  const devApi = await DemoApi.for(devSession);

  let leagueId = '';
  try {
    await setDisplayName(userBApi, 'Marcus Webb').catch(() => {});
    await setDisplayName(devApi, 'Priya Sharma').catch(() => {});
    // Verification stays off, so every card lands verified and the table fills.
    const league = await createLeague(adminApi, 'Yorkshire Winter League');
    leagueId = league.id;
    await joinWithCard(demoApi, league, 9.4);
    await joinWithCard(userBApi, league, 9.0);
    await joinWithCard(devApi, league, 8.5);

    await signIn(page, demoSession);
    await page.goto(`/leagues/${leagueId}`);
    await page.getByText('Yorkshire Winter League').first().waitFor();

    await demo.title('Showcase', 'Your league, live standings');
    await demo.caption('Every club deserves a proper league table.', 1800);

    const standings = page.getByText('Standings').first();
    await standings.scrollIntoViewIfNeeded();
    await demo.caption('Standings move the moment a card lands.', 1000);
    await demo.saveMoment();
    await demo.beat(1200);

    await page.getByRole('tab', { name: 'Form' }).click();
    await demo.caption('Form and history for every shooter.', 1600);
    await page.getByRole('tab', { name: 'History' }).click();
    await demo.beat(1200);
    await page.getByRole('tab', { name: 'Table', exact: false }).click();
    await demo.beat(800);

    const scores = page.getByText('Submitted Scores');
    await scores.scrollIntoViewIfNeeded();
    await demo.caption('Every card, every verification, on the record.', 2000);

    await demo.clearCaption();
    await demo.end('Shoot anywhere. Compete together.', 'sub12.io — leagues are free');
  } finally {
    if (leagueId) await adminDeleteLeague(adminApi, leagueId).catch(() => {});
    await demoApi.dispose();
    await userBApi.dispose();
    await devApi.dispose();
    await adminApi.dispose();
  }
});
