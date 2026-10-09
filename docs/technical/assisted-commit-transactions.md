# Assisted commit transactions

This is the backend engine for plan-first assisted commits. It does not itself
invoke Copilot, wire a UI callback, or push. The
[AppStore run integration](assisted-commit-runs.md) owns the real Changes action,
consent, Git reader coordination, cancellation and local acceptance.
Manual commits keep their existing behavior.
The separate [assisted commit planner](assisted-commit-planning.md) proposes
snapshot-only messages and groups, and returns this engine's checked capability
after full validation. It does not execute the capability.

Real-Git fault tests match exact physical filesystem paths, including missing
lock paths, rather than Git/native separators or Windows short-name spellings.
Filter fixtures compare cwd/worktree directory identity and reject a different
directory; path aliases do not weaken transaction ownership checks.

## Interfaces and lifecycle

The public API is exported from `app/src/lib/git/assisted-commit`. Snapshot and
plan types live in `app/src/models/assisted-commit.ts`; the UI request remains
`ICopilotAssistedCommitRequest`.

`withAssistedCommitSnapshot(repository, request, operation, options)` is the
preferred resource scope. It captures a snapshot and disposes private metadata
and indices even if analysis throws or is cancelled. Low-level callers must pair
`captureAssistedCommitSnapshot` with `disposeAssistedCommitSnapshot`.

Only `snapshot.analysis` may be supplied to the planner. It contains opaque
change IDs and selected-only diffs, including original unchanged context. It
never includes unselected working-tree changes. IDs are stable within one
snapshot, not between captures. Binary changes expose diff metadata, not binary
content. The rest of the snapshot is Desktop-owned recovery information.

`validateAssistedCommitPlan(snapshot, unknownProposal, options)` checks the whole
proposal and returns an opaque validated capability. Each commit must have a
nonblank single-line title, an optional string description, and snapshot IDs.
Ownership must be exhaustive and exactly once. Unknown fields, paths, patches,
blobs, IDs, empty groups, duplicate/missing IDs, and forged capabilities fail.
Every cumulative tree is materialized from the original frozen base before any
real commit. Every commit must change its predecessor's tree, and the final tree
must exactly equal the selected tree.

`createSingleAssistedCommitPlan` requires an explicit reason and a message
covering the **entire** selection. It never takes the first title of a failed
split. Only uncertainty or `unsafe-plan` permits this fallback; `invalid-plan`
is an error. With no selected changes and allow-empty enabled, the caller supplies
one nonblank title with reason `empty-selection`, without invoking a planner.

```ts
const result = await withAssistedCommitSnapshot(
  repository,
  request,
  async snapshot => {
    const proposal =
      snapshot.analysis.changes.length === 0
        ? createSingleAssistedCommitPlan(snapshot, {
            reason: 'empty-selection',
            title: 'Empty commit',
          })
        : await planner.propose(snapshot.analysis)

    const checked = await validateAssistedCommitPlan(snapshot, proposal, options)
    return executeAssistedCommitPlan(snapshot, checked, options)
  },
  options
)

if (options.signal?.aborted) {
  await rollbackAssistedCommitTransaction(result, options)
} else {
  await verifyAssistedCommitTransaction(result, options)
  // Immediately before push starts, or before returning to the ready state.
  finalizeAssistedCommitTransaction(result)
}
```

For an opted-in push, AppStore instead calls
`prepareAssistedCommitTransactionForPush` from the native push spawn preparation.
It verifies the retained result and destination under real HEAD/ref/index fences,
awaits owned fence cleanup, then returns a one-shot synchronous acceptance check.
The backup remains reversible until that check runs immediately before native
push invocation. A cleanup, selected-file, index, ref, authorization or signal
failure cannot launch a push. Once invoked, finalization has revoked rollback:
even an aborted hook or unknown remote outcome retains every created local commit.
The surrounding Desktop lease, not native file locks, protects the full network
operation and its ordinary post-push side effects. Push retry has its own frozen
intent and never uses a recovery token.

