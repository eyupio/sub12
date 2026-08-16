import { test } from './fixtures';
import { DEMO_USER, DemoApi, ensureAccount, signIn } from './session';
import { adminDeleteLeague, createLeague, createPersonalCard, deleteAllScoreCards, ensureGear } from './seed';

const ADMIN = { email: 'admin@sub12.local', password: 'password123', displayName: 'Admin' };

// Storyboard #4 in docs/demo-recordings.md — find a league by its join code,
// join it, and send an existing card to the open round.
test('howto-join-league', async ({ page, demo }) => {
  const adminSession = await ensureAccount(ADMIN.email, ADMIN.password, ADMIN.displayName);
  const adminApi = await DemoApi.for(adminSession);
  const session = await ensureAccount(DEMO_USER.email, DEMO_USER.password, DEMO_USER.displayName);
  const api = await DemoApi.for(session);

  let leagueId = '';
  try {
    const league = await createLeague(adminApi, 'Yorkshire Winter League');
    leagueId = league.id;

    await deleteAllScoreCards(api);
    const gear = await ensureGear(api);
    const cardId = await createPersonalCard(api, gear);

    await signIn(page, session);
    await page.goto('/leagues');
    await page.getByRole('heading', { name: 'Leagues' }).waitFor();

    await demo.title('How-to', 'Join a league and submit a card');
    await demo.caption("Leagues rank your cards against your rivals'.");

    await demo.caption('Got a code from your league? Type it here.', 1000);
    const search = page.getByPlaceholder('Search by name or code…');
    await search.pressSequentially(league.joinCode, { delay: 140 });
    await search.press('Enter');
    await page.getByText('Showing match for code').waitFor();
    await demo.beat(900);

    await page.getByRole('link', { name: /Yorkshire Winter League/ }).click();
    await page.getByPlaceholder('Enter invite code').waitFor();
    await demo.caption('Enter the invite code to join.', 1000);
    await page.getByPlaceholder('Enter invite code').pressSequentially(league.joinCode, { delay: 120 });
    await page.getByRole('button', { name: 'Join', exact: true }).click();
    await page.getByText("You've joined this league").waitFor();
    await demo.caption("You're in — here's the table.");
    await demo.beat(800);

    await demo.caption('Now send one of your cards to the open round.', 1400);
    await page.goto(`/scores/${cardId}`);
    const submit = page.getByRole('button', { name: 'Submit to League' });
    await submit.scrollIntoViewIfNeeded();
    await submit.click();
    await page.getByRole('dialog').getByRole('radio', { name: /Yorkshire Winter League/ }).waitFor();
    await demo.beat(900);
    await page.getByRole('dialog').getByRole('button', { name: 'Submit', exact: true }).click();
    await page.getByText('Score card submitted to league').waitFor();
    await demo.caption('Sent to the open round.');

    await page.goto(`/leagues/${leagueId}`);
    await page.getByText('Standings').first().waitFor();
    await demo.caption("Your score is in the standings the moment it's verified.", 800);
    await demo.saveMoment();
    await demo.beat(2000);

    await demo.clearCaption();
    await demo.end('Shoot your card anywhere. Compete everywhere.', 'Leagues → join with a code');
  } finally {
    if (leagueId) await adminDeleteLeague(adminApi, leagueId).catch(() => {});
    await api.dispose();
    await adminApi.dispose();
  }
});
