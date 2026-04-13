export interface PelletCatalogEntry {
  brand: string
  model: string
  head_size_mm?: number
  weight_grains?: number
}

export const PELLET_CATALOG: PelletCatalogEntry[] = [
  // JSB — .177
  { brand: 'JSB', model: 'Exact', head_size_mm: 4.50, weight_grains: 8.44 },
  { brand: 'JSB', model: 'Exact', head_size_mm: 4.51, weight_grains: 8.44 },
  { brand: 'JSB', model: 'Exact', head_size_mm: 4.52, weight_grains: 8.44 },
  { brand: 'JSB', model: 'Exact', head_size_mm: 4.53, weight_grains: 8.44 },
  { brand: 'JSB', model: 'Exact RS', head_size_mm: 4.52, weight_grains: 7.33 },
  { brand: 'JSB', model: 'Exact Heavy', head_size_mm: 4.52, weight_grains: 10.34 },
  { brand: 'JSB', model: 'Exact Monster', head_size_mm: 4.52, weight_grains: 13.43 },
  { brand: 'JSB', model: 'Match Diabolo', head_size_mm: 4.50, weight_grains: 8.02 },
  { brand: 'JSB', model: 'Match Diabolo S100', head_size_mm: 4.50, weight_grains: 8.02 },
  { brand: 'JSB', model: 'Straton', head_size_mm: 4.50, weight_grains: 8.26 },

  // H&N — .177
  { brand: 'H&N', model: 'Finale Match Light', head_size_mm: 4.50, weight_grains: 7.87 },
  { brand: 'H&N', model: 'Finale Match Heavy', head_size_mm: 4.50, weight_grains: 8.18 },
  { brand: 'H&N', model: 'Finale Match', head_size_mm: 4.49, weight_grains: 8.18 },
  { brand: 'H&N', model: 'Finale Match', head_size_mm: 4.50, weight_grains: 8.18 },
  { brand: 'H&N', model: 'Finale Match', head_size_mm: 4.51, weight_grains: 8.18 },
  { brand: 'H&N', model: 'Baracuda Match', head_size_mm: 4.50, weight_grains: 10.65 },
  { brand: 'H&N', model: 'Baracuda Match', head_size_mm: 4.51, weight_grains: 10.65 },
  { brand: 'H&N', model: 'Baracuda Match', head_size_mm: 4.52, weight_grains: 10.65 },
  { brand: 'H&N', model: 'Field Target Trophy', head_size_mm: 4.50, weight_grains: 8.64 },
  { brand: 'H&N', model: 'Field Target Trophy', head_size_mm: 4.51, weight_grains: 8.64 },
  { brand: 'H&N', model: 'Field Target Trophy', head_size_mm: 4.52, weight_grains: 8.64 },
  { brand: 'H&N', model: 'Sport', head_size_mm: 4.50, weight_grains: 8.18 },
  { brand: 'H&N', model: 'Sniper Magnum', head_size_mm: 4.50, weight_grains: 15.14 },

  // RWS — .177
  { brand: 'RWS', model: 'R10 Match', head_size_mm: 4.50, weight_grains: 8.20 },
  { brand: 'RWS', model: 'R10 Match', head_size_mm: 4.51, weight_grains: 8.20 },
  { brand: 'RWS', model: 'R10 Match Heavy', head_size_mm: 4.50, weight_grains: 8.68 },
  { brand: 'RWS', model: 'Superdome', head_size_mm: 4.50, weight_grains: 8.30 },
  { brand: 'RWS', model: 'Hobby', head_size_mm: 4.50, weight_grains: 7.00 },
  { brand: 'RWS', model: 'Meisterkugeln', head_size_mm: 4.50, weight_grains: 8.20 },

  // Air Arms — .177
  { brand: 'Air Arms', model: 'Diabolo Field', head_size_mm: 4.51, weight_grains: 8.44 },
  { brand: 'Air Arms', model: 'Diabolo Field', head_size_mm: 4.52, weight_grains: 8.44 },
  { brand: 'Air Arms', model: 'Diabolo Field Heavy', head_size_mm: 4.52, weight_grains: 10.34 },
  { brand: 'Air Arms', model: 'Falcon', head_size_mm: 4.52, weight_grains: 7.33 },

  // Daystate
  { brand: 'Daystate', model: 'Elite', head_size_mm: 4.52, weight_grains: 8.44 },
  { brand: 'Daystate', model: 'Superfire', head_size_mm: 4.52, weight_grains: 8.44 },
  { brand: 'Daystate', model: 'FT', head_size_mm: 4.52, weight_grains: 8.44 },

  // FX
  { brand: 'FX', model: 'Hybrid Slug', head_size_mm: 4.52, weight_grains: 10.20 },

  // Legends
  { brand: 'Legends', model: 'Legend', head_size_mm: 4.52, weight_grains: 8.44 },

  // .22 calibre pellets
  { brand: 'JSB', model: 'Exact', head_size_mm: 5.50, weight_grains: 15.89 },
  { brand: 'JSB', model: 'Exact', head_size_mm: 5.51, weight_grains: 15.89 },
  { brand: 'JSB', model: 'Exact', head_size_mm: 5.52, weight_grains: 15.89 },
  { brand: 'JSB', model: 'Exact', head_size_mm: 5.53, weight_grains: 15.89 },
  { brand: 'JSB', model: 'Exact RS', head_size_mm: 5.50, weight_grains: 13.43 },
  { brand: 'JSB', model: 'Exact RS', head_size_mm: 5.51, weight_grains: 13.43 },
  { brand: 'JSB', model: 'Exact RS', head_size_mm: 5.52, weight_grains: 13.43 },
  { brand: 'JSB', model: 'Exact Heavy', head_size_mm: 5.50, weight_grains: 18.13 },
  { brand: 'JSB', model: 'Exact Heavy', head_size_mm: 5.51, weight_grains: 18.13 },
  { brand: 'JSB', model: 'Exact Heavy', head_size_mm: 5.52, weight_grains: 18.13 },
  { brand: 'JSB', model: 'Exact Heavy', head_size_mm: 5.53, weight_grains: 18.13 },
  { brand: 'H&N', model: 'Field Target Trophy', head_size_mm: 5.53, weight_grains: 14.66 },
  { brand: 'H&N', model: 'Baracuda Match', head_size_mm: 5.53, weight_grains: 21.14 },
  { brand: 'Air Arms', model: 'Diabolo Field', head_size_mm: 5.52, weight_grains: 15.89 },
  { brand: 'RWS', model: 'Superdome', head_size_mm: 5.50, weight_grains: 14.50 },
]