Execution consumes the accepted snapshot and removes its private files. The
opaque result retains an in-memory original-index backup for cancellation after
the last local commit but before a future push. `rollbackAssistedCommitTransaction`
rechecks ownership and restores only this run. `verifyAssistedCommitTransaction`
rechecks retained success after caller-owned awaited steps, including selected
bytes and the installed index. `finalizeAssistedCommitTransaction`
releases that capability without Git operations. A failed rollback retains it
for a caller-directed retry or explicit finalization.
Cleanup failures retain owned handle/path obligations too. Recovery retry must
complete that cleanup before reporting success; finalization refuses to discard
a capability while an owned handle, lock or private metadata remains unresolved.
This applies to index locks and parent-owned HEAD/branch guards alike.

## Frozen content and supported selections

Capture resolves the repository root, actual Git metadata/index paths, complete
HEAD identity, and original index bytes. It freezes selected filesystem bytes,
file type, executable mode, inode/device identity and modification/change times,
hashes those bytes using Git's clean/attribute semantics, then verifies capture
consistency. A selected file modified and restored during capture is conservatively
rejected even when its final bytes match; a metadata-only selected-file change
also requires recapture. Unborn and detached HEADs, full
SHA-1/SHA-256 IDs, and linked worktrees are supported. No `.git` directory or
shared-index-path assumption is made.
Shallow boundaries and symbolic remote refs are preserved in the private view.
Effective attributes are frozen from the original index plus existing working-tree
attribute files along selected paths. Missing `.gitattributes` files retain Git's
indexed fallback; the private `GIT_ATTR_SOURCE` therefore normalizes exactly the
diff whose unified-line indices Desktop selected.
An inherited `GIT_ATTR_SOURCE` is resolved to its frozen full tree object ID
instead of being replaced by working-tree attributes; later HEAD changes cannot
change that policy.
System and global attribute sources, including Git's implicit default global
path, are copied into private metadata with system-before-global precedence.
Native conversion and partial certification both use that frozen attribute
policy rather than rereading external attribute files.
Disabled or absent attribute sources, including inherited `GIT_ATTR_NOSYSTEM`,
retain their absence policy; genuine lookup errors remain observable.

Text changes are represented at selected hunk level. Partial selection uses the
same `DiffParser` unified-line indices as Desktop. The selected blob is built from
the frozen base, retaining unselected deletions and omitting unselected additions.
Each cumulative subset splices original byte-line ranges, never offsets from a
live diff or a new HEAD. Separate hunks may be committed in either order.
Textconv partials are rejected for named drivers and the `diff.default` fallback;
displayed converted indices are never applied to raw bytes.
Literal drivers named `set`, `unset`, or `unspecified` are treated as ambiguous
attribute outputs and their named textconv settings are checked too.
When a named driver has no explicit textconv and default textconv exists,
capture conservatively rejects the partial rather than guessing whether Git's
driver registration falls back to converted text.
Partial capture additionally certifies its frozen hunk/line identity against a
read-only native index-aware diff, with optional index-refresh locks disabled.
Certification compares exact line content, including trailing carriage returns,
not merely CR-stripped text or hunk shape.
Conversion mismatches such as previously indexed CRLF with newly enabled
`core.autocrlf` fail explicitly instead of applying selected indices to other
lines; current working-tree bytes and original staging remain untouched.
Addition-only partial requests (`New`/`Untracked`) are rejected if the frozen
HEAD already has that path, rather than reinterpreting `/dev/null` UI indices
against HEAD after an index-only change.
Tracked regular complete selections materialize frozen native index-aware
binary/full-index diffs from owned copies of captured bytes in a private
conversion worktree, preserving ordinary Git's legacy
indexed-CRLF conversion semantics. Native conversion uses frozen configuration,
attributes and a HEAD-seeded isolated index, matching ordinary Desktop's clearing
of prior staging. Previously staged deletion/type/mode metadata cannot replace
a present selected file or its captured mode. Stable internal patch prefixes are
independent of user diff-prefix configuration. Only capture reads live files;
later trees and commits use those frozen canonical blobs.
Native conversion itself never rereads selected paths in the original worktree,
so swapped/restored ancestor directories cannot substitute unselected bytes.
Clean/process filters still execute with the original root as cwd and
`GIT_WORK_TREE`, while their stdin comes from frozen captured copies.
Internal full-conversion patches always have context, independently of
`diff.context` and inherited `GIT_DIFF_OPTS`; planner-visible hunk boundaries
retain display configuration.
Internal single-path conversion disables orderfiles, so relocating frozen inputs
does not change relative `diff.orderFile` lookup or require unselected files.
Internally parsed diffs disable `diff.suppressBlankEmpty` so unchanged blank
context remains parseable without changing hunk indices or content.

