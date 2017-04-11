## Big Changes from Desktop Classic => Desktop TNG

### UI Redesign

Obvious but calling out for the sake of thoroughness. Most notably the repositories list is only visible when you're switching.

### No more comparison graph

RIP

### No more Pull Request creation

RIP. The only similar affordance we have is the Branch > Compare on GitHub menu item.

### Some functionality that was in the toolbar is now in menus

1. "Create Branch" is now at File > New Branch…
2. The various Add Repository actions are now in the File menu.

### Changes

More or less the same as Classic Mac.

### History

No Revert/Rollback.

### Sync

He dead. A penny for the old guy.

The button in the toolbar now says what it's going to do: update, push, or pull.

### Clone

Completely different. Users can now clone an arbitrary URL or enter a shortcut (e.g., desktop/desktop to clone http://github.com/desktop/desktop). No Big List Of Repositories.

### New Repository

More closely matches dot com by allowing users to create a repo with a README, gitignore, and README.

### Git LFS

No LFS functionality exposed in the UI.

### Git Shell

No longer provide a shell for the user. When the user chooses to open a shell, we check if they have git installed yet. If not, we send them to help docs.

## Remaining UI Design

These are views that we plan to redesign before the beta launch:

- [ ] Clean slate / no repositories view (https://github.com/desktop/desktop/issues/871)
- [ ] File > New Branch (https://github.com/desktop/desktop/issues/1137)
- [ ] Publish Repository dropdown (https://github.com/desktop/desktop/issues/1151)
- [ ] Update Available notification (https://github.com/desktop/desktop/issues/1136)
- [ ] Preferences > Advanced > Opt out of analytics reporting (https://github.com/desktop/desktop/issues/912)
- [ ] Preferences > Advanced > Merge Tool (https://github.com/desktop/desktop/issues/68)
