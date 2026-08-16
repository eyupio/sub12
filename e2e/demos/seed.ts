import type { DemoApi } from './session';

/**
 * API-side seeding so each recording starts from the exact state its
 * storyboard assumes (docs/demo-recordings.md), no matter what earlier runs
 * left behind. List responses are parsed tolerantly (bare array or
 * `{ items }`) so these helpers don't break when pagination shapes change.
 */

function items<T>(res: unknown): T[] {
  if (Array.isArray(res)) return res as T[];
  if (res && typeof res === 'object') {
    const inner = (res as { items?: unknown }).items;
    if (Array.isArray(inner)) return inner as T[];
  }
  return [];
}

export async function deleteAllGear(api: DemoApi): Promise<void> {
  for (const r of items<{ id: string }>(await api.get('/rifles'))) {
    await api.delete(`/rifles/${r.id}`);
  }
  for (const p of items<{ id: string }>(await api.get('/pellets'))) {
    await api.delete(`/pellets/${p.id}`);
  }
}

export async function deleteAllScoreCards(api: DemoApi): Promise<void> {
  for (const c of items<{ id: string }>(await api.get('/score-cards'))) {
    await api.delete(`/score-cards/${c.id}`);
  }
}

export interface Gear {
  rifleId: string;
  pelletId: string;
}

/** The demo account's signature setup: a Weihrauch HW100 shooting JSB Exact. */
export async function ensureGear(api: DemoApi): Promise<Gear> {
  const rifles = items<{ id: string }>(await api.get('/rifles'));
  const pellets = items<{ id: string }>(await api.get('/pellets'));
  const rifleId =
    rifles[0]?.id ??
    (
      await api.post<{ id: string }>('/rifles', {
        make: 'Weihrauch',
        model: 'HW100',
        calibre: '.177',
        power_ftlb: 11.5,
      })
    ).id;
  const pelletId =
    pellets[0]?.id ??
    (
      await api.post<{ id: string }>('/pellets', {
        brand: 'JSB',
        model: 'Exact',
        head_size_mm: 4.52,
        weight_grains: 8.44,
      })
    ).id;
  return { rifleId, pelletId };
}

/** A finished personal card — a believable 25-shot round, not a wall of Xs. */
export async function createPersonalCard(api: DemoApi, gear: Gear): Promise<string> {
  const shotScores = [9, 10, 8, 10, 10, 9, 10, 9, 10, 8, 9, 10, 10, 9, 8, 10, 9, 10, 10, 9, 8, 10, 9, 10, 9];
  const shotXs = shotScores.map((s, i) => s === 10 && i % 2 === 0);
  const card = await api.post<{ id: string }>('/score-cards', {
    rifle_id: gear.rifleId,
    pellet_id: gear.pelletId,
    shot_at: new Date().toISOString().slice(0, 10),
    shot_scores: shotScores,
    shot_xs: shotXs,
    distance_m: 25,
    visibility: 'public',
    notes: 'Calm morning, light crosswind.',
  });
  return card.id;
}

export interface DemoLeague {
  id: string;
  joinCode: string;
}

/** A league owned by the admin account, joinable by invite code. */
export async function createLeague(adminApi: DemoApi, name: string): Promise<DemoLeague> {
  const league = await adminApi.post<{ id: string; join_code?: string }>('/leagues', {
    name,
    description: 'Weekly 25-shot cards, best score counts.',
    type: 'public',
    scoring_rule: 'highest',
    join_policy: 'invite_code',
  });
  let joinCode = league.join_code;
  if (!joinCode) {
    joinCode = (await adminApi.get<{ join_code?: string }>(`/leagues/${league.id}`)).join_code;
  }
  if (!joinCode) throw new Error(`league ${league.id} has no join code`);
  await adminApi.post(`/leagues/${league.id}/ensure-round`, {});
  return { id: league.id, joinCode };
}

export async function adminDeleteLeague(adminApi: DemoApi, id: string): Promise<void> {
  await adminApi.delete(`/admin/leagues/${id}`);
}
