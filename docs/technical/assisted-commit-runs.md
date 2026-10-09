# Assisted commit runs

The Changes action now connects the repository-owned assisted mode to a real,
awaited local transaction, optionally followed by a repository-authorized push.
Ordinary commits,
amend/squash forms, tutorials, and standalone commit-message generation keep
their separate paths.

## Ownership and UI

`ChangesSidebar -> FilterChangesList -> CommitMessage -> Dispatcher ->
AppStore._createCopilotAssistedCommits` is the request path. Dispatching the
callback is not success. The returned `AssistedCommitRunOutcome` distinguishes
`local-ready`, `pushed`, `push-error`, cancellation, declined consent, busy
admission, and local transaction errors.
Only a verified executor result can reach local acceptance.

`IChangesState.assistedCommit` is a discriminated state: idle, consent,
preparation/capture, analysis/whole-selection summarization, validation,
committing (zero-based index, total, title), finishing, push preparation,
pushing/refreshing pushed commits, rollback, or error.
AppStore owns the run ID, AbortController, original repository/account intent,
immutable request/options, snapshot, checked plan, result, and retained recovery
capability. Components own only presentation. Switching tabs/repositories or
unmounting the form does not cancel or orphan a run.

RepositoryStateCache reconciles assisted state by database ID, independently of
the repository's metadata hash. An alias or refreshed GitHub metadata must not
hide progress, permit a duplicate run, or disconnect Cancel. Distinct repository
IDs retain independent preferences, progress, and errors. The existing
per-repository commit-mode and assisted-push storage supply restart persistence;
active runs and
recovery capabilities are not reconstructed after process death.
Native GitStore publication has one authoritative store per repository ID/path;
obsolete metadata-hash emissions cannot replace a newer tip or local-commit list.
Historical getters route native work to that authoritative store while preserving
newest draft/co-author input revisions.
Path-changing transfers do not forward old-hash writes into the new path.
Old background stores stay isolated and cannot overwrite the moved history.

The animated panel announces concise phases and actual commit indices/titles.
Cancel remains reachable until acceptance and is disabled during recovery.
Push preparation remains reversible; native push entry removes rollback Cancel.
Push failures keep their own inline error and Retry push, even with no selected
Changes or no current Copilot eligibility.
Settled errors are inline, with details using existing error presentation;
unresolved recovery offers Retry rollback, not a dismiss-to-ready escape.
Error state records whether original settlement is still underway. Retry and
Dismiss are disabled in UI and backend until that exact owner has settled; error
publication does not itself release Git ownership.
Required recovery remains reachable independently of preferred Manual/Copilot
mode or current execution eligibility.
Manual fields remain inert/AT-hidden, and their draft is never replaced or
cleared by assisted success, failure, cancellation, or an empty commit.

## Admission, consent, and frozen inputs

Both UI and backend require the preview gate, an authenticated Desktop-enabled
eligible account, SDK permission, and the packaged runtime. The existing
commit-message model preference resolves to `CopilotModelRequest`, including
BYOK credentials. There is no new picker or hardcoded model/effort.

Unknown co-author and filtered-hidden-selection confirmations remain ahead of
execution. Desktop first prepares an opaque, weakly owned first-click intent
with immutable request, repository/HEAD, account/model and file versions.
Warning continuations keep immutable file/line selections,
trailers, and options; a stale continuation cannot silently use a broader set.
AppStore also checks selection, branch intent, mode, amend/conflict state,
options, and account intent after awaited preflight steps.

Assisted consent has its own `AssistedCommitDisclaimer` and 30-day timestamp,
not the manual-generation disclaimer's continuation or acceptance. It accurately
describes one or more generated local commits and cancellation. Declining starts
no snapshot, model analysis, or history mutation. Local preflight versions read
only selected filesystem metadata (not file contents/diffs or a Git snapshot),
so consent/keychain waits can reject newly edited selected files. These versions
are conservative freshness checks, never executor authority.
Every requested partial mask is also certified against its retained Desktop
diff basis before those versions become first-click freshness. This local
selection verification is not AI analysis or transaction snapshot capture;
read-only diff commands cannot stage or refresh the real index. Verification
repeats before capture and before authorizing the captured capability. Changed
or unverifiable initial masks require reselection, not a fresh numeric remap.
Retained bases include their original selection shape. Display refresh in
eligible assisted mode validates initial line selections before changing
selectable bounds. Incompatible views are excluded for reselection. Lineage
also survives derived `All`/`None` shapes across mode/fallback transitions, so
implicit whole-file promotion cannot bypass backend certification later.
Only explicit user selection updates establish a new basis; refresh never
manufactures a basis for an unverifiable partial mask.
An authorized snapshot temporarily owns retired UI masks while reconciliation
installs current selection authority; that handoff is not an unverifiable new
selection. Settled presentation-only errors are not read owners, even when an
ownerless reader temporarily marks their presentation as settling.

