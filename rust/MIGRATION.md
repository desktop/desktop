# Full migration and legacy-removal ledger

The requested end state is a Rust implementation with a complete headless CLI,
GitHub CLI integration, reusable web UI over localhost/WebSocket on Termux, and
an optional Wry/Tao desktop host. Electron/Node backend code, bundled Git
wrappers, native Electron modules, and their obsolete build/test/release
pipeline must be removed after verified replacement. Keeping both
implementations indefinitely is not the final architecture.

## Removal gates

- [ ] Inventory and replace every user-visible legacy workflow, including
      GitHub, credentials, repository management, settings, integration and
      recovery paths.
- [ ] Move reusable upstream web components/models/styles/assets into a
      standalone frontend; replace their Electron, Node, and synchronous IPC
      dependencies.
- [ ] Complete typed Git workflows with normal and failure/recovery coverage.
- [ ] Complete GitHub operations through `gh`, including PRs, issues, checks,
      enterprise/authentication, and actionable authentication/network failures.
- [ ] Repository creation/clone, multi-repository persistence, branch upstream
      state, history/diffs, selection/partial staging, binary/image diffs, and
      conflict UX.
- [ ] Implement and validate optional Wry/Tao host on supported desktop targets;
      keep Termux builds free from desktop-only dependencies.
- [ ] Validate actual browser user journeys, reconnects, large repositories,
      Unicode and byte-exact filenames, command cancellation, security, and
      state consistency.
- [ ] Replace root build commands, CI, tests, packaging, and developer
      documentation with the migrated paths and preserve attribution/license
      assets.
- [ ] Remove legacy source, packages, native modules, Electron assets/scripts,
      and stale documentation; verify no required runtime/build references
      remain.
- [ ] Build and exercise the resulting repository without legacy directories
      present.

No gate is satisfied by CLI passthrough alone, source counts, or the existence
of a replacement file. Legacy removal requires runtime evidence of replacement.

## Current evidence

The Rust workspace implements typed repository snapshots and common Git
workflows, a CLI and browser bridge/client, authentication and change events.
Repository creation/clone, saved selection and atomic registry updates now have
Rust implementations and offline CLI/server integration coverage.
`tests/workflows.py` exercises real local Git workflows, including conflict
recovery and a local remote. `tests/smoke.py` exercises the authenticated server
and argument forwarding. Unit tests cover status parsing and output limits.
These are partial replacement evidence, not a full parity certification.

The GitHub panel now reuses Row, Form, HorizontalRule, and HighlightText moved
from the upstream UI into shared frontend source. Legacy entrypoints re-export
the migrated implementations. Standalone build tests prove this frontend does
not depend on the Electron app, while wrapper build tests preserve existing
imports. DOM interaction tests cover GitHub flows, unsafe content, and stale
replies; actual browser rendering is still unverified.

Typed gh services cover auth status, repository details, PRs, issues/comments,
checks, and workflow runs. Offline adapter tests cover arguments and body text;
installed-gh integration tests use a local HTTPS mock API. Live authentication,
enterprise account switching, comprehensive upstream parity, richer diffs,
custom-filter/large-file diff parity, and complete native platform validation
remain outstanding.

The Cargo workspace now starts at the repository root. A dedicated Rust/frontend
CI workflow replaces those checks for migrated code; the legacy release and
packaging pipeline still requires migration.

## Structured diff replacement evidence

Rust now captures structured file diffs and supports versioned line/hunk staging
and unstaging through the CLI and browser. Index transactions use Git's own
lock, preserve unrelated entries, and reject stale views. The integration suite
covers new/deleted files, no-final-newline content, CRLF/encoding conversion,
raw paths, images/binaries, renamed content, split indexes, SHA-256
repositories, and linked worktrees. WebSocket tests exercise the same
operations.

The React diff viewer reuses moved DiffLine/raw-diff models. DOM tests cover
hunk and line selection, token forwarding, stale responses, image/binary states
and unsafe content; model tests cover the corrected hunk-size equality
comparison. Both React panels now share one `panels.js` bundle, replacing the
earlier single-panel scaffolding artifact.

The remaining diff gap includes arbitrary filters/LFS extensions, large-file
streaming and virtualization, batch/submodule discard, complete history
search/compare UX, remaining image formats/rendering validation, and the
remaining conflict/undo and native integration workflows. Legacy diff/apply code
is retained until those semantics and their callers are replaced; typed partial
staging alone does not prove all upstream apply/patch behavior is migrated.

## Shared image comparison replacement evidence

The upstream Image/ImageDiffType models, sizing helpers and image presentation
components now live in `web/src/upstream`. Their legacy entrypoints re-export
those implementations. The standalone diff panel uses the same modified/new/
deleted image views for captured working, staged and historical images,
including verified LFS payloads. Modified images offer 2-up, Swipe, Onion Skin
and Difference; the byte summary handles zero sizes and describes relative
change. Only allowlisted image data URLs are accepted. Failed browser decoding
produces a visible message without a repository mutation. Browser resize
observation and window timers replace Node's immediate timers, with teardown on
unmount and a window-resize fallback when ResizeObserver is unavailable.

The DDS conversion helper and its existing pinned parse-dds dependency moved
with the shared ImageContainer so legacy opt-in imports remain browser-only.
This is not a claim of Rust DDS previews or validated WebGL rendering. The Rust
service currently captures PNG/JPEG/GIF/WebP/BMP; ICO/AVIF/DDS capture, larger
images and actual native/browser pixel rendering still need validation or
implementation. Raster fixtures in DOM tests do not prove GPU compositing.

Bundle tests exercise old imports through the moved implementations without
Electron/Node backend dependencies. Component tests cover all comparison modes,
sliders, natural dimensions, resize, single-version and mixed-content states,
unsafe MIME/URL inputs, decode errors, history and cleanup, including the
window-resize fallback without ResizeObserver. The full localhost client test
receives two distinct real PNG captures from Rust, switches all four modes and
verifies that the index and HEAD are unchanged by viewing. It also
stages/unstages the whole PNG and opens the actual staged capture while
preserving unrelated index entries. Existing Git/LFS diff suites cover payload
capture and conservative binary selection boundaries. The generated frontend
embeds upstream and bundled runtime license notices, including parse-dds, so
Rust distributions retain them without node_modules. Termux checks passed
standalone formatting/type checking, all 16 frontend tests, all-feature Clippy,
18 Rust tests, Git/LFS diff regressions and the full client with and without
optional Git LFS. Actual browser/GPU pixels remain unverified. Legacy diff
selection and operation callers remain under their other removal gates; moving
these presentation components does not certify complete parity.

## Discard, journal, and undo replacement evidence

Rust now implements reviewed whole-file discard from HEAD (working file plus
selected index entries), working-only restore from the index, and selected-line
discard that preserves staged changes. Staged renames include both paths. The
CLI, authenticated WebSocket protocol and React review/undo panel share these
operations. Undo IDs have their own `undo_id` field, avoiding collision with RPC
request IDs; the complete client/server test covers that wire contract.

Plans certify raw file bytes, permissions, HEAD, index and restored output.
Whole-file filter output and backups stream to disk beyond the preview limit.
Directory-handle filesystem operations refuse symlink parents and replace links
without following their targets. Git index/HEAD/branch locks fence publication.
Original data, staged blob contents and shared-index bases are durable before a
prepared record permits replacements. Undo can recover a partial publication and
rejects newer edits, changed operation context and corrupt backups. Normal undo
preserves unrelated staged entries; special index flags use an exact index
snapshot and stricter stale-index guard. Completed backups can be explicitly
deleted; prepared records require recovery.

`tests/discard.py` covers working/staged/selected changes, raw filenames, new
and deleted files, staged renames, simulated interrupted recovery, corrupt/stale
undo, private backups, executable permissions, 12 MB binary data, symlink
targets, CRLF/custom filters, required filter failure, locks and intent-to-add
flags. `tests/discard_advanced.py` covers unborn and unmerged indexes, sparse
flags, UTF-16/CRLF conversion, SHA-256/detached/linked worktrees, symlink-parent
fences, HEAD/ref locking and cancellation during a smudge. `tests/discard_gc.py`
prunes the original staged blobs and removes split-index bases, then proves undo
reconstructs the data and original flags from the independent journal. DOM tests
cover reviewed confirmation, token/line forwarding, undo, explicit deletion and
stale roots; the complete client test runs discard/undo against the actual Rust
server.

This replaces the common discard path, not all legacy trash/platform and patch
semantics. Multiple-file batches, submodule reset/discard, reftable ref fencing,
arbitrary-filter/LFS-extension line selection, backup export/retention policy,
ownership/ACL and full native filesystem behavior still need
implementation/audit. Legacy apply/store/shell callers remain until those
workflows and their UI are moved.

## Git LFS replacement evidence

Rust `lfs_status` replaces tracking-pattern and per-file filter checks with a
read-only Git LFS 3.8.1 pattern reader and batched NUL-framed Git attributes.
Native `git lfs track --json` initializes the local format version even when
listing, so it cannot implement a passive query. The replacement preserves
native discovery, unstable equal-length source ordering, macro expansion,
quoted/raw names, duplicate/exclusion rules and global/linked-worktree sources.
It honors `GIT_ATTR_NOSYSTEM` where native Git LFS 3.8.1 fails, and accepts the
native supported/missing local format without writing it. Unknown formats fail
with a fixed error. Regular files and their symlinks have cancellable bounded
reads; special files cannot block a worker, and source/output budgets stop
unbounded allocations without returning partial patterns.

The recorded native oracle has 34 pattern cases (100 exact ordered rows) and
18 local-format cases. The Rust reader matches them with complete fixture-tree,
config and index snapshots unchanged. The oracle documents its narrow native
system-path shim, platform coverage and intentional read-only corrections.
Additional unit cases cover FIFOs, symlinks and input/output amplification.
The actual CLI fixture lists manually authored rules before any LFS setup and
preserves configuration, hooks, working attributes and the absent cache. Both
real LFS setup/payload recovery and transfer/tracking suites pass, along with
the localhost upstream client that originally detected the configuration write.
Ported Git LFS/wildmatch and Go ordering licenses and source references are in
`THIRD_PARTY_NOTICES.txt`.

Missing optional tooling is reported separately from path tracking.
`lfs_install` explicitly selects local/global filters, optional hook
installation, force and skip-smudge behavior. The CLI and React panel expose the
same protocol. Transfers, cached checkout and tracking/untracking also have
typed operations; other LFS commands remain available through system-Git
passthrough.

Version 2 undo journals retain original Git pointer blobs plus the actual LFS
payloads, including historical noncanonical pointers and extension fields kept
verbatim. Independent private backups are verified against pointer SHA-256 and
size, restored to the effective configured cache with no-replace publication,
and survive cache eviction plus Git object pruning. Cache locations containing
newlines are refused rather than parsed as a different directory. Old version 1
journals remain readable with their original recovery coverage. Missing/corrupt
staged payloads stop new discards before working-file/index publication; undo
never replaces a corrupt existing cache object. Android uses no-replace rename
because hard links are denied in the tested Termux filesystem.

`tests/lfs.py` uses real Git LFS offline under isolated configuration: hook
conflicts/force, global skip-repo setup, exact raw filenames, 4.8 MB payloads,
cache/object eviction, corrupt backups/cache objects, symlink refusal,
noncanonical/empty pointers, custom and moved storage, raw repository roots,
linked worktrees and SHA-256 repos. The React test checks explicit setup, safe
text, scope forwarding and stale replies; the complete client test exercises
inspection through the actual Rust bridge. Termux validation uses a
checksum-verified Git LFS 3.8.1 package extracted under the user's home; no
system install or user-global Git configuration was changed.

Working, staged, historical and conflict previews now materialize ordinary LFS
payloads from the configured local cache. Readable previews certify SHA-256 and
size; missing/corrupt/inaccessible cache entries and extension pointers are
explicit states, and oversized payloads retain metadata without reading their
contents. The cache reader refuses shard/leaf symlinks and opens special files
without blocking on a FIFO. Staged rename lookup reuses the history name-status
parser over an index-only query, avoiding working-file filter execution.

