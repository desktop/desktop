# Code Reviews

Some notes on how the Desktop core team review incoming pull requests

## The Flow

### Work-in-Progress

You should open pull requests early, especially for large changes. This means
continuous integration tests are run earlier on, and any regressions can be
caught before humans get involved.

Until the code is ready for review, you can prefix the PR title with [WIP] to
indicate that it's under development.

### Use Task Lists

If you are working through a list of tasks as part of a pull request, listing
those tasks and indicating when they have been completed helps reviewers to
understand quickly what's changed.

### Keep The Commit History Tidy

We're not that fussy about the history, but to make reviewing easier here's
some general tips:

 - make small, meaningful commits -
 - write good commit messages - these help the reviewer to understand the changes

Please also keep your branch up to date with `master` to ensure everything
integrates nicely - we prefer you merge `master` into your branch, but for small
PRs a rebase is fine.

### Tell Us When It's Ready

Feeling like it's ready to be reviewed? Add a comment to the Pull Request to
the effect of "Ready for review! :dog:" - this let's us know it's time to start
with a thorough review.

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