After admission and consent, the transaction engine freezes and verifies exact
selected bytes, identities, line selections, HEAD, and original index. Only
snapshots matching the original preflight versions and complete intended HEAD
can proceed to planning; an internally consistent newer capture is not authorization.
Only
`snapshot.analysis` crosses the planner boundary. The layer-three planner
validates the entire plan and every cumulative tree before execution. Its
uncertainty/valid-unsafe-split fallback requests a fresh whole-selection message;
invalid output, quota/auth failures, stale content, or observer errors never
trigger fallback.

Generated messages are checked against applicable repository rules before any
commit, including configured trailers/sign-off, author/committer email and branch
constraints.
Validation reads the snapshot's frozen identities/configuration, not newer live
Git settings. Complete raw native commit messages/identities are checked again
before each created object is published, including hook-modified messages.
Display-oriented truncated summaries/bodies and synthetic separators are never
used as validation input. Prepared custom-model intent also freezes non-secret
provider/model definitions; deletion or modification fails rather than silently
switching an assisted request to the default model.
Provider and credential revisions are frozen before awaited preflight, checked
through planning/publication/acceptance, and changes abort affected active runs.
Empty commits bypass this model/credential continuity check entirely.
Native message prevalidation uses hook-free, signing-free private commit
metadata under the already-validated plan. It changes no real refs or index and
does not count as a user commit. This gives exact `git commit --signoff` and
cleanup semantics rather than approximating sign-off with configurable
`interpret-trailers`. Temporary message metadata is snapshot-owned and disposed.
Messages are not wrapped, truncated, or otherwise rewritten beyond the existing
Git message/trailer conventions. Every generated commit receives the same
captured co-authors, sign-off, and skip-hooks options.

With no selected changes and Allow empty commit enabled, Desktop validates one
explicit plan titled exactly `Empty commit`. It performs no model request,
credential resolution, AI consent surrogate, or title prompt. Hooks may run;
a hook changing the required title causes rollback. Allow-empty resets only at
accepted success, and the manual summary/description remain unchanged.

## Coordinating Desktop Git activity

Git mutations sharing overlapping working files or Git metadata are conservatively
serialized, including parent checkout and cross-worktree branch rename. Unrelated
repositories retain independent state and execution. Existing input restoration
(Undo/amend/co-authors) advances the shared input revision just like manual edits.
Mutation admission resolves each caller's working, Git, common and object
directories, including transitive native/environment-provided alternate object
stores and peer linked worktrees outside the main checkout. Git resolves the
alternate dependency graph; Desktop does not change its environment or config.
Cleanup
snapshots become selection authority only after original first-click binding
succeeds; rejected captures cannot authorize replacement-content selections.
Complete resource-set ownership allows nested operations from the same caller,
such as ordinary create-and-checkout in a linked worktree. Observer callbacks
inherit neither Git nor destructive-resource ownership. Locate guards a missing
old path without querying vanished Git metadata, then guards the chosen path.

`git/repository-operation.ts` supplies per-canonical-path leases and tracks full
operations plus their Git subprocesses. Acquisition blocks new writers, then
drains already-admitted work before capture. It never kills a status reader or
reads around an in-flight index mutation.
AppStore rejects already-admitted mutations before registering an assisted run.
This keeps ordinary compound operations intact, rather than letting a new
preparing/consent owner interrupt their later checkout. Low-level acquisition
still drains complete admitted readers; new mutations never queue behind a run.
Ordinary mutation reservations are not exclusive destruction locks: background
fetch does not newly prohibit an otherwise-enabled manual commit or checkout.
Both kinds register complete lifetimes for reciprocal assisted admission.
Worktree add/read/switch and paired local name/email writes run through
Dispatcher/AppStore as whole operations. Worktree add/move guard canonical
destinations as well as source resources.
Shared ancestry checks handle filesystem roots without doubling separators,
including Windows drive roots, while retaining canonical case normalization.
Clone operations reserve their destination before preparatory Git/auth/progress
work and retain canonical protection through recursive checkout. Clone dialogs
disable affected destinations and revalidate after remote-info waits.
Native clone subprocess ownership derives from its explicit destination, not
the application's execution cwd. Relative destinations follow native cwd
resolution, and unrelated clones remain independent of an assisted checkout
containing the unpackaged application. Other commands retain cwd ownership.
Read-only global configuration queries used during clone preparation have no
worktree admission resource: they cannot refresh its index and must not wait
behind the application checkout's lease. Global mutations remain guarded.
Configuration classification parses genuine flags and their operands once per
decision. Literal values after `--`, including `--get` or `--list`, never grant
read-only admission.
Repository creation likewise runs through Dispatcher/AppStore with a complete
destination reservation. Initialization, registration, template writes and the
initial native commit keep ownership even after dialog dismissal/unmount.
Creation options are frozen before those awaits; protected destinations are
disabled and rejected before filesystem writes.
UI selection/dismissal runs after native creation ownership ends. Error handlers
leave both Git and destructive authority; delayed continuations retain no
destructive privilege once their exact operation token has finished.

