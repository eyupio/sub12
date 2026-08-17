// Demo screen recordings: what exists, what it teaches, and where the file
// lives. The videos themselves are produced by the recorder in e2e/demos/
// (see docs/demo-recordings.md) and shipped from frontend/public/demos/.
//
// Only entries with `available: true` are rendered anywhere — a storyboarded
// video can sit here without dangling a broken player while it waits to be
// recorded.

export type VideoGuideKind = 'showcase' | 'how-to'

export interface VideoGuide {
  slug: string
  kind: VideoGuideKind
  title: string
  blurb: string
  /** Rough runtime in seconds, shown as m:ss on the card. */
  durationS: number
  /** FAQ category the guide sits beside on the Help page. */
  category: string
  available: boolean
}

export const videoGuides: VideoGuide[] = [
  {
    slug: 'howto-add-gear',
    kind: 'how-to',
    title: 'Add your rifle and pellets',
    blurb: 'Pick your rifle from the catalog and the specs fill themselves in.',
    durationS: 26,
    category: 'Getting Started',
    available: true,
  },
  {
    slug: 'howto-first-card',
    kind: 'how-to',
    title: 'Log your first score card',
    blurb: '25 shots, a rifle, a pellet — tap each shot and the card keeps count.',
    durationS: 30,
    category: 'Getting Started',
    available: true,
  },
  {
    slug: 'showcase-score-card',
    kind: 'showcase',
    title: 'A 25-shot card, start to finish',
    blurb: 'The whole flow at speed: capture, totals, stats.',
    durationS: 20,
    category: 'Getting Started',
    available: true,
  },
  {
    slug: 'howto-join-league',
    kind: 'how-to',
    title: 'Join a league and submit a card',
    blurb: 'Enter a join code, send a card to the open round, watch the standings.',
    durationS: 81,
    category: 'Leagues',
    available: true,
  },
  {
    slug: 'howto-run-league',
    kind: 'how-to',
    title: 'Run a league: seasons, rounds, verification',
    blurb: "The organiser's weekly loop, from opening a round to verifying scores.",
    durationS: 83,
    category: 'Leagues',
    available: true,
  },
  {
    slug: 'showcase-league',
    kind: 'showcase',
    title: 'Your league, live standings',
    blurb: 'Standings that move the moment a card is verified.',
    durationS: 19,
    category: 'Leagues',
    available: true,
  },
  {
    slug: 'howto-pellet-test',
    kind: 'how-to',
    title: 'Test pellets: photograph and measure a group',
    blurb: 'Photograph the target and sub12 reads the group in mm and MOA.',
    durationS: 33,
    category: 'Pellet Testing',
    available: true,
  },
  {
    slug: 'showcase-pellet-testing',
    kind: 'showcase',
    title: 'Photograph the target, read the group',
    blurb: 'Hole detection, group size, and the pellet leaderboard.',
    durationS: 51,
    category: 'Pellet Testing',
    available: true,
  },
  {
    slug: 'showcase-analytics',
    kind: 'showcase',
    title: "Know exactly what's working",
    blurb: 'Trends, averages and gear comparisons across every card you shoot.',
    durationS: 72,
    category: 'Stats',
    available: true,
  },
  {
    slug: 'howto-install-pwa',
    kind: 'how-to',
    title: 'Install SUB12 on your phone',
    blurb: 'From browser tab to home-screen app in under a minute.',
    durationS: 40,
    category: 'Getting Started',
    available: false,
  },
]

export const availableVideoGuides = videoGuides.filter((g) => g.available)

export function videoGuideSrc(slug: string): string {
  return `/demos/${slug}.webm`
}

export function videoGuidePoster(slug: string): string {
  return `/demos/${slug}.jpg`
}

export function formatGuideDuration(s: number): string {
  const m = Math.floor(s / 60)
  const rest = s % 60
  return `${m}:${String(rest).padStart(2, '0')}`
}
