# Pull Request Review Process

This document describes how pull requests are handled in [desktop/desktop](https://github.com/desktop/desktop).

## Review Team

Desktop pull requests are reviewed by the `desktop/code-reviewers` team. Reviews are distributed via GitHub's **load-balanced code review assignment**, which considers each member's recent review requests and outstanding reviews.

## Review Ownership

The **Assignee** field indicates who owns the review process for a contribution. While others are welcome to add reviews, the assignee is responsible for seeing the PR through to completion. Assignees can request additional reviews from engineers with relevant domain expertise.

## Internal Pull Requests

1. **Contributor** opens a pull request (use draft mode if still in progress).
2. When ready, the contributor marks it ready for review.
3. A reviewer is **auto-assigned** via load-balanced code review assignment.
4. **Reviewer** leaves feedback; contributor responds and iterates.
5. Once approved, follow the [24-hour cooling-off period](#24-hour-cooling-off-period) before merging.

### No Self-Merges Without Review

Contributors should not merge their own PRs unless there are exceptional reasons (e.g., urgent CI fixes or packaging hotfixes). These should be called out with an explanation for bypassing the review process.

## External Pull Requests

External PRs follow this workflow:

1. **Initial triage** — PR receives the `external` and `needs-triage` labels. The First Responder performs a quick validity check:
   - Spam or AI sludge → Add `invalid` (auto-closes)
   - Not linked to a help-wanted issue → Add `no-help-wanted-issue` (auto-closes with comment)
   - Tiny fix (e.g., typo) → Review, test, and merge directly
   - Valid → Add `ready-for-review` and run CI (auto-removes `needs-triage`, auto-posts acknowledging comment)
2. **Review assignment** — The auto-assigned reviewer does not act until `ready-for-review` is applied.
3. **Requesting changes** — If changes are requested, the `contributor-input-needed` label is auto-added (removes `ready-for-review`). When the contributor responds, `ready-for-review` is re-applied automatically.
4. **Stale PR handling** — If no activity for 7 days, an automated message asks if the contributor is still interested. After another 7 days of inactivity, the PR auto-closes.

## 24-Hour Cooling-Off Period

After approval, most contributions remain in this state for at least 24 hours before merging. This ensures all team members across time zones have a chance to provide feedback.