AppStore mutation entrypoints and GitStore operations participate in this
coordination. Competing commit/amend/checkout/rewrite/discard/network/worktree
operations fail rather than queue a delayed mutation. Selection/options/mode
changes are likewise guarded, in addition to disabled UI, history actions,
menus, and toolbar controls.

Status/diff/indicator refresh requests coalesce during the owned scope. Other
readers defer until release. Full reader lifetimes are tracked so an existing
refresh cannot schedule an untracked index-refreshing subprocess after capture.
Transaction observers and UI emissions explicitly leave async operation
ownership; an observer cannot inherit permission to mutate the repository.
That includes streamed terminal chunks, GitStore updates, and AppStore errors.
Worktree move/delete operations guard both their command repository and target
worktree; another worktree cannot remove a running transaction's files.
Destructive parent/main-repository removal also guards every protected worktree,
Git directory and shared common directory, including a linked worktree outside
the main repository's filesystem tree.
Move/delete/discard guards cover affected directories and active descendants,
not just command cwd. They also protect files inside active roots, using
bidirectional overlap, and refuse admission against in-flight affected paths.
Deferred readers capture run association before waiting;
they cannot lose exclusion policy when the live run map is cleared.
Associated selection readers retain mutation admission and UI protection for
their complete verification/publication lifetime, even after the Git lease
releases. Settlement drains those readers before reusable admission. These reads
use command-local optional-lock-free strict error propagation; failures remain
inline and retryable rather than becoming quiet cancellation.
Status requests waiting behind sealed settlement carry only their exclusion
policy into the resumed read, not the old run's ownership or recovery fences.
Newly observed rows remain unchecked; ordinary later refreshes keep existing
behavior. A replacement run uses its own association, and the stale request
cannot clear its partial selections.
Physical working/Git/common/object protection is separate from the Git lease:
finalization does not remove it while readers or locked refresh recovery remain.
Related repositories' backend and UI admission use that same protection.
The context uses public async-hooks resource callbacks rather than Node's
AsyncContextFrame-backed AsyncLocalStorage, which can fatally crash in an
Electron renderer realm. This is exercised against the production Electron app,
not just Node unit tests.

Reconciliation inside the retained result/recovery scope uses command-local
`GIT_OPTIONAL_LOCKS=0`. Neither process.env nor Git configuration is changed.
Required assisted readers propagate errors rather than using GitStore's
ordinary success-shaped failable-operation defaults.
This prevents benign Desktop status refreshes from invalidating the original or
installed index. The engine continues its selected-file checks; unselected
working-file edits remain allowed and uncommitted, and are observed afterward.
Remaining/newly observed changes are excluded after success rather than being
automatically selected for the next assisted action.

## Cancellation, hooks, and recovery

Cancellation is cooperative: AppStore aborts its controller and settles only
its owned consent/hook popup. Native hook interception can stop a running hook;
Desktop still awaits the actual Git outcome before rollback. Ignore continues
the current ignorable hook failure, not a run-wide hook bypass. Later planned
commits still run hooks unless the user selected bypass up front.

All native hook failures, including ordinary commits and pulls, share one
owner-aware popup queue. Assisted failures retain their run-owned popup ID, so cancellation/dismissal cannot
close an unrelated dialog or leave a callback promise unresolved. Declining a
hook recovers the whole local run. Account/sign-in/token/policy revocation aborts
active work and remains an authorization error rather than a quiet cancellation.
Each resolver belongs to one immutable failure identity; stale repeated
settlement cannot remove or strand a later prompt.
Error cause traversal retains domain, SDK, billing, aggregate, cleanup, and
recovery identities, including wrapped cancellation and 402 display metadata.

The executor's `committed` progress is not completion. Even after successful
execution, AppStore retains the result's original-index backup through awaited
reconciliation and calls `verifyAssistedCommitTransaction` to recheck selected
content, full HEAD identity, and installed index. Cancel or selected-content
mutation here rolls back the successful result before acceptance.