Versioned selection now supports ordinary LFS text for staging, unstaging and
reviewed discard. It assembles selected payload bytes, lets Git apply its LFS
clean filter, then verifies both the resulting pointer and cached body before
index publication. Git blob IDs, payload states and LFS filter/extension
settings are included in the selection certificate. Configured extensions
disable partial selection. The CLI and React diff/recovery surfaces expose the
same payload metadata and retain whole-file choices for unsupported content.

`tests/lfs_diffs.py` exercises real payload diffs and selected operations under
isolated local configuration, including failed/changed filters, selected undo,
image/binary/large data, missing/corrupt/symlink/FIFO cache entries, raw names,
custom storage, SHA-256 Git blobs, linked worktrees and split indexes. A local
HTTP observer checks that missing-object previews never request a transfer, and
cache/index/working-file guards check that read operations leave data unchanged.
The React test covers all payload states and selection controls. With Git LFS
installed, the complete client test renders a real payload and stages/unstages
its selected lines through the actual Rust WebSocket bridge.

Standalone global filter setup (`global` + `skip_repo`) and tooling inspection
now work without a selected repository, through both CLI/typed JSON and an empty
authenticated bridge. The React panel defaults to that scope before a repository
is opened. Its full-client test starts empty, performs global setup, opens the
fixture repository, then exercises a dry-run and real upload to a local
bare-repository LFS store plus selected staging/unstaging.

Typed `lfs_transfer` fetch/pull/push, cached checkout and tracking/untracking
operations are now exposed by the CLI and React panel. They cover refs pinned to
commit IDs, all/recent/refetch and dry-run options, include/exclude filters,
glob checkout, literal filename rules and lockable permissions. The LFS runner
clears inherited pathspec environment settings: direct Git's literal-path flag
otherwise silently suppresses Git LFS's internal attribute queries on current
Git. Tracking refuses symlink/special .gitattributes files and parent traversal;
Git LFS owns the underlying multi-file mutation behavior. The UI refreshes even
after an error, because an operation can have partial effects.

`tests/lfs_operations.py` uses actual local bare-repository LFS storage to prove
uploads, filtered downloads, cached checkout, pull, refetch and all-ref
behavior. It verifies that fetch leaves working pointers intact, pull preserves
edits, checkout preserves an outside symlink target, and tracking leaves index
content and unrelated rules intact. Empty-service RPC and standalone CLI setup
use an isolated global configuration. Hook-conflict coverage preserves custom
hooks, checks partial global setup, redacts hook contents and verifies explicit
force replacement. A local HTTP service proves credential-safe failure responses
and interruption of an in-flight transfer with lock cleanup. DOM tests cover
operation options, scope defaults, literal pattern spaces, refresh on failure
and stale results. Native/live-service transfer behavior still needs the
corresponding platform and authentication audits.

Legacy `lfs.ts` service mappings are now explicit:

| Legacy helper                             | Rust replacement                                                                                                         |
| ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `installGlobalLFSFilters(force)`          | `lfs_install`, global scope with skip-repo                                                                               |
| `installLFSHooks(repository, force)`      | `lfs_install` in the selected repository, global scope for the original configuration behavior                           |
| `isUsingLFS(repository)`                  | `lfs_status.using_lfs`                                                                                                   |
| `isTrackedByLFS(repository, path)`        | NUL-framed `lfs_status.files[].tracked`                                                                                  |
| `filesNotTrackedByLFS(repository, paths)` | Batched status data for general callers; staged-blob commit review replaces the oversized-file warning in the new client |

The app-store/startup/dispatcher and changes-sidebar callers still retain their
Electron flows. Source audit found no dedicated lock-management API/UI in those
legacy LFS paths; native locks remain available through Git passthrough, and
additional typed lock management is not claimed here. Remaining LFS audits
include extension/reference-cache previews, native filesystem behavior, and
transfers beyond the current 120-second/output bounds. Those limits and
remaining legacy callers prevent a full removal claim.

## LFS startup and repository initialization replacement evidence

The standalone client now replaces `App.componentDidMount`'s non-forcing global
LFS setup and the store/dispatcher initialization prompt. Its independent
`lfs_tool_status` operation probes optional tooling without repository discovery
or configuration writes. When tooling is present, client startup requests global
`lfs_install` with `force: false` and `skip_repo: true`. A conflict stays intact
and shows retry, explicit filter replacement and Not now actions. Starting a
headless bridge alone does not mutate global Git configuration.

When an opened/selected repository uses LFS rules, the client asks before
initializing repository hooks and global filters. The first requested install
preserves custom hooks. Only a separate replacement action uses `force: true`.
Failed initialization refreshes state because Git LFS may have installed some
configuration or hooks before failing. Failed inspection has a read retry,
without offering replacement of uninspected hooks. Successful initialization or
dismissal is remembered per repository during the page session. Generation
guards invalidate reads and mutation replies synchronously on root changes;
reconnecting never replays installation. The existing manual setup panel still
supports local scope and skip-smudge choices.

DOM tests cover startup conflicts, non-forcing behavior, explicit recovery,
missing tooling, per-root dismissal, inspection failures and late root results.
The full client test uses real Git LFS with an isolated global configuration,
observes automatic global setup, opens an LFS fixture, preserves a conflicting
custom pre-push hook, hides its contents from the error, and replaces it only
after the explicit action through the real bridge. CLI/empty-service tests
exercise the tooling-only operation independently of selected-repository IDs. A
real global-filter conflict test preserves the custom value, redacts it from the
failure response and replaces it only on the explicit force request. Rust
formatting, all-feature Clippy, 18 Rust tests, frontend formatting/type checking
and 13 frontend tests passed, along with real LFS operations and bridge smoke
tests. The full localhost client passed both with the private Git LFS tool and
with Git LFS unavailable on the normal Termux PATH. Native smoke CI isolates its
Git configuration; that CI remains unexecuted from this Termux session. Root
lint still needs missing legacy Node dependencies. The legacy startup/store/UI
files still depend on their surrounding Electron application; their behavior has
a replacement but whole-directory removal remains gated by the other workflows
and native platform validation.

## Oversized-file commit review replacement evidence

The legacy `large-files.ts`, changes-sidebar commit check and oversized-files
popup now have a replacement in `core/src/commit.rs` and the standalone React
commit panel. The legacy files remain while their surrounding Electron callers
are still retained. Review uses the real new/changed regular blobs staged for
commit, with replacement objects disabled and batch object-size metadata. It
handles unborn repositories, byte paths, split indexes, SHA-256 repositories and
linked worktrees. Files exactly 100 MiB are allowed. Proper LFS pointers are
small; oversized Git blobs with matching LFS attributes still warn and explain
that the file needs to be staged again after configuring filters.

`commit_preview` returns paths, object IDs, sizes and a certificate binding the
index bytes, HEAD and symbolic branch, operation context and warning metadata.
`commit` blocks oversized blobs without consent. The override requires a fresh
certificate; the browser requests review first and preserves repository-scoped
in-memory drafts on errors and repository changes. Changing message text clears
the current consent prompt. Ordinary commits keep native Git hooks/signing and
locking. The certificate is checked before invocation; hooks can subsequently
change the index, so this is not an atomic tree reservation. Typed commit clears
pathspec environment flags to preserve normal Git pattern behavior inside hooks.

`tests/commit_review.py` uses genuine 100 MiB and 100 MiB + 1 blobs, verifies
no-write rejection, stale index/HEAD/branch/operation/attribute reviews,
replacement refs, LFS pointers, raw names, rename destinations, hooks, split
indexes, SHA-256 and linked worktrees. The React test covers consent, escaping,
message edits, failed/stale responses and draft/root changes. The full localhost
client test covers successful ordinary and explicitly approved oversized commits
through the real bridge, alongside its existing cancellation and reconnect
journeys. These are DOM tests on Termux; physical browser/native journeys remain
unchecked. Termux validation passed workspace formatting, Clippy with all
features, 18 Rust tests, standalone formatting/type checking and 12 frontend
tests, the real full-client test, commit-review and existing
workflow/cancellation/signal suites, LFS operations, bridge smoke and 5
transport tests. Root `lint:fix` still stops at missing legacy `prettier`
dependencies. Large-repository performance and complete upstream commit callers,
including assisted commit flows, remain separate migration gates.

## History, tracking, and recovery replacement evidence

History now uses pinned, paginated commit IDs and length-framed batch object
reads. Root/merge file lists, rename paths, parent selection, and historical
read-only diffs have CLI, WebSocket, and DOM coverage. Tracking state includes
upstream refs and ahead/behind counts. Snapshot operation markers are read from
the actual working-tree Git directory.

Merge, rebase, cherry-pick, revert and am recovery are explicit typed
operations. Certified base/ours/theirs conflict previews support normal,
modify/delete, and binary conflicts; stale edited files reject old choices. Real
Git tests exercise merge continuation, missing-side deletion, binary resolution,
mainline replay, and abort recovery for cherry-pick/rebase/revert/am. The
browser has operation and branch controls, and history reuses migrated
commit/identity/author/branch/ remote models and pure trailer parsing. Legacy
entrypoints re-export them. The interim Webpack configuration now transpiles the
shared directory and resolves one app-owned React instance; the complete legacy
Electron build still needs validation before removal.

Complete history encoding/search/compare behavior, recovery edge cases and
remaining conflict orchestration still need audit before deleting the
corresponding legacy Git modules. Durable Undo for common conflict choices and
edited-file staging is described below.

## Stash workflow replacement evidence

The original `git/stash.ts` was audited for marker parsing, per-branch listing,
creation, reassociation, apply/pop/drop and file inspection. Rust now has a
structured stash list and typed save/files/apply/drop/move services, dedicated
CLI commands and a browser stash panel. The old unreviewed latest-entry browser
shortcuts were removed. Pure marker generation/extraction moved into shared
frontend source, and the legacy Git module imports/re-exports them.

Entries retain full object IDs, native reflog positions, trees/parents and
branch metadata. Saved working files, saved index changes and native
untracked-parent files feed the existing read-only historical diff viewer with
byte paths and pinned commit IDs. Apply uses the chosen object ID, optionally
restoring the index. UI pop/removal require explicit confirmation. A reviewed
list basis binds the selected ID/position; stale lists are refused rather than
selecting a newer entry. Common-directory OS locks serialize Rust stash
mutations across CLI processes and linked worktrees, with cancellation and
no-follow lock opening. These application locks do not reserve direct external
Git writers: exclusive fencing across the validation/native removal interval
remains an audit item.

Native Git owns stash conversion and recovery. Untracked files use its third
parent instead of being staged before saving, so their original distinction is
preserved. Failed/conflicted apply retains its stash, exposes normal conflict
controls and permits explicit removal after resolution. Pop keeps the saved
entry if a concurrent writer changes the list after successful application.
Reassociation saves the replacement before dropping the original, retaining both
when removal fails. Creation compares actual refs and reports a saved entry even
when Git subsequently reports an error; it does not infer success from localized
stdout or an empty error stream. Native LFS receives its normal internal path
handling rather than the bridge's literal-path environment.

`tests/stashes.py` exercises saved working/index/untracked content, ignored
files, read-only diffs, branch markers and reassociation, stale ID/position
reviews, older-entry application, successful/conflicted pop, conflict resolution
and explicit removal, raw filenames, SHA-256, split indexes, linked worktrees,
reftable, symlinks, concurrent Rust removals and lock cancellation. Additional
fixtures cover lock symlink refusal, an error after stash creation, a concurrent
native store during pop, replacement storage with failed removal and real LFS
index/working content. DOM tests cover safe text, byte paths, index views,
review/confirmation parameters, errors, disabled controls and stale-root
replies. A full localhost client journey saves and views the actual
staged/working data, applies with the saved index, reassigns a branch, refuses a
stale deletion, pops an older selected entry, resolves a conflicted pop and
removes the retained stash explicitly. This is protocol/DOM evidence; actual
browser pixels are not claimed.

Common per-branch leave/bring checkout orchestration is now implemented below.
Import of legacy store state, nested stash orchestration, very large lists and
remaining native/filter edge cases still require audit. The legacy stash store/
callers remain until those workflows migrate; this does not certify the entire
upstream stash subsystem for deletion yet.

Termux checks passed all-feature workspace build/Clippy, 19 Rust tests, 23
frontend tests, six transport tests, all three localhost client journeys, the
real Git/LFS stash suite, existing workflow regressions and bridge smoke. The
final rebuilt service also passed the stash client journey and expanded stash
suite, including ambiguous branch/tag names and no-op reassociation. Standalone
frontend formatting/type checking/build passed. Root `lint:fix` still stops at
the missing legacy Prettier dependency; native CI remains unexecuted here.

