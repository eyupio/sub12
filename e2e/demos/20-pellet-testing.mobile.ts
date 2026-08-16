import { resolve } from 'node:path';
import { test, OUTPUT_DIR } from './fixtures';
import { DEMO_USER, DemoApi, ensureAccount, signIn } from './session';
import { ensureGear } from './seed';
import { domClick, driveMeasurement, generateTargetImage } from './pelletFlow';

// Portrait phone cut of the pellet-testing showcase — an app-store preview
// clip (see "Portrait variants" in docs/demo-recordings.md).
test('showcase-pellet-testing-mobile', async ({ page, browser, demo }) => {
  const session = await ensureAccount(DEMO_USER.email, DEMO_USER.password, DEMO_USER.displayName);
  const api = await DemoApi.for(session);
  try {
    await ensureGear(api);
  } finally {
    await api.dispose();
  }

  const targetPath = resolve(OUTPUT_DIR, 'target-fixture.jpg');
  await generateTargetImage(browser, targetPath);

  await signIn(page, session);
  await page.goto('/pellet-testing/new');
  await page.getByRole('heading', { name: 'Equipment' }).waitFor();

  await demo.title('Showcase', 'Photograph the target, read the group');
  await page.locator('select').nth(0).selectOption({ index: 1 });
  await page.locator('select').nth(1).selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('heading', { name: 'Setup & conditions' }).waitFor();
  await page.getByPlaceholder('25').fill('25');
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('heading', { name: 'Target photos' }).waitFor();
  await demo.caption('Shoot a group. Photograph the card.', 1000);
  await page.locator('input[type="file"]').first().setInputFiles(targetPath);
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByLabel('Measure this photo').waitFor();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('heading', { name: 'Measure', exact: true }).waitFor();
  await driveMeasurement(page, demo, false);
  await demo.caption('Holes found. Group in mm and MOA.', 1000);
  await demo.saveMoment();
  await demo.beat(1600);
  await domClick(page, 'DONE');
  await page.getByRole('heading', { name: 'Measure', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('heading', { name: 'Groups & review' }).waitFor();
  await page.getByRole('button', { name: 'Save test' }).click();
  await page.waitForURL(/\/pellet-testing\/[0-9a-f-]{36}/);
  await demo.caption('Every test, tracked forever.', 2000);

  await demo.clearCaption();
  await demo.end('Find the tin your rifle loves.', 'sub12.io — pellet testing built in');
});