Verified rollback restores only run-created history and the original index;
it never writes old bytes to the working tree. Original selections are restored
when independently verified unchanged, not inferred from an error code.
Mutated text selections are reconciled by original HEAD/content
anchors against the current diff, not stale unified-line offsets. Ambiguous,
atomic, renamed, removed, or changed-identity content remains excluded with a
review/reselection message. Newly observed unselected content stays excluded.
Partial restoration always compares canonical and displayed diffs, even when
selected-file metadata is unchanged: unselected attributes or textconv settings
can change display offsets without changing selected bytes.
Restored selection objects retain weakly owned canonical diff, full HEAD and
backing-version authority. Every later display installation verifies that
authority before updating selectable bounds; changed display/content is excluded,
never promoted implicitly to whole-file selection.
Whole-file and atomic restoration also retain HEAD/backing-version authority.
Newly authorised snapshots and successful Manual commits consume old UI
authority; failed commits retain it. Rollback creates fresh current-content
authority instead. Per-file partial masks retain their displayed diff basis when
created, independently of whichever row is currently visible. Pre-capture
cancellation and decline verify those individual bases without dropping
unchanged nondisplayed masks. Display certification uses actual whitespace
options, excluding unsupported views into a settled review state.
Reader failure invalidates uncertified restored selections even after the
original run is gone. Certified rows merge into the latest status rather than
overwriting unrelated newly discovered rows.
Manual commits consuming restored selections defer their selection readers
through the actual native commit and hooks. Success retires the consumed
authority before releasing those readers; failure retains it for verification.
An in-flight post-commit hook therefore cannot make the commit's own HEAD change
look like unauthorized selection drift.
After resource discovery, the admitted reader-gated Manual scope rechecks the
captured masks against current selection/status and certifies their original
HEAD/diff/file versions before any native staging. A refresh that invalidated
those masks during admission cannot authorize them again merely by finishing.
Certified restored partial diffs also follow the native Manual staging path.
After message/unstaging awaits, patch formatting uses that verified diff rather
than applying old numeric masks to a freshly fetched diff. Later unselected
edits remain in the working tree and cannot become committed selected lines.
Ordinary selections without restored authority retain their existing staging
behavior.
Ownerless refresh and commit admission certify every retained restored selection,
including nondisplayed files. Refresh-only restoration likewise merges checked
selections into current rows/status rather than reinstalling a captured list.

Interfered or failed recovery retains its real engine capability in AppStore,
the original cause and recovery metadata in state, and an explicit retry action.
Retry performs recovery/reconciliation only: no new planner, commits, or push.
External ref/index changes are never overwritten to manufacture ready state.
If rollback succeeded but status/selection reconciliation failed, the error
instead offers Retry refresh and retains the original cause; cancellation cannot
suppress that independent failure.
Unreconciled refresh errors still lock new commits and cannot be dismissed to
reuse stale selections. Metadata-hash transfers redirect old and current cache
representations to reconciled content while preserving draft inputs.
Restored selections carry a full-HEAD/file-version fence through deferred reads.
Every pre-capture exit, including Cancel and declined consent, independently
checks first-click freshness. Settled failures resume ordinary diff readers;
retained snapshot existence does not itself keep the UI frozen.
Uncaptured exits recheck versions after awaited HEAD/diff verification and carry
the same fence through teardown. Verified cancellation explicitly resumes the
current Changes diff as well as deferred History visualization.
Uncaptured exit reads use already-acquired ownership rather than waiting behind
their own lease. Required coalesced reconciliation finishes before acceptance;
an optional post-accept refresh failure retains accepted outcome/statistics and
offers refresh of current accepted state, never pre-run selection restoration.
Retry and dismissal deregister the exact old owner before publishing idle, so a
synchronous subscriber may safely start another run. Automatic history file/diff
loading deferred during retained result ownership resumes as a strict read after
release, even under retained refresh protection and when the already-selected
SHA remains unchanged. Failed visualization requests remain deferred until
success or explicit supersession. This optional visualization keeps ordinary
error handling separate from accepted transaction results. Accepted statistics
settle before optional History/error notification delivery; throwing observers
cannot reject an already accepted outcome or skip its bookkeeping.
Initial and retry publication run inside cleanup-protected ownership scopes.
Cancel records its idempotency flag before abort effects and notifies observers
afterward; notification failure cannot prevent signal/popup/hook cancellation.
Reader settlement drains and verifies until quiescent, then seals admission
before its final await returns. New reads coalesce until settlement completes.
Repeated invalidation retains existing causes, including SDK/billing metadata.
Deferred nonselection refresh failures use the same cause-preserving transition.
Mandatory teardown/completion bookkeeping is cleanup-protected independently
from error-notification delivery.
Final optional delivery is protected for cancellation, declined consent and
failed runs too. Verified settled outcomes stay controlled; existing errors
retain notification causes without restoring a removed owner or affecting a
replacement run. Deferred History waits for every unfinished/recovery owner,
not just owners with a successful executor result.
Verified cancellation and declined consent publish idle only after mandatory
reader/resource settlement, through guarded final delivery.
Successful retry publishes idle only through this settled delivery path, after
exact-owner deregistration and mandatory cleanup.

## Local acceptance and the later push boundary

`acceptVerifiedAssistedCommitTransaction` is the explicit local acceptance fence.
It holds parent-owned HEAD, full branch-ref and real index locks while completing
verification and the synchronous final authorization/cancellation check.
Recovery ownership is finalized while those fences remain held; a fence-cleanup
failure reactivates retained recovery. The closing UI phase disables cancellation
because this accepted boundary cannot be interrupted. `acceptLocalAssistedCommitRun`
then resets allow-empty/appropriate filters and returns to idle after owned
cleanup. Per-commit statistics count accepted commits, not rolled-back progress.
Final selected-content reads are followed by a complete backing-version vector
before the synchronous boundary; an earlier selected file cannot expire while a
later file is being read.
A final non-yielding metadata-only check closes the asynchronous sampling window.
Synchronous filesystem access is limited to this short acceptance fence; content
capture and all other transaction I/O remain asynchronous.
Post-accept presentation failures preserve truthful local-ready outcome and
accepted statistics. They never invoke pre-run selection restoration or rollback
after finalisation.
Ordinary Manual completion also treats a failed statistics write as nonfatal,
logging it without skipping draft/options/status/history success bookkeeping.

