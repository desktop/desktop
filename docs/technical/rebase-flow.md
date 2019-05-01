# Rebase Flow

This document outlines the technical details about the rebase flow as
implemented in GitHub Desktop. It is intended to be a simple subset of what is
technically possible to do with the `git rebase` command line interface, and
various decisions have been made along the way to support this flow.

## Testing the rebase

When the user is choosing which branch to rebase the current branch on, the
application is expected to test and identify whether there will be problems with
the rebase:

 - In the "happy path" case, there will be no conflicts when rebasing this
 branch on top of the chosen branch, and the number of commits that will be
 rebased is shown

 - If conflicts are expected that the user is required to resolve to rebase the
 current branch on top of the chosen branch, the application should provide a
 warning. Ideally the application would be able to identify the absolute number
 of conflicts, but because of the cascading nature of rebases (after the user
 resolves conflicts in one commit, the following commits may introduce conflicts
 that were not previously known) this is not able to be quantified definitively.

To work out this information, we need to _emulate_ a Git rebase and test out the
changes without making changes to the working directory or the Git index. To do
this, we need to:

 1. identify the commits that Git would apply from the target branch
 2. generate a patch that represents the changes the rebase would apply to the
   base branch
 3. test this patch and see if it applies cleanly to the base branch

Steps 2 and 3 are not currently implemented, but are being tracked in
[#6960](https://github.com/desktop/desktop/issues/6960).

The next section walks through these steps in more detail, referencing the
underlying Git implementation.

### Identifying the commits to rebase

The rebase flow that Desktop currently uses is the simple
`git rebase <upstream> <branch>`. In the rest of this document I will refer to
`<upstream>` as the **base branch** and `<branch>` as the **target branch**, to
differenitate from the upstream remote.

When `git` invokes `git rebase <upstream> <branch>` it performs these steps as
setup:

 1. confirm `<upstream>` and `<branch>` are valid references in the repository,
    and resolve the `oid` of each ref
 2. find the range of commits from `<upstream_oid>..<branch_oid>`
 3. generate a patch series of the contents, ready to rebase

### Detecting Conflicts

**TODO:** As part of detecting conflicts in [#6960](https://github.com/desktop/desktop/issues/6960)
there will be some words here eventually to help explain how the solution works.

## Warning about remote commits

If the target branch is tracking a remote branch and the user has enabled the
_Show confirmation dialog before force pushing_ setting enabled, before starting
the rebase Desktop will check if any commits exist in the range
`<upstream_oid>..<remote_branch_oid>`, where `<remote_branch_oid>` is the tip of
the tracking branch.

This check is important to identify any remote commits that will be caught in
this rebase, because this will require rewriting the history on the remote,
which the user may not have permission to do based on branch protections.

If commits are found, a dialog is shown to ask the user to confirm they wish
to proceed with the rebase.

## Reporting Progress

When the user launches the rebase, the application will run
`git rebase <upstream> <branch>` behind the scenes, which progress information
to `stdout` as it works through the process of applying commits to the base
branch to create the new history.

Desktop is able to parse this output and use in the application, but because
this is all working locally it is typically very fast on machines with good I/O,
the application will make the rebase appear slower than it actually is so that
it can transition smoothly between "progress" and the end states of the rebase
without confusing the user.

## Encountering conflicts

Once the `git rebase <upstream> <branch>` has completed Desktop inspects the
output returned by `git`. The rebase will end up in one of two states:

 - the commits from the target branch were applied cleanly, and the reference
   associated with the target branch now points  to the rewritten history on top
   of the base branch.
 - the rebase could not complete because one of the commits had conflicts when
   it was applied to the base branch, and the user needs to resolve these
   conflicts if the user wishes to resolve them

This section will focus on the second scenario, and what Desktop does to surface
this context to the user to help them figure out how to resolve conflicts.

When a rebase is in a conflicted state, the `.git` directory has
a bunch of helpful context to help the user orient themselves and to figure out
what is next.

#### Is a rebase in progress?

The `.git/REBASE_HEAD` file exists when the rebase is stopped because of
conflicts, and contains the commit ID of the current patch that cannot be
applied cleanly to the working directory

#### Details about the rebase

The information about what changes are being rebased can be identified found
from a few files:

 - `.git/rebase-apply/head-name` - the name of the target branch associated with
    the current rebase - may be prefixed with `refs/heads/`

**TODO**: can we confirm when this happens or doesn't happen?

 - `.git/rebase-apply/onto` - the commit ID of the base branch, which is used as
    a starting point to apply the commits from the target branch

 - `.git/rebase-apply/orig-head` - the original commit ID of the target branch

This information is especially helpful if Desktop encounters a repository which
had the rebase started outside Desktop but encountered conflicts - with this
information the application can identify the current situation and continue
with resolving conflicts without needing to restart the operation.

#### Details about the rebase progress

If a rebase was not started outside Desktop, or the rebase flow is paused, the
details about the progress state can be built up from these fields.

When a rebase encounters conflicts, the patches themselves are stored in files
in `.git/rebase-apply/` in numeric order of which they will be applied, e.g.
`0001`, `0002`, `0003` and so on.

**TODO**: can we confirm whether `9999` is the upper limit here for the rebase?

 - `.git/rebase-apply/next` - this contains a number representing the current
   patch being applied as part of the rebase.
 - `.git/rebase-apply/last` - this number contains the total number of patches
   that will be applied as part of this rebase
 - `.git/rebase-apply/orig-head` - the original commit ID of the target branch
 - `.git/rebase-apply/onto` - the commit ID of the base branch, which is used as
    a starting point to apply the commits from the target branch

The last two files, `orig-head` and `onto` can be used to generate a range of
commits which are part of the rebase, without needing to read all the patch
files in the directory.

## Completing the rebase

After detecting that the user has resolved all conflicts in the working
directory - both in files with conflict markers and files requiring a manual
resolution ("ours" or "theirs") - the rebase flow will determine what the next
rebase action should be.

After staging all the tracked files, if there are no changes in the index this
means the current commit is a no-op and the changes it contains are already
available in the base branch. This means the commit can be omitted by the
rebase by running `git rebase --skip`.

If there are changes in the index after staging all the changes, the rebase flow
will run `git rebase --continue` to indicate the current commit should be
updated and used in the rebased branch.

And like before, the rebase flow will monitor the output from this new rebase
command and report progress, until it either completes or encounters conflicts
again.

## Aborting the rebase

If the rebase encounters conflicts, the user has the opportunity to abort the
rebase if they feel uncomfortable with proceeding.

If the user has resolved conflicts before trying to abort, the rebase flow will
ask the user to confirm they wish to abort the rebase, as those changes will not
be available if they proceed.

## Force Push

When the rebase is completed, the application will update its list of rebased
branches to indicate that the current branch was updated by the user and is
eligible to be "force pushed" to the remote repository.

This has potential downsides, so there are additional checks as part of this
work:

 - only a branch that completed the rebase flow in Desktop will be eligible for
 a "force push" operation - branches rebased outside Desktop will be ignored
 - other branches which are ahead and behind will need to have these commits
 resolved before any commits can be pushed. Depending on your Git configuration,
 this could be a `pull with rebase` or a `pull with merge` commit
 - if the user has enabled "Show Confirmation Dialog before Force Pushing"
 (enabled by default), the user will see a prompt that explains the downstream
 impact of rewriting the branch for other contributors
 - when Desktop invokes `git push` it will also pass the `--force-with-lease`
 flag that guards against the tracking branch being updated without the user
 knowing, to avoid overwriting newer commits since the rebase was completed
