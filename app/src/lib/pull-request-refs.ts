import { Commit } from '../models/commit'
import { PullRequest } from '../models/pull-request'
import { IssueReference } from './markdown-filters/issue-mention-filter'

/**
 * The canonical issue/PR reference matcher (the same one used to linkify
 * `#123`, `gh-123`, and `owner/repo#123` mentions throughout the app),
 * anchored on a non-word "leader" so we don't match tokens like `abc#123`
 * and made global so we can scan a whole commit message.
 */
const IssueReferenceMatcher = new RegExp(
  '(?<=^|\\W)' + IssueReference.source,
  'gi'
)

/**
 * Extract pull request numbers referenced in a list of commits by scanning
 * commit summaries and bodies for issue/PR mentions.
 *
 * Catches the common cases:
 *   - GitHub merge commits: `Merge pull request #123 from owner/branch`
 *   - Squash-merged titles:  `Some title (#456)`
 *   - Free-text references:  `Fixes #789` / `Fixes gh-789`
 *
 * Reuses the shared {@linkcode IssueReference} pattern but, unlike the
 * mention-linkifier, only accepts *bare* same-repo references: we drop
 * cross-repo `owner/repo#N` and URL-style (`/issues/`, `/pull/`) markers
 * because callers resolve these numbers against the *current* repository's
 * pull requests, so another repo's `#1` would be a wrong-repo false match.
 *
 * Numbers are returned in first-seen order with duplicates removed.
 */
export function extractPullRequestNumbersFromCommits(
  commits: ReadonlyArray<Commit>
): ReadonlyArray<number> {
  const seen = new Set<number>()
  const result: Array<number> = []

  for (const commit of commits) {
    const fields = [commit.summary, commit.body]
    for (const field of fields) {
      if (!field) {
        continue
      }
      for (const match of field.matchAll(IssueReferenceMatcher)) {
        const groups = match.groups
        if (groups === undefined) {
          continue
        }

        const { refNumber, ownerOrOwnerRepo, marker } = groups
        // Only bare, same-repo references via `#`/`gh-`; skip cross-repo
        // prefixes and URL-style markers we can't safely resolve here.
        if (ownerOrOwnerRepo !== undefined) {
          continue
        }
        if (marker !== '#' && marker?.toLowerCase() !== 'gh-') {
          continue
        }

        const prNumber = parseInt(refNumber, 10)
        if (prNumber > 0 && !seen.has(prNumber)) {
          seen.add(prNumber)
          result.push(prNumber)
        }
      }
    }
  }

  return result
}

/**
 * Find pull requests in a locally-cached list whose numbers appear in the
 * given list. Preserves the order of `numbers` (first-seen wins) and skips
 * numbers without a matching PR — letting callers fall back gracefully.
 */
export function findPullRequestsByNumbers(
  numbers: ReadonlyArray<number>,
  pullRequests: ReadonlyArray<PullRequest>
): ReadonlyArray<PullRequest> {
  if (numbers.length === 0 || pullRequests.length === 0) {
    return []
  }

  const byNumber = new Map<number, PullRequest>()
  for (const pr of pullRequests) {
    byNumber.set(pr.pullRequestNumber, pr)
  }

  const result: Array<PullRequest> = []
  for (const prNumber of numbers) {
    const match = byNumber.get(prNumber)
    if (match !== undefined) {
      result.push(match)
    }
  }
  return result
}
