package service

import (
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// robotsRule is one Allow/Disallow line from the User-agent: * group.
type robotsRule struct {
	pattern string
	allow   bool
	re      *regexp.Regexp
}

// parseRobots reads the User-agent: * group out of a robots.txt file.
// Groups for other agents are ignored, as is Sitemap:, which is not a rule.
func parseRobots(t *testing.T, path string) []robotsRule {
	t.Helper()

	raw, err := os.ReadFile(path)
	require.NoError(t, err, "robots.txt must be readable at %s", path)

	var rules []robotsRule
	inStarGroup := false

	for _, line := range strings.Split(string(raw), "\n") {
		if i := strings.IndexByte(line, '#'); i >= 0 {
			line = line[:i]
		}
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		key, value, ok := strings.Cut(line, ":")
		if !ok {
			continue
		}
		key = strings.ToLower(strings.TrimSpace(key))
		value = strings.TrimSpace(value)

		switch key {
		case "user-agent":
			inStarGroup = value == "*"
		case "allow", "disallow":
			if !inStarGroup || value == "" {
				continue
			}
			rules = append(rules, robotsRule{
				pattern: value,
				allow:   key == "allow",
				re:      robotsPatternRegexp(value),
			})
		}
	}

	require.NotEmpty(t, rules, "expected rules in the User-agent: * group")
	return rules
}

// robotsPatternRegexp compiles a robots.txt path pattern, honouring the two
// wildcards the standard defines: '*' for any run of characters and a
// trailing '$' to anchor the end of the path.
func robotsPatternRegexp(pattern string) *regexp.Regexp {
	anchored := strings.HasSuffix(pattern, "$")
	if anchored {
		pattern = strings.TrimSuffix(pattern, "$")
	}

	var b strings.Builder
	b.WriteString("^")
	for _, part := range strings.Split(pattern, "*") {
		if b.Len() > 1 {
			b.WriteString(".*")
		}
		b.WriteString(regexp.QuoteMeta(part))
	}
	if anchored {
		b.WriteString("$")
	}
	return regexp.MustCompile(b.String())
}

// robotsAllows applies the standard match precedence: the longest matching
// pattern wins, and Allow beats Disallow on an equal-length tie.
func robotsAllows(rules []robotsRule, path string) bool {
	best := -1
	allowed := true // no matching rule means crawlable

	for _, rule := range rules {
		if !rule.re.MatchString(path) {
			continue
		}
		n := len(rule.pattern)
		if n > best || (n == best && rule.allow) {
			best = n
			allowed = rule.allow
		}
	}
	return allowed
}

func appRobots(t *testing.T) []robotsRule {
	t.Helper()
	return parseRobots(t, filepath.Join("..", "..", "..", "frontend", "public", "robots.txt"))
}

// pathOf strips the configured site origin off a sitemap <loc>.
func pathOf(t *testing.T, loc string) string {
	t.Helper()
	u, err := url.Parse(loc)
	require.NoError(t, err, "sitemap <loc> must be a valid URL: %s", loc)
	require.True(t, u.IsAbs(), "sitemap <loc> must be absolute: %s", loc)
	return u.Path
}

// TestStaticPagesAreCrawlable is the regression guard for the Search Console
// report "New reasons prevent pages in a sitemap from being indexed:
// Blocked by robots.txt". A URL is only worth submitting if robots.txt lets a
// crawler fetch it, and the two files are edited independently — so assert
// the sitemap against the robots.txt we actually ship.
func TestStaticPagesAreCrawlable(t *testing.T) {
	rules := appRobots(t)
	svc := &SitemapService{siteURL: "https://sub12.io"}

	pages := svc.staticPages()
	require.NotEmpty(t, pages)

	for _, page := range pages {
		path := pathOf(t, page.Loc)
		assert.True(t, robotsAllows(rules, path),
			"sitemap lists %s but robots.txt disallows it", path)
	}
}

// TestEntityURLsAreCrawlable covers the generated per-entity URLs. These are
// the ones that actually tripped: the sitemap advertised /users/{id} while
// robots.txt disallowed /users.
func TestEntityURLsAreCrawlable(t *testing.T) {
	rules := appRobots(t)

	for _, path := range []string{
		"/share/users/paul-jennings",
		"/share/leagues/winter-ft-series",
		"/share/clubs/emley-moor",
		"/share/users/3f8b1c2e-0000-4000-8000-000000000000",
	} {
		assert.True(t, robotsAllows(rules, path),
			"sitemap emits %s but robots.txt disallows it", path)
	}
}

// TestInAppEntityRoutesStayBlocked pins the other half of the fix. The
// in-app routes sit behind requireAuth and serve a redirect to /login, so
// they must stay out of both robots.txt and the sitemap. If someone re-allows
// them, this fails and points at the sitemap rather than the robots file.
func TestInAppEntityRoutesStayBlocked(t *testing.T) {
	rules := appRobots(t)

	for _, path := range []string{
		"/users/3f8b1c2e-0000-4000-8000-000000000000",
		"/leagues/3f8b1c2e-0000-4000-8000-000000000000",
		"/clubs/3f8b1c2e-0000-4000-8000-000000000000",
		"/leagues",
		"/clubs",
		"/feed",
		"/admin/users",
		"/settings/privacy",
		"/reset-password",
		"/pellet-testing/leaderboard",
	} {
		assert.False(t, robotsAllows(rules, path),
			"%s is an authenticated route and must stay disallowed", path)
	}
}

// TestStaticPagesMatchPublicRoutes pins the exact set. Everything listed is a
// child of rootRoute or authRoute in frontend/src/routeTree.tsx; anything
// under appRoute would bounce a crawler to /login and be reported as a soft
// 404. Adding a page here means checking it is genuinely anonymous-reachable.
func TestStaticPagesMatchPublicRoutes(t *testing.T) {
	svc := &SitemapService{siteURL: "https://sub12.io"}

	var got []string
	for _, page := range svc.staticPages() {
		got = append(got, pathOf(t, page.Loc))
	}

	assert.ElementsMatch(t, []string{
		"/",
		"/pellet-leaderboard",
		"/register",
		"/login",
		"/privacy",
		"/terms",
		"/cookies",
	}, got)
}

// TestStaticPagesHaveNoDuplicates guards against the same URL being submitted
// twice, which Search Console reports as a sitemap warning.
func TestStaticPagesHaveNoDuplicates(t *testing.T) {
	svc := &SitemapService{siteURL: "https://sub12.io"}

	seen := map[string]bool{}
	for _, page := range svc.staticPages() {
		assert.False(t, seen[page.Loc], "duplicate sitemap entry %s", page.Loc)
		seen[page.Loc] = true
	}
}

func TestShareRefPrefersSlugOverID(t *testing.T) {
	assert.Equal(t, "paul-jennings", shareRef("paul-jennings", "3f8b1c2e"))
	// Rows that predate slug backfill still need a working URL.
	assert.Equal(t, "3f8b1c2e", shareRef("", "3f8b1c2e"))
}