## Optional push and retry

The assisted secondary options menu exposes **Push after committing** beside
co-authors, sign-off, bypass commit hooks, and allow-empty. AppStore/Dispatcher
persist only this boolean under `assisted-commit-push-<repository ID>`.
Missing/invalid values are off. Repository aliases, metadata refresh, path moves
and reconstructed caches retain the same ID-specific preference; another ID
retains its own choice. No global/manual setting is migrated. Manual commits
never consult this preference.

First-click preparation freezes the preference independently of transaction
snapshot options. It also freezes the original canonical branch, configured
upstream/default remote, actual single push URL, relevant effective Git config,
and physical working/Git/common/object directory identities. A changed warning
continuation cannot add a push. Native preparation certifies that same
destination and full completed tip; switching the active UI repository never
changes the run's repository.

Only a complete successful local result can reach `preparing-push`.
`prepareAssistedCommitTransactionForPush` retains its rollback backup while
verifying selected content, installed index, full HEAD/ref, cancellation and the
destination under parent-owned real HEAD/ref/index locks. Those locks must clean
up successfully before spawn. Backing-file/config/environment fences and the
final authorization/signal check then run without yielding, immediately before
the native `git push` invocation. Backup finalization and the irreversible
`pushing` transition are adjacent to that invocation. The Desktop Git lease and
physical resource protection remain owned over the full network operation; no
native ref/index lock is held over credential prompts, hooks, fetch, or refresh.
No token bypass or unlocked live-branch push is used.
Post-acknowledgement Git work retains a scoped native-spawn owner check under the
already-admitted operation. Fetch, branch fast-forwarding and refresh commands
recheck original physical/routing identity immediately before execution, including
after earlier follow-up commands complete. Retargeting an execution alias cannot
borrow the cached original lease to mutate another checkout; acknowledged push
success remains intact and follow-up work stops with a refresh error.
Accepted repository refresh verifies ownership before operation admission and
uses the frozen canonical checkout for admission. Deferred History uses that same
canonical owner. A substituted alias cannot wait behind another repository's
recovery lease before the retained ownership check runs.
The negative admission certificate follows those reads into operation admission:
it is checked before and after awaited pathname resolution and after lease waits.
Replacing even the canonical checkout between initial verification and admission
cannot register work behind an unowned repository's recovery lease.
Push-retry discovery and lease-free accepted refresh recovery carry that same
negative admission certificate. Outstanding publication cleanup retains its
separate cleanup-first admission over the originally owned resources.
The lease retains that negative spawn check for later admitted work too; recovery,
deferred refresh and selection-reader settlement scopes carry it after network
completion. Retry refresh cannot install a retargeted checkout's status/history
under the old run's identity when upstream metadata already finished.
Requested aliases and the exact native execution path are both certified and
synchronously fenced, including configuration symlink targets. A retargeted
execution alias cannot borrow another checkout's otherwise valid retry proof.
Requested alias certification is filesystem-only and precedes native queries.
Those queries use the frozen execution checkout, so cross-retargeted retry
aliases cannot wait on each other's retained repository leases.
The fence includes linked-worktree `commondir`/`gitdir` routing files and all
configuration include targets, including empty or missing files. Adding a URL
rewrite through a previously empty include cannot change the accepted destination.
Unresolved `GIT_WORK_TREE` and `core.worktree` paths remain certified separately
from their physical targets. Retargeting a directory alias cannot change which
working files a later native refresh reads. Mutable private/common ref and reflog
trees allow ordinary Git creation, replacement and content changes, but reject
symbolic directory routing and symbolic/shared-hardlink leaves before native work.
Native shallow metadata and explicit `GIT_SHALLOW_FILE` routing receive the same
mutable-file certification and exact path/lock admission. Legitimate native
regular-file replacements remain allowed; a substituted symbolic/shared file
cannot change follow-up History through another repository's boundary metadata.
Native `info/grafts` and explicit `GIT_GRAFT_FILE` paths retain their original
versions and parent routes through follow-up reads. Introducing grafted history
expires the certificate, preserving the local transaction's no-grafts restriction
without rolling back acknowledged commits.
Loose and packed replacement refs are also refused before retained native work;
replacement/namespace environment changes expire the original certificate.
Custom replacement-ref prefixes or Git namespaces require normal Push review.
Missing optional graft-parent directories make automatic push unavailable, not
local execution: selected and Empty commits still complete with setup guidance.
Unexpected filesystem I/O remains explicit rather than treated as absence.
Missing optional shallow parents likewise refuse only automatic push. Native
private/common shallow aliases remain independently certified; existing symbolic
shallow routes require normal Push review instead of trusting a canonical target.
Additional configuration/metadata targets and lock paths undergo foreign-lease
admission before push intent is retained and again before acquiring the run lease.
An already-owned external configuration target cannot be borrowed for upstream
publication. Valid local commits finish with optional-push guidance instead.
Environment certification follows native Windows case-insensitive variable names,
including indexed configuration overrides; POSIX names remain case-sensitive.
Both entry and follow-up certificates retain `LOCAL_GIT_DIRECTORY`, which selects
Dugite's executable and default system configuration. Object-routing verification
has a 4096-entry inspection budget shared across admitted roots and uses bounded
directory iteration. Exceeding it refuses optional push, preserving valid local
commits; later growth stops follow-up work without revoking acknowledged success.
Explicit `GIT_DIR` and `GIT_COMMON_DIR` routes retain their unresolved pathname
and original target too; an unchanged environment string cannot authorize a
retargeted private or common directory.
Configuration inputs are read through nonblocking regular-file handles, with
target/handle identity checked after reading. Final synchronous verification
uses the same rule, so an ignored conditional include replaced by a FIFO cannot
block the renderer. An unsupported nonregular input makes automatic push
unavailable without preventing valid selected or empty local commits; after
acknowledgement it expires the original setup intent. Unexpected I/O remains an
explicit retryable refresh error rather than a stale-success fallback.
Regular-file ancestors and symlink-loop path components are proven unsupported
topology, with their original error retained. They make optional push unavailable
without blocking local selected or Empty commits; after acknowledgement, owned
cleanup completes before stale setup expires. Unexpected `EIO` remains retryable.
After capturing backing versions, preparation re-reads the complete effective
configuration graph and compares its entries, origins, and include directives.
Newly discovered dependencies reject certification instead of borrowing a new
parent version with an old target list. An initial mismatch becomes unavailable
optional-push intent, so valid selected or Empty local execution still completes
without attempting automatic push. Publication uses the same consistency
check before deciding which tracking keys are missing.
Native `git var GIT_CONFIG_SYSTEM` and `GIT_CONFIG_GLOBAL` enumerate default and
overridden configuration paths independently of emitted entries, so empty or
missing system/global configuration is fenced too. Explicit overrides retain
their exact pathname, including embedded line breaks, rather than splitting it
into invented inputs. Ambiguous default-global pathname enumeration makes
automatic push unavailable without preventing valid local commits.
Rebasing native overrides, include targets and environment routes preserves
unresolved `..` traversal rather than lexically collapsing it across symlinks.
Native filesystem resolution certifies the actual consulted target. Ambiguous
drive-relative spellings make optional push unavailable instead of guessing.
Assisted configuration queries and remote enumeration explicitly clear the
config-command-only `GIT_CONFIG` override. They observe the same effective
configuration as native status and Push, not a shadow file consulted only by
`git config`. Ordinary callers keep their existing lookup environment.
Unsupported runtime-prefix include paths (`%(prefix)/...`) and invalid upstream
ref names become unavailable push intent, not local transaction failure.
Known unsupported remote lookup results, including global/system-only remotes,
use that same local-completion outcome rather than aborting first-click dispatch.
Valid local commits, including `Empty commit`, complete before setup guidance;
the ordinary Push action remains available for advanced configuration.

