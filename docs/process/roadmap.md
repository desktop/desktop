# Roadmap

The following are our marketing releases, as planned to date (and we plan to revisit 6 months from now). They contain the broad features we're considering. The further away a release is, the less defined it is. Releases are subject to change at any time. This is not written in stone!!!

## 1.2 - Relationship between branches - lite

- [Relationship between branches lite](https://github.com/desktop/desktop/issues/3956)
  - Compare my work to any branch
  - Merge in any other branch to my branch
  
- [Upgrade nudge from classic to the new app](https://github.com/desktop/desktop/issues/2146)

## 1.3 - Detecting marge conflicts - 2.0
  
- [Relationship between branches 2.0](https://github.com/desktop/desktop/issues/2639)
  - Notifications around diverging from master branch
  - Detect merge conflicts
  
## 1.4 - New branch, maybe?

- [Move unpublished commits on master to new branch](https://github.com/desktop/desktop/issues/1021)
  - Don't let me commit to branches I shouldn't commit to
  - Guide me to creating my own branches
** depending on things, this might get combined with 1.5 
  
## 1.5 - Better onboarding

- Better onboarding for new users

## 1.6 - Conflict resolution lite

- [Conflict resolution lite](https://github.com/desktop/desktop/issues/2640)
  - Differentiate conflicted files from other changed files
  - Let me choose my mergetool
  - Let me open my mergetool
  
## 1.7 - Conflict resolution - 2.0

- [Conflict resolution 2.0](https://github.com/desktop/desktop/issues/2640)
  - Edit inline
  - Abort merge
  - How did I get here?
  - Don't let me commit a file with conflict markers
  
## 1.8 - Messaging + Tracking
  
- End of Progress & in-app messaging

- App interaction tracking

- Human readable Table of Contents

## Icebox

- [Fork if needed](https://github.com/desktop/desktop/issues/3918)
  - Offer to fork on clone, or push, or ?
  
- Keep environment up-to-date
  - Do I need to run `npm install`? `bundle install`?
  - Is it pluggable?

- Linting
  - TBD

- Repository list info
  - Does a repository need my attention?
  
- Track memory usage & garbage collection
  - especially long running processes
  - [Electron API endpoint for process usage](https://electronjs.org/docs/api/app#appgetappmetrics)
