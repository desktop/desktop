# Desktop Rust migration

Rust replacement for GitHub Desktop's backend, CLI, and platform transports. The
full migration is active. The original Electron app remains until the
replacement passes the removal gates in [MIGRATION.md](MIGRATION.md). Remaining
headless and platform work is tracked in [TODO.md](TODO.md). Upstream
is https://github.com/desktop/desktop at
`1bfab971ad2d373d5ef996dda2b894232658f8f6`. The upstream MIT license applies.
Bundled browser dependencies and moved source notices are preserved in
`web/THIRD_PARTY_NOTICES.txt` and the generated `panels.js` artifact. Embedded
branch-rule matcher notices are in `THIRD_PARTY_NOTICES.txt`.

## Termux

If needed: `pkg install git gh rust clang make`. Install `git-lfs` as well for
repositories that use Git LFS. Keep repositories under Termux home so executable
files and permissions work. Rust development needs neither Electron nor the
upstream Node dependencies.

```sh
cd ~/github-desktop/rust
cargo build --locked -j 1
./target/debug/desktop-rs --help
./target/debug/desktop-rs -C .. status --json
./target/debug/desktop-rs -C .. snapshot
./target/debug/desktop-rs -C .. git status --short
./target/debug/desktop-rs gh auth login
./target/debug/desktop-rs -C .. gh pr list
./target/debug/desktop-rs -C .. serve --port 9418
```

Open the exact `http://127.0.0.1:9418/#token=...` URL printed by `serve` in an
Android browser. `--port 0` selects an available port. The page stores the token
in tab-local session storage for reloads and removes it from the address bar.
The token changes on server restart; reopen the new URL. Ctrl-C stops the
server. Temporary socket failures reconnect automatically with bounded backoff.
Disconnected requests fail without replay; reconnection refreshes repository
state and preferences. The Reconnect button retries immediately. Use
`serve --empty` to start with a repository chooser when no working tree exists
yet.

## Optional desktop host

The `desktop-native` crate hosts the same browser assets and authenticated
WebSocket protocol using Wry and Tao. It is separate from `desktop-rs`; default
builds do not compile Wry/Tao or link desktop libraries. Termux uses the browser
bridge above, including when Cargo's `native` feature is selected on Android.

On a Linux, macOS, or Windows desktop:

```sh
cargo run -p desktop-native --features native -- --empty
cargo run -p desktop-native --features native -- -C /path/to/repo
cargo run -p desktop-native --features native -- --selected
```

