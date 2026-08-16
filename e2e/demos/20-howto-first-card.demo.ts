import { test } from './fixtures';
import { DEMO_USER, DemoApi, ensureAccount, signIn } from './session';
import { ensureGear } from './seed';

// A believable first card: strong but human — 10s, a few Xs, the odd 8.
const SHOTS = ['9', '10', '8', '10', 'X', '9', '10', '9', '10', '8', '9', 'X', '10', '9', '8', '10', '9', '10', 'X', '9', '8', '10', '9', '10', '9'];

// Storyboard #2 in docs/demo-recordings.md — logging a 25-shot card by
// tapping the grid.
test('howto-first-card', async ({ page, demo }) => {
  const session = await ensureAccount(DEMO_USER.email, DEMO_USER.password, DEMO_USER.displayName);
  const api = await DemoApi.for(session);
  try {
    await ensureGear(api);
  } finally {
    await api.dispose();
  }

  await signIn(page, session);
  // The first-run "How to enter scores" modal blocks the page; the captions
  // narrate the same instructions, so skip it on film.
  await page.context().addInitScript(() => localStorage.setItem('sub12-score-help-seen', '1'));

  await page.goto('/');
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor();

  await demo.title('How-to', 'Log your first score card');
  await demo.caption('Time to log your first card.');

  await page.getByRole('link', { name: 'Log Score' }).click();
  await page.getByText('Shot grid').waitFor();
  await demo.caption("25 shots, a rifle, a pellet — that's a card.");

  await demo.caption("Tell it what you're shooting today.", 1000);
  await page.locator('#score-rifle').selectOption({ index: 1 });
  await demo.beat(600);
  await page.locator('#score-pellet').selectOption({ index: 1 });
  await demo.beat(800);

  await page.getByRole('button', { name: 'Shot 1: not entered' }).click();
  await demo.caption('Tap each shot as you go — the cursor moves on for you.', 800);
  for (const value of SHOTS) {
    await page.getByRole('button', { name: value, exact: true }).click();
  }
  await demo.caption('The card keeps count for you.', 800);
  await demo.saveMoment();
  await demo.beat(1400);

  const save = page.getByRole('button', { name: 'Save Card' });
  await save.scrollIntoViewIfNeeded();
  await demo.beat(600);
  await save.click();
  await page.waitForURL(/\/scores\/[0-9a-f-]{36}/);
  await demo.caption('Saved. Stats, averages and trends update instantly.', 2800);

  await demo.clearCaption();
  await demo.end('Your scores, remembered forever', 'Dashboard → Log Score');
});
