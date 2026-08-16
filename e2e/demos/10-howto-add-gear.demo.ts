import { test } from './fixtures';
import { DEMO_USER, DemoApi, ensureAccount, signIn } from './session';
import { deleteAllGear, deleteAllScoreCards } from './seed';

// Storyboard #1 in docs/demo-recordings.md — a fresh account adds a rifle
// and a pellet from the catalog.
test('howto-add-gear', async ({ page, demo }) => {
  const session = await ensureAccount(DEMO_USER.email, DEMO_USER.password, DEMO_USER.displayName);
  const api = await DemoApi.for(session);
  try {
    await deleteAllScoreCards(api);
    await deleteAllGear(api);
  } finally {
    await api.dispose();
  }

  await signIn(page, session);
  await page.goto('/');
  await page.getByRole('heading', { name: 'Dashboard' }).waitFor();

  await demo.title('How-to', 'Add your rifle and pellets');
  await demo.caption('Everything starts with your gear.');

  await page.getByRole('link', { name: 'Add Rifle' }).click();
  await page.getByRole('button', { name: 'Add Rifle' }).waitFor();
  await demo.caption('This is Gear — your rifles and pellets live here.');

  await page.getByRole('button', { name: 'Add Rifle' }).click();
  await demo.caption('Pick your rifle — the specs fill themselves in.', 1200);
  const rifleSearch = page.getByRole('combobox', { name: 'Search rifles — e.g. HW100, Air Arms...' });
  await rifleSearch.pressSequentially('HW100', { delay: 140 });
  await page.getByRole('listbox').getByRole('option', { name: /HW100/ }).first().click();
  await demo.beat(900);
  await demo.caption('Make, model, calibre and power, all filled in.');

  await page.getByRole('button', { name: 'Add Rifle' }).last().click();
  await page.getByText('No rifles added yet.').waitFor({ state: 'hidden' }).catch(() => {});
  await page.getByText('Weihrauch HW100').first().waitFor();
  await demo.caption('Saved. Now the pellets you shoot with it.');

  await page.getByRole('button', { name: 'pellets' }).click();
  await page.getByRole('button', { name: 'Add Pellet' }).click();
  const pelletSearch = page.getByRole('combobox', { name: 'Search pellets — e.g. JSB Exact, H&N...' });
  await pelletSearch.pressSequentially('JSB', { delay: 130 });
  await page.getByRole('listbox').getByRole('option', { name: /JSB Exact/ }).first().click();
  await demo.beat(800);
  await page.getByRole('button', { name: 'Add Pellet' }).last().click();
  await page.getByText(/JSB/).first().waitFor();

  await demo.caption('Gear done — every card you log now knows what you shot it with.', 800);
  await demo.saveMoment();
  await demo.beat(1800);
  await demo.clearCaption();
  await demo.end('Gear set up in under a minute', 'Gear → Add Rifle · Add Pellet');
});
