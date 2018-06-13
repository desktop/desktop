# Discard Changes

The `Discard Changes` feature allows users to clean up uncommitted changes from
a repository, and has evolved over time to support different workflows.

## Implementation

As the implementation details of this may change over time, this section will
instead describe the high-level flow of the implementation.

You can view a reference of this function [here](https://github.com/desktop/desktop/blob/2b111155914cb44824b39ee197deed23bb825a1a/app/src/lib/stores/git-store.ts#L1066).

The `Discard Changes` flow is composed of multiple steps.

### Moving Files to Trash

Electron provides the [`shell.moveItemToTrash(fullPath)`](https://electronjs.org/docs/api/shell#shellmoveitemtotrashfullpath)
API to manage moving files into the OS-specific trash.

Desktop uses this API to move _all new or modified files_ out from the
repository as a way to preserve changes, in case the user wishes to recover
them later. Files moved to the Trash are moved over as-is, so ensure you have
the ability to view hidden files if you wish to recover files that are prefixed
with `.`.

### Reset Paths

The next step is identifying any files that have been listed for discard that
are also staged in the index. While Desktop doesn't stage files itself, a user
might be using other tools alongside Desktop, so this is a sanity check before
proceeding to the next stage.

**Git CLI equivalent**: `git reset HEAD -- [path]`

### Checkout Paths

The last step is to replace the modified files in the working directory with
whatever is currently in the index - this ensures that Desktop only replaces
files that the user has chosen to discard.

**Git CLI equivalent**: `git checkout-index -f -u -- [path]`
