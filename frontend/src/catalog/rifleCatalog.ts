export interface RifleCatalogEntry {
  make: string
  model: string
  calibre: string
  power_ftlb?: number
  // Optional path under /catalog/rifles/ in frontend/public.
  // When omitted the UI falls back to a brand mark (see brandImages.ts).
  image_url?: string
}

export const RIFLE_CATALOG: RifleCatalogEntry[] = [
  // Air Arms — .177
  { make: 'Air Arms', model: 'S200', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'S400', calibre: '.177', power_ftlb: 11.5, image_url: '/catalog/rifles/air-arms-s400.jpg' },
  { make: 'Air Arms', model: 'S400 MPR', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'S410', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'S410 TDR', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'S510', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'S510 XS', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'S510 Ultimate Sporter', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'S510 Carbine', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'S510 Tactical', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'TX200', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'TX200 HC', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'TX200 Mk3', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'Pro-Sport', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'Pro-Elite', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'HFT 500', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'EV2', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'FTP 900', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'Galahad', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'Ultimate Sporter R', calibre: '.177', power_ftlb: 11.5 },
  // Air Arms — .22
  { make: 'Air Arms', model: 'S410', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'S510', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'S510 Ultimate Sporter', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'TX200', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'Pro-Sport', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Air Arms', model: 'Galahad', calibre: '.22', power_ftlb: 11.5 },
  // Air Arms — .25 (FAC, no UK sub-12)
  { make: 'Air Arms', model: 'S510 Ultimate Sporter', calibre: '.25' },
  { make: 'Air Arms', model: 'Galahad', calibre: '.25' },

  // Anschütz
  { make: 'Anschütz', model: '8002 Club', calibre: '.177' },
  { make: 'Anschütz', model: '8002 S2', calibre: '.177' },
  { make: 'Anschütz', model: '9015 Premium', calibre: '.177' },
  { make: 'Anschütz', model: '9015 ONE', calibre: '.177' },

  // Beeman
  { make: 'Beeman', model: 'R7', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Beeman', model: 'R9', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Beeman', model: 'R11', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Beeman', model: 'RX2', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Beeman', model: 'R9', calibre: '.22', power_ftlb: 11.5 },

  // Benjamin / Crosman
  { make: 'Benjamin', model: 'Marauder', calibre: '.177' },
  { make: 'Benjamin', model: 'Marauder', calibre: '.22' },
  { make: 'Benjamin', model: 'Marauder', calibre: '.25' },
  { make: 'Benjamin', model: 'Akela', calibre: '.22' },
  { make: 'Benjamin', model: 'Discovery', calibre: '.177' },
  { make: 'Benjamin', model: 'Bulldog', calibre: '.357' },
  { make: 'Benjamin', model: 'Armada', calibre: '.22' },
  { make: 'Benjamin', model: 'Fortitude', calibre: '.22' },

  // Brocock
  { make: 'Brocock', model: 'Compatto', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Brocock', model: 'Compatto', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Brocock', model: 'Bantam', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Brocock', model: 'Bantam', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Brocock', model: 'Bantam Sniper', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Brocock', model: 'Bantam Sniper', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Brocock', model: 'Bantam HR', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Brocock', model: 'Concept', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Brocock', model: 'Concept Lite', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Brocock', model: 'Concept Elite', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Brocock', model: 'Sahara', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Brocock', model: 'Commander', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Brocock', model: 'Pathfinder', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Brocock', model: 'Atomic XR', calibre: '.22' },

  // BSA
  { make: 'BSA', model: 'R-10', calibre: '.177', power_ftlb: 11.5 },
  { make: 'BSA', model: 'R-10', calibre: '.22', power_ftlb: 11.5 },
  { make: 'BSA', model: 'R-10 SE', calibre: '.177', power_ftlb: 11.5 },
  { make: 'BSA', model: 'R-10 SE', calibre: '.22', power_ftlb: 11.5 },
  { make: 'BSA', model: 'R-10 TH', calibre: '.177', power_ftlb: 11.5 },
  { make: 'BSA', model: 'R-10 Mk2', calibre: '.177', power_ftlb: 11.5 },
  { make: 'BSA', model: 'Ultra', calibre: '.177', power_ftlb: 11.5 },
  { make: 'BSA', model: 'Ultra', calibre: '.22', power_ftlb: 11.5 },
  { make: 'BSA', model: 'Ultra SE', calibre: '.177', power_ftlb: 11.5 },
  { make: 'BSA', model: 'Ultra CLX', calibre: '.177', power_ftlb: 11.5 },
  { make: 'BSA', model: 'Scorpion', calibre: '.177', power_ftlb: 11.5 },
  { make: 'BSA', model: 'Scorpion SE', calibre: '.22', power_ftlb: 11.5 },
  { make: 'BSA', model: 'Gold Star', calibre: '.177', power_ftlb: 11.5 },
  { make: 'BSA', model: 'Gold Star SE', calibre: '.177', power_ftlb: 11.5 },
  { make: 'BSA', model: 'Buccaneer SE', calibre: '.22', power_ftlb: 11.5 },
  { make: 'BSA', model: 'Lightning XL', calibre: '.177', power_ftlb: 11.5 },

  // Cometa
  { make: 'Cometa', model: 'Fusion Premier', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Cometa', model: 'Fenix 400', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Cometa', model: 'Lynx', calibre: '.22', power_ftlb: 11.5 },

  // Crosman
  { make: 'Crosman', model: '1077', calibre: '.177' },
  { make: 'Crosman', model: '2240', calibre: '.22' },
  { make: 'Crosman', model: 'Optimus', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Crosman', model: 'Mag-Fire Ultra', calibre: '.22' },

  // CZ
  { make: 'CZ', model: '200 S', calibre: '.177', power_ftlb: 11.5 },
  { make: 'CZ', model: '200 T', calibre: '.177', power_ftlb: 11.5 },
  { make: 'CZ', model: '200 FS', calibre: '.177', power_ftlb: 11.5 },

  // Daystate
  { make: 'Daystate', model: 'Red Wolf', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Red Wolf', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Red Wolf', calibre: '.25' },
  { make: 'Daystate', model: 'Delta Wolf', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Delta Wolf', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Delta Wolf', calibre: '.25' },
  { make: 'Daystate', model: 'Alpha Wolf', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Alpha Wolf', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Wolverine R', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Wolverine 2', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Wolverine B Type', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Pulsar', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Pulsar Synthetic', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Saxon', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Saxon SXS', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Huntsman Regal', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Huntsman Regal', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Huntsman XL', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'MK4', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Air Wolf', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Daystate', model: 'Air Ranger', calibre: '.22' },
  { make: 'Daystate', model: 'Renegade', calibre: '.22' },
  { make: 'Daystate', model: 'Genus', calibre: '.22' },
  { make: 'Daystate', model: 'Tsar', calibre: '.22' },

  // Diana
  { make: 'Diana', model: '34', calibre: '.177', power_ftlb: 11.5, image_url: '/catalog/rifles/diana-34.jpg' },
  { make: 'Diana', model: '34', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Diana', model: '48', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Diana', model: '52', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Diana', model: '54 Airking', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Diana', model: '56 TH', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Diana', model: '350 Magnum', calibre: '.22' },
  { make: 'Diana', model: 'Stormrider', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Diana', model: 'Stormrider', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Diana', model: 'Outlaw', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Diana', model: 'Skyhawk', calibre: '.22' },
  { make: 'Diana', model: 'Mauser AM03', calibre: '.22' },

  // Edgun
  { make: 'Edgun', model: 'Leshiy 2', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Edgun', model: 'Leshiy', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Edgun', model: 'Matador R5', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Edgun', model: 'R3M', calibre: '.22', power_ftlb: 11.5 },

  // Evanix
  { make: 'Evanix', model: 'Rex', calibre: '.22' },
  { make: 'Evanix', model: 'Rex P', calibre: '.22' },
  { make: 'Evanix', model: 'Sniper', calibre: '.22' },
  { make: 'Evanix', model: 'Speed', calibre: '.22' },
  { make: 'Evanix', model: 'Windy City', calibre: '.22' },

  // Feinwerkbau
  { make: 'Feinwerkbau', model: '700', calibre: '.177' },
  { make: 'Feinwerkbau', model: '700 Universal', calibre: '.177' },
  { make: 'Feinwerkbau', model: '800', calibre: '.177' },
  { make: 'Feinwerkbau', model: '800 Basic', calibre: '.177' },
  { make: 'Feinwerkbau', model: '800 Evolution', calibre: '.177' },
  { make: 'Feinwerkbau', model: '800 X', calibre: '.177' },
  { make: 'Feinwerkbau', model: 'P75 Field Target', calibre: '.177' },
  { make: 'Feinwerkbau', model: 'Sport', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Feinwerkbau', model: 'P800 X', calibre: '.177' },
  { make: 'Feinwerkbau', model: 'P44', calibre: '.177' },

  // FX
  { make: 'FX', model: 'Crown', calibre: '.177', power_ftlb: 11.5 },
  { make: 'FX', model: 'Crown', calibre: '.22', power_ftlb: 11.5 },
  { make: 'FX', model: 'Crown', calibre: '.25' },
  { make: 'FX', model: 'Crown Mk II', calibre: '.22', power_ftlb: 11.5 },
  { make: 'FX', model: 'Maverick', calibre: '.177', power_ftlb: 11.5 },
  { make: 'FX', model: 'Maverick', calibre: '.22', power_ftlb: 11.5 },
  { make: 'FX', model: 'Maverick Sniper', calibre: '.22' },
  { make: 'FX', model: 'Maverick Compact', calibre: '.22', power_ftlb: 11.5 },
  { make: 'FX', model: 'Impact', calibre: '.177', power_ftlb: 11.5 },
  { make: 'FX', model: 'Impact', calibre: '.22', power_ftlb: 11.5 },
  { make: 'FX', model: 'Impact', calibre: '.25' },
  { make: 'FX', model: 'Impact M3', calibre: '.22' },
  { make: 'FX', model: 'Impact Mk2', calibre: '.22' },
  { make: 'FX', model: 'Dreamline', calibre: '.177', power_ftlb: 11.5 },
  { make: 'FX', model: 'Dreamline', calibre: '.22', power_ftlb: 11.5 },
  { make: 'FX', model: 'Dreamline Lite', calibre: '.22', power_ftlb: 11.5 },
  { make: 'FX', model: 'Dreamline Tactical', calibre: '.22', power_ftlb: 11.5 },
  { make: 'FX', model: 'Wildcat', calibre: '.177', power_ftlb: 11.5 },
  { make: 'FX', model: 'Wildcat', calibre: '.22', power_ftlb: 11.5 },
  { make: 'FX', model: 'Wildcat Mk3', calibre: '.22', power_ftlb: 11.5 },
  { make: 'FX', model: 'Streamline', calibre: '.22', power_ftlb: 11.5 },
  { make: 'FX', model: 'Independence', calibre: '.22' },
  { make: 'FX', model: 'Cyclone', calibre: '.177', power_ftlb: 11.5 },
  { make: 'FX', model: 'Royale', calibre: '.22' },
  { make: 'FX', model: 'Boss', calibre: '.25' },
  { make: 'FX', model: 'Verminator', calibre: '.22' },

  // Gamo
  { make: 'Gamo', model: 'Coyote', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Gamo', model: 'Phox', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Gamo', model: 'HPA', calibre: '.22' },
  { make: 'Gamo', model: 'Maxxim', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Gamo', model: 'Hunter 440', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Gamo', model: 'Whisper Fusion', calibre: '.177', power_ftlb: 11.5 },

  // Hatsan
  { make: 'Hatsan', model: 'AT44-10', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Hatsan', model: 'AT44-10', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Hatsan', model: 'AT44-10 Long', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Hatsan', model: 'Flash', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Hatsan', model: 'Flashpup', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Hatsan', model: 'Bullboss', calibre: '.22' },
  { make: 'Hatsan', model: 'Galatian', calibre: '.22' },
  { make: 'Hatsan', model: 'Hercules', calibre: '.30' },
  { make: 'Hatsan', model: 'BT65', calibre: '.22' },
  { make: 'Hatsan', model: 'BT65 SB', calibre: '.22' },
  { make: 'Hatsan', model: 'Edge', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Hatsan', model: 'Mod 95', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Hatsan', model: 'Mod 130', calibre: '.30' },
  { make: 'Hatsan', model: 'Sortie', calibre: '.22' },

  // Kalibrgun
  { make: 'Kalibrgun', model: 'Cricket', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Kalibrgun', model: 'Cricket', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Kalibrgun', model: 'Cricket II', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Kalibrgun', model: 'Cricket II Tactical', calibre: '.22' },
  { make: 'Kalibrgun', model: 'Capybara', calibre: '.30' },

  // Kral
  { make: 'Kral', model: 'Puncher Maxi', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Kral', model: 'Puncher Mega', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Kral', model: 'Puncher Breaker', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Kral', model: 'Knight', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Kral', model: 'Empire', calibre: '.22', power_ftlb: 11.5 },

  // Norica
  { make: 'Norica', model: 'Black Eagle', calibre: '.22' },
  { make: 'Norica', model: 'Massimo', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Norica', model: 'Atlantic', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Norica', model: 'Marvic', calibre: '.22', power_ftlb: 11.5 },

  // RAW (Rapid Air Weapons)
  { make: 'RAW', model: 'HM1000x', calibre: '.177', power_ftlb: 11.5 },
  { make: 'RAW', model: 'HM1000x', calibre: '.22' },
  { make: 'RAW', model: 'HM1000x LRT', calibre: '.22' },
  { make: 'RAW', model: 'TM1000', calibre: '.22' },

  // Ripley
  { make: 'Ripley', model: 'AR15', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Ripley', model: 'XL-12', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Ripley', model: 'XL9', calibre: '.177', power_ftlb: 11.5 },

  // Steyr
  { make: 'Steyr', model: 'LG110 FT', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Steyr', model: 'LG110 HFT', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Steyr', model: 'LG110 HP Match', calibre: '.177' },
  { make: 'Steyr', model: 'LG110 SH', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Steyr', model: 'LG100', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Steyr', model: 'Challenge', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Steyr', model: 'Hunting 5', calibre: '.22' },

  // Stoeger
  { make: 'Stoeger', model: 'X20', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Stoeger', model: 'X50', calibre: '.177' },
  { make: 'Stoeger', model: 'ATAC', calibre: '.22' },
  { make: 'Stoeger', model: 'S4000-E', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Stoeger', model: 'RX5', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Stoeger', model: 'RX20', calibre: '.22', power_ftlb: 11.5 },

  // Theoben
  { make: 'Theoben', model: 'Sirocco', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Theoben', model: 'Rapid 7', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Theoben', model: 'Eliminator', calibre: '.22' },
  { make: 'Theoben', model: 'Crusader', calibre: '.22', power_ftlb: 11.5 },

  // Umarex
  { make: 'Umarex', model: 'Origin', calibre: '.22' },
  { make: 'Umarex', model: 'Gauntlet', calibre: '.22' },
  { make: 'Umarex', model: 'Gauntlet 2', calibre: '.22' },
  { make: 'Umarex', model: 'Synergis', calibre: '.22', power_ftlb: 11.5 },

  // Vulcan
  { make: 'Vulcan', model: 'Vulcan 2', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Vulcan', model: 'Vulcan 3', calibre: '.22', power_ftlb: 11.5 },

  // Walther
  { make: 'Walther', model: 'LGV', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Walther', model: 'LGU', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Walther', model: 'LG400', calibre: '.177', image_url: '/catalog/rifles/walther-lg400.jpg' },
  { make: 'Walther', model: 'LG400 Anatomic', calibre: '.177' },
  { make: 'Walther', model: 'LG400 Universal', calibre: '.177' },
  { make: 'Walther', model: 'LG500', calibre: '.177' },
  { make: 'Walther', model: 'Reign', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Walther', model: 'Rotex RM8', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Walther', model: 'Rotex RM8 Varmint', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Walther', model: 'Rotex R8', calibre: '.22', power_ftlb: 11.5 },

  // Webley
  { make: 'Webley', model: 'Mark VI', calibre: '.177' },
  { make: 'Webley', model: 'Tomahawk', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Webley', model: 'Eclipse', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Webley', model: 'Stingray', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Webley', model: 'Onyx', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Webley', model: 'Vulcan', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Webley', model: 'Excel', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Webley', model: 'Raider 2', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Webley', model: 'Mastiff', calibre: '.22', power_ftlb: 11.5 },

  // Weihrauch — .177
  { make: 'Weihrauch', model: 'HW30S', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW35E', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW35K', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW50S', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW57', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW77', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW77K', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW80', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW80K', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW85', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW90', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW95', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW95K', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW97K', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW97KT', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW98', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW100', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW100 T', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW100 K', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW100 S', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW100 BP', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW110', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW110 ST', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW110 K', calibre: '.177', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW44', calibre: '.177', power_ftlb: 11.5 },
  // Weihrauch — .22
  { make: 'Weihrauch', model: 'HW77K', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW80K', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW95', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW97K', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW100', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW100 T', calibre: '.22', power_ftlb: 11.5 },
  { make: 'Weihrauch', model: 'HW110', calibre: '.22', power_ftlb: 11.5 },

  // Western Air Arms
  { make: 'Western Air Arms', model: 'Eagle', calibre: '.22' },
]