## Reviewed checkout and branch-stash orchestration evidence

Audit of `AppStore.checkoutBranchCore`, its leave/bring implementations and the
stash/overwrite dialogs established the two native workflows. The Rust checkout
service now previews source/target refs, file changes, branch-associated stashes
and occupied worktrees. The standalone review consumes the already moved
`UncommittedChangesStrategy` model and shared Row component. Version-1 Rust
preferences gain the same strategy default without rewriting reads; browser
settings/remembered choices and CLI ask/leave/bring flags use that field.

Review certificates include changed raw file bytes/modes, nested repository
states, raw indexes, HEAD/source refs, pinned target metadata, operation
markers, effective attributes (including Git metadata attributes), relevant
conversion/ hook configuration, the stash list and worktree registrations.
Leaving changes stores a uniquely tagged branch stash before optionally removing
the specifically reviewed previous stash. Bringing first attempts native
checkout; only local-overwrite refusal on the unchanged source uses a transient
stash. Successful fallback applies that selected object ID and removes only its
transient entry. Failed/conflicted apply keeps it. Source/destination saved
entries otherwise remain unchanged. Source/target changes during native saving
stop before previous-stash deletion. Common-directory OS locks serialize Rust
stash/switch operations across processes and linked worktrees; arbitrary
external writers/editors still lie outside an exclusive whole-workflow
reservation.

Remote refs create local branches at the reviewed commit and get native upstream
configuration. Canonical ref resolution handles a local branch literally named
like a remote ref; native tracking DWIM is scoped to the validated exact ref.
Full symbolic source refs also prevent equally named tags changing branch names.
Existing registered worktrees open without touching the source checkout; stale
registration removal preserves Git's dirty/locked refusal. Detached/unborn
sources bring changes according to native Git capabilities. Recursive submodule
updates and LFS/checkout hooks run with native path semantics after switching.
Submodule update failures retain nested local data and report the switched
parent.

Private phase receipts are atomic/fsynced before each native mutation. They
record the expected source/target, uniquely tagged stash message, available
saved OID and previous stash ID. A cancelled child can have already saved data;
history reconciles its nonce even if no OID was returned. Records show the last
attempted phase, never an automatic replay instruction. Acknowledgement removes
metadata only. UI errors/cancellation refresh state and saved changes, with
controls for normal conflict recovery and manual restoration. History refresh
has a distinct revision so it cannot replay a prior checkout. Busy ownership and
branch-option readiness prevent another panel or initial mount enabling checkout
prematurely.

`tests/checkout.py` covers leave/overwrite consent, returning to saved changes,
direct and fallback bring, native saved-index/untracked restoration, retained
conflicts, stale bytes despite unchanged size/mtime, source/target/config
fences, remote tracking, occupied-worktree CLI selection, SHA-256,
split/linked/reftable, detached/unborn sources, errors before/after native
switching, cancellation, preference defaults and uncertain-phase stash
reconciliation. `tests/checkout_native.py` adds read-only preview with corrupt
preferences, conflicting preview flags, canonical shadow refs, source/target
movement during saving, cancellation after native stash creation, recursive
submodule bytes and retained failures, real LFS content and native post-checkout
hooks.

DOM tests exercise strategy values, overwrite acknowledgement, saved-index and
remembered preferences, root fencing, failed records, worktree selection,
explicit stale-registration removal, read-only review/history refresh and busy
ownership. The complete localhost journey leaves/replaces work, returns to the
source stash, restores its index, brings changes through a temporary stash,
remembers that choice, retains/resolves a conflicted bring, acknowledges only
its notice, opens an existing worktree and checks out a remote tracking branch.
These remain DOM/protocol checks, not physical native/browser rendering
evidence.

GitHub protected-branch policy integration, arbitrary fetch-refspec namespace
selection, nested per-repository stash orchestration, large reviews/retention,
live progress/auth/proxy parity and remaining checkout/detach/create callers
remain to audit. The original checkout/store/dialog modules are retained until
those paths and their native platforms are replaced and verified.

Termux validation passed all-feature build/Clippy, 19 Rust tests, 27 frontend
tests, six transport tests, all four complete localhost journeys and the
checkout/checkout-native, workflow, management, history and bridge smoke suites.
The final browser run also exercised canonical local/remote selector collisions;
the final native run covered effective metadata attributes and ref changes while
saving. A persisted stale-registration fixture separately proved removal and
subsequent checkout retain the source edit. Standalone formatting/type checking
and embedded-asset rebuilding passed. Root `lint:fix` still stops at missing
legacy Prettier; physical browser/native rendering remains unverified here.

## Reviewed branch rename evidence

Audit of `AppStore.renameBranchCore` found that native `branch -m` alone left
Desktop saved-change associations behind. The Rust rename service now reviews
source refs/tips, symbolic HEAD, branches/worktrees, effective configuration and
all saved entries. The browser confirms this certificate; the dedicated CLI
accepts a review basis or acts on the current state under the shared stash lock.

All source-associated entries are copied before the native ref rename, keeping
exact trees/parents and newest-first branch order. Existing destination-name and
ordinary user entries remain intact. Native Git moves config/reflogs and updates
linked-worktree HEADs. Originals are removed only after stored copies and the
renamed ref are verified. Context or reflog movement during copying stops with
originals and replacements retained. Copies have unique receipt messages and
prewritten IDs, so cancellation after native store/rename still leaves evidence.
Private atomic/fsynced phase records show current refs and reachable saved IDs.
Acknowledgement removes only metadata; no operation is replayed automatically.

`tests/branch_rename.py` covers all associated entries/order, raw untracked
paths, staged versus working contents, destination/user stash retention, stale
config/ ref/reflog/worktree reviews, invalid/existing names, missing identity,
SHA-256, split/linked/reftable, detached/noncurrent renames, shared process
locking, failures before/after rename and during cleanup, native writer
movement, cancellation after store/rename, nofollow metadata and real LFS
restoration. DOM tests cover review invalidation, exact basis/ref requests,
failed receipts, metadata-only acknowledgement, safe text and stale replies
across repositories. The existing full localhost checkout journey also exercises
the actual rename form and transport, preserving native upstream configuration
and saved index, working and untracked trees.

Current validation passed the all-feature workspace build and warning-free
Clippy, all 19 Rust tests, frontend formatting/type checking/build and all 29
DOM/build tests. All four complete localhost client journeys passed, together
with native branch-rename, stash, history/state, workflow and HTTP/WebSocket
smoke suites. Additional executed cases cover canonical sources whose literal
name begins with `refs/heads/`, receipt file symlinks, nonblocking FIFO
rejection and the bounded receipt reader. Root lint still stops at the missing
legacy Prettier dependency. Native desktop and physical browser rendering remain
unverified in this Termux environment.

The external-native-writer reservation gap remains optimistic. Case-insensitive
case-insensitive platform evidence, remote rename, default/protected branch policy,
large reviews/receipt retention, remaining create/delete callers and supported
native platform behavior remain to audit. Original branch/store modules stay
until those replacements and removal gates have evidence.

## Reviewed branch creation evidence

`AppStore.createBranchCore` creates a branch with an optional start point and
no-track choice, then delegates switching to the normal checkout workflow. The
Rust raw `switch -c`/`branch` path has been replaced by that orchestration. A
single reviewed engine now handles ordinary local/remote checkout and new branch
creation, sharing raw file/index/configuration fences, native leave/bring,
saved-stash replacement consent, submodule/LFS/hooks and durable phase records.

Creation plans bind canonical source refs, their raw IDs and resolved commits.
Native Git sets tracking from the reviewed ref with its own autoSetupMerge,
autoSetupRebase and inherit rules, or explicit no-track. A chosen start
expression is pinned to its commit. Ask/replacement consent happens before any
ref mutation. For a source with a commit, the branch is created before stashing
or switching; source/target checks stop later work when an outside writer moves
either context. Ref-only creation reviews only relevant ref/configuration
context and retains working/index/current-branch/stash state, including with a
damaged index or stash ref. Unborn checkout uses native create-and-switch
behavior from either no commit or an existing start commit, including its
current symbolic branch name.

The browser's existing strategy review now also shows creation/start/tracking
choices. Even a clean creation is reviewed before execution; ref-only creation
describes its effect on the current checkout. Refresh reconstructs only allowed
request fields from the response, so internal source-certification metadata
cannot leak into strict protocol calls. CLI preview and ref-only operations do
not depend on reading strategy preferences. Existing version-1 checkout records
still read with the new optional creation metadata. FIFO receipt rejection now
uses nonblocking reads before checking for regular files. A reproduced
busy-panel regression first failed because a review request was dropped while
controls were disabled. Pending reviews now wait for readiness and are claimed
once per request revision; readiness changes do not replay branch operations.

The native `branch_create.py` suite covers staged/working/untracked retention,
source-stash replacement consent, direct and fallback bring, conflicted bring,
native tracking/inherit/no-track, canonical shadows and commit expressions,
stale file/index/source/config/ref/stash reviews, unborn and detached sources,
SHA-256/split/linked/reftable, failure before/after native creation,
cancellation, corrupt-preference independence, receipt FIFOs and real LFS.
Additional cases cover ref-only creation during merge conflicts, failed checkout
hooks, start refs moved during the native create command, damaged index/stash
metadata, and unborn sources initialized from fetched commits. DOM tests cover
exact creation parameters, read-only refresh, response-field whitelisting,
ref-only behavior, failed phase records and late replies. The full localhost
journey extends the actual sidebar form through reviewed
create/switch/replacement and ref-only creation while preserving
staged/working/untracked bytes.

Current checks passed the all-feature workspace build, warning-free Clippy and
all 19 Rust tests. Frontend formatting/type checking/build and all 32 DOM/build
tests passed, including the busy-review regression that first failed before the
readiness fix. All four complete localhost journeys passed on the resulting
production frontend. The full native creation suite passed with real LFS and the
additional damaged-metadata/unborn/partial-failure cases. Existing reviewed
checkout and native submodule/LFS checkout suites also passed. Workflow and
HTTP/WebSocket smoke suites passed, including byte-identical embedded assets.
Root lint remains unavailable at the missing legacy Prettier dependency;
physical browser/native desktop rendering is still unverified here.

Default/protected branch policy, remote create/delete/publish orchestration,
external-writer reservations, remaining create/delete/detach callers and native
platform evidence still require auditing before legacy module removal.

## Reviewed local branch deletion evidence

Audit of the legacy delete dialog, `deleteBranchCore` and fallback-branch choice
found that the raw Rust `branch -d` command omitted current-branch switching and
explicit unmerged deletion. The new local service reviews the selected ref/tip,
merged target, settings, worktrees and, when switching, the existing certified
checkout plan. Current-branch deletion delegates leave/bring and recovery to the
shared engine with a preallocated related receipt ID. Consent is checked before
creating recovery refs or switching. A no-op switch target becomes a ref-only
operation and does not depend on index/working/stash state.

