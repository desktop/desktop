# The Review Process

This is the typical flow:

1. **Contributor** opens pull request.
1. When it's ready for review, they comment on it saying so.
1. A member of the maintainer team will give it a quick look over and
   add the `ready-for-review` label.
1. Suddenly a wild **reviewer** appears!
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

The rest of this document goes into more details around this flow.

## Notes for Contributors

### Work-in-Progress

We recommend open pull requests early - ideally as soon as you have something to
show. This is especially helpful for large pieces of work, as continuous
integration tests are run earlier on, and regressions can be caught before
humans get involved.

Until the code is ready for review, you can prefix the PR title with [WIP] to
indicate that it's under development.

### Use Task Lists

If you are working through a list of tasks as part of a pull request, listing
those tasks and indicating when they have been completed helps reviewers to
understand quickly what's changed.

### Keep The Commit History Tidy

We're not that fussy about the history, but to make reviewing easier here's
some general tips:

 - make small, meaningful and logical commits - these make the review process easier
 - [write good commit messages](https://chris.beams.io/posts/git-commit/) -
   these help the reviewer to understand the changes
 - keep up to date with `master` - not only does this address potential merge
   conflicts, it ensures you're integrating with the latest code

When merging, we prefer you merge `master` into your branch, but for small
PRs a rebase is fine.

### At Least One Assignee

While many people can be involved with a review, there's generally one person
who eventually approves the pull request and merges. They'll be assigned to the
pull request early on, so we can easily verify every active pull request has a
reviewer.

### When The Review Is Done

We're using GitHub's review tools to co-ordinate feedback, and we like to be
methodical with our reviews, so you'll probably end up with one of two results:

 - **Approved**: nothing else to do; the reviewer merges
 - **Request Changes**: there are things to address; reviewer provides details

Reviews can take a few iterations, especially for large contributions. Don't
be disheartened if you feel it takes time - we just want to ensure each
contribution is high-quality and that any outstanding questions are resolved,
captured or documented for posterity.

### These Things Take Time

Our team is distributed around the world, and often we like to get their
feedback for specific areas. And even with minor changes, we often like to let
them sit for a while and give everyone a chance to provide their input.

## Other Rules

## No Self-Merges

Even for minor changes, we discourage people from merging their own pull
requests.

## Everyone Reviews

While everyone has their own domain expertise around the codebase, we encourage
people to share the load of reviews and reviewing areas of the codebase that
aren't as familiar. This spreads knowledge across the team

