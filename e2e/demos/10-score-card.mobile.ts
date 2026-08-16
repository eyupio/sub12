import { test } from './fixtures';
import { DEMO_USER, DemoApi, ensureAccount, signIn } from './session';
import { ensureGear } from './seed';

const SHOTS = ['10', 'X', '10', 'X', '9', '10', 'X', '10', '10', 'X', '9', '10', 'X', '10', '10', 'X', '10', '9', 'X', '10', '10', 'X', '10', '10', 'X'];

// Portrait phone cut of the score-card showcase — an app-store preview clip
// (see "Portrait variants" in docs/demo-recordings.md). Same flow as
// 30-showcase-score-card, framed for a thumb.
test('showcase-score-card-mobile', async ({ page, demo }) => {
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

  await demo.title('Showcase', 'Log every shot, one tap at a time');
  await demo.caption('Built for the firing line.', 1400);

  await page.locator('#score-rifle').selectOption({ index: 1 });
  await page.locator('#score-pellet').selectOption({ index: 1 });

  const firstCell = page.getByRole('button', { name: 'Shot 1: not entered' });
  await firstCell.scrollIntoViewIfNeeded();
  await firstCell.click();
  for (const value of SHOTS) {
    await page.getByRole('button', { name: value, exact: true }).click();
  }
  await demo.caption('25 shots. One thumb.', 1400);
  await demo.saveMoment();

  const save = page.getByRole('button', { name: 'Save Card' });
  await save.scrollIntoViewIfNeeded();
  await save.click();
  await page.waitForURL(/\/scores\/[0-9a-f-]{36}/);
  await demo.caption('Saved — stats and averages done for you.', 2400);

  await demo.clearCaption();
  await demo.end('Shoot. Log. Improve.', 'sub12.io — free to use');
});
