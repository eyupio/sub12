import { resolve } from 'node:path';
import { test, OUTPUT_DIR } from './fixtures';
import { DEMO_USER, DemoApi, ensureAccount, signIn } from './session';
import { ensureGear } from './seed';
import { deleteAllPelletTests, domClick, driveMeasurement, generateTargetImage } from './pelletFlow';

// Storyboard #7 in docs/demo-recordings.md — the pellet test wizard end to
// end: equipment, conditions, photograph, auto-detected measurement, save.
test('howto-pellet-test', async ({ page, browser, demo }) => {
  const session = await ensureAccount(DEMO_USER.email, DEMO_USER.password, DEMO_USER.displayName);
  const api = await DemoApi.for(session);
  try {
    await ensureGear(api);
    await deleteAllPelletTests(api);
  } finally {
    await api.dispose();
  }

  const targetPath = resolve(OUTPUT_DIR, 'target-fixture.jpg');
  await generateTargetImage(browser, targetPath);

  await signIn(page, session);
  await page.goto('/pellet-testing/new');
  await page.getByRole('heading', { name: 'Equipment' }).waitFor();

  await demo.title('How-to', 'Test pellets: photograph and measure a group');
  await demo.caption('Which tin does your rifle actually like? Test it.');

  await page.locator('select').nth(0).selectOption({ index: 1 });
  await demo.beat(500);
  await page.locator('select').nth(1).selectOption({ index: 1 });
  await demo.caption('The rifle and pellet on trial today.', 1400);
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('heading', { name: 'Setup & conditions' }).waitFor();
  await page.getByPlaceholder('25').fill('25');
  await demo.caption('Distance matters — it turns millimetres into MOA.', 1800);
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('heading', { name: 'Target photos' }).waitFor();
  await demo.caption('Now photograph the card you just shot.', 1200);
  await page.locator('input[type="file"]').first().setInputFiles(targetPath);
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.getByLabel('Measure this photo').waitFor();
  await demo.caption('One photo per group.', 1200);
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('heading', { name: 'Measure', exact: true }).waitFor();
  const { detectedLine } = await driveMeasurement(page, demo, true);
  await demo.caption(`${detectedLine} — group size in mm and MOA, no ruler needed.`, 1200);
  await demo.saveMoment();
  await demo.beat(1600);
  await domClick(page, 'DONE');
  await page.getByRole('heading', { name: 'Measure', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Continue' }).click();

  await page.getByRole('heading', { name: 'Groups & review' }).waitFor();
  await page.getByText('From photo').waitFor();
  await demo.caption('The measured group is already logged.', 1600);
  await page.getByRole('button', { name: 'Save test' }).click();
  await page.waitForURL(/\/pellet-testing\/[0-9a-f-]{36}/);
  await demo.caption('Saved — every test builds the picture of what shoots best.', 2400);

  await demo.clearCaption();
  await demo.end('Photograph the target. Read the group.', 'Pellet testing → New test');
});
