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
 - keep up to date with `development` - not only does this address potential merge
   conflicts, it ensures you're integrating with the latest code

When merging, we prefer you merge `development` into your branch, but for small
PRs a rebase is fine.

### These Things Take Time

Our team is distributed around the world, and often we like to get their
feedback for specific areas of the codebase. And even with minor changes, we often like to let
them sit for a while and give everyone a chance to provide their input.
