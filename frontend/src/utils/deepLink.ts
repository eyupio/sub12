// Map an inbound Universal Link / App Link URL to the in-app router path to
// navigate to. We only register https://sub12.io links (not a custom scheme), so
// the URL always has a real host and the pathname is the in-app route. Returns
// null when there's nothing meaningful to open — a bare host or an unparseable
// value — so the caller can no-op and leave the user on the launch screen.
//
// Examples:
//   https://sub12.io/share/leagues/abc  -> /share/leagues/abc
//   https://sub12.io/scores/123?x=1#g   -> /scores/123?x=1#g
//   https://sub12.io/                   -> null
export function deepLinkToPath(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  const path = `${parsed.pathname}${parsed.search}${parsed.hash}`
  if (!path || path === '/') return null
  return path
}
