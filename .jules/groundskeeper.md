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