The shared native push pipeline keeps authentication, system proxies,
credential trampoline, terminal output, LFS progress and pre-push interception.
An explicit internal outcome distinguishes native push success, hook abort,
push/preparation failure, and independent refresh failure after remote success.
It never interprets a resolved `Promise<void>` from a fallible wrapper as success.
Errors and their original causes stay inline, without starting a generic Push
retry or generating contradictory background toast actions.

The refspec is the certified full commit ID to the original canonical
`refs/heads/...` destination, not a later live branch tip. This is a normal,
non-force push, including preexisting local ancestry. Native pre-push input
therefore uses Git's full-SHA source-ref form; the configured remote name,
destination ref and exact object IDs remain intact. Commit-hook bypass never
disables push hooks. Ignore resumes only the current intercepted push; decline
or native hook abort keeps every accepted local commit. Cancellation, sign-out,
network/auth failure, rejection or an unknown remote response after invocation
can never invoke transaction rollback.

Command-local Git parameters pin the original raw URL in its original native
collection: explicit `pushurl`, or the fetch `url` fallback. This preserves
`pushInsteadOf`, which Git ignores when an explicit push URL exists.
The resolved destination is checked under those exact command-local parameters
before native entry. Rewriting applies once under the certified configuration;
proxy/credential preparation uses the resolved push URL. Neither URL enters
command or performance arguments.
Native mirror, force, follow-tags and recursive
submodule push behavior are disabled; pending tags remain for an ordinary
explicit Push. New branches follow normal publication semantics using the
configured remote and set their original upstream immediately after verified
remote success, before follow-up fetch. Tracking values are observed under the
real configuration lock. Missing keys are appended to the original configuration
bytes in memory, using the transaction engine's existing quoted-value escaping.
Git's native configuration parser reads those bytes through stdin and verifies
each exact tracking value before both keys install by atomic replacement.
Original comments and formatting stay intact, including files without a final
newline. Failed validation leaves both original values unchanged.
After the configuration-lock handle closes, synchronous identity and exact-byte
checks run immediately before atomic installation. A replaced lock is never
installed or deleted as if it were owned.
The final byte-check descriptor opens nonblocking, validates its own regular-file
type/device/inode against the owned lock, and closes in `finally`. Pathname
ownership is rechecked after reading; a FIFO or same-byte foreign replacement
cannot block the renderer or be adopted as the owned publication lock.
Original staging bytes also come from the nonblocking, descriptor-validated
regular-file reader and are recertified before use. A substituted configuration
FIFO cannot hang publication while its lock and operation ownership remain held.
Publication retains its own original working/Git/common/object, routing and
configuration-owner proof across all preparation awaits. It cannot borrow
substituted common metadata after remote success. Empty or missing worktree
configuration is fenced independently of common `config.lock`, preventing a
concurrent worktree tracking choice from being overwritten by staged common keys.
The canonical branch ref and `packed-refs` are fenced before sampling the accepted
HEAD and through installation; an external ref writer expires the setup intent
without restoring or rewriting that writer's history.
Unfinished publication metadata and owned lock cleanup retain an
explicit in-memory obligation: Retry refresh completes only that original
tracking intent under renewed Git ownership, never pushes again or overwrites a
different current tracking choice. If the original branch or tracking choice has
changed or the original remote was removed, the stale setup obligation expires after owned cleanup, releasing
protection and offering dismissal/manual setup while retaining remote success
and all local history. A cleanup failure still requires Retry refresh; finding
a stale intent in its cause chain cannot discard an owned lock.
Cleanup retry reacquires admission over the retained original resource set before
attempting current Git discovery. An in-memory, weakly owned original routing
proof can then classify a broken or substituted owner as stale after cleanup;
invalid `commondir` cannot strand accessible original locks.
Publication creates no private staging directory, marker, or staged configuration
file. It needs no recursive cleanup and cannot adopt or remove an unrelated folder
at a temporary pathname. Only the exclusively created native `config.lock` handle
and its registered identity remain cleanup obligations.
Known unsupported symbolic HEAD/ref layouts and native not-a-repository results
after acknowledgement likewise expire setup after cleanup. Unknown command or
I/O errors remain explicit refresh failures, not stale-success fallbacks.
Asynchronous fence capture distinguishes a proven vanished symlink target from
unexpected I/O just as final synchronous verification does. Dangling worktree or
included configuration cannot create an impossible publication-refresh loop.
The unresolved common `config` alias is captured independently of Git's absolute
path output, which resolves file symlinks. Retargeting that alias during publication
expires the setup intent instead of installing tracking into a retired target.
Post-acknowledgement unsupported remote scopes or include expansions follow that
same stale-setup rule. Metadata version/routing mismatches have explicit domain
identity, distinct from filesystem failures: transient `EIO` preserves the
publication obligation and offers Retry refresh, including when it occurs during
the final owner/configuration checks. Successful cleanup alone does not turn an
unproven I/O failure into permission to abandon upstream setup.
The retained owner proof also certifies all original configuration input bytes and
their resolved paths, including empty/missing inputs and routing environment.
Only the exact configuration bytes installed by the owned upstream transaction
advance that proof. A hook or external writer changing `core.worktree`, includes,
or another routing input stops subsequent native reads and mutations; acknowledged
push success and local history remain intact. Refresh recovery executes through
the frozen original repository, independently certifies any supplied same-ID alias,
and retains that alias check through native reads and final settlement.
Deferred refreshes from initial completion, push-only retry and refresh recovery
follow the same frozen-path rule. Nested spawn certification preserves every outer
negative fence; a later read scope cannot drop an alias check.
Canonical resource equivalence is kept separate from unresolved routing paths.
Original object-directory aliases, their targets and environment-provided object
paths remain certified through every post-push spawn; retargeting a symlink cannot
send fetch writes into an unadmitted object database.
Primary object-store subdirectories, including pack, loose-object and auxiliary
metadata routes, reject symbolic redirection before native work. Ordinary object
creation, replacement and immutable object hard links remain valid.
Assisted follow-up fetches and local branch fast-forward fetches disable submodule
recursion. Populated submodules are not admitted as writable resources by a main
repository's run; ordinary manual fetch and push retain their existing recursion.
Deferred History retains the accepted owner even after the run leaves the active
map. Its original execution path, deferred alias, native reads and final changeset
and diff publication remain certified. Proven stale deferred requests expire
rather than being delivered later without their owner; unexpected read failures
remain retryable and inline without duplicate background error prompts.
The initial and push-retry outcomes include final deferred-refresh, selection-reader
and History failures as `refreshError` while retaining acknowledged `pushed` success.
Refresh retry completes these local reads only, never another push or commit.
Mutable native index and `FETCH_HEAD` routes are certified separately from their
contents: normal writes and atomic replacement remain valid, but symlinks,
shared hard links or a changed parent route stop follow-up work. Explicit index
and configuration-file targets and their locks join resource admission, without
reserving their entire parent directory. The index environment remains frozen.
Native `packed-refs` receives the same mutable-file routing certification:
normal content changes and replacement are allowed, symbolic/shared-file routes
are not. Alternate-routing files, including initially missing and transitive
`objects/info/alternates`, retain immutable versions from one consistently
discovered native resource graph. A changed alternate graph stops follow-up
work rather than widening the run's object ownership.
Native object discovery can succeed while reporting ignored missing or
unresolvable alternate targets. Any routing diagnostics make optional push
unavailable, preserving the original diagnostic and valid local completion.
Such a target cannot activate outside the frozen object graph after remote
acknowledgement. Native warnings about garbage entries do not describe omitted
routes and keep their existing behavior, as do ordinary local operations.
Raw literal edges from each native root's alternate file and
`GIT_ALTERNATE_OBJECT_DIRECTORIES` retain their original physical targets too.
An existing directory alias cannot retarget outside admitted ownership after
acknowledgement while leaving the original object trees intact. Native discovery
still determines the complete graph; these edges only certify its routing.
Alternate-file versions are captured before raw-edge enumeration. Re-reading
those edges under the same file and path fences rejects sampling drift even if
different aliases initially resolve to the same native object root.
Quoted alternate lists or non-UTF-8 alternate-file inputs cannot be certified
for optional push and retain valid local commits with normal Push guidance.
Object-tree routing uses that same native primary/transitive root set, not an
invented common `objects` directory. An external native object database needs no
unused default directory; alternate pack/loose routes cannot bypass certification.
The original symbolic `HEAD` file remains certified as the branch condition for
`includeIf.onbranch`. A hook changing that condition stops follow-up work after
owned cleanup, preserving the external HEAD change and every created commit.
The original HEAD must directly name the frozen branch. Initial symbolic branch
aliases remain unsupported by the local assisted transaction; push intent
certification also refuses them without weakening that restriction.
The branch itself must remain nonsymbolic before follow-up native work, including
when packed refs initially provide its value. Introducing a symbolic branch
alias cannot activate different conditional configuration behind an unchanged
literal HEAD. External alias changes and acknowledged commits are preserved.
Requested alias verification also compares its synchronous current canonical
target with the original destination; an awaited capture cannot adopt a
replacement checkout as its own new baseline.
Accepted Changes readers recertify ownership before diff/selection publication
and after filesystem-derived work completes, including untracked image loading.
Foreign bytes are never installed transiently before a later error clears them.
Known missing configuration-input certification, including an inactive dangling
conditional include, becomes unavailable push intent rather than aborting valid
local commits. It keeps its original cause, creates no push attempt, and offers
normal Push setup guidance. Unexpected I/O remains an explicit error.
No remote, unsupported or multiple upstream values, multiple push URLs, or changed destination
retains the accepted local result and explains the existing normal Push/Publish
setup action. Desktop does not create or publish a repository automatically.

