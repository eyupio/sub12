import { test as leagueTest } from './leagueFactory';
import { uniqueName } from '../helpers/factories';

export interface GearHandles {
  rifleId: string;
  pelletId: string;
  rifleName: string;
  pelletName: string;
}

interface GearFixtures {
  gearA: GearHandles;
  gearB: GearHandles;
}

// Score submission requires a rifle and pellet. We pre-create them per worker
// and clean up afterwards so the ScoreEntryPage POM only has to pick by name.
export const test = leagueTest.extend<GearFixtures>({
  gearA: async ({ pageA }, use) => {
    const rifleName = uniqueName('e2e-rifle-A');
    const pelletName = uniqueName('e2e-pellet-A');
    const rifle = await pageA.api.createRifle({ make: 'E2E', model: rifleName, calibre: '.177' });
    const pellet = await pageA.api.createPellet({ brand: 'E2E', model: pelletName });
    await use({ rifleId: rifle.id, pelletId: pellet.id, rifleName, pelletName });
    try { await pageA.api.deleteRifle(rifle.id); } catch { /* ignore */ }
    try { await pageA.api.deletePellet(pellet.id); } catch { /* ignore */ }
  },
  gearB: async ({ pageB }, use) => {
    const rifleName = uniqueName('e2e-rifle-B');
    const pelletName = uniqueName('e2e-pellet-B');
    const rifle = await pageB.api.createRifle({ make: 'E2E', model: rifleName, calibre: '.177' });
    const pellet = await pageB.api.createPellet({ brand: 'E2E', model: pelletName });
    await use({ rifleId: rifle.id, pelletId: pellet.id, rifleName, pelletName });
    try { await pageB.api.deleteRifle(rifle.id); } catch { /* ignore */ }
    try { await pageB.api.deletePellet(pellet.id); } catch { /* ignore */ }
  },
});

export const expect = test.expect;
