export interface PelletCatalogEntry {
  brand: string
  model: string
  head_size_mm?: number
  weight_grains?: number
  // Optional path under /catalog/pellets/ in frontend/public.
  // When omitted the UI falls back to a brand mark (see brandImages.ts).
  image_url?: string
}

export const PELLET_CATALOG: PelletCatalogEntry[] = [
  // ─── .177 calibre ──────────────────────────────────────────────────────────

  // JSB — .177
  { brand: 'JSB', model: 'Exact', head_size_mm: 4.50, weight_grains: 8.44, image_url: '/catalog/pellets/jsb-exact.jpg' },
  { brand: 'JSB', model: 'Exact', head_size_mm: 4.51, weight_grains: 8.44, image_url: '/catalog/pellets/jsb-exact.jpg' },
  { brand: 'JSB', model: 'Exact', head_size_mm: 4.52, weight_grains: 8.44, image_url: '/catalog/pellets/jsb-exact.jpg' },
  { brand: 'JSB', model: 'Exact', head_size_mm: 4.53, weight_grains: 8.44, image_url: '/catalog/pellets/jsb-exact.jpg' },
  { brand: 'JSB', model: 'Exact RS', head_size_mm: 4.51, weight_grains: 7.33 },
  { brand: 'JSB', model: 'Exact RS', head_size_mm: 4.52, weight_grains: 7.33 },
  { brand: 'JSB', model: 'Exact Heavy', head_size_mm: 4.52, weight_grains: 10.34 },
  { brand: 'JSB', model: 'Exact Heavy MkII', head_size_mm: 4.52, weight_grains: 10.34 },
  { brand: 'JSB', model: 'Exact Monster', head_size_mm: 4.52, weight_grains: 13.43 },
  { brand: 'JSB', model: 'Exact Beast', head_size_mm: 4.52, weight_grains: 16.20 },
  { brand: 'JSB', model: 'Hades', head_size_mm: 4.52, weight_grains: 10.34 },
  { brand: 'JSB', model: 'Match Diabolo', head_size_mm: 4.50, weight_grains: 8.02 },
  { brand: 'JSB', model: 'Match Diabolo S100', head_size_mm: 4.50, weight_grains: 8.02 },
  { brand: 'JSB', model: 'Match Diabolo S100', head_size_mm: 4.51, weight_grains: 8.02 },
  { brand: 'JSB', model: 'Straton', head_size_mm: 4.50, weight_grains: 8.26 },
  { brand: 'JSB', model: 'Predator', head_size_mm: 4.52, weight_grains: 8.02 },

  // H&N — .177
  { brand: 'H&N', model: 'Finale Match Light', head_size_mm: 4.49, weight_grains: 7.87 },
  { brand: 'H&N', model: 'Finale Match Light', head_size_mm: 4.50, weight_grains: 7.87 },
  { brand: 'H&N', model: 'Finale Match Heavy', head_size_mm: 4.49, weight_grains: 8.18 },
  { brand: 'H&N', model: 'Finale Match Heavy', head_size_mm: 4.50, weight_grains: 8.18 },
  { brand: 'H&N', model: 'Finale Match', head_size_mm: 4.50, weight_grains: 8.18 },
  { brand: 'H&N', model: 'Finale Match', head_size_mm: 4.51, weight_grains: 8.18 },
  { brand: 'H&N', model: 'Finale Match', head_size_mm: 4.52, weight_grains: 8.18 },
  { brand: 'H&N', model: 'Field Target Trophy', head_size_mm: 4.50, weight_grains: 8.64 },
  { brand: 'H&N', model: 'Field Target Trophy', head_size_mm: 4.51, weight_grains: 8.64 },
  { brand: 'H&N', model: 'Field Target Trophy', head_size_mm: 4.52, weight_grains: 8.64 },
  { brand: 'H&N', model: 'Field Target Trophy Green', head_size_mm: 4.50, weight_grains: 5.56 },
  { brand: 'H&N', model: 'Baracuda Match', head_size_mm: 4.50, weight_grains: 10.65 },
  { brand: 'H&N', model: 'Baracuda Match', head_size_mm: 4.51, weight_grains: 10.65 },
  { brand: 'H&N', model: 'Baracuda Match', head_size_mm: 4.52, weight_grains: 10.65 },
  { brand: 'H&N', model: 'Baracuda Hunter', head_size_mm: 4.50, weight_grains: 9.57 },
  { brand: 'H&N', model: 'Baracuda Hunter Extreme', head_size_mm: 4.50, weight_grains: 9.57 },
  { brand: 'H&N', model: 'Baracuda Power', head_size_mm: 4.50, weight_grains: 10.65 },
  { brand: 'H&N', model: 'Baracuda Green', head_size_mm: 4.50, weight_grains: 6.48 },
  { brand: 'H&N', model: 'Sport', head_size_mm: 4.50, weight_grains: 8.18 },
  { brand: 'H&N', model: 'Sniper Magnum', head_size_mm: 4.50, weight_grains: 15.14 },
  { brand: 'H&N', model: 'Excite Spike', head_size_mm: 4.50, weight_grains: 9.26 },
  { brand: 'H&N', model: 'Crow Magnum', head_size_mm: 4.50, weight_grains: 8.64 },

  // RWS — .177
  { brand: 'RWS', model: 'R10 Match', head_size_mm: 4.49, weight_grains: 8.20 },
  { brand: 'RWS', model: 'R10 Match', head_size_mm: 4.50, weight_grains: 8.20 },
  { brand: 'RWS', model: 'R10 Match', head_size_mm: 4.51, weight_grains: 8.20 },
  { brand: 'RWS', model: 'R10 Match Heavy', head_size_mm: 4.50, weight_grains: 8.68 },
  { brand: 'RWS', model: 'Meisterkugeln', head_size_mm: 4.50, weight_grains: 8.20 },
  { brand: 'RWS', model: 'Superdome', head_size_mm: 4.50, weight_grains: 8.30 },
  { brand: 'RWS', model: 'Superpoint', head_size_mm: 4.50, weight_grains: 8.20 },
  { brand: 'RWS', model: 'Superfield', head_size_mm: 4.52, weight_grains: 8.40 },
  { brand: 'RWS', model: 'Hobby', head_size_mm: 4.50, weight_grains: 7.00 },

  // Air Arms — .177
  { brand: 'Air Arms', model: 'Diabolo Field', head_size_mm: 4.51, weight_grains: 8.44 },
  { brand: 'Air Arms', model: 'Diabolo Field', head_size_mm: 4.52, weight_grains: 8.44 },
  { brand: 'Air Arms', model: 'Diabolo Field Heavy', head_size_mm: 4.52, weight_grains: 10.34 },
  { brand: 'Air Arms', model: 'Falcon', head_size_mm: 4.51, weight_grains: 7.33 },
  { brand: 'Air Arms', model: 'Falcon', head_size_mm: 4.52, weight_grains: 7.33 },
  { brand: 'Air Arms', model: 'Express', head_size_mm: 4.51, weight_grains: 7.87 },

  // Daystate — .177
  { brand: 'Daystate', model: 'Rangemaster Sovereign', head_size_mm: 4.52, weight_grains: 8.44 },
  { brand: 'Daystate', model: 'Rangemaster Li', head_size_mm: 4.52, weight_grains: 7.87 },
  { brand: 'Daystate', model: 'Rangemaster Kaiser', head_size_mm: 4.52, weight_grains: 10.34 },
  { brand: 'Daystate', model: 'Rangemaster FT', head_size_mm: 4.52, weight_grains: 8.44 },

  // FX — .177
  { brand: 'FX', model: 'Pellets Match', head_size_mm: 4.51, weight_grains: 8.44 },

  // Crosman / Benjamin — .177
  { brand: 'Crosman', model: 'Premier HP', head_size_mm: 4.50, weight_grains: 7.90 },
  { brand: 'Crosman', model: 'Premier Domed', head_size_mm: 4.50, weight_grains: 7.90 },
  { brand: 'Crosman', model: 'Premier Heavy', head_size_mm: 4.50, weight_grains: 10.50 },
  { brand: 'Crosman', model: 'Wadcutter', head_size_mm: 4.50, weight_grains: 7.40 },
  { brand: 'Benjamin', model: 'Bullseye', head_size_mm: 4.50, weight_grains: 7.90 },

  // Predator — .177
  { brand: 'Predator', model: 'Polymag', head_size_mm: 4.51, weight_grains: 8.02 },
  { brand: 'Predator', model: 'GTO', head_size_mm: 4.50, weight_grains: 5.40 },

  // Norma — .177
  { brand: 'Norma', model: 'S-Target', head_size_mm: 4.50, weight_grains: 8.18 },

  // Qiang Yuan — .177
  { brand: 'Qiang Yuan', model: 'Match', head_size_mm: 4.50, weight_grains: 8.20 },
  { brand: 'Qiang Yuan', model: 'Olympic', head_size_mm: 4.50, weight_grains: 8.20 },
  { brand: 'Qiang Yuan', model: 'Training', head_size_mm: 4.50, weight_grains: 8.20 },

  // Lapua — .177
  { brand: 'Lapua', model: 'Master M', head_size_mm: 4.50, weight_grains: 8.18 },

  // Falcon — .177
  { brand: 'Falcon', model: 'Accuracy Plus', head_size_mm: 4.50, weight_grains: 7.33 },
  { brand: 'Falcon', model: 'Accuracy Plus', head_size_mm: 4.51, weight_grains: 7.33 },

  // ZAN — .177
  { brand: 'ZAN', model: 'Slug', head_size_mm: 4.50, weight_grains: 13.40 },

  // Webley — .177
  { brand: 'Webley', model: 'Mosquito', head_size_mm: 4.51, weight_grains: 8.40 },

  // Legends — .177
  { brand: 'Legends', model: 'Legend', head_size_mm: 4.52, weight_grains: 8.44 },

  // ─── .22 calibre ───────────────────────────────────────────────────────────

  // JSB — .22
  { brand: 'JSB', model: 'Exact', head_size_mm: 5.50, weight_grains: 15.89 },
  { brand: 'JSB', model: 'Exact', head_size_mm: 5.51, weight_grains: 15.89 },
  { brand: 'JSB', model: 'Exact', head_size_mm: 5.52, weight_grains: 15.89 },
  { brand: 'JSB', model: 'Exact', head_size_mm: 5.53, weight_grains: 15.89 },
  { brand: 'JSB', model: 'Exact RS', head_size_mm: 5.50, weight_grains: 13.43 },
  { brand: 'JSB', model: 'Exact RS', head_size_mm: 5.51, weight_grains: 13.43 },
  { brand: 'JSB', model: 'Exact RS', head_size_mm: 5.52, weight_grains: 13.43 },
  { brand: 'JSB', model: 'Exact Jumbo', head_size_mm: 5.52, weight_grains: 15.89 },
  { brand: 'JSB', model: 'Exact Heavy', head_size_mm: 5.51, weight_grains: 18.13 },
  { brand: 'JSB', model: 'Exact Heavy', head_size_mm: 5.52, weight_grains: 18.13 },
  { brand: 'JSB', model: 'Exact Heavy', head_size_mm: 5.53, weight_grains: 18.13 },
  { brand: 'JSB', model: 'Exact Monster', head_size_mm: 5.52, weight_grains: 25.39 },
  { brand: 'JSB', model: 'Hades', head_size_mm: 5.52, weight_grains: 15.89 },
  { brand: 'JSB', model: 'Knock-Out Slug', head_size_mm: 5.50, weight_grains: 21.00 },
  { brand: 'JSB', model: 'Knock-Out Slug', head_size_mm: 5.50, weight_grains: 25.39 },

  // H&N — .22
  { brand: 'H&N', model: 'Field Target Trophy', head_size_mm: 5.51, weight_grains: 14.66 },
  { brand: 'H&N', model: 'Field Target Trophy', head_size_mm: 5.52, weight_grains: 14.66 },
  { brand: 'H&N', model: 'Field Target Trophy', head_size_mm: 5.53, weight_grains: 14.66 },
  { brand: 'H&N', model: 'Baracuda Match', head_size_mm: 5.51, weight_grains: 21.14 },
  { brand: 'H&N', model: 'Baracuda Match', head_size_mm: 5.52, weight_grains: 21.14 },
  { brand: 'H&N', model: 'Baracuda Match', head_size_mm: 5.53, weight_grains: 21.14 },
  { brand: 'H&N', model: 'Baracuda Hunter Extreme', head_size_mm: 5.50, weight_grains: 18.52 },
  { brand: 'H&N', model: 'Slug HP', head_size_mm: 5.50, weight_grains: 25.00 },
  { brand: 'H&N', model: 'Slug II', head_size_mm: 5.50, weight_grains: 30.00 },
  { brand: 'H&N', model: 'Crow Magnum', head_size_mm: 5.50, weight_grains: 18.21 },
  { brand: 'H&N', model: 'Sniper Magnum', head_size_mm: 5.50, weight_grains: 23.30 },

  // RWS — .22
  { brand: 'RWS', model: 'Superdome', head_size_mm: 5.50, weight_grains: 14.50 },
  { brand: 'RWS', model: 'Superpoint', head_size_mm: 5.50, weight_grains: 14.50 },
  { brand: 'RWS', model: 'Hobby', head_size_mm: 5.50, weight_grains: 11.90 },
  { brand: 'RWS', model: 'Meisterkugeln', head_size_mm: 5.50, weight_grains: 14.00 },

  // Air Arms — .22
  { brand: 'Air Arms', model: 'Diabolo Field', head_size_mm: 5.51, weight_grains: 15.89 },
  { brand: 'Air Arms', model: 'Diabolo Field', head_size_mm: 5.52, weight_grains: 15.89 },
  { brand: 'Air Arms', model: 'Diabolo Field Heavy', head_size_mm: 5.52, weight_grains: 18.13 },

  // Daystate — .22
  { brand: 'Daystate', model: 'Rangemaster Sovereign', head_size_mm: 5.52, weight_grains: 15.89 },
  { brand: 'Daystate', model: 'Rangemaster Kaiser', head_size_mm: 5.52, weight_grains: 18.13 },

  // FX — .22
  { brand: 'FX', model: 'Hybrid Slug', head_size_mm: 5.52, weight_grains: 22.00 },
  { brand: 'FX', model: 'Hybrid Slug', head_size_mm: 5.52, weight_grains: 25.00 },

  // Crosman / Benjamin — .22
  { brand: 'Crosman', model: 'Premier Domed', head_size_mm: 5.50, weight_grains: 14.30 },
  { brand: 'Crosman', model: 'Premier HP', head_size_mm: 5.50, weight_grains: 14.30 },
  { brand: 'Benjamin', model: 'Bullseye', head_size_mm: 5.50, weight_grains: 14.30 },

  // Predator — .22
  { brand: 'Predator', model: 'Polymag', head_size_mm: 5.51, weight_grains: 16.00 },

  // Norma — .22
  { brand: 'Norma', model: 'S-Target', head_size_mm: 5.50, weight_grains: 15.43 },

  // Lapua — .22
  { brand: 'Lapua', model: 'Master M', head_size_mm: 5.50, weight_grains: 14.50 },

  // ─── .25 calibre ───────────────────────────────────────────────────────────

  { brand: 'JSB', model: 'Exact King', head_size_mm: 6.35, weight_grains: 25.39 },
  { brand: 'JSB', model: 'Exact King Heavy', head_size_mm: 6.35, weight_grains: 33.95 },
  { brand: 'JSB', model: 'Exact Monster', head_size_mm: 6.35, weight_grains: 33.95 },
  { brand: 'H&N', model: 'Baracuda Match', head_size_mm: 6.35, weight_grains: 30.86 },
  { brand: 'H&N', model: 'Field Target Trophy', head_size_mm: 6.35, weight_grains: 19.91 },
  { brand: 'H&N', model: 'Slug HP', head_size_mm: 6.35, weight_grains: 33.00 },
  { brand: 'FX', model: 'Hybrid Slug', head_size_mm: 6.35, weight_grains: 36.00 },
  { brand: 'Predator', model: 'Polymag', head_size_mm: 6.35, weight_grains: 26.00 },
]
