import { test } from './fixtures';
import { DEMO_USER, DemoApi, ensureAccount, signIn } from './session';
import { ensureGear } from './seed';

// A cracking session for the showcase — 247/250 with a run of Xs.
const SHOTS = ['10', 'X', '10', 'X', '9', '10', 'X', '10', '10', 'X', '9', '10', 'X', '10', '10', 'X', '10', '9', 'X', '10', '10', 'X', '10', '10', 'X'];

// Storyboard #3 in docs/demo-recordings.md — the how-to flow at showcase
// pace: fewer captions, punchier copy.
test('showcase-score-card', async ({ page, demo }) => {
  const session = await ensureAccount(DEMO_USER.email, DEMO_USER.password, DEMO_USER.displayName);
  const api = await DemoApi.for(session);
  try {
    await ensureGear(api);
  } finally {
    await api.dispose();
  }

  await signIn(page, session);
  await page.context().addInitScript(() => localStorage.setItem('sub12-score-help-seen', '1'));

  await page.goto('/scores/new');
  await page.getByText('Shot grid').waitFor();

  await demo.title('Showcase', 'A 25-shot card, start to finish');
  await demo.caption('Log every shot.', 1400);

  await page.locator('#score-rifle').selectOption({ index: 1 });
  await page.locator('#score-pellet').selectOption({ index: 1 });

  await page.getByRole('button', { name: 'Shot 1: not entered' }).click();
  for (const value of SHOTS) {
    await page.getByRole('button', { name: value, exact: true }).click();
  }
  await demo.caption('25 shots. One card.', 1600);

  const save = page.getByRole('button', { name: 'Save Card' });
  await save.scrollIntoViewIfNeeded();
  await save.click();
  await page.waitForURL(/\/scores\/[0-9a-f-]{36}/);
  await demo.caption('Averages, bulls, splits — done for you.', 800);
  await demo.saveMoment();
  await demo.beat(2600);

  await demo.clearCaption();
  await demo.end('Shoot. Log. Improve.', 'sub12.io — free to use');
});
