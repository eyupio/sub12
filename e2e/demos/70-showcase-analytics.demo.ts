import { test } from './fixtures';
import { DEMO_USER, DemoApi, ensureAccount, signIn } from './session';
import { deleteAllScoreCards, ensureGear, seedHistory } from './seed';

// Storyboard #9 in docs/demo-recordings.md — trends and gear analytics drawn
// from nine weeks of back-dated history.
test('showcase-analytics', async ({ page, demo }) => {
  const session = await ensureAccount(DEMO_USER.email, DEMO_USER.password, DEMO_USER.displayName);
  const api = await DemoApi.for(session);
  let rifleId = '';
  try {
    await deleteAllScoreCards(api);
    const gear = await ensureGear(api);
    rifleId = gear.rifleId;
    await seedHistory(api, gear, 9);
  } finally {
    await api.dispose();
  }

  await signIn(page, session);
  await page.goto('/');
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor();

  await demo.title('Showcase', "Know exactly what's working");
  await demo.caption('Every card you log feeds your numbers.', 2000);

  await page.goto('/scores/trends');
  await page.getByRole('heading', { name: 'Score Trends' }).waitFor();
  await page.getByText('Average Score').first().waitFor();
  await demo.caption('Watch the average climb, week by week.', 1200);
  await demo.saveMoment();
  await demo.beat(1600);

  await page.getByRole('button', { name: 'Monthly' }).click();
  await demo.caption('Zoom out to months when the season is long.', 2000);
  await page.getByRole('button', { name: 'Weekly' }).click();
  await demo.beat(800);

  await page.goto(`/gear/rifles/${rifleId}`);
  await page.getByText('Rifle Showcase').waitFor();
  await page.getByText('Score over time').first().waitFor();
  await demo.caption("Your rifle's whole story on one page.", 1800);

  await page.getByText('Score distribution').first().scrollIntoViewIfNeeded();
  await demo.caption('Distributions, trends, best groups — per rifle, per pellet.', 2400);

  await demo.clearCaption();
  await demo.end('Shoot. Log. Know.', 'sub12.io — free analytics for every shooter');
});
