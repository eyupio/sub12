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

/**
 * Back-date a believable practice history so the trends charts have a story:
 * roughly three cards a week, averages climbing from ~215 toward ~240, the
 * occasional bad day, Xs becoming more frequent as the "shooter" improves.
 * Deterministic (seeded by index) so re-recordings draw the same charts.
 */
export async function seedHistory(api: DemoApi, gear: Gear, weeks = 9): Promise<number> {
  let created = 0;
  for (let w = 0; w < weeks; w++) {
    const cardsThisWeek = w % 3 === 0 ? 2 : 3;
    for (let c = 0; c < cardsThisWeek; c++) {
      const daysAgo = (weeks - w) * 7 - c * 2 - 1;
      const date = new Date(Date.now() - daysAgo * 86_400_000).toISOString().slice(0, 10);
      // Skill climbs with w; a dip every 4th week keeps it human.
      const skill = 8.55 + w * 0.11 - (w % 4 === 3 ? 0.25 : 0);
      const shotScores: number[] = [];
      const shotXs: boolean[] = [];
      for (let s = 0; s < 25; s++) {
        const wobble = Math.sin((w * 25 + c * 7 + s) * 2.7) * 1.1;
        const score = Math.max(6, Math.min(10, Math.round(skill + wobble)));
        shotScores.push(score);
        shotXs.push(score === 10 && (s * 31 + w * 7 + c) % 5 < 1 + Math.floor(w / 3));
      }
      await api.post('/score-cards', {
        rifle_id: gear.rifleId,
        pellet_id: gear.pelletId,
        shot_at: date,
        shot_scores: shotScores,
        shot_xs: shotXs,
        distance_m: 25,
        visibility: 'public',
      });
      created++;
    }
  }
  return created;
}

export interface DemoLeague {
  id: string;
  joinCode: string;
  roundId: string;
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
  const round = await adminApi.post<{ round_id: string }>(`/leagues/${league.id}/ensure-round`, {});
  return { id: league.id, joinCode, roundId: round.round_id };
}

/**
 * Join a member into the league and put one finished card of theirs into the
 * open round, so standings and score lists have real rows on film. Members
 * with verification off are auto-verified on submission.
 */
export async function joinWithCard(
  api: DemoApi,
  league: DemoLeague,
  quality: number,
): Promise<void> {
  await api.post(`/leagues/${league.id}/join`, { join_code: league.joinCode });
  const shotScores: number[] = [];
  const shotXs: boolean[] = [];
  for (let s = 0; s < 25; s++) {
    const wobble = Math.sin((quality * 13 + s) * 2.3) * 1.0;
    const score = Math.max(6, Math.min(10, Math.round(quality + wobble)));
    shotScores.push(score);
    shotXs.push(score === 10 && (s * 17 + quality * 3) % 4 === 0);
  }
  const card = await api.post<{ id: string }>('/score-cards', {
    shot_at: new Date().toISOString().slice(0, 10),
    shot_scores: shotScores,
    shot_xs: shotXs,
    distance_m: 25,
    visibility: 'public',
  });
  await api.post(`/score-cards/${card.id}/submit-to-league`, { league_round_id: league.roundId });
}

export async function adminDeleteLeague(adminApi: DemoApi, id: string): Promise<void> {
  await adminApi.delete(`/admin/leagues/${id}`);
}

/** Standings read better with real-looking names than seed-account labels. */
export async function setDisplayName(api: DemoApi, displayName: string): Promise<void> {
  await api.patch('/users/me', { display_name: displayName });
}

/** Switch league score verification on/off (and how many confirmations). */
export async function setLeagueVerification(
  adminApi: DemoApi,
  leagueId: string,
  on: boolean,
  confirmations = 1,
): Promise<void> {
  await adminApi.patch(`/leagues/${leagueId}/config`, {
    require_score_verification: on,
    required_confirmations: confirmations,
  });
}