Binary/non-UTF-8 changes, full deletions, empty files, renames/copies, symlinks,
mode changes and large full-file changes are atomic. A rename removes its
original HEAD path and adds its frozen destination. An unselected recreated
source is neither included nor watched. A selected file is watched in its
entirety, even if only some lines are selected.

Hunk splitting supports up to 4 MiB of combined base and cleaned full-file bytes
per path, inclusive. Larger full selections are atomic; larger partial selections
are an explicit unsafe condition, never broadened to the whole file.
Tracked symlink placeholders with `core.symlinks=false` retain their `120000`
type and literal target bytes even though the filesystem entry is a regular file.

Unsafe selections fail explicitly: conflicts or pending merge/rebase/cherry-pick/
revert/bisect operations, submodules (including dirty-only changes), symbolic
branch aliases, filesystem-symlink HEAD files, non-file ref backends, overlapping
selected rename paths, partial
rename/copy/symlink/binary/large/mode-changing changes, text-converted partial
diffs, unsupported filesystem types, symlink ancestors, and selections containing
no changed lines. Replacing a tracked directory with a file is unsupported.
Replacing a tracked file with selected child paths is supported; an ordering that
adds a child before removing the blocking file is `unsafe-plan` and can use an
explicit single-commit fallback. Paths are literal, NUL-delimited where needed,
and may contain supported spaces, Unicode, quotes, tabs, newlines or leading
dashes. Windows filesystem restrictions still apply.
Replacement refs and grafted history are rejected because their interpreted tree
can introduce an unselected delta relative to the raw original HEAD.

## Git execution and hooks

No general-purpose staging API is exposed. Capture and validation construct only
private indices from frozen entries and suppress index hooks during analysis.
Objects use the original object database; disposing or rolling back leaves
unreachable objects for Git's normal garbage collection.
Automatic GC and maintenance are disabled in the private repository: its frozen
ref view must never prune objects owned by current refs or other worktrees.

Execution uses temporary repository metadata, a private HEAD with the original
branch identity, frozen effective configuration (including conditional includes),
frozen refs, the original object database and the original working-tree root.
Configuration is read underneath the trampoline wrapper, so transient
`credential.helper=desktop` overrides are not persisted into private metadata.
The query-only legacy `GIT_CONFIG` selector is cleared for effective configuration
capture and private queries, never substituted for ordinary execution policy.
Native hook children retain the user's functional underlying credential policy.
Hooks using ordinary Git environment variables see the private HEAD/index.
Hooks hard-coding `.git`, reading reflogs, or requiring current external ref
changes are not equivalent to this isolated view; hard-coded real ref/index
interference is detected, not overwritten. Hook side effects in the working tree
are never undone.

Each `git commit -F -` gets the same captured trailers, sign-off, and skip-hooks
options. `formatCommitMessage` provides existing formatting/trailer conventions.
Skip-hooks uses existing Desktop `--no-verify` semantics. Existing hook
Message/trailer formatting runs sequentially in the same private environment and
frozen configuration. No failed formatter can leave a second native formatting
process running after recovery. Commit parent validation follows Git's contiguous
parent-header block, rejecting misplaced headers rather than trusting text that
Git ignores. Existing hook
interception, progress, terminal output and `abort | ignore` callbacks are reused.
Hook discovery uses the same private Git environment/configuration as execution,
so a later original-repository `core.hooksPath` change cannot silently drop a
captured hook from the interception proxies.
Private hook children also retain the captured non-proxy Git parameter policy,
so login-shell `GIT_CONFIG_PARAMETERS` cannot replace that hook location.
Ignoring a failed hook continues the **current** operation; later commits still
run their hooks unless skip-hooks was selected. A hook-created wrong tree, parent,
or unintended staged entry fails before that commit is published.

