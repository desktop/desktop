# Roadmap

The following are our marketing releases as planned to date. They contain the broad features we're considering. The further away a release is, the less defined it is. Releases are subject to change at any time.

## 1.0

- Feature complete
- Stable
- Replaces existing Desktop apps
- See the [1.0 milestone](https://github.com/desktop/desktop/milestone/7)

## 1.1

- Relationship to _X_
  - Show how the current branch relates to the target branch
  - The target is the default branch or the upstream's default branch
  - _Probably_ let the user switch the target branch

- Conflict resolution lite
  - Differentiate conflicted files from other changed files
  - Let me choose my mergetool
  - Let me open my mergetool

- Pull request list
  - _Probably_ a tab in the Branches foldout
  - Group my pull requests vs. others

- Pull request CI status
  - Show PRs CI status in the above pull request list

- Auto-config upstreams on fork
  - Create an `upstream` remote for forks
  - Fetch periodically

## 1.2

- Full conflict resolution
  - Lots TBD
  - Pick ours/theirs/both
  - Edit inline
  - Abort merge
  - How did I get here?

- Fork if needed
  - Offer to fork on clone, or push, or ?

- Protected branches and default branch protection
  - Don't let me commit to branches I shouldn't commit to
  - Guide me to creating my own branches

- CI status notifications lite
  - Only on my PRs
  - Use OS notifications
  - Notifications link to the PR on dotcom

## 1.3

- Keep environment up-to-date
  - Do I need to run `npm install`? `bundle install`?
  - Is it pluggable?

- Linting
  - TBD

- Save face
  - Keep me from making embarrassing mistakes
  - Don't let me commit a file with conflict markers

- Repository list info
  - Does a repository need my attention?