`_retryCopilotAssistedCommitPush` is separate from rollback/refresh recovery.
It retains only in-memory original push intent/result, rechecks the exact run,
physical repository identities, HEAD/full tip and destination, and admits one
shared in-flight push promise. Changed HEAD/ref, replaced directory or changed
remote refuses rather than publishing different commits or deleting external
history. Same physical aliases are valid. Retry never captures, analyzes,
commits, resets current options/drafts or counts local commits again; it remains
available across repository switches and does not require AI eligibility.
Before starting retry settlement, filesystem-only certification checks both
retained execution and requested aliases. Resource discovery uses the frozen
physical checkout under that negative certificate. A stale alias refuses without
creating a busy settlement or issuing a query into another retained owner's lease.
Settled early refusals notify subscribers immediately so the panel shows the
current refusal, not an old receiver error. Publication cleanup recovery obtains
admission through the frozen physical checkout and retained resources, cleans
owned locks first, then expires stale execution/requested aliases.
Ordinary Push/Pull enter whole-operation admission before metadata/credential
preflight, so they cannot queue a mutation behind the run or overlap its retry.

Successful push returns ready after the existing fetch/fast-forward/protection/
status side effects. A post-push refresh failure returns `pushed` with a
`refreshError` and offers Retry refresh, never rollback or Retry push.
An acknowledged push error remains visible with Details/Dismiss even when its
setup has expired, the saved preference is Manual, or AI eligibility has ended.
Its explicit acknowledged-success marker does not change the saved commit mode;
new assisted execution waits for dismissal, then the preferred mode resumes.
Local accepted-commit statistics and verified push statistics retain their
existing schemas. A secondary statistics/notification error preserves the
actual primary push error and its retry.

Rollback restores the original index timestamp as well as bytes/mode.
Otherwise an older stat-cache entry can become falsely clean when reinstalled
with a newer index-file epoch on Git builds that compare second-resolution
timestamps. The original racy-stat epoch keeps unchanged selected working
bytes visibly dirty and safely restores their selections after late Cancel.

Executable retry/rollback capabilities, credentials and frozen URLs/config are
not stored in localStorage. After process restart, the preference remains;
ordinary Desktop Push remains available for the accepted local commits.