Without a repository argument the host opens the repository chooser. `--config`
shares the CLI's registry and preferences format. On Linux the build requires
GTK 3, WebKitGTK 4.1, and D-Bus development packages (Debian/Ubuntu:
`libgtk-3-dev libwebkit2gtk-4.1-dev libdbus-1-dev`). Windows uses WebView2;
macOS uses WKWebView. Refer to
[Wry's platform requirements](https://github.com/tauri-apps/wry#platform-specific-notes).

The window starts its own random loopback port and session token without
printing that credential. It only permits its application document inside the
webview; HTTP(S) links to other origins open in the system browser. Closing the
window or pressing Ctrl-C shuts down the bridge and open sockets. Native browser
storage is ephemeral. Native host CI includes compilation on all three desktop
OSes and a Linux webview/RPC smoke run; that CI has not been executed from this
Termux session, so native runtime validation remains a migration gate.

## Saved repositories, creation, and clone

```sh
./target/debug/desktop-rs init /path/to/new-project
./target/debug/desktop-rs clone https://github.com/OWNER/REPO.git /path/to/clone
./target/debug/desktop-rs repositories list
./target/debug/desktop-rs repositories add /path/to/repo --select
./target/debug/desktop-rs --selected snapshot
./target/debug/desktop-rs repositories forget /path/to/repo
./target/debug/desktop-rs serve --empty
```

The browser can open a directory, select a saved repository, initialize a new
repository, or clone into an absent/empty directory. All connected tabs share
the server's active repository. Saved paths live at
`$XDG_CONFIG_HOME/desktop-rs/repositories.json` or
`~/.config/desktop-rs/repositories.json` on Linux/Android. Without an XDG
override, macOS uses
`~/Library/Application Support/desktop-rs/repositories.json` and Windows uses
`%LOCALAPPDATA%/desktop-rs/repositories.json`. Use `--config PATH` before the
command to choose an isolated registry. Writes use an OS lock and atomic
replacement; invalid existing data is reported without being overwritten.
Forgetting an entry never deletes the repository. Normal CLI commands use the
current directory or `-C`; `--selected` explicitly selects the saved active
repository. `serve` saves its startup working tree; `serve --empty` does not
auto-open a saved entry.

## Saved stashes and branch association

The browser lists both native Git and existing Desktop stashes, including their
branch association. Save can include untracked files and generate the existing
`!!GitHub_Desktop<BRANCH>` marker. Named stashes also work while detached.
Inspect shows saved working files, untracked files and the saved index; opening
a file uses the read-only historical diff viewer. Viewing does not apply it.

```sh
./target/debug/desktop-rs stash
./target/debug/desktop-rs stash save --desktop --include-untracked
./target/debug/desktop-rs stash save 'work in progress' --include-untracked
./target/debug/desktop-rs stash files STASH_OID
./target/debug/desktop-rs stash apply STASH_OID --restore-index
./target/debug/desktop-rs stash apply STASH_OID --pop
./target/debug/desktop-rs stash drop STASH_OID --index 0 --basis LIST_BASIS
./target/debug/desktop-rs stash move STASH_OID feature/other --index 0 --basis LIST_BASIS
```

`stash_list` returns structured `entries`, `basis` and `has_more`, rather than
command output text. Entries identify their full object ID, reflog index, tree,
parents, message, timestamp and optional Desktop branch. The list shows the
newest 1000 entries. `stash_files` accepts an object ID and returns `files` and
`staged_files`, including the commit IDs required for read-only `commit_diff`.

`stash_apply` uses the full `oid`; `restore_index` requests native `--index`
behavior and `pop` removes the selected entry only after successful application.
Failed or conflicted application retains it. Resolve resulting conflicts with
the normal conflict controls and explicitly remove the saved entry when ready.
If another writer changes the stash list during application, successful changes
are reported and the stash is kept with a warning. Removal requires a matching
`oid`, `index` and list `basis`; the browser also supplies these on apply/pop.
The CLI can supply optional `--index` and `--basis` on apply for the same check.
Removal and pop have explicit browser confirmation controls.

`stash_move` associates a stash with another valid branch name by creating a new
commit with the original tree/parents, storing it, then removing the selected
original entry. Reassociation to the current associated branch returns
`unchanged` without rewriting the entry. Branch markers use the full symbolic
ref, so a tag with the same short name does not change the association. Failure
before storage leaves the original. If removal fails or the list changes, both
entries are kept and the response says so. Stash creation reports `created`
independently of Git's exit status: an error after Git saved an entry must not
hide that saved data or be reported as success.

Native Git owns filter, encoding, index, reflog and working-tree behavior.
Including untracked files uses native Git's third stash parent, preserving the
tracked/untracked distinction. Rust does not stage unrelated untracked files as
a precondition. Stash commands clear the bridge's literal-path environment so
Git LFS internals and hooks receive native Git path handling.

Rust stash mutations share a cancellable OS lock in the common Git directory,
including separate CLI processes and linked worktrees. The list certificate is a
preflight check; independent Git writers do not honor that application lock.
Individual native commands retain Git's own ref/reflog locks. Exclusive fencing
against an external ref mutation between validation and native removal, large
stash-list virtualization and automatic branch-switch stash orchestration remain
migration work. Browser/native visual validation remains under its platform
gate.

## Reviewed branch switches and saved changes

The browser's branch selector supports local branches and canonical remote
tracking refs. A clean switch runs directly. With local changes, the default
review lets you leave work on the current branch or bring it to the destination.
The existing Desktop strategy values are shared with the standalone frontend.
Replacing an existing source-branch stash needs an explicit checkbox. A saved
stash already associated with the destination remains available in Stashes; it
is not applied automatically.

```sh
./target/debug/desktop-rs checkout feature --preview
./target/debug/desktop-rs checkout feature --strategy leave --basis REVIEW_BASIS
# Add this only after reviewing replacement of an existing source-branch stash:
./target/debug/desktop-rs checkout feature --strategy leave --basis REVIEW_BASIS --replace-stash
./target/debug/desktop-rs checkout feature --strategy bring --basis REVIEW_BASIS --restore-index
./target/debug/desktop-rs checkout refs/remotes/origin/feature
./target/debug/desktop-rs checkout feature --open-worktree
./target/debug/desktop-rs checkout-history
./target/debug/desktop-rs checkout-acknowledge RECEIPT_ID
```

`checkout_preview` returns the proposed target/ref/tip, source branch, changed
files, current/destination saved stashes, another registered worktree and a
`basis`. The browser always sends that basis back to `checkout`. It binds raw
working content/modes (including changed nested repositories), index bytes,
source/target refs, operation state, effective attributes, conversion/hook
settings, stashes and worktree registrations. Stale reviews fail before
mutation. The CLI can omit a basis to act on the current state; `--strategy ask`
returns code 2 with a review when a choice is needed. `--preview` never selects
a worktree and works without reading a damaged preferences file.

Leave saves tracked and untracked changes with the current branch marker,
replaces only a previously reviewed stash when requested, then switches. Bring
first attempts normal Git checkout so non-overlapping files retain their normal
staging. Only a local-overwrite refusal triggers a temporary stash, switch and
apply. `--restore-index` also asks Git to restore saved staging in that
fallback; without it, native stash-apply behavior is used. A conflicted or
failed application keeps the temporary stash and shows the normal conflict
controls. The existing source/destination saved stashes are not replaced by that
temporary entry. Detached and unborn sources use bring; if Git cannot save or
carry their changes, the operation reports that failure without forcing it.

Remote targets create a local branch at the reviewed commit and configure its
native upstream. Canonical remote refs take precedence over similarly named
local branches. Registered worktrees open in the browser instead of being
checked out a second time; missing registrations get an explicit removal action
which keeps Git's normal dirty/locked refusal. CLI `--open-worktree` validates
and saves that selection; use `--selected` for subsequent commands. Native
recursive submodule update and checkout/LFS hooks run after a successful switch,
without force. Nested uncommitted data is not included in a parent Git stash;
manage it within its own repository when native Git cannot carry it.

Branch switch preferences can ask, always leave or always bring. Previous-stash
replacement still requires confirmation. The browser can remember a reviewed
choice or reset the default under Branch switch preference; the CLI accepts:

```sh
./target/debug/desktop-rs preferences set '{"uncommitted_changes":"AskForConfirmation"}'
./target/debug/desktop-rs preferences set '{"uncommitted_changes":"StashOnCurrentBranch"}'
./target/debug/desktop-rs preferences set '{"uncommitted_changes":"MoveToNewBranch"}'
```

Each multi-step switch writes a private, atomic phase record under the actual
worktree Git directory's `desktop-checkout`. Its UUID is also in the stash
message, so history can find a saved entry after cancellation or a crash before
the child reported its object ID. Records describe the last attempted phase;
they never replay commands. Inspect the current repository and saved stashes
before retrying. Native Git can have switched branches before a hook/submodule
failure is reported. The browser shows incomplete/error records and can show
completed ones; acknowledging a record removes only that notice, with no file,
index, branch or stash mutation. History currently supports 1000 records;
acknowledge older ones as needed.

Rust serializes stash/checkout orchestration through the common-directory OS
lock, including linked worktrees and separate CLI processes. Source/target refs
are checked after saving and around switching/application. Native Git owns each
individual index/ref transaction; an arbitrary external writer or editor is not
exclusively reserved across the whole workflow. Protected-branch GitHub policy,
custom remote fetch-namespace discovery, nested stash orchestration, very large
reviews and native/browser visual behavior remain migration audits.

## Reviewed branch creation

The sidebar reviews a new branch's name, optional start point, upstream choice
and whether to switch. Creation uses the same leave/bring and previous-stash
replacement controls as a branch switch. A review alone never creates the ref.

```sh
./target/debug/desktop-rs create-branch topic --start refs/remotes/origin/base --checkout --preview
./target/debug/desktop-rs create-branch topic --start refs/remotes/origin/base --checkout --strategy bring --basis REVIEW_BASIS
./target/debug/desktop-rs create-branch topic --checkout --strategy leave --basis REVIEW_BASIS --replace-stash
# Create a ref while keeping the current checkout and its staged/working files:
./target/debug/desktop-rs create-branch topic --start HEAD~1 --no-track
```

`create_branch_preview` and `create_branch` accept `name`, optional
`start_point`, `no_track` and `checkout` (default false). The mutation also
accepts the normal checkout `strategy`, `basis`, `replace_stash` and
`restore_index` fields. The browser always confirms a reviewed creation. The CLI
reads the saved strategy only when switching; read-only preview and ref-only
creation work independently of preferences. Omitting the start point uses the
current HEAD. Canonical source refs are exact, including when another local
branch is named like a remote ref. Commit expressions and detached sources are
supported.

A switching review binds the start ref's raw object ID and resolved commit
together with files, staging, source identity, effective Git configuration,
stashes and worktrees. Ref-only review binds ref/configuration context without
reading working files, the index or stashes, so creating a ref also works when
those unrelated structures need repair. For a source with a commit, Git creates
the branch before the leave/bring workflow runs, using its native
`branch.autoSetupMerge`, `branch.autoSetupRebase` and inherit behavior.
`--no-track` suppresses tracking. Ref-only creation keeps files, index, current
branch and stashes in place, including during conflicts. With no initial commit,
use `--checkout` to create an unborn branch and carry staged/untracked files;
there is no commit ref to create independently yet. An unborn checkout can also
start at an existing commit, including its current symbolic branch name. Native
Git creates and switches in one step in that case, carrying staged/untracked
files and applying its normal collision checks and tracking defaults.

Creation and subsequent checkout share private checkout-history records. The
`creating_branch` phase records the requested source/tracking settings before
Git runs. A cancelled or failed child may already have created the branch. A
later stash, checkout, hook or submodule failure keeps it and the normal
recovery information. Inspect branches, current state and saved changes before
retrying; use the ordinary checkout flow for an already created branch.
Acknowledgement removes only the record, and no step is replayed automatically.
Native Git owns individual ref/index transactions; outside Git writers remain
subject to the same optimistic whole-workflow fencing as other branch
operations.

## Reviewed branch renames

Branch management in the browser reviews the new name and all saved change sets
associated with the current branch before confirming a rename. Existing saved
changes associated with the destination name are retained. Working files and
staging remain in place, and native Git moves branch configuration and reflogs.

```sh
./target/debug/desktop-rs rename-branch refs/heads/feature renamed-feature --preview
./target/debug/desktop-rs rename-branch refs/heads/feature renamed-feature --basis REVIEW_BASIS
./target/debug/desktop-rs branch-rename-history
./target/debug/desktop-rs branch-rename-acknowledge RECEIPT_ID
```

`rename_branch_preview` binds the source tip, current symbolic branch, local and
remote branch metadata, worktrees, effective configuration and the whole stash
list. `rename_branch` accepts that basis; omitting it acts on the current state
under the common stash lock. Source names can be canonical local refs; the new
name is a literal local branch name. Existing destination refs are refused.

Every associated stash is copied with its original tree and all parents before
the native branch rename. Their newest-first order is preserved. Originals are
removed only after every replacement is stored and the renamed ref is verified.
A failure or cancellation can leave both copies. Inspect Stashes and the private
`desktop-branch-renames` records under the actual worktree Git directory before
retrying. History reports current source/destination tips and reachable saved
IDs; it never resumes mutations. Acknowledgement deletes only the receipt.

Reviews and replacements are limited to 1000 total saved entries, receipts to 1
MiB and history to 1000 records. Native Git still owns each ref/reflog update;
an external writer is not exclusively reserved across this multi-step workflow.
Case-only rename fallback is implemented, with case-insensitive filesystem
runtime evidence still pending. Remote rename, GitHub policy and remaining
create/delete/default-branch callers still need parity and platform audits. Local deletion keeps its normal merged-branch and
checked-out-worktree checks and leaves saved stashes available.

## Branch identity and case-only renames

Creation and remote-checkout previews reject an existing symbolic destination,
even if its target is unborn. Native `git branch` creation also checks its
reference transaction before Git can commit it: the destination must remain a
direct absent ref, the new OID must equal the reviewed commit, and any reviewed
start ref must still have its recorded OID. A start ref moved inside the native
invocation can no longer create a different branch tip and only fail afterward.
Native tracking, inheritance, rebase defaults and callbacks remain in use.

The scoped dispatcher is tested through a private hook event before mutation;
Git silently skipping a non-executable hook is an error. User reference hooks
retain their original enabled states, argv and stdin. The caller's original Git
configuration environment is restored before callback delegation, so nested Git
commands can use another repository's own hooks. Private dispatcher files are
removed when the checkout/creation receipt is acknowledged. Git 2.56 is the
tested baseline; keep Termux repositories on an executable filesystem.

The transaction guard currently applies to native `git branch`, including the
branch-creation step before a normal switch. Native `switch -c` paths, such as
unborn creation and automatic local creation during remote checkout, retain
symbolic-destination preflight and existing phase checks. Equivalent transaction
protection across their checkout/submodule callbacks remains a migration audit.
External writers are not reserved across the entire workflow.

Case-only rename first attempts native `branch -m`. If Git reports the exact
case-collision error, it may retry `-M` only after a fresh context/stash check:
no exact destination or other case variant may exist, and any filesystem alias
must resolve to the reviewed source tip. Another branch is never intentionally
replaced. Native hook failures and unrelated errors are not retried. The preview
reports `case_only` and `case_retry`; the browser explains the retry boundary
and participates in global busy state. Linux tests exercise real case-sensitive
renames and simulated case-insensitive lookup/collision responses. Physical
macOS/Windows filesystem behavior still needs platform evidence.

## Default branch permissions

```sh
./target/debug/desktop-rs branch-policy
./target/debug/desktop-rs branches
./target/debug/desktop-rs snapshot
```

`branch-policy` explains the locally inferred default and each local branch's
rename/deletion permissions. Fetch-capable `origin` is preferred, then the first
remote in Desktop's name order. Push-only remotes and URL lists reset to empty
are excluded. The selected remote's cached symbolic HEAD supplies the default
name. Symbolic aliases are excluded from branch candidates. Local branches
tracking that ref take precedence, preferring a matching name; a same-named
local branch and then the remote ref are the next choices.
Without a usable remote HEAD, the explicit global `init.defaultBranch` setting
supplies the name, falling back to `main`. As in Desktop, included files are
excluded from this global preference lookup. A repository-local initialization
setting does not replace Desktop's global preference. Inference performs local reads.

Typed deletion rejects the detected local default, including forced and
combined upstream deletion. Rename rejects a published default; an unpublished
default can still be renamed. A configured upstream counts as published even
when its cached tip is gone. Reviews bind the policy identity, including remote
HEAD movements between equal commits. Deletion checks again after checkout so
a hook promoting the selected branch to default retains that branch and its
recovery record. The CLI, snapshot, branch list and browser use these shared
permissions. The browser explains disabled actions and keeps published-branch
upstream information visible during rename review.

## Fork contribution preferences and cached association

```sh
./target/debug/desktop-rs repository-context
./target/debug/desktop-rs repository-context --refresh
./target/debug/desktop-rs repository-context --target self
./target/debug/desktop-rs repository-context --target parent --basis REVIEW_BASIS
```

Repository settings in the browser expose the same explicit load, metadata
refresh and contribution-target controls. Parent is the default saved preference.
It takes effect when `gh` verifies that the selected fetch remote is a fork with
a known parent. Self uses the fork's fetch remote. A nonfork remains associated
with its own fetch remote regardless of the saved preference.

Refresh resolves the effective native Git fetch URL, queries `gh` with its
explicit canonical identity, verifies the response and checks the destination
again before publishing the cache. The cache contains normalized identities and
URL fingerprints; credentials, query strings and clone URLs are omitted. An
origin change makes the old association stale until an explicit refresh.
Ordinary snapshots and branch reviews only read local metadata.

Verified Parent contribution selects `upstream`. Its URL must match the cached
parent; missing, unrecognized or mismatched upstreams use the global/main
fallback and have an explicit settings status. Existing remotes are not
replaced. Saving a preference
is also available before association and remains effective after refresh.

The common Git directory holds private `desktop-repository.json` metadata, an
immutable UUID in `desktop-repository.id`, and an OS lock. The UUID travels with
the Git directory so repository moves preserve the context; linked worktrees
share that identity and their preferences. Updates are atomic, preserve concurrent
preference edits during metadata refresh and invalidate prior branch reviews.
Readers reject corrupt/foreign documents, symlinks, special files and unsafe
ownership or permissions. Existing invalid data is preserved for recovery.

Broader branch/name-rule callers, complete account/sign-in/import flows and
native platform evidence remain migration work.

## Parent upstream setup

```sh
./target/debug/desktop-rs upstream-setup --preview
./target/debug/desktop-rs upstream-setup --basis REVIEW_BASIS
```

After a successful metadata refresh, a verified fork automatically receives a
missing `upstream` remote using its parent's canonical HTTPS clone URL, matching
Desktop's association flow. This also applies when its contribution preference
is Self. Setup changes local Git configuration; it performs no fetch or push.
Snapshots and ordinary context reads remain read-only.

The browser also provides a parent-upstream review and add-only confirmation.
An existing matching effective fetch identity is a no-op that preserves custom
fetch mappings, push URLs and transport choices. Any other occupied upstream
namespace is blocked, including push-only, empty-reset, global, worktree and
command settings. Dotted neighboring remote names remain separate. There is no
force/replacement action. Metadata refresh keeps its verified cache if setup is
blocked and returns an explicit setup error.

Preview certificates bind the cached association, contribution preference and
scoped upstream/URL-rewrite configuration. Native URL rewriting is checked
before addition; a different or unrecognized destination is blocked. After
native `remote add`, the service verifies the parent identity and default fetch
mapping. A native failure or changed postcondition leaves the current config
for inspection; it does not blindly roll back or replay a possible addition.
The common application lock does not reserve all configuration against outside
Git writers.

A cached non-origin fork source remains associated when adding `upstream`
changes alphabetical remote order. A present origin still takes priority;
removed or changed primary URLs require renewed verification. Older cache
records recover their source from the stored fingerprint until refreshed.

## Preparing a repository for publication

The following commands inspect a repository and available GitHub owners without
creating a remote repository or pushing commits:

```sh
./target/debug/desktop-rs -C /path/to/repo publish context --host github.com
./target/debug/desktop-rs -C /path/to/repo publish organizations --host github.com --login Alice
./target/debug/desktop-rs -C /path/to/repo publish organizations --host github.com --effective
./target/debug/desktop-rs -C /path/to/repo publish preview --login Alice --owner Alice --name project
./target/debug/desktop-rs -C /path/to/repo publish history
./target/debug/desktop-rs -C /path/to/repo publish continue-preview RECEIPT_ID
./target/debug/desktop-rs -C /path/to/repo publish acknowledge RECEIPT_ID
```

The context includes the local name and Git description, stored accounts and
whether an origin exists. The description reader does not follow symlinks or
wait on named pipes. Organization listing uses the explicitly chosen account,
verifies its identity and is bounded to 1,600 entries. A preview requires a
saved repository and explicit account; it reviews the verified owner and
planned branches while detecting account, repository and configuration changes.
The management panel also exposes this read-only review in the localhost UI.
It neither reserves the name nor verifies permission to create a repository.
`can_apply` remains false because full publication is not implemented. The
management panel supports history and acknowledgement without replay.

A separate, explicitly partial CLI operation can create only the remote after
review; it does not add `origin`, assign an account or push branches. Use exactly
the same request values in preview and creation:

```sh
./target/debug/desktop-rs -C /path/to/repo publish create --login Alice --owner Alice --name project --basis REVIEW_BASIS --acknowledge-partial
```

Once creation starts, its durable record prevents another attempt even after
acknowledgement. For a confirmed creation with recorded identity,
`continue-preview` rechecks the account, repository ID and HTTPS URL, then
shows what was verified without changing the repository. Older records without
identity cannot use this review. Automatic reconciliation is not yet
implemented. An interrupted or unverified response remains `creation_unknown`;
inspect GitHub and history before taking further action. With a confirmed
creation, the reviewed continuation can add `origin` and associate the selected
account; it does not push branches:

```sh
GIT_CONFIG_NOSYSTEM=1 ./target/debug/desktop-rs -C /path/to/repo publish continue-preview RECEIPT_ID
GIT_CONFIG_NOSYSTEM=1 ./target/debug/desktop-rs -C /path/to/repo publish continue RECEIPT_ID --basis CONTINUATION_BASIS --acknowledge-partial
```

The continuation rejects Git config includes, URL rewrites, existing origin
settings, unsafe config files and unsupported Git environment overrides. Use
`GIT_CONFIG_NOSYSTEM=1` or an explicitly specified safe `GIT_CONFIG_SYSTEM`.
A partial or interrupted result needs inspection and is never automatically
replayed. These operations require
a private registry outside the worktree and Git directories. The safe registry
implementation currently supports Unix. Preview and creation fail closed on
non-Unix platforms until equivalent directory identity checks are implemented.

## Saved repository accounts

```sh
./target/debug/desktop-rs repositories add /path/to/repo --select
./target/debug/desktop-rs --selected account
./target/debug/desktop-rs --selected account catalog
./target/debug/desktop-rs --selected account assign github.com Alice --preview
./target/debug/desktop-rs --selected account assign github.com Alice --basis REVIEW_BASIS
./target/debug/desktop-rs --selected account none --preview
./target/debug/desktop-rs --selected account none --basis REVIEW_BASIS
./target/debug/desktop-rs --selected account effective --preview
./target/debug/desktop-rs --selected account effective --basis REVIEW_BASIS
```

Use the same `--config PATH` namespace for review and application. Account
changes require a saved repository and a fresh review. Ordinary `-C` Git
operations remain available without saving a repository or creating registry
files. The browser's separate Account section loads settings and the stored
account catalog explicitly; it never chooses the first or active account.

There are three choices. `assigned` verifies a named stored account's numeric
actor ID and repository access. `none` disables typed GitHub API operations and
assigned-origin HTTPS credential lookup
without signing out of `gh`. `effective` explicitly uses the native `gh`
environment/active credential; this is the compatibility default for existing
Rust records. A failed named credential lookup retains the assignment and
refuses fallback to an effective or different account. Git author settings are
independent of all three choices.

Named credentials are acquired with `gh auth token --hostname HOST --user LOGIN
--no-refresh`, retaining the stored login's spelling. Each API session verifies
login and numeric identity, pins that credential for private gh calls and
suppresses debug output. Tokens are absent from RPC arguments, account records
and certificates; typed output redacts the captured token. Metadata refresh and
typed GitHub operations use this resolver. Raw `git`/`gh` forwarding retains
native behavior.

Typed HTTPS fetch/push/pull, direct Git LFS transfers and inherited hooks/filters
now use an operation-owned credential broker for named accounts (Git 2.46+).
Only the intended effective remote URLs receive a grant. Credentials travel over
private helper protocol pipes; child Git configuration contains no token, and
helper refusal stops later helpers and prompts. The account/source witness is
rechecked before credentials are issued and monitored after issuance. Completion
and cancellation revoke the private broker. Other hosts, SSH and effective mode
keep native authentication.

Matching netrc entries, inline URL credentials and authentication headers can
bypass native helper selection; assigned operations refuse those conflicting
sources with a headless error. LFS working/index/HEAD configuration and URL
rewrites are inspected locally. Git redirects are disabled at the protected
origin. Native LFS still owns server-issued object-action URLs and redirects:
exact helper-context validation does not enforce a path allowlist on every LFS
HTTP request. That transport audit remains open.

Native LFS uses a temporary private storage alias that shares the existing
object cache and blocks raw error-log creation. It applies to the exact Git
directory, including a linked worktree, without redirecting a submodule's cache.
The operation revokes and drains its broker before cleanup; storage ownership
stays with the caller so CLI failure exits also remove the private alias.
Incomplete transfers and lock caches are operation-local in this version.
Non-Unicode storage paths and unavailable directory-link support refuse safely;
Windows/runtime parity remains unverified. Output redacts both literal and
encoded selected credentials.

Assigned PR creation uses fixed GraphQL requests through `gh api`, with JSON
variables on stdin and no Git-reading `gh pr create` parent. It preserves the
explicit base/head, title/body, draft and maintainer-edit settings. Open-PR
preflight matches the exact base and qualified head; incomplete or invalid
pagination cannot authorize creation. The captured numeric actor and saved
source/account are rechecked before the mutation. Success returns the verified
PR URL; cancellation or an uncertain response asks you to inspect GitHub before
retrying. Effective-account mode retains native gh behavior.

Assigned PR checkout reads the fixed PR REST endpoint and uses a matching
declared head remote when available, with its verified credential grant retained
through checkout, native LFS/hooks and cleanup. Otherwise
it fetches the declared base remote's `refs/pull/NUMBER/head`. Both paths verify
the API head SHA before reviewed branch creation/checkout and safe fast-forwards.
New branches track the known head remote explicitly; the fallback retains
existing nonempty tracking or configures the editable fork/base PR-ref route.
The host's HTTPS/SSH preference is preserved. Fallback tracking changes require
unchanged settings and an ordinary writable local config file (8 MiB maximum); refusals
preserve existing settings and refresh the UI even if checkout already switched
the branch. API tokens never enter Git child environments. The base must match
an existing declared remote; divergent local branches require manual review.
Clone and newly created worktree/submodule destinations still need separate
provisional account scopes; they cannot borrow a parent repository's assignment.

Saved records have stable IDs. Explicit Open worktree adopts an already saved
target, or relocates the current saved record to an unsaved target while keeping
its assignment. Ordinary Open directory creates/adopts an independent saved
record. Separately saved linked worktrees can therefore have different accounts.
Forgotten or relocated handles become stale rather than selecting another
record. Native root paths remain byte-preserving.

An assignment and its verified repository association are published atomically
in the registry. Fork contribution preferences remain in the common Git
directory. Actor-scoped metadata never falls back to another record's cache;
clearing it retains the selected fetch remote independently, including forks
without origin. A present origin still takes precedence. Successful named
association reuses the add-only parent-upstream setup; setup errors retain the
saved assignment and are reported for inspection.

Interactive GitHub requests capture the account view's `basis` as
`account_basis`. It binds the saved account and selected fetch URL, so a stale
witness is rejected before invoking `gh`, including requests queued before a
same-root account or origin change. Scripts can supply the same
optional field; omission deliberately uses the current account at dispatch.
Global authentication discovery stays unbound. An outside-Git request cannot
silently discard a supplied saved-account witness. Recognized working-tree
identities fix the default typed repository selector while effective mode keeps
native GitHub CLI credential precedence.

Account changes at the same working-tree root clear GitHub lists/details and
pending metadata reviews. Late replies cannot restore old-account data or
release a newer operation's busy state. Uncertain saves trigger a state refresh
without replay. Existing v1 path arrays remain readable and acquire stable record
IDs without changing their native path representation.

## GitHub branch-name rules

```sh
./target/debug/desktop-rs branch-name-rules feature/topic
```

Typed branch creation and rename previews include `name_rules`. Execution checks
fresh policy before receipts, stash copies or branch writes. Worktree branch
creation uses the same backend gate, including native remote-name DWIM when no
local branch exists. Existing local worktree reuse and ordinary snapshots stay
offline. Worktree creation currently executes directly and has no separate
review certificate.

Checks require a currently verified repository association. They apply to the
fork's own repository, regardless of its contribution target. GitHub.com and
`*.ghe.com` are supported; GHES and unverified associations report a skipped
check. An owner's private repository is skipped for a missing/free plan, as in
Desktop. Skipped and unavailable results are explicit; they do not claim that
repository rules passed. API failures retain Desktop's permissive behavior for
local operations. A known restriction or matcher evaluation failure blocks the
mutation. GitHub remains authoritative when publishing.

Fixed `gh api --method GET --hostname` reads verify the actual authenticated
actor, repository identity/privacy, paginated branch rules and ruleset bypass
status. The whole branch name is encoded as one path segment. A private
in-memory session pins the effective GitHub token for all reads in one check;
the token is absent from RPC parameters, results, certificates and application
files.
Review bases bind the actor, repository association and rule evidence. A changed
review requires another explicit action; mutations are never replayed.

The trusted RE2JS 2.0.1 matcher and Desktop's shared matcher run inside a bounded
QuickJS runtime embedded in Rust. No Node, shell, OS modules or client-supplied
JavaScript is used for matching. The engine has a 64 MiB heap, a 1 MiB stack and
a five-second interrupt deadline, including cancellation. Rule pagination is
bounded to 16 pages of 100 entries; patterns are limited to 8192 UTF-8 bytes
each and 1 MiB of serialized parameters in total. Oversized or invalid
evaluation is reported explicitly.
Termux builds generate the engine's Android C bindings with Clang/libclang;
other supported build targets use the dependency's supplied bindings.

Desktop's existing rule quirks remain: missing rulesets are ignored while
parsing, creation-only `always` bypass produces no warning, and the final
bypass check considers every relevant creation/name ruleset. Only `always`
bypasses directly; `pull_requests_only` stays enforced. Parsing also compiles
other known metadata patterns when relevant branch rules exist, preserving its
invalid-pattern errors. The isolated test oracle and deterministic engine
builder are documented in `tests/branch-rules-oracle/README.md`.

## Reviewed remote branch deletion

The CLI and browser Branch management panel review a canonical remote branch
across a named remote's push destinations. Each destination has its own complete
expected object ID, supplied to native Git as an explicit lease. Fetch URLs can
differ from push URLs. Native credentials, transport settings, server policy,
and file/configured pre-push hooks remain active.

```sh
./target/debug/desktop-rs remote-deletion-targets
./target/debug/desktop-rs delete-remote-branch origin refs/heads/topic --preview
./target/debug/desktop-rs delete-remote-branch origin topic --basis REVIEW_BASIS
./target/debug/desktop-rs delete-remote-branch origin topic --fetch-backup --preview
./target/debug/desktop-rs delete-remote-branch origin topic --expect FULL_OID --preview
./target/debug/desktop-rs remote-deletion-history
./target/debug/desktop-rs restore-remote-tip RECEIPT_ID 0 recovered-topic
./target/debug/desktop-rs forget-remote-deletion RECEIPT_ID
```

Keep the same options for review and deletion. Repeat `--expect OID` once per
configured push URL to skip server reads; `--expect missing` requires absence.
Public reviews identify push destinations in configured order and omit URLs.
Inspect that order with `git remote get-url --push --all REMOTE`. Known URL
userinfo/query tokens are removed from native diagnostics. Git 2.56 or later is
the tested baseline for URL-list resets and native hook delegation.

Typed operations are `remote_deletion_targets`, `remote_branch_delete_preview`,
`delete_remote_branch`, `remote_deletion_history`, `restore_remote_tip` and
`forget_remote_deletion`. Preview/delete carry a `request` object containing
`remote`, `branch`, optional `expected` (one full OID or null per URL), and
`fetch_backup` (default false). Delete also accepts `basis`. Target discovery
uses canonical upstream remote/ref atoms and makes no network requests.

Available local tips are retained under unique
`refs/desktop/deleted-remotes/UUID/INDEX` refs before the first push. Preview
identifies missing tips; `--fetch-backup` fetches those tips before deletion,
preserving the index and FETCH_HEAD. Recovery refs retain available commit
graphs through GC, with existing shallow/promisor limits; they do not archive all
LFS payloads. An unavailable tip cannot be restored unless it is fetched. Restore
creates an absent local branch without switching or pushing. Forget removes only
unchanged private recovery refs and metadata, never server branches.

A multi-destination push is not a distributed transaction. A later refusal or
cancellation can follow an earlier successful deletion. Private bounded phase
records in the actual Git directory preserve acknowledgments, uncertainty,
retained tips and errors. No mutation is automatically replayed. A scoped
reference hook prevents premature native tracking-ref cleanup; direct unchanged
caches are pruned with explicit old IDs after every destination succeeds.
Negative mappings, local branches/tags, private recovery refs, symbolic refs and
changed caches are retained. Hook/config overrides are never persisted.

Combined local/upstream deletion is available through the local branch review
below. GitHub policy UX and native desktop platform behavior remain migration
work. Native server refusals are preserved. URL values
containing line delimiters are rejected before any mutation. See
[Git push leases](https://git-scm.com/docs/git-push) and
[native URL-list configuration](https://git-scm.com/docs/git-config).

## Reviewed local branch deletion and recovery

Branch management reviews a local branch's tip, merged state and any required
switch before deletion. Unmerged deletion needs an explicit checkbox. A current
branch uses the same leave/bring, saved-index and previous-stash replacement
choices as ordinary checkout. Saved stashes remain available under their
original branch association. The browser can restore a deleted tip/settings
without switching, or explicitly forget its recovery ref and record.

```sh
./target/debug/desktop-rs delete-branch refs/heads/topic --preview
./target/debug/desktop-rs delete-branch topic --to refs/heads/main --force --strategy leave --basis REVIEW_BASIS --replace-stash
./target/debug/desktop-rs deleted-branches
./target/debug/desktop-rs restore-branch RECEIPT_ID
./target/debug/desktop-rs restore-branch RECEIPT_ID --name recovered-topic
./target/debug/desktop-rs forget-deleted-branch RECEIPT_ID
```

`delete_branch_preview` accepts `name` and optional `to_checkout`.
`delete_branch` also accepts `force`, `strategy`, `basis`, `replace_stash` and
`restore_index`. The browser sends the reviewed basis; CLI omission acts on the
current context under the common stash/checkout lock. Without an explicit switch
target, a current branch chooses an available local remote-HEAD/default,
main/master, recent or remaining branch. Deleting the only current branch needs
another destination. Other registered worktrees are not switched or removed.

Native Git performs the final `branch -d`/`-D`, preserving its worktree/rebase
refusals, config removal, reflogs and reference hooks. A scoped prepared-
transaction guard checks the reviewed tip while Git holds its ref locks.
Configured and file hooks are delegated once with their original enabled states
and full input through `git hook run --to-stdin`. Disabling user reference hooks
does not disable the application's tip check. No hook configuration is
persisted. This requires Git providing `GIT_SHELL_PATH`, `hook run --to-stdin`
and reference- transaction hooks. The Git-provided shell is used on Unix; native
desktop behavior remains a platform audit.

Before switching or deletion, a private journal records the local branch
settings and a unique `refs/desktop/deleted-branches/UUID` retains its tip. That
ref keeps the Git commit graph reachable through GC. Records under the actual
worktree Git directory's `desktop-branch-deletions` show the last attempted
phase, current/recovery refs and related checkout receipt. Failures and
cancellation can occur after a native step changed state; inspect records,
branches and saved stashes before retrying. No step is replayed automatically.

Restore refuses an existing destination ref or local branch settings. It creates
a branch at the retained tip and reapplies the saved local settings, preserving
multiple values; valueless boolean entries become explicit `true`. It restores
the tip/settings rather than the deleted reflog. Stash associations are retained
even when restoring under a different name. Forget explicitly removes only the
private recovery ref and journal, with expected-OID checks and no symbolic-ref
dereference. Existing branches, working files and stashes remain in place.

Non-switching deletion/restoration does not inspect working files or the index;
CLI preview and non-switching deletion do not depend on preferences. Journals
are limited to 1 MiB each and history to 1000 records. Whole-workflow editor/
external-writer reservations, broader remote-helper/credential failures, GitHub
default/protected branch policy and native platform parity remain migration
audits.

## Delete a local branch and its upstream together

The local deletion review can also include its configured network upstream.
Git resolves the canonical remote/ref, including differently named branches and
custom fetch mappings. `pushRemote` does not replace that upstream identity;
each configured push destination still uses its own reviewed lease. A missing
or local `.` upstream is refused before mutation when inclusion is requested.

```sh
./target/debug/desktop-rs delete-branch topic --include-upstream --preview
./target/debug/desktop-rs delete-branch topic --include-upstream --basis REVIEW_BASIS
./target/debug/desktop-rs delete-branch topic --include-upstream --fetch-upstream-backup --preview
./target/debug/desktop-rs delete-branch topic --include-upstream --expect-upstream FULL_OID --preview
```

Use the same options for review and execution. Repeat `--expect-upstream` once
per push URL (`missing` means absent) for push-only access. The existing
`--to`, `--force`, `--strategy`, `--replace-stash` and `--restore-index` choices
still apply. The web review requires separate consent for the upstream action.

The typed `delete_branch_preview` and `delete_branch` operations accept optional
`upstream: { expected, fetch_backup }`; null/omission selects local-only deletion.
Remote names/refs cannot be overridden inside this object. The combined basis
binds the local plan, canonical upstream, endpoint tips and backup choices.
Local force/stash consent is checked before recovery preparation. Available or
explicitly fetched remote tips and the local tip/settings are backed up before
checkout. Remote deletion starts only after native local deletion succeeds.

Local and remote histories contain related receipt IDs, alongside any checkout
receipt. A failed preparation, switch or local deletion prevents all upstream
pushes. A later server refusal, configuration change or cancellation can leave
the local branch deleted and only some destinations finished. Inspect both
histories and saved stashes before retrying. Restore and forget remain explicit
local actions; no rollback, remote recreation or deletion is automatically
replayed. Older receipts without related IDs remain readable.

The remote configuration certificate permits local removal of the deleted
branch section, creation of a reviewed tracked checkout target, and submodule
initialization during checkout. Other sections/scopes, including dotted
neighboring branch names and transport/hook policy, remain bound to the review.
Unexpected effective configuration changes (including conditional includes)
stop the push and preserve recovery. The application lock serializes its own
processes; it does not reserve all state against external writers throughout
the multi-step workflow.

## External editors and edited conflicts

The Rust service launches configured editors without a shell. On Unix, the CLI
replaces its process to preserve its terminal, signals and the editor's exit
status, so it also supports Vim, Neovim and Nano on Termux. The browser/native
client launches GUI commands; a terminal editor uses the CLI command because a
WebSocket does not provide a terminal. Settings can discover known executables
or store a custom program, argument list and terminal requirement. Automatic
selection prefers GUI editors. Actual GUI application behavior and the complete
desktop editor catalog still need native platform validation.

```sh
./target/debug/desktop-rs editor --list
./target/debug/desktop-rs -C /path/to/repo editor file.txt
./target/debug/desktop-rs preferences set '{"external_editor":{"kind":"command","program":"code","args":["--wait","{path}"],"terminal":false}}'
./target/debug/desktop-rs preferences set '{"external_editor":{"kind":"automatic"}}'
```

Each argument is passed separately. `{path}` expands to the native absolute
file/repository path and `{repo}` to its repository; without `{path}`, the
target is appended. Literal spaces, quotes, shell syntax and Unix filename bytes
stay in their arguments. File targets must exist inside the selected repository;
metadata and symlinks escaping it are refused. GUI launch errors are reported; a
running editor is independent of the service and remains open on shutdown.
Existing Rust version-1 preferences without the editor setting keep their
defaults.

To finish an edited conflict, inspect it, open the editor, save, then refresh
its preview and stage the reviewed version. The application follows the original
external-editor workflow. Staging uses normal Git clean filters and encoding
conversion through an alternate index, preserving unrelated entries and working
file bytes. It rejects changes to the reviewed file, unmerged entries, HEAD,
branch, operation context, attributes or conversion settings. Git's detected
leftover markers require a separate explicit staging action. Marker diagnostics
have Git's normal filter/binary behavior; they do not validate the resolution.

```sh
./target/debug/desktop-rs -C /path/to/repo conflict file.txt
./target/debug/desktop-rs -C /path/to/repo editor file.txt
# Save the file, then inspect again for a fresh basis:
./target/debug/desktop-rs -C /path/to/repo conflict file.txt
./target/debug/desktop-rs -C /path/to/repo stage-conflict file.txt --basis REVIEW_BASIS
./target/debug/desktop-rs -C /path/to/repo recover merge continue
```

Conflict choices and edited-file staging return an `undo_id`. Before continuing
or aborting the operation, use `undo UNDO_ID` (also `discard-undo UNDO_ID`) or
the browser's resolution Undo button to restore the original unmerged index
stages. Choosing ours/theirs/deletion also restores the previous raw working
file; Undo refuses to overwrite subsequent working-file changes. Undoing an
edited-file staging action only restores index stages and keeps later editor
changes, including deletion. Gitlink choices and their Undo leave nested
checkouts intact. The shared undo history persists across service restarts and
provides recovery for an interrupted publication.

Resolution backups use version-3 journals. They retain original Git blobs,
working-file bytes and available verified LFS bodies. A body already missing or
corrupt before resolution is recorded as unavailable; its pointer and raw
working file remain recoverable, but Undo does not invent or fetch its body. The
history displays this limitation. Ordinary discard still requires all original
staged LFS bodies and keeps its version-2 behavior. Existing version-1 and
version-2 journals remain readable. On repositories with file refs, Git's
HEAD/current-branch locks fence normal ref writers. Reftable conflict operations
hold the index lock and recheck HEAD/branch/operation context before
publication; direct ref writers are outside that reservation. Exclusive reftable
ref fencing remains a migration gate.

`stage_conflict` takes `path`, `basis` and optional `allow_markers`; the CLI's
explicit override is `--allow-markers`. A marker warning returns code 2 and
`requires_confirmation`. `available_editors` and `open_editor` are application
RPCs; `open_editor` takes optional repository-relative `path` (null opens the
repository) and checks the usual `repository_id` fence. Editor discovery works
without an open repository. Cancellation before index publication leaves the
real index intact; filters and external applications retain their normal native
side effects. The service does not close editors as part of cancellation.

## Repository workflows

The CLI and browser execute the same Rust operation types. The browser supports
changes, working/staged diffs, stage/unstage per file, commits, branch switching
and creation, fetch/pull/push, stash save/apply, history, tags, and remotes. It
polls repository state every two seconds and sends change events to connected
tabs, including edits that preserve the same Git status flags.

```sh
./target/debug/desktop-rs -C /path/to/repo stage file.txt
./target/debug/desktop-rs -C /path/to/repo diff --staged file.txt
./target/debug/desktop-rs -C /path/to/repo commit "Summary" --description "Details"
./target/debug/desktop-rs -C /path/to/repo create-branch feature --checkout
./target/debug/desktop-rs -C /path/to/repo push origin feature --set-upstream
./target/debug/desktop-rs -C /path/to/repo repo '{"method":"stash_list"}'
./target/debug/desktop-rs -C /path/to/repo repo '{"method":"merge","branch":"main"}'
```

Commits review new or changed regular Git blobs staged in the index. Blobs
larger than 100 MiB require explicit consent; the check uses staged object
sizes, so deleted or edited working files cannot hide staged content. Proper LFS
pointers are small and do not trigger the warning. An LFS rule alone does not
exempt a large Git blob: configure the filters and stage the file again.
[GitHub documents its file-size limit here](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github).

```sh
./target/debug/desktop-rs -C /path/to/repo commit-preview
# After reviewing the returned paths, sizes and basis:
./target/debug/desktop-rs -C /path/to/repo commit "Summary" --allow-large-files --basis REVIEW_BASIS
```

The typed operations are `commit_preview` and `commit` with `summary`, optional
`description`, `basis` and `allow_large_files`. A blocked commit returns code 2,
`requires_confirmation: true` and a fresh `preview`. An override needs its
review basis; stale index, HEAD, branch, operation context or relevant
attributes require another review. The browser previews every commit and offers
an explicit **Commit anyway** action for oversized blobs. Errors preserve the
message; changing repositories keeps separate drafts in memory until the page
closes.

Review is checked immediately before invoking ordinary Git commit. Git owns its
locks, hooks and signing; a user hook may change the index after review just as
it can in a terminal commit. This does not claim an atomic tree reservation.
Typed commit clears inherited pathspec environment flags so hooks retain normal
Git pattern behavior. Existing cancellation, timeout and output limits apply.

`repo` exposes every typed operation listed in `crates/core/src/protocol.rs`,
including merge/rebase and merge abort plus rebase abort/continue, cherry-pick,
revert, stash management, tags, and remotes. It prints JSON and preserves Git
failure exit codes. `-C` must precede the command. Paths are relative to the
resolved repository root, including when `-C` selects a subdirectory. Empty path
selections, traversal, absolute paths, option injection, and Git pathspec
expansion are rejected. Unix filename bytes can be passed as `{"bytes":[...]}`
instead of a string.

`git` and `gh` forward their entire command surfaces without a shell. On Unix,
including Termux, they replace the process and preserve the interactive
terminal, signals, arguments, and exit status. Use them for interactive
authentication and operations whose typed migration is still pending. This
forwarding is not proof that a legacy workflow has been migrated.

## Structured diffs and partial staging

```sh
./target/debug/desktop-rs -C /path/to/repo diff --json file.txt
./target/debug/desktop-rs -C /path/to/repo select-lines file.txt --basis TOKEN --lines 1,2
./target/debug/desktop-rs -C /path/to/repo select-lines file.txt --staged --basis TOKEN --lines 1,2
```

The structured diff returns `basis`, `kind`, before/after metadata, and hunks
with stable line IDs for that captured version. Select added/deleted lines or
entire hunks in the browser, then stage or unstage them. Context lines cannot be
selected. The working file is preserved, including CRLF and a missing final
newline. New/deleted files, rename content, raw filename bytes, SHA-256 object
formats, split indexes, and linked worktrees are covered by real Git tests.

Requests are `{"method":"diff_detail","path":"file.txt","staged":false}` and
`{"method":"select_diff","path":"file.txt","staged":false,"basis":"TOKEN","lines":[1,2]}`.
CLI `repo -` accepts these as JSON from stdin. A token expires if the relevant
captured content, modes, or index change. Reload and make a new selection after
an expired-token error. Each selection uses Git's actual index lock and an
alternate index, then atomically installs the result. It retains unrelated
staged entries. A lock owned by another Git process is reported and preserved.

Image comparisons reuse the upstream browser components: 2-up with dimensions
and byte-size changes, Swipe, Onion Skin with opacity control, and Difference
blending. They work with working/staged and historical captures, including
verified local LFS payloads. Added and deleted images have a single-version
view. Comparisons are read-only; whole-file staging remains the binary action.
The viewer preserves aspect ratios, responds to container/window resize, and
reports image decoding failures. Only allowlisted image data URLs are used.

The viewer renders PNG/JPEG/GIF/WebP/BMP previews, binary notices, symlink
targets, and submodule Gitlinks. Git built-in line-ending and
working-tree-encoding conversions are applied before content selection. Files
with arbitrary clean filters, binary/image/symlink/Gitlink changes, mode-only
changes, and files over the current 1 MiB per-side preview limit require
whole-file staging. Ordinary Git LFS text supports selection as described below.
These are remaining parity/performance areas, not evidence of full legacy diff
replacement. Captured diff generation has an 8 MiB output budget; ordinary
command output retains its 2 MiB budget.

DiffLine and the raw diff models were moved from upstream into shared browser
source. Their old entrypoints re-export the migrated code. A previously missing
`newLineCount` comparison in DiffHunkHeader equality was corrected and tested.

## Git LFS

The browser and native client probe installed tooling at startup and, when it is
available, run non-forcing global filter setup with repository hooks skipped.
This matches the original application startup. Conflicting filter values are
preserved and shown with retry, explicit replacement, and Not now choices.
Opening a repository with LFS tracking rules offers initialization of its hooks
and global filters. The initial attempt preserves custom hooks; replacing them
requires the separate **Replace existing LFS filters and hooks** action.
Repository setup failures can have partial effects, so the client refreshes
repository state. Initialization and dismissal are remembered for that
repository during the page session. Reconnecting does not replay setup
mutations. CLI reads and starting `serve` alone do not initialize filters;
client startup performs that action.

`lfs tool-status` / typed `lfs_tool_status` only probe the executable,
independently of repository selection or tracking data. They work in an empty
authenticated bridge and do not change Git configuration or hooks.

Git LFS is optional and uses the installed `git-lfs` executable. Tracking
pattern inspection runs in Rust, preserving Git LFS 3.8.1 discovery, source
ordering, macro expansion and displayed rules. It does not write the local LFS
format version, create a cache, install hooks or fetch objects. Unknown local
format versions require an updated implementation. Attribute content and
pattern output each have a 2 MiB inspection budget; unsupported special files
cannot block inspection. Exact Git attribute queries support byte paths through
the typed protocol, including when the LFS executable is missing.

```sh
./target/debug/desktop-rs lfs
./target/debug/desktop-rs lfs status data.bin plain.txt
./target/debug/desktop-rs lfs install
./target/debug/desktop-rs lfs install --skip-smudge
./target/debug/desktop-rs lfs install --global --skip-repo
# Explicit replacement of existing LFS configuration and hook:
./target/debug/desktop-rs lfs install --force
./target/debug/desktop-rs git lfs track '*.bin'
./target/debug/desktop-rs git lfs fetch
```

Setup defaults to repository-local filters and the pre-push hook. `--global`
changes global Git configuration; `--skip-repo` leaves repository hooks alone.
Existing hook conflicts are reported unless `--force` is selected. These actions
are also available in the browser's Git LFS panel, including inspection of the
first 1000 changed files. The typed operations are `lfs_status` (`paths`) and
`lfs_install` (`scope: local|global`, `force`, `skip_repo`, `skip_smudge`).
Global setup with `--skip-repo` and tooling inspection work even before opening
a repository. The browser starts with that global scope when no repository is
selected; repository hooks are skipped.

The CLI and browser also expose explicit transfer and tracking operations:

```sh
./target/debug/desktop-rs lfs fetch origin HEAD --include '*.bin'
./target/debug/desktop-rs lfs fetch origin --all
./target/debug/desktop-rs lfs checkout '*.bin'
./target/debug/desktop-rs lfs pull origin
./target/debug/desktop-rs lfs push origin --dry-run
./target/debug/desktop-rs lfs push origin HEAD
./target/debug/desktop-rs lfs track '*.bin'
./target/debug/desktop-rs lfs track --filename -- '-asset[1].psd'
./target/debug/desktop-rs lfs untrack '*.bin'
```

Typed transfers use the configured remote `origin` by default. `lfs_transfer`
takes `request: {action: fetch|pull|push, remote, ...}`. Fetch/push accept
`refs` (default HEAD), `all` and `dry_run`; fetch also accepts `recent`,
`refetch`, `include` and `exclude`. Pull accepts include/exclude filters. With
`all` and no refs, Git LFS scans all applicable refs; fetch-all cannot combine
with recent or include/exclude. Explicit refs are resolved to commit IDs before
transfer. Include/exclude values follow Git LFS's comma-separated glob syntax.

`lfs_checkout` takes `patterns` (strings or byte paths), interpreted as Git LFS
globs; empty selects all indexed LFS files. Fetch never populates working files,
and cached checkout never fetches. Pull combines download and checkout. Modified
files are preserved by Git LFS; uploading objects does not push Git refs. The
LFS runner keeps Git's internal attribute pathspecs enabled while direct Git
operations retain literal path handling.

`lfs_track` takes UTF-8 single-line `patterns`, optional `filename`, and
optional `lockable` (true/false/null); `lfs_untrack` removes matching tracking
rules. Patterns preserve spaces, and parent traversal is refused. These commands
edit .gitattributes without staging it or rewriting history; symlink/special
.gitattributes entries are refused. Lockable rules can change working-file
permissions. Git LFS's own mutation and partial-failure behavior applies; the
browser refreshes state after failures as well as success.

Transfers currently share the 120-second command timeout, bounded output and
cancellation lifecycle; longer transfer/progress support remains migration work.
Failures return a nonzero `code`, a best-effort `error_kind`, and a fixed hint;
endpoint credentials and raw network diagnostics stay out of failure responses.
Assigned-account transfers suppress native error-log files and report that no
transfer log was retained. Other modes can use `git lfs logs last` in a terminal
for detailed diagnostics. Other LFS commands remain available through the Git
passthrough.

Discard journals save staged LFS pointer bytes and their cached payloads before
changing files. Payloads stream to private backups with SHA-256 and size checks;
undo restores missing cache entries as well as the Git blobs and index. Cache
locations follow Git LFS configuration, including custom storage and linked
worktrees. Newline-containing cache directory names are refused because the Git
LFS environment report cannot represent them unambiguously. Missing or corrupt
staged payloads stop discard before publication; fetch the missing objects
explicitly before retrying. Undo refuses corrupt backups or existing corrupt
cache entries and keeps the journal for recovery. Structured working, staged,
history and conflict previews resolve local LFS payloads with SHA-256 and size
verification before showing text or images. `before.lfs` / `after.lfs` identify
the payload by `oid`, `size` and `state`; the ordinary `oid` field remains the
Git blob ID. States distinguish verified content, missing/corrupt/inaccessible
cache entries, extensions and the 1 MiB preview limit. Preview reads never fetch
objects or execute LFS extensions. Staged rename lookup reads the index without
running working-file clean filters.

Ordinary LFS text supports selected-line staging, unstaging and discard through
the same diff tokens and review controls. Selection passes the assembled body
through the configured LFS clean filter and verifies its pointer and cached
payload before publishing an index change. Broken filters preserve the index.
LFS filter/extension configuration changes expire old selection tokens.
Configured LFS extensions disable selection; extension processing, reference
caches and large previews remain migration work. Missing payloads require an
explicit fetch through the browser LFS panel or `desktop-rs lfs fetch`, followed
by reload.

## Discard review and undo

Whole-file discard defaults to restoring HEAD in both the working file and
selected index entries, including both paths of a staged rename. Use
`--working-tree` to restore the index version while keeping staged changes.
Selected-line discard always keeps the index. Every discard requires a token
from a fresh preview; the browser provides the review and confirmation controls.
Preview itself does not replace working files or publish index changes.

```sh
./target/debug/desktop-rs discard-preview file.txt
./target/debug/desktop-rs discard file.txt --basis PREVIEW_TOKEN
./target/debug/desktop-rs discard-preview file.txt --working-tree
./target/debug/desktop-rs discard file.txt --working-tree --basis PREVIEW_TOKEN
./target/debug/desktop-rs diff --json file.txt
./target/debug/desktop-rs discard-preview file.txt --lines 1,2 --diff-basis DIFF_TOKEN
./target/debug/desktop-rs discard file.txt --lines 1,2 --diff-basis DIFF_TOKEN --basis PREVIEW_TOKEN
./target/debug/desktop-rs discard-undo
./target/debug/desktop-rs discard-undo UNDO_ID
./target/debug/desktop-rs discard-forget UNDO_ID
```

The typed operations are `discard_preview`, `discard`, `list_discards`,
`undo_discard` and `forget_discard`. Both undo and deletion take `undo_id`,
separate from the WebSocket envelope's numeric `id`. Selected requests include
`selection: {"basis":"DIFF_TOKEN","lines":[1,2]}` and `scope: "working_tree"`.
The preview's `basis` certifies the target paths, raw contents/permissions,
HEAD, index and restored data. The web diff viewer sends selected line IDs to
the same review panel; history diffs cannot discard content.

Before publication, original raw files, symlink targets, selected index stages
and their blob contents, split-index bases, and a manifest are saved under
`desktop-undo/UNDO_ID` in the actual working tree's Git directory. Regular files
stream to disk, so whole-file discard is not constrained by diff-preview or
command-capture limits. Git applies its checkout filters, CRLF and
working-tree-encoding conversion to temporary data. Required filter failures
preserve the working files and index. Selected-line operations still require a
selectable text diff. Ordinary LFS text is supported; arbitrary clean filters,
LFS extensions and large text selection remain unsupported.

Working paths use directory handles and reject symlink parents and metadata
paths. The operation holds Git index, HEAD and current-branch locks while
preparing and publishing a discard. Backups are private and durable before
replacement. A prepared record can recover a partially published operation; use
`discard-undo` or Recover interrupted discard in the web UI. Cancellation during
preparation leaves the target files and index unchanged. Publication finishes
its short critical section before reporting completion or cancellation.

Undo refuses newer edits, changed HEAD/index entries, changed merge/rebase
operation state and corrupt backup bytes. Ordinary index undo preserves
unrelated staged entries. Sparse, assume-unchanged and intent-to-add flags use
an exact index backup; these records require the unchanged post-discard index.
Restoring them also restores the original flags. Canonical staged blobs and
shared indexes are retained independently of Git garbage collection and
reinstalled before undo. The undo data remains when a guard rejects restoration;
it can be inspected in the Git directory without forcing an overwrite.
`manifest.json` maps paths to numbered `N.before` raw backups. Backups stay
outside normal commits/pushes and remain until explicitly deleted. The UI
requires confirmation before deleting one; interrupted records must be recovered
first.

Submodule discard, batches spanning multiple selected files, automatic backup
retention, reftable ref locking, and complete native filesystem/trash behavior
remain migration work. Ref locking currently requires file-based Git refs.

## Working trees, submodules, and settings

```sh
./target/debug/desktop-rs worktree
./target/debug/desktop-rs worktree add /path/to/linked feature --new-branch
./target/debug/desktop-rs worktree lock /path/to/linked --reason "Keep this checkout"
./target/debug/desktop-rs worktree unlock /path/to/linked
./target/debug/desktop-rs worktree move /path/to/linked /path/to/moved
./target/debug/desktop-rs worktree remove /path/to/moved
./target/debug/desktop-rs worktree prune
./target/debug/desktop-rs submodule
./target/debug/desktop-rs submodule update
./target/debug/desktop-rs submodule sync
./target/debug/desktop-rs submodule deinit modules/example
./target/debug/desktop-rs config
./target/debug/desktop-rs config set user.name "Your Name"
./target/debug/desktop-rs config set user.email you@example.com --global
./target/debug/desktop-rs preferences
./target/debug/desktop-rs preferences set '{"theme":"dark","poll_interval_ms":1000}'
```

Worktree operations use registered paths and Git's own lifecycle checks. The
active worktree cannot be removed/moved by the service. Removal and submodule
deinitialization preserve Git's refusal to discard local changes by default; the
CLI exposes an explicit `--force` option. `worktree prune` previews metadata
cleanup; `--apply` performs it. Worktree paths and saved repository roots retain
Unix bytes in JSON, while UTF-8 paths keep their existing string representation.
Snapshots also include `root_id`, which distinguishes byte paths even when lossy
display text looks identical. The browser can open a listed worktree.

Submodule lists report declared URL, pinned/current object IDs, initialization,
local changes, and a changed Gitlink. Update initializes missing checkouts and
is recursive by default; `--no-recursive` selects top-level behavior. Submodule
add/update/sync/deinit operate through system Git. Conflict choices stage the
selected Gitlink commit without overwriting the nested checkout or local files;
use submodule update when you want to check out that recorded commit. Network
protocols follow Git's native policy. A saved parent account cannot be borrowed
by an initialized submodule; dispatch a separately saved child under its own
account. Provisional submodule account selection remains migration work. Tests
use isolated local remotes.

The settings panel edits a supported set of identity, signing, default-branch,
line-ending, file-mode, pruning and pull-policy keys. Local/global scopes are
explicit. Credential helpers and arbitrary config keys are excluded from the web
API; full Git configuration remains available through `desktop-rs git`. New
repositories honor configured `init.defaultBranch`, falling back to `main` when
it is unset. Use `--` before a CLI value that begins with a hyphen.

Application preferences are separate from Git config, stored beside the registry
at `repositories.preferences.json` (or the corresponding `--config` basename).
Updates are partial patches using atomic replacement and an OS lock. Invalid or
corrupt existing data is reported without being overwritten. Theme selection
supports system/light/dark; polling accepts 500–60000 ms. Authenticated clients
receive preference-change events, and the server adopts the new polling period.
These preferences are available in `serve --empty` before opening a repository.
Global Git settings are also available without an active repository.

Typed app methods are `get_preferences`, `update_preferences` with a
`preferences` patch, `git_settings`, `set_git_setting`, `worktrees`,
`worktree_add`/`remove`/`move`/`lock`/`prune`, and `submodules`,
`submodule_add`/`update`/`sync`/`deinit`. See the core protocol for fields.

## History, tracking, and conflict recovery

```sh
./target/debug/desktop-rs history --limit 30
./target/debug/desktop-rs history --revision COMMIT --offset 30
./target/debug/desktop-rs show COMMIT
./target/debug/desktop-rs show COMMIT file.txt --parent 0
./target/debug/desktop-rs branches
./target/debug/desktop-rs conflict file.txt
./target/debug/desktop-rs resolve-conflict file.txt theirs --basis TOKEN
./target/debug/desktop-rs recover cherry_pick abort
```

History returns a pinned commit ID, metadata, repository-aware trailers, and a
next offset. Later pages reuse the pinned ID to avoid skips/duplicates if HEAD
advances. Commit metadata is read through length-framed Git batch output, so
message delimiters cannot corrupt record parsing. Root and merge commits have
file lists and read-only diffs; parent indexes are zero-based. Merge reverts and
cherry-picks accept a one-based `mainline` in the typed protocol; the history UI
uses its selected comparison parent.

`branch_list` returns local/remote refs, OIDs, upstream refs, and worktree
paths. Snapshots include the active upstream, ahead/behind counts, and operation
state. Branch renaming, tracking, detached checkout, merge and rebase controls
use the same Rust operations. Counts compare resolved object IDs; a
detached/unborn HEAD or missing upstream has no count.

The operation banner detects merge, rebase, cherry-pick, revert, and `git am`
state, including linked-worktree metadata. Continue/abort/skip are explicit
requests validated against the current operation (merge has no skip action).
Conflict previews expose base/ours/theirs versions and a certification token.
Choosing a side stages it; an absent chosen side resolves as deletion. Editing a
file after inspection expires that token. Binary choices use Git checkout/add
without text decoding. During rebase, ours means the upstream being rebased onto
and theirs means the commit being replayed. Manual editor resolution followed by
staging is also available.

The backend still has bounded history output and UTF-8 display conversion;
complete legacy encoding/search/compare UX remains part of the migration.

## GitHub services and shared web components

The GitHub panel provides authentication status, repository details, PR/issue
lists and details, checks, PR checkout/review/merge, creation forms, issue
comments and state changes, and workflow runs/reruns. It uses the installed `gh`
executable for API calls; credentials remain in its existing configuration.
Assigned-account PR checkout uses the brokered native Git path described above.
GitHub-specific reads and writes are explicit UI actions, not automatic on page
load. PR merge
requires the full reviewed head SHA. Body text goes through stdin unchanged.
Authentication responses whitelist account metadata and exclude token values.

```sh
./target/debug/desktop-rs github '{"action":{"type":"auth_status"}}'
./target/debug/desktop-rs -C /path/to/repo github '{"action":{"type":"pull_requests","limit":30}}'
./target/debug/desktop-rs github '{"repository":"github.example/owner/repo","action":{"type":"issues"}}'
```

`repository` optionally selects `[HOST/]OWNER/REPO`; otherwise `gh` resolves the
working tree. See `crates/core/src/github.rs` for typed actions. Use `github -`
or `repo -` to read a JSON request from stdin, avoiding command-line size
limits. Check `code`, `data`, `stderr`, and `hint` in replies. Check
failures/pending states retain structured data with nonzero codes. The WebSocket
form is
`{"id":1,"method":"github","request":{"action":{"type":"pull_requests"}}}`. Auth
status works without an active repository; other browser GitHub actions require
one. Interactive login remains `desktop-rs gh auth login` in Termux.

Row, Form, HorizontalRule, and HighlightText were moved from upstream into
`web/src/upstream/`. Original app entrypoints re-export these implementations.
The GitHub panel reuses them in a standalone React bundle, with no Electron or
Node dependencies. The rest of the old React UI is still being migrated. The
browser bundle is checked in so Rust builds do not need Node. After frontend
source changes, run from the repository root:

```sh
npm ci --prefix rust/web
npm --prefix rust/web run typecheck
npm --prefix rust/web run build
npm --prefix rust/web test
```

The root Cargo workspace and `.github/workflows/rust.yml` build and validate the
new implementation independently of the legacy npm/Electron pipeline. Build
artifacts remain under `rust/target` during the source migration.

## Architecture and protocol

- `desktop-core`: saved repositories, init/clone, typed Git operations, root
  normalization, exact path bytes, structured status, bounded command output,
  and operation serialization.
- `desktop-cli`: direct workflows, JSON protocol execution, Git/gh forwarding.
- `desktop-bridge`: loopback HTTP, session authentication, bounded ordered RPC,
  request cancellation and change events.
- `desktop-native`: optional Wry/Tao host for the same application.
- `web/`: browser frontend, shared upstream React components, GitHub panel, and
  framework-independent transport; the complete upstream UI is still pending.

The server binds to IPv4 `127.0.0.1` and verifies Host and WebSocket Origin.
Open `ws://127.0.0.1:PORT/ws` from the corresponding HTTP page. Authenticate
within five seconds by sending `{"token":"SESSION_TOKEN"}`. The server replies
`{"ready":true,"version":3,"capabilities":{"cancel":true,"max_pending":32}}`.
Subsequent requests have a unique in-flight unsigned integer `id` and the
operation fields, for example:

```json
{ "id": 1, "method": "stage", "paths": ["file.txt"] }
```

Replies contain `id` plus `result` or `error`. Git command results have `code`,
`stdout`, and `stderr`; a nonzero `code` is a failed Git command. `snapshot`
returns `root`, `branch`, `head`, and a structured `files` array with
byte-preserving paths, rename sources, status flags, conflict state, size, and
modification time. App methods are `list_repositories`,
`open_repository`/`select_repository` (with `path`), `forget_repository`
(metadata only), `init_repository` (with `path`), and `clone_repository` (with
`url` and `path`). No active repository returns `null` from `snapshot`; other
repository operations then return an error. Notifications have
`event: "repository_changed"` and `snapshot`, without an `id`.

Requests run in arrival order within each connection. Up to 32 requests can be
pending per connection and up to 16 WebSocket sessions can be open. Full queues
reply with `error_code: "queue_full"` without executing that request. Browser
requests over the serialized 64 KiB UTF-8 limit fail locally without closing the
socket; shorten the input or use the CLI. Reusing an in-flight ID closes that
session. Controls bypass the queue:

```json
{ "id": 2, "method": "cancel", "request_id": 1 }
```

For operations tied to the displayed repository, include `repository_id` from
the snapshot's `root_id`. The browser does this automatically. The server checks
it under the selection lock when the queued request executes, so another tab's
selection change rejects stale work rather than applying it to the newly
selected repository. Snapshot/management and global settings/auth reads are
independent of that fence. Omitting the field keeps the raw RPC's
shared-selection behavior.

Cancellation is scoped to the authenticated connection. The control reply has
`status: "requested"`, `"queued"`, or `"not_found"`; a cancelled original
request replies with `error_code: "cancelled"`. Completed changes are not rolled
back. The browser's Cancel work button cancels its pending requests, waits for
cleanup, and refreshes state. The transport also accepts
`request(method, parameters, { signal })` for AbortSignal cancellation.
Disconnecting cancels that connection's unfinished work; reconnects authenticate
anew and never replay operations.

On Unix, Git/gh use separate process groups. Cancellation sends SIGINT, drains
output for up to two seconds, then kills remaining group members and reaps the
direct child before releasing the operation lock. Metadata lock and repository
mutex waits are also cancellable. Windows currently terminates the direct child;
Windows process-tree cancellation remains a migration gate. Typed CLI operations
handle SIGINT/SIGTERM, perform the same cleanup, and exit 130/143 on Unix;
Git/gh passthrough preserves the forwarded executable's own signal behavior.
Cancellation, timeout, and disconnect can happen after a mutation took effect;
inspect current state before retrying.

All operations on the server's repository handle are serialized. Git still
coordinates with independent processes through its own locks. Ordinary command
output is limited to 2 MiB per stream (captured diff stdout: 8 MiB) and
execution to 120 seconds. A timeout or output limit can occur after a mutation
has taken effect: inspect state before retrying. Mutating commands can execute
repository-configured hooks and filters, as normal Git does. Use repositories
you trust. Browser operations cannot prompt in the terminal; configure
credentials/signing using the CLI first. Pull uses fast-forward only, branch
deletion uses Git's merged-branch check, and push does not force.

## Validation

```sh
cargo fmt --all -- --check
cargo test --workspace --locked -j 1
cargo clippy --workspace --all-targets --locked -j 1 -- -D warnings
python tests/smoke.py
python tests/lifecycle.py
python tests/cancellation.py
python tests/signals.py
python tests/workflows.py
python tests/direct_git_cli.py
python tests/stashes.py
python tests/branch_rename.py
python tests/branch_create.py
python tests/branch_delete.py
python tests/checkout.py
python tests/checkout_native.py
python tests/commit_review.py
python tests/lfs_operations.py
python tests/diffs.py
python tests/discard.py
python tests/discard_advanced.py
python tests/discard_gc.py
python tests/history_state.py
python tests/editor_conflicts.py
python tests/conflict_undo.py
python tests/management.py
python tests/repositories.py
python tests/publish_context.py
python tests/publish_preview.py
python tests/publish_receipts.py
python tests/publish_create.py
python tests/publish_ledger_visibility.py
python tests/publish_preview_cancel.py
python tests/publish_continue.py
python tests/publish_origin.py
python tests/github.py
python tests/github_cli.py
node --test tests/transport.test.mjs
npm --prefix web run test:integration
node --check web/client.js
node --check web/transport.js
```

Integration tests use isolated local repositories and a local bare remote; no
GitHub credentials or network are needed. They cover CLI forwarding and exit
codes, HTTP/WS restrictions, authenticated mutations, change events, unborn
branches, staged/working changes, exact filename bytes, literal pathspecs,
branches, stashes, merge conflicts/recovery, rebase, cherry-pick/revert, tags,
and fetch/push/pull. Repository tests cover create/clone, saved selection,
concurrent registry updates, safe forgetting, and corrupt-data preservation.
Transport tests cover authentication, reply correlation, events, and disconnect
failures. The GitHub adapter tests use a controlled gh substitute and the
installed gh against a local HTTPS mock API. `github_cli.py` requires `openssl`
or an explicit `OPENSSL_BIN` path (Termux: install `openssl-tool`). React DOM
tests use JSDOM; actual browser rendering and live GitHub authentication still
need separate verification. Upstream `npm run lint:fix` currently requires
missing Node dependencies; it fails at `prettier: not found` in this checkout.
