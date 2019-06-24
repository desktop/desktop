# Pull Request Triage

This document outlines how the Desktop team handles pull requests, to ensure
a consistent process for contributions from the core team and the community.

## The Review Process

1. **Contributor** opens pull request.
1. When it's ready for review, add a comment to the pull request.
1. A member of the reviewer team will give it a quick look over and
   add the `ready-for-review` label.
1. A **reviewer** with bandwidth will appear.
1. **Reviewer** assigns the PR to themselves.
1. **Reviewer** leaves line comments with suggestions or questions.
1. When the **reviewer** is done they comment on the PR with an emoji, meme,
   pokémon, or words to that effect.
1. The **contributor** responds to feedback, makes changes, etc.
1. When the **contributor** is ready for the **reviewer** to re-review, they
   comment on the PR with an emoji, meme, pokémon or words to that effect.
1. Goto 6 until both parties are happy with the PR.
1. The **reviewer** hits the big green merge button and deletes the branch (if
    applicable).

Merged contributions are first published to the beta channel (we aim to publish
new versions weekly if contributions are availlable) before then being
published to the production channel (we aim to publish new versions on a monthly
cadence).

### When The Review Is Done

We're using GitHub's review tools to co-ordinate feedback, and we like to be
methodical with our reviews, so you'll probably end up with one of two results:

 - **Approved**: nothing else to do; the contribution is great! :gem:
 - **Request Changes**: there are things to address; reviewer provides details :memo:

Reviews can take a few iterations, especially for large contributions. Don't
be disheartened if you feel it takes time - we just want to ensure each
contribution is high-quality and that any outstanding questions are resolved,
captured or documented for posterity.

### Assignees

The reviewers team uses the **Assignee** field to indicate who "owns" the review
process for a contribution. While others can add their reviews to a pull request -
and large features will likely have multiple reviewers - it's up to the assignee
to take charge of the process and see it through to the end.

If a reviewer is feeling overloaded, or if a review has stalled, the reviewer may
remove themselves from a pull request. This helps others know where they can help
out to share the load.

### Everyone Reviews

While everyone has their own domain expertise around the codebase, we encourage
people to share the load of reviews and reviewing areas of the codebase that
aren't as familiar. This spreads knowledge across the team

### 24 Hours Cooling Off

After being approved, most contributions will remain in this state for at least
24 hours before merging. The review team does this to ensure everyone on the team,
who are normally spread around the world, has a chance to provide feedback about
the changes.

### No Self-Merges

We encourage a strong review culture, and contributors should not merge their
own PRs unless there are exceptional reasons.

Examples of exceptional situations:

- [#2733](https://github.com/desktop/desktop/pull/2733) was pinning a dependency
  that affected our continuous integration tests by installing the incorrect
  version

- [#4319](https://github.com/desktop/desktop/pull/4319) was a minor packaging
  change introduced unexpectedly on `development` but would affect everyone when they
  updated their local repositories.

These should be called out by the merging person with a `#jolo` - "Josh Only
Lives Once" - to acknowledge to everyone that they're bypassing the review
process, and the reasons for doing that.

### Stale Pull Requests

A reviewer will return to an **open and reviewed** pull request if, after 14
days:

 - no response has been received from the contributor, or
 - no new commits have been made to the pull request

This is done to ensure we keep the number of reviews under control.

The reviewer should ask if the contributor is still interested in working on
this, and indicate that they are welcome to open a fresh pull request later if
they lack the time currently to continue on.

If it's agreed to put this contribution on hold, or if no feedback is
received after 3 days, the pull request will be closed.
