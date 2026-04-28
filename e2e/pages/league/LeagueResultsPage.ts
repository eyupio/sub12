import { LeagueDetailPage } from './LeagueDetailPage';

// In sub-12 today, "results" is the standings tab on the detail page rather
// than a dedicated route. This POM is a thin alias so spec code can read
// intent-first ("results.getStandings()") and we have a single seam to point
// at a real /results route later if the app gains one.
export class LeagueResultsPage extends LeagueDetailPage {}
