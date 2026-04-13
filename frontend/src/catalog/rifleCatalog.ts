export interface RifleCatalogEntry {
  make: string
  model: string
  calibre: string
  power_ftlb?: number
}

export const RIFLE_CATALOG: RifleCatalogEntry[] = [
  // Air Arms
  { make: 'Air Arms', model: 'S400', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'S410', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'S410 TDR', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'S510', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'S510 XS', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'TX200', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'TX200 HC', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'Pro-Sport', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'HFT 500', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'EV2', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'FTP 900', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'S200', calibre: '.177', power_ftlb: 11.5 },

  // BSA
  { make: 'BSA', model: 'R-10', calibre: '.177', power_ftlb: 11.5 },
  { make: 'BSA', model: 'R-10 SE', calibre: '.177', power_ftlb: 11.5 },
  { make: 'BSA', model: 'Ultra', calibre: '.177', power_ftlb: 11.5 },
  { make: 'BSA', model: 'Ultra SE', calibre: '.177', power_ftlb: 11.5 },
  { make: 'BSA', model: 'Scorpion', calibre: '.177', power_ftlb: 11.5 },
  { make: 'BSA', model: 'Scorpion SE', calibre: '.177', power_ftlb: 11.5 },
  { make: 'BSA', model: 'Gold Star', calibre: '.177', power_ftlb: 11.5 },

  // Brocock
  { make: 'Brocock', model: 'Compatto', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Brocock', model: 'Bantam', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Brocock', model: 'Bantam Sniper', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Brocock', model: 'Concept', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Brocock', model: 'Concept Lite', calibre: '.177', power_ftlb: 11.5 },

  // CZ
  { make: 'CZ', model: '200 S', calibre: '.177', power_ftlb: 11.5 },
  { make: 'CZ', model: '200 T', calibre: '.177', power_ftlb: 11.5 },

  // Daystate
  { make: 'Daystate', model: 'Red Wolf', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Delta Wolf', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Wolverine', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Wolverine B Type', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Pulsar', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Saxon', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Huntsman Regal', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'MK4', calibre: '.177', power_ftlb: 11.5 },

  // Diana
  { make: 'Diana', model: 'Stormrider', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Diana', model: 'Outlaw', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Diana', model: '56 TH', calibre: '.177', power_ftlb: 11.5 },

  // FX
  { make: 'FX', model: 'Impact', calibre: '.177', power_ftlb: 11.5 },
  { make: 'FX', model: 'Crown', calibre: '.177', power_ftlb: 11.5 },
  { make: 'FX', model: 'Dreamline', calibre: '.177', power_ftlb: 11.5 },
  { make: 'FX', model: 'Wildcat', calibre: '.177', power_ftlb: 11.5 },
  { make: 'FX', model: 'Maverick', calibre: '.177', power_ftlb: 11.5 },

  // RAW
  { make: 'RAW', model: 'HM1000x', calibre: '.177', power_ftlb: 11.5 },

  // Ripley
  { make: 'Ripley', model: 'AR15', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Ripley', model: 'XL-12', calibre: '.177', power_ftlb: 11.5 },

  // Steyr
  { make: 'Steyr', model: 'LG110 FT', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Steyr', model: 'LG110 HFT', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Steyr', model: 'Challenge', calibre: '.177', power_ftlb: 11.5 },

  // Walther
  { make: 'Walther', model: 'LGU', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Walther', model: 'Rotex RM8', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Walther', model: 'LG400', calibre: '.177' },
  { make: 'Walther', model: 'Reign', calibre: '.177', power_ftlb: 11.5 },

  // Weihrauch
  { make: 'Weihrauch', model: 'HW100', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW100 T', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW110', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW97K', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW77', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW44', calibre: '.177', power_ftlb: 11.5 },

  // .22 calibre variants
  { make: 'Air Arms', model: 'S510', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'TX200', calibre: '.22', power_ftlb: 11.5 },
  { make: 'BSA', model: 'R-10', calibre: '.22', power_ftlb: 11.5 },
  { make: 'BSA', model: 'Ultra', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW100', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW97K', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Red Wolf', calibre: '.22', power_ftlb: 11.5 },
  { make: 'FX', model: 'Impact', calibre: '.22', power_ftlb: 11.5 },
  { make: 'FX', model: 'Crown', calibre: '.22', power_ftlb: 11.5 },
]