A unique recovery ref retains the reviewed tip before native mutation, and a
private bounded/fsynced record retains local settings and last attempted phase.
Native `branch -d`/`-D` owns its merge/worktree/rebase checks, config cleanup
and reflog semantics. A command-scoped reference-transaction hook reads the
current tip at the prepared phase, where Git holds ref locks, and forwards
phases and stdin to the original native hook. This also handles all-zero old
values in forced deletes, rather than mistaking them for a real previous tip.
Git's
[reference-transaction contract](https://git-scm.com/docs/githooks#_reference_transaction)
provides that locking/checking boundary. Native `git hook run --to-stdin`
forwards the full payload. Configured hooks are suppressed only in the outer
wrapper and restored for the delegated call, preserving their native
counts/order and enabled states. An original disabled event does not disable the
application's own tip gate. The
[hook runner contract](https://git-scm.com/docs/git-hook) defines the
stdin/configured-hook behavior. No hook config is persisted.

Recovery shows current/recovery refs and links failed switches to normal
checkout/stash history. Restore creates an absent destination at the retained
OID and reapplies local branch values without switching or overwriting existing
settings. Valueless booleans normalize to explicit true; deleted reflogs are not
recreated. Explicit forgetting drops only the recovery ref and metadata using
expected-ID and no-dereference updates. Source/destination branch data, index,
working files and saved stashes remain intact. Recovery readers reject links,
FIFOs and oversized files; malformed/foreign records are not used for writes.

The browser uses an explicit force checkbox, shared leave/bring values and
previous-stash replacement consent. Held worktrees block the action. Failed
operations refresh checkout/stash history and retain the recovery notice;
restore and permanent forget are separate actions. Recovery controls now receive
global readiness and are excluded from imperative button enabling, so releasing
busy state cannot bypass their consent conditions.

`branch_delete.py` exercises normal/unmerged/current deletion, ref/config
restoration, multivalue settings, other-branch preservation, GC reachability,
leave/bring and saved index/untracked data, stale review inputs, quoted native
hook paths/phase forwarding, an external ref change inside the native delete
command, worktrees, damaged indexes/preferences, SHA-256/split/linked/reftable/
packed refs, OS locking, cancellation after deletion, bounded/nofollow metadata,
changed recovery refs, symbolic backup replacement and real LFS. DOM tests cover
force/replacement consent, native-style restore/forget choices, held worktrees,
partial errors, safe text and root fences. The complete localhost journey also
deletes the current branch through leave, checks saved staged/working/untracked
trees, and restores its tip/settings without switching or applying stashes.

Validation passed the all-feature workspace build, warning-free Clippy and all
19 Rust tests. Frontend formatting/type checking/build and all 34 DOM/build
tests passed. All four complete localhost journeys passed with the actual
delete/ checkout/restore flow. The full native local-deletion suite passed,
including native hook payload/count comparison, disabled-event guarding, policy
refusal, partial checkout, rebase protection, symbolic backup replacement and
LFS. Existing checkout, branch-creation, workflow and HTTP/WebSocket smoke
suites passed too, including byte-identical embedded assets. Root lint still
stops at missing legacy Prettier. Physical browser and native desktop rendering
remain unverified in this Termux environment.

Full GitHub default/protected branch policy, all
remaining branch-operation callers, arbitrary external filesystem reservations,
large histories and native desktop platform evidence remain outstanding. The
legacy branch/store/dialog modules remain until those removal gates pass.

## Reviewed remote branch deletion evidence

The Rust service reviews canonical remote head refs and every effective push
destination separately, preserving different fetch URLs, native URL rewriting,
credentials/transport and configured/file pre-push hooks. Each deletion supplies
a complete expected ID as an explicit native lease. Supplied expectations also
support push-only access without server reads. Native URL resolution verifies
that scoped URL-list resets isolate the destination without editing repo config.

Locally available tips are retained before any push; optional fetches retain
missing tips without index/FETCH_HEAD changes. Bounded, nofollow, nonblocking,
owner-checked private phase records preserve each destination's acknowledged
result or uncertainty. Partial success/cancellation never triggers automatic
rollback or replay. Restore creates an absent local branch without checkout or
network writes. Forget checks direct recovery refs and expected IDs, so symbolic
replacement cannot dereference into an active branch. Recovery creation uses a direct absent-value native ref update, rejecting
dangling symbolic destinations without creating a different branch. Commit reachability does
not imply a complete shallow/promisor/LFS archive.

Native tests exposed that empty fetch refspecs do not suppress push's automatic
tracking cleanup. A scoped reference-transaction guard retains local refs during
push. Pre-push callbacks are delegated once with original argv/stdin/enabled
flags. Git may return failure for the stopped local transaction after printing
a successful server porcelain acknowledgment; that acknowledgment is recorded
as server success. After all destinations succeed, unchanged direct caches are
pruned with old-ID checks. Positive/negative/custom mappings are considered;
local branches/tags, private recovery refs and symbolic refs are preserved.
Duplicate effective destinations are not deleted twice. No overrides persist.

The web panel adds reviewed deletion consent, missing-backup notice/fetch choice,
partial outcome history, local restore and separate permanent-forget consent.
Root generations/read revisions reject late results and global readiness
preserves consent. Errors refresh history without replay. Discovery resolves
canonical upstream remote/ref names independently of local branch names and
fetch namespaces. Public records omit transport URLs and scrub known credentials.

`remote_delete.py` uses private local bare remotes for differing multi-URL tips,
fetch-only separation, stale reviews, races inside pre-push, partial success,
native hook payload/counts, supplied expectations, custom/negative/head mappings,
URL rewriting/resets, fetch recovery, missing tips, GC/local restore/forget,
server refusal, corrupt indexes, SHA-256/reftable/linked worktrees, cancellation
after actual server mutation and bounded/nofollow metadata. DOM coverage checks
consent, failure recovery, expectations and cross-root replies. The production
localhost journey exercises remote delete/local restore through WebSocket.

Final Termux validation passed the all-feature workspace build, warning-free
Clippy and all 21 Rust tests; frontend formatting/type checking/build and all
36 DOM/build tests; and all four production localhost journeys. Both full native
local/remote deletion suites passed with real LFS, including dangling symbolic
restore refusal, canonical nested refs, mirror/follow-tags scoping, native URL
rewriting, server leases, partial outcomes and cancellation. Workflow and
HTTP/WebSocket smoke suites passed, including byte-identical embedded assets.
The browser test readiness regressions were corrected and rerun successfully.
Root lint still exits 127 because legacy Prettier is absent. Physical browser
rendering and native desktop behavior remain unverified on this device.

GitHub policy UX, broader remote-helper and credential-provider failures,
native desktop platforms and remaining legacy callers still require evidence. The branch removal gate remains open.

## Combined local/upstream deletion evidence

Local deletion now optionally derives its network upstream from native Git's
canonical remote/ref atoms. A single combined review binds the local checkout/
force context, exact upstream, all push destinations/tips and backup options.
Native target discovery supports different local/remote branch names and custom
fetch mappings; branch pushRemote does not redirect upstream identity. Missing
and local-dot upstreams are refused read-only when inclusion is requested.

The remote service is factored into reviewed preparation and execution under the
existing common lock. Local force and stash replacement consent precede recovery
creation. Local tip/settings and available or explicitly fetched remote tips are
retained before checkout. Remote pushes occur only after native local deletion
succeeds. Preparation/checkout/local refusal stops every upstream push; server
refusal, unexpected configuration or cancellation after local deletion leaves
both recoveries and per-destination outcomes available. Related local/remote/
checkout receipt IDs are written before their corresponding mutation; no step
is automatically replayed or rolled back. Earlier receipts default related IDs
to null and remain readable.

Remote configuration capture preserves native scope/origin/value boundaries.
For combined execution, only exact known local branch sections and local
submodule initialization settings may change between review and push. Neighbor
branches with dotted names, global/worktree/command settings and all transport/
hook policy remain bound. Unexpected conditional-include changes stop execution
with recoveries retained. This is not an exclusive external-writer reservation
or a distributed transaction. Explicit leases still guard each server tip.

The CLI exposes `--include-upstream`, `--fetch-upstream-backup`, and repeated
`--expect-upstream` flags. The browser adds a canonical upstream review with
separate consent, fetch/push-only choices and related history notices. Both
management panels refresh after their branch mutations, so a locally restored remote
tip becomes available immediately for local branch management. Reconnect and
late root replies do not replay deletion.

`upstream_delete.py` exercises canonical names, pushRemote separation, stale
contexts/options, consent, leave/bring, native tracked target creation,
submodule initialization, local hook/checkout refusals, server refusal,
configuration changes during checkout, multi-destination partial success,
backup-fetch races, older receipts, native hash/ref/worktree backends, LFS and
interruption before and after local deletion. It uses only private local bare
remotes. DOM coverage checks separate consent and linked failure history. The
production localhost journey restores a remote tip locally and then deletes that
local branch and a differently named upstream through the real WebSocket bridge.

Termux validation passed the all-feature workspace build and warning-free
Clippy, all 21 Rust tests, frontend formatting/type checking/build, and all
37 DOM/build tests. All four complete localhost journeys passed against the
final embedded frontend, including combined deletion and linked history after
local remote-tip restore. The expanded combined, local-only and standalone
remote deletion suites passed with real LFS. Workflow and HTTP/WebSocket smoke
checks passed, including byte-identical embedded assets. Editor/stash journeys
now wait for enabled controls before issuing their next action. Root lint still
exits 127 because legacy Prettier is absent. Physical browser rendering and
native desktop execution remain unverified on this device.

GitHub policy UX, wider provider/conditional-configuration behavior, external
writer reservations, large repositories, native platform evidence and remaining
legacy callers still require their migration audits. All removal gates remain
open until their full requirements are proven.

## Native branch identity and case-only rename evidence

The audit found that Git can treat a dangling symbolic branch destination as
absent and follow it into another ref. Creation, remote-checkout and rename
previews now reject symbolic destinations before mutation. Creation preflight
rechecks immediately before native execution. The existing source-race fixture
also showed that a moved native start ref could create an unreviewed tip, with
the old service detecting it only after creation.

Native `git branch` creation now uses a scoped reference dispatcher. Its
preparing/prepared checks require exactly the reviewed direct absent ref and
new commit, and compare a canonical start ref's raw OID. It catches both
redirection between the review and command and a pointer/start changed from a
user preparing callback. Native branch/tracking/inherit/rebase behavior remains
the underlying implementation. A private event first proves the dispatcher can
execute; a skipped hook cannot silently remove the protection. Synthetic probe
phases never go to user reference callbacks.

Original reference hooks are delegated with native input/arguments and their
original configuration environment. Event/friendly disabling remains effective
for user callbacks but cannot disable the application check. Nested Git from a
user hook can use another repository's own hook path. Private dispatcher files
are removed on receipt acknowledgment; public histories omit inherited private
configuration. Tests cover shell metacharacters in refs and caller config.

This guard is scoped to native `git branch`. `switch -c` also runs checkout/index
callbacks and may recurse into submodules. It currently has destination
preflight and phase recovery, not equivalent transaction guarding. Probes also
confirmed that native rename callbacks differ on file refs and reftable, so a
single prepared-hook predicate cannot claim an exclusive rename lease across
both. Those concurrent-writer/runtime cases remain open rather than silently
replacing native tracking/reflog/hook semantics.

The native rename implementation now matches the legacy case-only fallback.
It enumerates exact ref names independently of case-insensitive lookup, tries
`-m`, and only considers `-M` for the exact native case-collision error and a
fresh unchanged context/stash list. An existing exact destination, another case
variant, changed source/configuration or a hook failure prevents the retry.
Source-associated stash copies remain available until the final renamed tip is
verified. Preview metadata and the web view explain the case-only path, and
rename now participates in global operation readiness.

`branch_refs.py` covers file/SHA-256/reftable variants, existing and injected
symbolic destinations, moved starts, preparing-hook races, hook executability,
callback phase/input/count parity and disabling, nested Git configuration,
private guard cleanup, quoted refs/private inherited config, normal case-only
renames, simulated case-insensitive lookup/collision, and retry ownership races.
The existing creation source-race assertion now requires no unexpected ref.
DOM coverage checks case disclosure/review/busy handling; the production
localhost journey also renames the active branch through both letter cases.

Termux validation passed the all-feature workspace build, warning-free Clippy,
all 21 Rust tests, frontend formatting/type checking/build, and all 38 DOM/build
tests. All four complete localhost journeys passed against the embedded assets.
The expanded branch identity, creation and rename suites passed, including real
LFS where applicable. Checkout, native checkout, workflow and HTTP/WebSocket
smoke suites also passed against the same binary. Root lint still exits 127
because legacy Prettier is absent; native desktop and physical case-insensitive
filesystem execution remain unverified.

## Default branch permission replacement evidence

The legacy menu protects the inferred default from deletion and a published
default from rename (`app/src/lib/menu-update.ts`). Rust now shares that policy
across typed CLI/RPC mutations, `branch-policy`, annotated branch lists and
snapshots. Its inference follows `find-default-branch.ts`: use the selected
fetch-capable remote's cached symbolic HEAD, prefer local tracking branches
(with a matching-name preference), then the same-named local branch, then the
remote ref. Explicit global `init.defaultBranch` (without includes) and `main`
provide the fallback name. A remote HEAD outside its remote namespace or a
self-looping cached HEAD also uses that fallback rather than preventing ordinary
snapshots.
Fetch remote enumeration honors empty URL resets, excludes push-only entries,
and uses Desktop's UTF-16 name ordering. URL contents never enter policy output.

Branch enumeration excludes symbolic refs, matching the legacy parser; local
aliases cannot steal default protection through their own tracking settings.

Default deletion is rejected before journal/backup/checkout/upstream work, even
with force. Published default renames are rejected before stash reassociation;
unpublished defaults and nondefault published branches remain eligible. Reviews
bind the policy identity independently of tip equality. Deletion resolves the
policy again after checkout, preserving its branch/recovery record when a hook
makes the selected branch the new default. The automatic checkout destination
also uses this resolution, including remote-only defaults that need a native
local tracking checkout. Browser controls validate shared permissions, explain
blocked actions and clear outdated reviews when policy context changes.

`branch_policy.py` covers global/local configuration precedence, excluded global
includes/conditional includes, invalid/looping cached HEAD fallback, symbolic
aliases,
nested/quoted and Unicode names, fetch URL resets/private line breaks, push-only exclusion,
tracking priorities/gone tips, default force rejection, unpublished rename,
remote-only checkout, equal-tip policy changes, post-checkout hooks, detached
and unborn states, SHA-256/reftable/packed refs/linked worktrees, and read-only
CLI execution with corrupt indexes/preferences. DOM tests cover disabled
controls, policy updates and invalid permission data. The production localhost
journey now verifies that a published default cannot be renamed and exercises
case-only rename on a nondefault branch instead.

Termux validation passed the all-feature workspace build, warning-free Clippy
and all 21 Rust tests. The standalone frontend passed formatting/type checking,
its build and all 40 DOM/build tests. All four complete localhost journeys
passed, including disabled default actions, published-branch disclosure,
nondefault case-only renames and linked deletion recovery. Native policy,
reference-guard and history suites passed; the final cached-HEAD cases and
HTTP/WebSocket smoke checks passed against the rebuilt binary, including
byte-identical served assets and CLI/RPC policy agreement. Root lint still exits
127 because legacy Prettier is absent. Native desktop and physical browser
rendering remain unverified; removal gates remain open.

## Fork contribution settings and association replacement evidence

Rust now has per-repository contribution preferences and verified cached GitHub
metadata in the common Git directory. `repository-context`, its refresh/target
flags and equivalent typed RPCs share the browser settings controls. A saved
`parent` preference is the default; it changes default-branch inference only
for a currently verified fork with a known parent. Self and nonforks retain
ordinary fetch-remote selection. A literal upstream with a matching parent URL
supplies the parent default. Missing/unrecognized/mismatched upstreams use the
global/main fallback rather than selecting the origin HEAD or replacing a
conflicting remote.

Refresh uses an explicit normalized host/owner/repository `gh` selector, checks
returned URL/name/fork/parent consistency and rechecks the effective fetch URL
before publishing. HTTPS/SSH/SCP identities compare canonically; web ports are
preserved while SSH transport ports do not become API ports. Public/stored
metadata omits transport credentials and query strings. Changed origin identity
makes cached metadata inert. Snapshots and branch reviews perform local reads.

Capability-relative private records/locks are bounded, no-follow and
nonblocking, with regular-file/ownership/hardlink checks. Atomic updates use a
pinned common Git directory and sync a readable relative directory descriptor.
A private immutable UUID marker binds the record across repository moves and
linked worktrees; earlier path-bound records upgrade on a subsequent write.
Marker publication is synced before JSON replacement, and lock-free reads
inspect JSON before the marker to avoid false foreign-record errors during
initial publication. Linked worktrees share preferences/cache. Refresh releases
metadata locks for network reads and preserves a concurrent preference edit on
publication.
Preference/cache revisions bind branch reviews even when tips are identical.
The settings UI keeps mutations behind explicit actions and has root/read/busy
fences; it reloads state after uncertain mutations without replay.
The original workflow-preference enum/type now live in shared frontend source;
the legacy entrypoint re-exports them and the new settings use the same enum.
Standalone/legacy-import bundle coverage checks that shared contract.

Validation passed the all-feature workspace build, warning-free Clippy and all
26 Rust tests. Standalone frontend formatting/type checking/build and all 45
DOM/build tests passed, including shared workflow imports and immediate review
invalidation after context changes. All eight native repository-context
sections passed: offline/verified/stale association, private storage, marker
safety and migration, relocation, linked worktrees/native ref backends,
concurrent preferences/refresh, remote races and cancellation. Installed `gh`
passed repository-bound refresh against the local HTTPS API with its real parent
JSON shape; subsequent policy reads made no API calls. HTTP/WebSocket smoke and
default-branch regression suites passed against the final binary.

All four complete localhost journeys passed with their original per-action and
overall time limits, including real pending preference save/reload and private
UUID marker verification. The integration runner executes files serially so
multiple native Git fixtures do not compete on Termux. Parallel execution and
a preceding isolated run exceeded total test budgets; serial confirmation
passed the unchanged checks after restoring original limits. Hardlink record
and marker fixtures are explicitly unavailable on this Termux filesystem
(EACCES) and run automatically on capable hosts; that platform evidence remains
open. Root lint still exits 127 because legacy Prettier is absent. Native
webview/physical browser rendering and full legacy removal remain unverified.

Legacy preference/metadata import, automatic association-discovery/startup
callers, full account and endpoint flows, native platforms and broader
external-writer reservations remain open. Creation/rename use the name/ruleset
checks below; remaining account/startup and branch callers still need parity
evidence before branch legacy removal.

## Parent upstream setup replacement evidence

The native setup service now replaces `addUpstreamRemoteIfNeeded`'s local add
behavior after verified metadata refresh, regardless of Parent/Self preference.
It derives the parent's HTTPS clone URL from the verified association, adds only
an absent upstream namespace and never fetches or pushes. Matching effective
fetch identities remain unchanged, preserving their custom refspecs/push URLs.
Occupied namespaces, including non-fetch settings and scoped/reset entries, are
blocked. Dotted neighboring remote names are parsed separately.

`upstream-setup --preview` and its reviewed execution share typed RPCs and the
browser's review/confirmation controls. Certificates bind repository context
and complete scoped/origin-tagged upstream and URL-rewrite records. Native URL
rewriting must retain the verified parent identity before mutation. Native
addition is followed by parent identity and default fetch-mapping checks.
Uncertain/partial failures retain actual configuration for inspection; no blind
rollback or replay removes user changes. The metadata-refresh caller retains a
successful association cache and reports setup failure explicitly. Application
locking/rechecks do not claim an exclusive lease over outside config writers.

Cache records now retain their verified source remote, so adding an
alphabetically earlier upstream cannot invalidate a non-origin fork's own
association. A newly present origin still takes priority. Legacy records without
the source name recover it from the exact URL/name fingerprint and canonical
identity until a subsequent refresh persists it.

The native `upstream_setup.py` suite covers automatic/manual/CLI add, Self,
custom web ports, private URL omission, exact namespace/scope collisions,
matching no-ops/custom configuration, rewrites/stale bases, no-origin/legacy
cache source recovery, uncertain native failures, native config lock
preservation, and SHA-256/reftable/packed/linked/corrupt-index cases. Its Git
wrapper rejects transfers; configuration setup does not mutate refs, index or
working files. DOM tests cover confirmation/parameter whitelisting, blocked and
no-op states, unsafe URLs, late roots and uncertain outcomes without replay.
A full localhost journey exercises actual UI/WebSocket/native Git setup.

Validation passed the all-feature workspace build, warning-free Clippy and all
26 Rust tests. Standalone frontend formatting/type checking/build and all 48
DOM/build tests passed. All eight upstream-setup sections passed without
transfers or skips. The existing eight repository-context sections passed;
hardlink capability cases remain explicitly skipped on this Termux filesystem.
Installed-gh HTTPS integration, HTTP/WebSocket smoke and default-branch policy
regressions passed against the final binary. All five complete localhost
journeys passed serially with their original time limits, including parent
remote addition, matching no-op and conflicting-remote protection. Rust,
frontend and CI formatting checks passed. Root `lint:fix` still exits 127 because
legacy Prettier is absent. Physical browser/native desktop validation,
association/startup caller parity and full legacy removal remain open.

## GitHub branch-name rules replacement evidence

The Rust name-policy service now binds the verified associated repository's own
identity, effective authenticated actor, repository identity/privacy and rule
responses. Parent contribution preferences do not redirect this check to the
parent repository. Fixed explicit-host GET operations read the actor,
repository, branch rules and deduplicated rulesets. Complete branch names are
percent-encoded into one path segment. Pagination and response sizes are bounded
without following provider-supplied endpoint URLs.

An ephemeral private session resolves credentials through installed `gh` and
pins the same token in child environments for every API read in that check.
Tokens are never command arguments or included in policy witnesses, JSON,
errors, receipts or application records; debug output is disabled. Authenticated
user data proves actor identity instead of relying on an active-account label.
The repository association is rechecked after API/matcher work. Each subsequent
review/execution obtains fresh policy, so actor, association or rules changes
invalidate existing certificates. This is not an exclusive lease over remote
GitHub policy or independent credential/config writers.

Creation plans, including ref-only and checkout variants, and rename plans bind
and display name policy. Mutations reject known restrictions before receipts,
stash copies or native branch changes, with fresh checks before execution.
Worktree branch creation and native DWIM use the same backend gate; existing
local worktree reuse stays offline. The worktree command still lacks a separate
preview certificate. Snapshots never call name-rule APIs. Raw Git/gh forwarding
remains explicitly outside typed workflow guarantees.

The actual pure Desktop metadata matcher and rule models now live in shared
frontend source with legacy re-exports/imports. RE2JS remains pinned to 2.0.1 in
an isolated test/build package. A deterministic static bundle runs inside
Rust's embedded QuickJS runtime with no Node, filesystem, networking or OS
modules. Parameters are data passed to a fixed function, never evaluated code.
Memory, stack, input-size, deadline and cancellation limits constrain evaluation.
The original matcher is reused to preserve ASCII classes, Unicode/astral
behavior, quoting, anchors, unsupported escapes and syntax errors.

The evaluator preserves missing-ruleset behavior, creation-only bypass and the
final all-relevant-ruleset bypass check. Only `always` directly bypasses rules;
`pull_requests_only` is enforced. Other known metadata patterns are compiled
when the legacy parser would compile them, preserving invalid-provider errors.
GitHub.com/data-residency hosts are supported and GHES is skipped. Own private
repositories with missing/free plans are skipped using the actual actor and
REST owner login. API availability failures remain permissive for local
operations but are labelled unavailable; malformed evaluation blocks. Missing
rulesets can therefore yield a permissive result with incomplete evidence,
which the frontend displays as unavailable rather than a proven pass.

Validation passed the all-feature workspace build, warning-free Clippy and all
38 Rust tests. The source oracle passes 125 legacy checker cases; Rust matches
all 114 eligible evaluated-checker outcomes and all 91 frozen matcher outcomes.
The deterministic bundle/license check passes. Frontend formatting/type
checking/build and all 50 DOM/build tests passed. All eight native name-rule
sections passed without skips, including fixed paths/pagination, actor and
repository binding, missing rulesets, credential-store/env rotation, equal
public bases for different tokens of the same actor, stale policy/context,
malformed/private diagnostics, origin races and cancellation. Blocked ref-only
creation, checkout creation, rename and explicit/DWIM worktree creation preserved
refs, raw index/files and stashes and wrote no mutation receipts. Existing
branch-create (including real LFS), rename, management and HTTP/WebSocket smoke
regressions passed. All six complete localhost journeys passed serially with
unchanged time limits, including actual UI blocked/bypass/stale name-policy
behavior and mutation-parameter whitelisting. Root `lint:fix` still exits 127
because legacy Prettier is absent.

Account import and broader sign-in/sign-out/clone/publish flows, legacy rule-cache
import, association/startup callers and native/physical-browser parity remain open. This service does not
complete the branch or full legacy-removal gates.

## Saved-record account assignment replacement evidence

The registry now retains stable record IDs alongside the compatible v1 native
path arrays. Legacy entries without record metadata synthesize deterministic
IDs on read and persist the same ID on an authorized update. New records use
UUIDs; forgetting and re-adding a path produces a different record. Present
records must contain strict account state; malformed or missing assignment data
never defaults to an effective credential. Optional retained source names are
separate from verified account metadata.

Account assignment belongs to the saved record, rather than the common Git
directory. The explicit worktree-opening operation validates native membership
and common-directory identity. It adopts a separately saved target record, or
relocates the current record to an unsaved target while retaining its ID and
latest account. Relocation rechecks the source path under the registry lock.
Ordinary Open repository remains an independent add/adopt action. Both browser
worktree controls and CLI `checkout --open-worktree` use this distinction.
Fixed handles check record ID, namespace and current path; forgotten, replaced
or relocated records cannot silently select a new account.

CLI `--config` scope now reaches the operation funnel and direct preview/typed
GitHub/serve opens. `--selected` binds the exact saved record. Ordinary offline
`-C` operations neither save a repository nor eagerly require a registry/HOME.
Account-aware operations read their scope afresh. Explicit-repository GitHub
operations can still work outside Git, but native-open failures inside saved or
invalid assignment state cannot authorize an unbound credential fallback.
Global authentication discovery and raw Git/gh forwarding retain native scope.

A sanitized explicit-host catalog preserves stored login spelling without
selecting the active/first entry. Reviewed account targets distinguish named
assignment, explicit None and native effective mode. None clears account-scoped
metadata and disables typed GitHub API operations; effective is the compatibility
default for older Rust records. Named review verifies the authenticated numeric
actor and repository access. Assignment plus verified association is published
in one registry compare-and-replace, guarded by record/revision, source URL
fingerprint and the reviewed actor/repository evidence. Tokens and cache
wall-clock timestamps are excluded from review certificates. Contribution
preferences remain common-directory settings, with scoped associations and
retained source names chosen independently of cleared private metadata.

Named sessions capture `gh auth token --hostname HOST --user LOGIN --no-refresh`,
verify `/user` login/ID and pin that credential in every child environment.
Missing/invalid named credentials remain unavailable without effective-account
fallback, and assignments are retained. Typed GitHub operations and metadata
refresh share this resolution. Host and source fingerprint are rechecked around
session opening/command execution, closing deterministic origin-change races.
Transport failures and private command diagnostics are sanitized; literal
captured credentials are redacted from typed output within output bounds.
The installed-gh synthetic fixture proves named-user precedence over conflicting
environment tokens without network access or credential-store mutation.

Typed GitHub requests now accept an optional saved-account/source witness.
The public basis combines stored account scope with the selected fetch name and
effective URL fingerprint; low-level context selection uses a store-only state
to avoid recursive resolution. The UI captures that basis when an action begins
and retains it for follow-up reads. Bound execution compares it with current account state before any gh
invocation, so an action queued under a former account cannot run as its
replacement, or against a newly selected origin under the same actor. Recognized
working-tree identities also fix the default typed repository selector without
changing effective-mode credential precedence. Explicit script omission means
current-account-at-dispatch; global
authentication remains unbound. Outside-Git calls reject supplied saved-account
witnesses rather than silently ignoring their intent.

The separate account UI requires explicit loading, discovery, review and save.
It displays retained signed-out choices and failed catalog reads without
reselection. Same-root assignment bases invalidate GitHub lists/details, parent
metadata and pending reviews. Request generations own busy state, so late old
replies cannot release a newer request or repopulate old-account data. Saves send
only target and basis; uncertain outcomes refresh state without replay. Existing
Git author settings and local Git data remain independent.

Validation passed the all-feature workspace build, warning-free Clippy and all
55 Rust tests, including strict assignment parsing, stable record/CAS/worktree
scopes, installed-gh named-user precedence and unbound witness refusal.
Standalone frontend formatting/type checking/build and all 56 DOM/build tests
passed. All nine native account sections passed without skips on the final
binary: catalog/no-autoselection, atomic actor/cache publication, typed PR/issue
stdin/pinning/redaction, signed-out retention, actor and source queued witnesses,
independent worktree records/caches, stale namespaces/records, malformed/legacy/
raw-byte paths, origin races and concurrent assignment CAS. Stale queued
mutations ran no gh command and preserved registry/Git data; source-only changes
changed the public witness without changing the stored account.

Final HTTP/WebSocket smoke, offline GitHub adapters and installed-gh local-HTTPS
integration passed. All seven complete localhost journeys passed serially with
unchanged time limits, including the corrected `open_worktree` assertion against
the held native path, actual account/source request witnesses, private-view
invalidation, no fallback/replay and unchanged author/index/files/refs.
Existing registry, management, repository-context, parent-upstream, default-branch
and name-rule native regressions also passed during this increment. Context
hardlink cases retain their explicit Termux EACCES skips; no broad platform
completion is inferred. Root `lint:fix` still exits 127 because legacy Prettier
is absent. Desktop/physical-browser and all legacy-removal gates remain open.

Full account/profile/database import, queued ensure-account/sign-in dialogs,
explicit sign-out keep/clear/cancel behavior and clone/publish account selection
remain open. SSH remotes still need known account API endpoints to resolve
nondefault web ports; their SSH transport port must not become an API port. The following transport increment adds the private operation-owned broker,
central Git/LFS configuration inheritance and bounded helper described below.
Raw terminal forwarding remains native. Clone, newly created worktrees and
submodule destinations still need provisional account scopes before their saved
records exist. Native LFS HTTP actions/redirects and complete sign-in/import/
publish flows remain separate audit items.

The original gh lookup contracts remain available in the [token command source](https://github.com/cli/cli/blob/trunk/pkg/cmd/auth/token/token.go),
[credential lookup source](https://github.com/cli/cli/blob/trunk/internal/config/config.go)
and [environment contract](https://cli.github.com/manual/gh_help_environment).
All broad account and full legacy-removal gates remain open.

## Assigned-account HTTPS transport replacement evidence

The shared Rust process runner now installs a private operation-owned credential
broker for named saved accounts and explicit no-account assignments. Effective
mode, SSH and unrelated origins retain native authentication. The bounded hidden
CLI helper validates native credential fields, stops fallback with `quit=true`,
and consumes store/erase requests without writing the gh store. Tokens and the
private capability never enter Git arguments, persisted configuration, registry
records, review certificates or browser RPC.

Intent comes from effective native fetch URLs, every push destination and the
reviewed remote-deletion endpoint set. Local hooks/filters use the saved source;
child submodules receive no parent grant. The broker verifies the stored numeric
actor and destination repository access, pins the captured session, rechecks the
saved-record/source witness and revokes itself on cancellation/completion. Git
2.46+ proactive Basic authentication, final-layer quoted configuration overrides
and helper resets prevent native helper fallback. Matching netrc/header sources
and credential-bearing URLs are refused before transport. Working/index/HEAD
`.lfsconfig`, includes and URL aliases are inspected without lazy object fetch.

Assigned PR checkout no longer launches a token-pinned gh parent that can spawn
Git. A fixed REST PR read and declared base-remote fetch prove the head SHA before
reviewed branch creation/checkout or a non-destructive fast-forward. The API and
Git broker reuse one captured session. Private fetch refs are cleaned up.

Git redirects are disabled for the protected origin. Native LFS still owns its
HTTP redirects and server-issued object-action requests; a helper sees only the
credential context LFS chooses to present. This increment does not certify a
repository-path allowlist for every native LFS HTTP request. Rust-owned LFS HTTP
routing or another explicit transport boundary remains an audit item.

A same-filesystem, operation-owned LFS storage alias shares canonical objects,
blocks native error-log creation with a regular-file guard and applies only to
the exact selected Git directory. Its tokenless include is removed on Drop.
The caller owns storage directly; operation completion cancels and drains helper
requests and the revocation monitor before cleanup. This also covers CLI error
paths that terminate the process immediately after returning the result.
Non-Unicode paths and unsupported Windows directory links fail safely. Transfer
resume and lock caches remain operation-local; broader LFS/platform parity is
open. Private output redaction also covers selected Basic/base64/URL encodings.

The preceding broker/LFS baseline passed 98 Rust tests (plus one internal oracle
worker run explicitly by its parent), warning-free all-feature Clippy and
formatting. Twelve real local-HTTPS transport sections passed on the frozen
binary: named fetch/push/ff-pull and account switching; None/signed-out retention;
direct LFS plus pre-push and pull-smudge descendants; bounded/malformed/CRLF
credential protocol and read-only store/erase; submodule isolation; native URL
rewrites and multiple push destinations; account/source/forget/cancel revocation;
native Effective/SSH preservation; scoped conflicting authentication headers;
PR checkout/fast-forward/ahead/divergence/SHA/default-name/parent handling;
working/index/HEAD LFS configuration precedence; authenticated WebSocket fetch
and PR checkout; and reference-transaction hook credential inheritance.

Runtime checks exposed and fixed a large shared async future overflowing the
normal 8 MiB process stack, leading whitespace invalidating Git environment
configuration, a slow revocation monitor starving helper acceptance, and a
reference guard discarding credential policy. Large workflow futures are boxed
and a size regression guards the shared operation boundary. Revocation runs in
a separate abort-owned task. Caller parameters and tokenless broker policy are
restored through environment variables, without copying them into guard scripts.
Both CLI and native-host executables handle private helpers without UI startup.
A focused real-LFS run passed all five ordinary transfer/descendant paths, then
an authenticated HTTP 422 response containing synthetic literal and Basic
credentials. The fixed JSON error contained no raw diagnostics; no native logs,
private aliases or credential bytes remained in the object cache. This caught
and fixed deferred async-task cleanup losing storage ownership at CLI exit.
The same fixture blocks a real authenticated LFS batch after storage creation,
then cancels the CLI: exit 130, all three observed children terminated, no alias
or native log retained, and unrelated refs/index/config/registry/files and prior
cached objects unchanged.

The native fixture compiles a small C instrumentation wrapper when a compiler is
available, with Python fallback. It preserves opaque argv/stdin/exit/signals and
asserts credential-free Git argv/environment plus explicit deterministic gates.
Its separate tools-only checks passed malformed/nested controls, concurrent log
rows, native byte paths, signals and the bounded gate timeout. Instrumented new
network cases use 60 seconds; existing account cases retain their 25-second
limit. No production command/browser deadline changed.

Broader regression checks passed saved accounts, branch creation, native
checkout, remote/upstream deletion, HTTP/WebSocket smoke, offline GitHub and the
installed gh CLI. Six other localhost client journeys and six transport cases
passed; the final upstream client journey now passes with Git LFS installed,
including its byte-for-byte configuration preservation assertion. This exposed
and fixed the passive native LFS listing write documented above. No
legacy-removal gate is closed by this increment. Clone, worktree creation and
submodule destination account selection need provisional scopes;
sign-in/import/publish and complete platform flows remain open.

## Assigned-account pull request API replacement evidence

The assigned creation path now uses fixed `gh api graphql` calls with JSON stdin,
not a token-pinned high-level parent that reads native Git configuration. This
preserves the pinned gh creation mutation fields: repository ID, explicit base
and qualified head, title/body, draft and `maintainerCanModify: true`. The
repository's identity and node ID are verified together; open-PR candidates use
bounded cursor pagination and exact head-label/base matching. Cycles, truncated
or malformed pages cannot certify that no PR exists. Same-repository equal
head/base requests fail before preflight. API errors and raw diagnostics remain
private; only a verified same-repository HTTPS PR URL is returned on success.

The captured numeric actor and saved account/source witness are rechecked
between reads and the mutation. All post-mutation scope failures preserve the
instruction to inspect GitHub before retrying. A request-local remote-write
marker carries that instruction through CLI signals, WebSocket cancellation
and command timeouts; queued and preflight-only cancellations keep their
ordinary guidance. Generic session dispatch refuses both creation and checkout
so a new caller cannot reintroduce either high-level Git-spawning parent.
Effective/unbound mode retains native behavior.

The implementation follows the pinned
[creation context and duplicate check](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/pr/create/create.go#L517)
and [GraphQL mutation](https://github.com/cli/cli/blob/v2.103.3/api/queries_pr.go#L490).
Fixed API processing keeps stdin literal and avoids repository placeholders;
see the pinned [API command](https://github.com/cli/cli/blob/v2.103.3/pkg/cmd/api/api.go#L311).
Six integration sections pass through actual installed gh and a verified local
TLS proxy: literal stdin, named actor without Git children, duplicate pagination,
private provider errors, actor/source/account fences, queued/no-account/effective
modes and both CLI and active-WebSocket cancellation after a remote write.
The nine saved-account regression sections also pass. The complete frontend
suite passes 66 tests, including current/stale checkout refresh and partial
failure behavior. No legacy-removal gate is closed by this increment.

## Assigned-account pull request tracking replacement evidence

PR checkout now distinguishes a validated declared head remote from the base
PR-ref fallback. Known heads extend the captured checkout credential scope with the one verified
head-fetch destination. The same session, account basis and endpoint witnesses
stay active through fetch, branch creation/fast-forward, native LFS/hooks and
private-ref cleanup. The fetched private ref must match the
API head OID before a guarded direct-ref transaction updates the canonical
remote-tracking ref. Fetch uses an empty `--refmap` so native opportunistic updates
cannot bypass that transaction; an isolated native-Git probe proved the previous
implicit update and its suppression. New local branches use native
`--track=direct`, retaining
Git's explicit upstream and `autoSetupRebase` behavior even when automatic merge
tracking is disabled. Existing/current branch settings remain caller-owned.
Only the missing-head-remote path prefixes a default-branch head with its owner.

For the PR-ref fallback, a nonempty effective branch merge value preserves all
tracking settings, including `gh-merge-base`. Otherwise an editable surviving
fork supplies the generated remote URL; deleted/uneditable forks use the base
remote and `refs/pull/NUMBER/head`. Remote, pushRemote and merge publish together
through a witnessed native-config lock. The fixed `gh config get git_protocol`
read uses no API credential and preserves the host's native HTTPS/SSH preference.
The common local config must be a regular nonsymlink file of at most 8 MiB,
without foreign config locks, in a writable directory supporting atomic rename.
Original bytes, permissions and effective included settings are rechecked;
included/global files are not rewritten. A refused tracking write may follow a
completed branch switch; callers must refresh local state on either result.
Abrupt process death or filesystem failure may require inspecting leftover locks.

The shared reference guard now supports both absent creation destinations and
expected-old direct-ref updates. Existing native user callbacks keep their
inherited caller/broker configuration. Guard tests exercise normal delegation,
same-OID symbolic replacement, stale tip and source-ref races; tracking-plan and
config-lock units cover caller-setting preservation and refusal paths.
All seven native tracking integration sections pass: declared-head fetches with
no base PR ref, explicit native tracking/rebase settings, preserved existing
settings, a repeated fast-forward requiring a missing real LFS object,
HTTPS/SSH and case-preserving fallback URLs, deleted-head/default naming,
nonempty/empty merge settings, symbolic/tip ref races, and configuration changes
during fetch or post-checkout. The final source also passes 106 Rust tests and
all-feature Clippy; 66 frontend tests pass. Supported desktop platform validation
and broader account/destination scopes remain open.

## Worktrees, submodules, and settings replacement evidence

Rust implements linked-worktree listing/add/move/remove/lock/unlock and prune,
with registered-path validation, dirty-checkout protection, and byte-preserving
paths. Submodule listing/add/update/sync/deinit use actual Git metadata and
commands. Local integration fixtures cover worktree lifecycle/locks/dirty data,
submodule staged/dirty protection and initialization, exact Gitlink conflict
choices without overwriting nested local files, and saved native root paths.

The app has atomic partial preferences updates, synchronized theme/polling
changes, and an explicit local/global Git settings API with an allowed-key list.
Tests isolate global Git configuration and verify credential-key exclusion,
configuration inheritance, default branch initialization, corrupt preference
preservation, concurrent patches, WebSocket settings without a repository, and
cross-client preference events. DOM tests exercise management controls and
non-forcing mutations. Worktree display helpers and the uncommitted-changes
strategy model now use shared source; the legacy Node path adapter remains until
its callers are removed.

Native desktop platform integration, richer persistence/import of existing
Desktop data, worktree repair/retry flows, nested submodule UI, and complete
settings parity still require audit before full legacy removal.

## Durable conflict resolution Undo replacement evidence

`resolve_conflict` and successful `stage_conflict` now prepare a durable
version-3 journal before index or working-file publication. They return an
`undo_id` accepted by `undo_discard`, CLI `undo`/`discard-undo`, the immediate
resolution control and the shared persisted history. Choice Undo restores the
previous raw file/symlink and exact unmerged index stages, refusing newer
working contents. Edited-stage Undo restores unmerged entries while keeping
later working-file edits/deletion. Gitlink choices/Undo never rewrite a child
checkout. Normal index restoration preserves unrelated staged entries; special
flags use the same stricter exact-index snapshot policy as discard.

Prepared records recover working-file-only or index-only publication prefixes.
Original stage blobs are backed up without replacement refs and can be restored
after object eviction. Split-index bases are retained independently. Available
LFS bodies are verified and retained; bodies unavailable before resolution are
explicitly recorded, and their pointer blobs/raw working files remain saved.
Undo does not fetch missing data or fabricate cache contents. A missing LFS tool
therefore does not prevent deletion choices or restoration of saved raw files
and pointers. This optional retention policy applies only to resolution
journals; version-2 discard still requires every original staged LFS body.
Version-1/version-2 records remain readable.

HEAD, branch, operation context, selected entries and appropriate working-file
states are checked before publication/restoration. File-ref repositories hold
HEAD/current-branch locks. Reftable conflict operations retain the index lock
and optimistic context guards; exclusive fencing against direct reftable ref
writers is still outstanding. No claim of an exclusive editor/working-file
reservation is made. Full native filesystem behavior and remaining rename, batch
and recovery orchestration remain under the broader removal gates.

`tests/conflict_undo.py` covers ours/theirs/deletion, newer-file refusal,
index-only Undo with newer edits/deletion, unrelated staged data, raw paths,
UTF-16 conversion, SHA-256, split indexes, linked worktrees, reftable,
interrupted publication prefixes, stale HEAD/branch/operation context, ref
changes during saved-object restoration, legacy journal defaults, symlinks,
object replacement/eviction, Gitlinks, retained/evicted LFS bodies and
previously unavailable bodies/tooling. DOM tests cover receipt IDs,
root/operation guards, clearing stale shortcuts, purpose-specific persisted
history and unavailable-LFS messages. The complete localhost editor-client
journey undoes edited staging without losing a later edit, applies/undoes a side
choice, stages again and continues the merge. These checks exercise the actual
Rust service and do not certify physical native rendering.

Termux validation passed all-feature Clippy, 18 Rust tests, 20 frontend tests,
six transport tests, both localhost client journeys and the conflict Undo,
editor, history, management, discard/advanced/GC, LFS and bridge smoke suites.
The standalone frontend passed formatting, type checking and rebuilding. Root
`npm run lint:fix` remains unavailable because legacy Prettier is not installed.
The new conflict suite is included in Rust CI; both editor/conflict suites
discover installed Git LFS as well as accepting an explicit tool path.

## External editor and edited-conflict replacement evidence

Source audit of `ui/lib/conflicts/unmerged-file.tsx` and the store editor
methods shows that manual resolution delegates to the selected external editor.
The Rust replacement preserves that workflow, with editor discovery/custom
command settings and application `available_editors` / `open_editor` RPCs.
Executable and argument vectors stay separate; placeholders preserve native
repository/ file bytes. Targets are checked against the selected repository and
metadata paths are refused, including symlink aliases. Browser launches refuse a
terminal-only editor; the CLI replaces its process to preserve TTY, signals and
exit status. GUI processes are reaped while the service runs, report immediate
failure and remain independent on shutdown. Existing preference files migrate
through a default field without being rewritten by reads.

`stage_conflict` stages the saved working file through a temporary index. Its
certificate binds selected conflict entries, working content/mode, repository
identity, HEAD/branch, operation state, attributes and relevant conversion
configuration. It checks the certificate before/after Git conversion, retains
unrelated index entries, and atomically publishes only the completed index. Git
filters and working-tree encodings remain native behavior. Git's detected
conflict markers require explicit consent; diagnostics retain normal Git
filter/binary limitations. Nothing claims an exclusive working-file reservation
against an editor or arbitrary external process. The UI refreshes the review
after editing and clears stale marker consent.

`tests/editor_conflicts.py` exercises literal/raw argv, path and repository
fences, settings validation/default compatibility, native CLI TTY/exit status,
GUI launch errors/lifetime, reviewed marker choices, deletion, encoding,
SHA-256/split indexes, real LFS cleaning and clean-filter cancellation. DOM
coverage handles settings, terminal guidance, stale roots and marker consent.
The complete localhost client test configures a deterministic external-editor
fixture through the real preferences service, edits a conflicted file, rejects
its old certificate, refreshes/stages the new version and continues the merge.
This validates the launch contract, not a physical GUI application on Android,
Linux, macOS or Windows. Full editor catalogs, file-manager/terminal launchers
remain under their corresponding migration gates. Durable conflict Undo now
covers common choices and edited-file staging as described above.

Termux checks passed formatting, all-feature Clippy, 18 Rust tests, 18 frontend
tests, six transport tests, both full-client journeys, editor/conflict/history/
settings integration suites, advanced discard regressions and bridge smoke.
Oversized serialized UTF-8 requests now fail locally before socket transmission,
leaving the session available; tests cover the exact 64 KiB boundary, multibyte
text and JSON escaping. Root lint still stops at missing legacy Prettier.

## Native shell and transport lifecycle evidence

The optional `desktop-native` crate uses Wry/Tao on Linux, macOS, and Windows,
loads the existing embedded browser UI, and shares its authenticated WebSocket
operations. Desktop dependencies are optional and target-gated; default Termux
builds remain headless. Navigation is confined to the session document and
remote HTTP(S) links use the system browser. Ordinary native hosting exposes no
native IPC API. Explicit smoke mode checks asset imports, WebSocket
authentication, preferences/registry RPC, and management UI mounting before
closing.

The bridge now provides owned start/wait/shutdown APIs, requests shutdown when
its owner drops, and stops authenticated and pre-authentication WebSocket
sessions. Local integration tests verify orderly shutdown, port release, and
drop behavior. Navigation policy tests cover origin/port/path and unsupported
URL schemes. Configuration defaults honor XDG overrides and use native macOS and
Windows application-data locations; unit tests verify the current target and
missing/relative-path errors. A Python integration check also verifies that
shutdown stops an in-flight gh process. Desktop CI jobs are configured to
compile and test all three supported OSes and run a Linux smoke check, but those
jobs and a real native window have not run in this Termux environment. Native
platform completion remains unchecked, as do production browser journeys,
Windows process-tree cancellation, desktop integration, packaging, and releases.

## Cancellation and connection recovery evidence

Version 3 of the bridge keeps requests ordered per session, with 32 pending
requests and 16 simultaneous sockets as bounds. Cancel controls bypass the queue
and can only target that session. Active and queued requests produce explicit
cancellation replies; duplicate in-flight IDs close their session. Cancellation
reaches process execution, repository mutexes, and atomic metadata lock waits.
Unix process groups receive SIGINT with a cleanup grace period, then forced
termination of remaining group members. Disconnect and shutdown also drain
active work; completed effects are not rolled back.

`tests/cancellation.py` runs actual Git commit hooks and a local gh fixture with
an interrupt-resistant descendant. It verifies index-lock cleanup, unchanged
staged content, cancelled queued mutations, lock waits, cross-session isolation,
queue bounds, and cleanup on disconnect/duplicate IDs/shutdown. The browser also
supplies snapshot root IDs with bound operations. The server checks those IDs
under the repository-selection lock, and a two-repository queue test proves a
stale branch mutation cannot run against another tab's newly selected root. Rust
tests cover scope propagation and cancelled metadata locks preserving the
original file. `tests/signals.py` verifies typed CLI SIGINT/SIGTERM cleanup,
conventional exit codes, synchronous metadata-lock cancellation, and unchanged
exec-passthrough signal behavior. Server/native shutdown handlers share the same
signal source.

The browser now exposes Cancel work and Reconnect, accepts AbortSignal requests,
and automatically reauthenticates after transient socket loss without replaying
mutations. State/preferences are refreshed and stale panel state cleared.
Transport tests cover cancellation cleanup, bounded pending work, terminal auth
failure, initial recovery and stale socket replies. The complete web client is
also tested in JSDOM against the actual Rust HTTP/WebSocket server, including
real Git-hook cancellation, disconnect during a commit, preference changes while
offline, and reconnection without replay. This is DOM/protocol evidence, not
visual browser or native-window validation.

Windows descendant cleanup, detached helper ownership, live progress streaming,
large-repository responsiveness, complete recovery UX and actual browser/native
platform journeys remain to audit before deleting all legacy runtime modules.

## Upstream Git module audit

Each item below is a source module to audit, not an automatically approved
removal. “Partial” means corresponding Rust primitives exist; complete upstream
semantics and tests have not been ported. Nested assisted-commit modules and the
app's models/stores/UI/platform integrations also require audit.

| Upstream module (`app/src/lib/git/`) | Replacement status                                                                                                                                                                                                |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `add.ts`                             | Partial; inspect corresponding typed operation and integration coverage                                                                                                                                           |
| `apply.ts`                           | Partial: transactional staging/unstaging and reviewed selected-line discard with durable undo implemented; remaining caller/filter semantics pending                                                              |
| `assisted-commit-push.ts`            | Pending semantic audit and replacement                                                                                                                                                                            |
| `authentication.ts`                  | Partial: saved-record HTTPS credential broker and headless failures implemented; full sign-in/import/platform flows pending                                                                                                                                                                            |
| `branch.ts`                          | Partial: reviewed create/rename/local-delete and per-destination remote/combined upstream deletion, creation identity guard, case-only rename and default-branch permissions with recovery implemented; verified fork preferences/cache and parent default selection implemented; parent upstream setup after association implemented; GitHub name/ruleset checks implemented; saved-record account assignment implemented; provisional clone/worktree/submodule credentials, startup/platform and remaining callers pending                                                                      |
| `checkout.ts`                        | Partial: reviewed local/remote leave/bring, stash replacement, native submodules/hooks and phase recovery implemented; reviewed create uses shared engine; remaining callers/auth/protection/native audit pending |
| `checkout-index.ts`                  | Pending semantic audit and replacement                                                                                                                                                                            |
| `cherry-pick.ts`                     | Partial; inspect corresponding typed operation and integration coverage                                                                                                                                           |
| `clone.ts`                           | Partial; Rust clone and saved repository flow covered offline                                                                                                                                                     |
| `coerce-to-buffer.ts`                | Pending semantic audit and replacement                                                                                                                                                                            |
| `coerce-to-string.ts`                | Pending semantic audit and replacement                                                                                                                                                                            |
| `commit.ts`                          | Partial: native commits with staged-blob size review, explicit consent and hook/cancellation coverage; remaining callers pending                                                                                  |
| `config.ts`                          | Partial: scoped supported Git settings and initialization policy implemented; full config callers pending                                                                                                         |
| `core.ts`                            | Pending semantic audit and replacement                                                                                                                                                                            |
| `create-tail-stream.ts`              | Pending semantic audit and replacement                                                                                                                                                                            |
| `credential.ts`                      | Pending semantic audit and replacement                                                                                                                                                                            |
| `description.ts`                     | Pending semantic audit and replacement                                                                                                                                                                            |
| `diff.ts`                            | Partial: structured working/history/conflict previews, ordinary LFS payloads and selection implemented; larger/custom-filter/image workflows pending                                                              |
| `diff-check.ts`                      | Partial: native marker diagnostics and explicit consent for edited-resolution staging; other callers/status propagation pending                                                                                   |
| `diff-index.ts`                      | Pending semantic audit and replacement                                                                                                                                                                            |
| `environment.ts`                     | Pending semantic audit and replacement                                                                                                                                                                            |
| `fetch.ts`                           | Partial; inspect corresponding typed operation and integration coverage                                                                                                                                           |
| `file-version-fence.ts`              | Pending semantic audit and replacement                                                                                                                                                                            |
| `for-each-ref.ts`                    | Pending semantic audit and replacement                                                                                                                                                                            |
| `format-patch.ts`                    | Pending semantic audit and replacement                                                                                                                                                                            |
| `git-delimiter-parser.ts`            | Pending semantic audit and replacement                                                                                                                                                                            |
| `gitignore.ts`                       | Pending semantic audit and replacement                                                                                                                                                                            |
| `index.ts`                           | Pending semantic audit and replacement                                                                                                                                                                            |
| `init.ts`                            | Partial; new-repository initialization and registry covered offline                                                                                                                                               |
| `interpret-trailers.ts`              | Pure parsing moved/shared; Rust history uses Git trailer parsing; merge-trailer semantics pending                                                                                                                 |
| `lfs.ts`                             | Partial: typed setup/attributes, payload journaling/previews and ordinary text selection implemented; typed transfers/tracking implemented; legacy callers, extensions and platform audit pending                 |
| `log.ts`                             | Partial; inspect corresponding typed operation and integration coverage                                                                                                                                           |
| `merge.ts`                           | Partial; inspect corresponding typed operation and integration coverage                                                                                                                                           |
| `merge-tree.ts`                      | Pending semantic audit and replacement                                                                                                                                                                            |
| `multi-operation-terminal-output.ts` | Pending semantic audit and replacement                                                                                                                                                                            |
| `owned-file-lock.ts`                 | Pending semantic audit and replacement                                                                                                                                                                            |
| `pull.ts`                            | Partial; inspect corresponding typed operation and integration coverage                                                                                                                                           |
| `push.ts`                            | Partial; inspect corresponding typed operation and integration coverage                                                                                                                                           |
| `push-terminal-chunk.ts`             | Pending semantic audit and replacement                                                                                                                                                                            |
| `rebase.ts`                          | Partial; inspect corresponding typed operation and integration coverage                                                                                                                                           |
| `reflog.ts`                          | Pending semantic audit and replacement                                                                                                                                                                            |
| `refs.ts`                            | Pending semantic audit and replacement                                                                                                                                                                            |
| `remote.ts`                          | Partial; inspect corresponding typed operation and integration coverage                                                                                                                                           |
| `reorder.ts`                         | Pending semantic audit and replacement                                                                                                                                                                            |
| `repository-operation.ts`            | Partial: ordered bounded sessions and scoped cancellation implemented; remaining operation callers pending                                                                                                        |
| `repository-operation-context.ts`    | Partial: ordered bounded sessions and scoped cancellation implemented; remaining operation callers pending                                                                                                        |
| `reset.ts`                           | Pending semantic audit and replacement                                                                                                                                                                            |
| `rev-list.ts`                        | Pending semantic audit and replacement                                                                                                                                                                            |
| `rev-parse.ts`                       | Partial; inspect corresponding typed operation and integration coverage                                                                                                                                           |
| `revert.ts`                          | Partial; inspect corresponding typed operation and integration coverage                                                                                                                                           |
| `rm.ts`                              | Pending semantic audit and replacement                                                                                                                                                                            |
| `show.ts`                            | Pending semantic audit and replacement                                                                                                                                                                            |
| `spawn.ts`                           | Partial: bounded capture, cancellation, Unix groups, timeout and signals; streaming and Windows process trees pending                                                                                             |
| `squash.ts`                          | Pending semantic audit and replacement                                                                                                                                                                            |
| `stage.ts`                           | Partial; inspect corresponding typed operation and integration coverage                                                                                                                                           |
| `stash.ts`                           | Partial: structured listing, saved files/index, branch markers/move, reviewed apply/pop/drop, checkout leave/bring and rename reassociation implemented; remaining callers/platform audit pending                 |
| `status.ts`                          | Partial; inspect corresponding typed operation and integration coverage                                                                                                                                           |
| `submodule.ts`                       | Partial: structured state and lifecycle operations implemented/tested; complete nested/filter parity pending                                                                                                      |
| `tag.ts`                             | Partial; inspect corresponding typed operation and integration coverage                                                                                                                                           |
| `update-index.ts`                    | Pending semantic audit and replacement                                                                                                                                                                            |
| `update-ref.ts`                      | Pending semantic audit and replacement                                                                                                                                                                            |
| `var.ts`                             | Pending semantic audit and replacement                                                                                                                                                                            |
| `worktree.ts`                        | Partial: lifecycle, locks, prune and byte paths implemented/tested; repair/retry/import flows pending                                                                                                             |

## Publication preparation

Read-only publication context and organization listing are available through
CLI and the typed protocol even when no origin exists. Account selection is
explicit; organization pages are bounded and verified against the selected
numeric actor, and account and remote changes invalidate an in-flight result.
The description reader rejects symlinks and non-regular files without blocking.
Provider responses that reflect credentials are rejected before exposure.

The offline `publish_context.py` fixture passes CLI/protocol parity, effective
credentials with an empty account catalog, actor and source races, numeric-ID
checks, bounded pagination, encoded credential reflection, and corrupt unrelated
legacy association data. Rust workspace tests, Clippy, formatting and build
also pass. Publication preview, remote creation, durable phase receipts, saved
repository/account revalidation, first push and partial-failure recovery remain
open; no legacy-removal gate is closed by this preparation.

## Read-only publication review

A typed preview and CLI command bind the exact proposed host, account, owner,
name, description and visibility to the verified actor and organization IDs,
saved account state, remotes, Git configuration and planned branch tips. It
rechecks local state after provider reads and orders a known default branch
before the current branch. Unborn or detached repositories show no planned
pushes. For a repository with a prior remote, the existing Desktop-compatible
branch policy resolves remote HEAD and tracking. Credential reflection is
rejected, and numeric IDs are limited to JavaScript-safe integers.

The localhost management panel exposes the review and a separately confirmed
origin/account step that does not push.
The offline integration fixtures pass account, branch, concurrent-state and
credential-reflection checks. The preview does not reserve a name or establish
creation permissions. It returns `can_apply: false` while full publication,
account-bound first push and reconciliation remain unimplemented. A separate
`can_create` describes availability of remote-only creation. All removal gates
remain open.

## Publication recovery records

History and idempotent acknowledgement operate on scoped, bounded local
records with fixed public phases and errors. Reads reject symlinks and special
files, and acknowledgement writes atomically while the saved registry record is
locked. URLs are withheld until their provenance can be verified. The offline
fixture covers namespace and record isolation, corrupted and oversized files,
symlinks, FIFOs, credential reflection and a concurrent registry replacement.
The localhost panel can display and acknowledge recovery records without
replaying publication; its WebSocket integration uses a synthetic receipt.
The remote-only create command persists an authoritative intent in the private
registry before its fixed GitHub POST. The registry blocks a second attempt
after an uncertain or confirmed outcome, including after acknowledgement. It
checks saved record, worktree and common Git directory identities, and reports
an interrupted or unverified response as uncertain. The CLI requires explicit
acknowledgement of its partial scope. For confirmed creations with durable identity, a read-only continuation review
revalidates actor, owner, remote numeric ID and HTTPS URL and rechecks the
repository and account witnesses; older receipts without identity and unknown
outcomes are not adopted. A reviewed continuation can add a verified HTTPS
`origin` and associate the chosen account, with durable phases before each
effect. It rejects unsafe Git config files, includes, URL rewrites and existing
origin settings; it performs no push. Independent writers that ignore Git's
config lock are not reserved by that lock. Account-bound pushes and explicit
reconciliation remain open. Preview and creation currently fail closed on
non-Unix platforms pending equivalent directory identity checks.

## Other legacy boundaries

| Area                                                 | Current status                                                                                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `app/src/main-process`, `app/src/cli`                | Partial: headless CLI and optional Wry/Tao shell implemented; native validation and remaining platform responsibilities pending       |
| `app/src/lib/stores`, persistence and preferences    | Partial: repository/preference persistence and configuration implemented; remaining stores/import pending                             |
| `app/src/lib/api`, sign-in/token/account state       | Partial: typed gh services and auth status; full credential/account flows pending                                                     |
| `app/src/ui`, models, styles, static assets          | Partial: shared components and diff models migrated; GitHub/diff panels tested; full UI reuse pending                                 |
| Notifications, filesystem/editor/shell integration   | Partial: external editor discovery/custom commands, CLI TTY and browser GUI launches implemented; other adapters/native audit pending |
| Updates, statistics, crash reporting                 | Pending explicit replacement decisions and implementation                                                                             |
| Copilot/assisted commits and operation recovery      | Pending replacement                                                                                                                   |
| Electron native vendor modules and bundled Git       | Pending removal after replacement                                                                                                     |
| Root npm/Webpack scripts, CI, packaging and releases | Root Cargo workspace and Rust/web CI implemented; legacy release/packaging removal pending                                            |

The active goal remains incomplete while these rows or gates are unresolved.