`AbortSignal` cancellation is cooperative: in-flight Git must settle before its
actual full tip is inspected and recovery starts. Callers may use the existing
hook-progress abort control, but must not abandon the executor promise.
Progress observers are awaited at safe boundaries. `committed` is progress, not
transaction completion or permission to push; await the executor result.

## Ref/index ownership and recovery

Each verified commit is published with `updateRefWithVerification`: Git prepares
a compare-and-swap ref transaction, holds its ref locks (including implicit HEAD
locks), and Desktop verifies the original full HEAD identity before allowing it
to commit. This guards even a switch to another branch at the same SHA.

The real index remains unchanged through analysis and execution. Execution holds
its exclusive lock, compares original bytes again, and synchronizes it only after
all commits succeed. Success matches ordinary Desktop commit semantics: the index
becomes the final selected tree, clearing pre-existing staging rather than
including it. Unselected current working-tree bytes remain untouched. Any
concurrent index change, including a conservative byte-only refresh difference,
is rejected rather than overwritten; callers should avoid index-refreshing
status requests while a snapshot is active.

On cancellation, selected-content mutation, declined hook failure, Git failure,
or observer failure, recovery compares the exact run-owned tip and full original
ref, then restores the original ref or deletes an unborn branch with an old-value
guard. It never uses hard reset, checkout, stash, amend, push or deletion of commit
objects. The original real index is kept, or restored from the in-memory backup
only while its installed bytes are still owned by the run. If external history
owns HEAD, recovery also refuses to replace the index beneath it.
Restoration retains the original index-file timestamp. Reinstalling identical
stat-cache entries with a newer file timestamp would defeat Git's racy-stat
protection and could hide same-second, same-size selected working changes.
Exclusive-lock initialization is exception-safe: cleanup closes the handle and
removes only a verified owned inode, surfacing any failure rather than leaving
a success-shaped orphan.
Ownership is registered immediately after exclusive creation, before the first
inode query. If identity cannot yet be observed, the handle stays retained and
open for a safe retry rather than discarding the ability to verify its inode.
Index-only retries recheck the complete original HEAD identity and hold Git's
file-backend ref/HEAD locks across index restoration. If Git fails after a
rollback ref update,
recovery observes the actual restored target, preserves the command failure, and
keeps subsequent recovery retryable rather than repeating an obsolete CAS.
Publication retains its attempted verified commit before invoking Git. If the
publication and immediate observation both fail, recovery resolves the actual
tip from known verified run commits, preserving both failures and safely undoing
either the confirmed prefix or the newly advanced tip.
Final successful index synchronization holds the same ref/HEAD guard at the
last run-owned tip. These non-ref mutations use parent-owned lock files, retained
until every pending filesystem operation settles; a Git child exiting cannot
release ownership while an index rename is pending. Publication still uses Git's
prepared CAS transaction. Guarded actions are always joined, including Git-process
failure paths. Integrity reads disable replacement
interpretation, and private replacement/graft state introduced by hooks is
rejected before publication.

`AssistedCommitError` retains its cause and a typed code. Executor failures include
`recovery`: original snapshot/selections, verified created full SHAs, expected
rollback tip, observed HEAD, history/index outcomes and recovery errors.
`recovery-failed` requires attention; it is never presented as a successful
rollback. Caller-owned selection restoration uses `snapshot.originalSelection`.
After selected-file mutation, refresh/reconcile line selections with current
diffs rather than blindly reusing old line offsets or restoring old bytes.
Failed automatic executor recovery also supplies an opaque `recovery.retryToken`.
Pass it to `rollbackAssistedCommitTransaction` after interference is resolved,
or to `finalizeAssistedCommitTransaction` to explicitly release the retained
in-memory backup once cleanup has completed. Private metadata is normally already
disposed; a failed disposal or lock close/unlink remains an explicit retryable
obligation. Close failure does not skip ownership-checked lock removal, and no
recovery retry reports success while a run-owned resource remains unresolved.
The preferred snapshot scope preserves `error.recovery` and its retry token if
its own final disposal also fails, appending the additional cleanup error.
