## 2026-07-23 - git history recency checks are unreliable in this checkout
**Finding:** `git log -1 -- <path>` shows ~648 of ~895 tracked files (including
long-untouched docs like `e2e/SELECTORS_TODO.md` and stray debug cruft like the
removed `tmp_sub12_cmd2.sh`) as last-modified by the same single "Merge pull
request #305" commit (`882b5ee`, 2026-06-27). That commit is a bulk-import/
squash artifact from how this sandbox checkout's history was assembled, not
genuine same-day editing of every one of those files.
**Learning:** A naive "skip anything with a commit in the last 30 days" recency
gate will flag nearly the entire repo as too-recent-to-touch here, because the
bulk commit's timestamp dominates `git log -1` for most paths regardless of
how old the file's real content is.
**Prevention:** When recency-gating a candidate in this repo, don't trust a
single `git log -1` date at face value — check whether it's shared by a large
fraction of unrelated files (a bulk/merge artifact) versus a commit with a
narrow, specific file list and a substantive message (real recent work). Weigh
the latter far more heavily when deciding whether something is safe to touch.

## 2026-08-19 - the bulk-commit trap isn't a single known commit — check every candidate's own diff stat
**Finding:** `882b5ee` isn't the only bulk-squash commit in this history.
`2676224` ("Rebuild the community feature board around voting", 2026-08-01) has
a feature-board-focused message but its diff stat touches ~990 lines across
files spanning `.github/workflows/`, `.env.example`, `.jules/*`, and — the
files that led here — two fully-formed, entirely orphaned components
(`GroupSizeTimeline.tsx`, `LocationPicker.tsx`, zero references anywhere in the
tree, superseded by other components) that have nothing to do with a feature
board. `git log -1` on those two files pointed at this commit and made them
look like genuine two-week-old work.
**Learning:** Don't hard-code "ignore commit 882b5ee" as the recency-gate fix —
this repo's history has more than one squash/rebuild artifact, and a narrow-
looking commit message is not by itself proof the commit is narrow.
**Prevention:** Before trusting a `git log -1` date on a candidate, run
`git show --stat <commit>` (or `--shortstat`) on the commit it names. A commit
touching only a handful of files related to its stated message is real recent
work; a commit whose file list is far wider than its message describes is
probably another bulk artifact, whatever its author line or message reads
like — and doesn't count toward "recently touched" for gating purposes.
