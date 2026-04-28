import { test as usersTest } from './users';
import type { CreatedLeague } from '../helpers/api';
import { uniqueLeagueName } from '../helpers/factories';

export interface LeagueFactory {
  create: (overrides?: {
    name?: string;
    join_policy?: 'open' | 'invite_code' | 'approval';
    type?: 'public' | 'private';
    scoring_rule?: 'highest' | 'average';
  }) => Promise<CreatedLeague>;
}

interface LeagueFactoryFixtures {
  leagueFactory: LeagueFactory;
}

// Owner of every league created by this factory is User A. Cleanup uses User A's
// admin role to delete via /admin/leagues/{id} regardless of which user joined.
export const test = usersTest.extend<LeagueFactoryFixtures>({
  leagueFactory: async ({ pageA }, use) => {
    const created: CreatedLeague[] = [];
    const factory: LeagueFactory = {
      create: async (overrides = {}) => {
        const league = await pageA.api.createLeague({
          name: overrides.name ?? uniqueLeagueName(),
          type: overrides.type ?? 'public',
          scoring_rule: overrides.scoring_rule ?? 'highest',
          join_policy: overrides.join_policy ?? 'invite_code',
        });
        // Re-fetch to get the join_code which the create response may not include.
        if (!league.joinCode) {
          const full = await pageA.api.getLeague(league.id);
          league.joinCode = full.join_code;
        }
        created.push(league);
        return league;
      },
    };
    await use(factory);
    // Teardown — admin-delete every league we created, even if the test failed.
    for (const l of created) {
      try {
        await pageA.api.adminDeleteLeague(l.id);
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn(`[leagueFactory] cleanup failed for ${l.id}: ${(err as Error).message}`);
      }
    }
  },
});

export const expect = test.expect;
