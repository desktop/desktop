# Developer OAuth App

Because GitHub Desktop uses [OAuth web application flow](https://developer.github.com/v3/oauth/#web-application-flow)
to interact with the GitHub API and perform actions on behalf of a user, it
needs to be bundled with a Client ID and Secret.

For external contributors, we have bundled a developer OAuth application
with the Desktop application so that you can complete the sign in flow locally
without needing to configure your own application.

These are listed in [app/app-info.ts](https://github.com/desktop/desktop/blob/85cf9dbae5055cc4f0de9fb4f7046cd32607e877/app/app-info.ts#L9-L10).

**DO NOT TRUST THIS CLIENT ID AND SECRET! THIS IS ONLY FOR TESTING PURPOSES!!**

The limitation with this developer application is that **this will not work
with GitHub Enterprise**. You will see  sign-in will fail on the OAuth callback
due to the credentials not being present there.

## Provide your own Client ID and Secret

The OAuth client ID and Client Secret are bundled into the application with
webpack. If you want to provide your own Client ID and Client Secret, set these
environment variables:

 - `DESKTOP_OAUTH_CLIENT_ID`
 - `DESKTOP_OAUTH_CLIENT_SECRET`

## Short-lived credentials (preview)

Development builds and builds started with `GITHUB_DESKTOP_PREVIEW_FEATURES=1`
request `offline_access` in addition to Desktop's existing OAuth scopes for
GitHub.com and GitHub Enterprise Cloud. GitHub Enterprise Server always uses the
existing scopes for new sign-ins; no GHES version is currently enabled for
refreshable OAuth acquisition. When GHES support becomes available, add a
version-based capability check before opting in. The authorization response
determines whether the account uses rotating credentials. Existing non-expiring
tokens remain supported; this does not automatically migrate existing accounts.
Reauthenticate to opt an eligible account in.

The flag controls acquisition only. Disabling the preview must not stop renewal
of already-issued credentials. Do not force expiring tokens in the OAuth app's
registration while older Desktop versions remain in use.

### Storage and renewal

`AccountsStore` is the credential authority in Desktop's single main renderer.
It keeps the account list and delegates renewal, token resolution, rejected-token
handling, and ordered secure-storage writes to `CredentialSessions`.
Electron's single-instance lock prevents a second Desktop instance from owning
the same application profile. Main-process private image requests delegate token
resolution to that renderer; Git subprocesses use the existing trampoline.

`CredentialSessions` tracks the issuing session of account snapshots and
propagates that association through owner-produced token, lease, and profile
copies. The association lives outside `Account` fields and serialized account
data. A replacement sign-in produces a distinct snapshot instead of rebinding
old objects, even when the access-token string is reused. Session-bound getters
reject unknown or retired snapshots rather than inferring identity from token
text. Ordinary endpoint/user-ID fresh-account lookups still follow the current
same-user sign-in; operations that must retain their origin use bound getters.

Rotating credentials are persisted as a versioned record containing both tokens
and their expiry metadata in one OS secure-store item. Refresh tokens are never
part of `Account`, local storage, IPC, Git credentials, or Copilot SDK credentials.
Existing plain access-token entries are still readable. There is no plaintext
fallback when secure storage fails.

Before authenticated work, Desktop renews a token that expires within ten minutes
(inclusive), or whose expiry is unknown. Concurrent callers share one exchange.
Once rotation starts, even callers with a shorter validity requirement wait for
that exchange rather than receiving the old token that rotation invalidates.
Secure writes, account replacement, and sign-out are coordinated so a late
exchange cannot restore a signed-out account. Both replacement tokens must be
saved before publishing the new access token.

Sign-out captures the credential to revoke in the same synchronous step that
retires its session. A renewal published before retirement is revoked by sign-out;
a replacement received after retirement is handled by unused-credential cleanup.
Failure to delete secure storage is reported without discarding the credential
needed for remote revocation.

API clients resolve credentials for every request, including clients created
before rotation. Git and Git LFS receive a freshly resolved token as their
username/password; Desktop's trampoline disables other credential helpers for its
Git operations, so it does not populate external credential caches.
Git reuses that token for every request it makes, so each Git process holds a
lease on it until the process exits, shared with the Git LFS processes it
starts. Anyone who needs a leased token renewed waits until it is released,
or until it is within a minute of expiring. During a token's last ten minutes,
work that needs a renewal can therefore wait for a long Git operation.
Private images use bounded, sender-checked IPC.

Refreshable Copilot sessions use the SDK's token-provider callback. Desktop
requires more than 61 minutes of validity and subtracts the one-minute safety
buffer from the reported lifetime, aligning the SDK's one-hour cached-token
preflight with Desktop's renewal deadline. Fractional seconds are preserved so a
valid token is not rounded onto the SDK's rejection boundary. Unknown lifetimes,
or buffered lifetimes of an hour or less, fail explicitly. Only access tokens and
remaining lifetimes cross that boundary.

Each client's static authentication and SDK provider bind to the same originating
session before asynchronous preparation. Commit-message generation captures
that context before model discovery. The static token is resolved after runtime
preparation, immediately before client construction, and quota token lookups
stay bound across SDK startup. Metadata calls keep the ordinary ten-minute
renewal margin, rather than the SDK session margin.

Providers follow rotation within their session and read the access token and
expiry from the same credential snapshot. Retirement permanently rejects both
existing providers and attempts to create a provider from an old account
snapshot, even if the same user signs in again or the later sign-in reuses the
access-token string. A new sign-in needs a new account snapshot and client.

Copilot does not hold a token lease for the duration of an invocation. Preflight
alignment does not protect an SDK request that is already running: a long-running
invocation can still fail if another consumer rotates and revokes its token.

Commit-message generation and conflict resolution cancel their own waits for
client preparation and SDK session creation without waiting for Git leases to
end. Generation also cancels its wait for shared model discovery. Shared discovery
and credential renewal continue, and cancellation does not release another
operation's token lease. Clients and sessions returned after cancellation are
stopped or disconnected once. Conflict cancellation remains an abort rather than
a transport failure or a retry.

### Failure and recovery

- Temporary network/service failures retain credentials, fail the operation
  with connection guidance, and allow the next authenticated operation to retry
  immediately. They do not sign the user out. Simultaneous callers still share
  an in-flight renewal. Git operations keep using the current access token
  instead while it has not expired.
- Explicit refresh rejection or a malformed replacement pair signs the user out
  and immediately asks whether to sign in again, matching the existing
  invalid-token flow. Choosing **No** leaves the account signed out; the usual
  sign-in options remain available in Settings/Preferences > Accounts. Choosing
  **Yes** opens sign-in for the same host, including the original Enterprise
  endpoint. Local repositories and changes remain unaffected.
- Failed persistence after rotation never returns the new access token or falls
  back to plaintext. Desktop signs out and removes the unusable stored
  credential before attempting to revoke the unused replacement. Revocation
  runs independently of waiting credential consumers, has a 30-second
  cancellation deadline, and logs failures without preventing sign-in recovery.
- During sign-in, credentials returned by the code exchange remain owned by the
  sign-in flow until it hands them to `AccountsStore`. Cancellation before that
  point, profile lookup failure, or failed persistence attempts the same bounded,
  nonblocking cleanup of unpublished credentials. Once handed over, credentials
  are owned by `AccountsStore` and are not revoked merely because the sign-in UI
  is dismissed, even while they are still being saved.
- Overlapping sign-ins for the same host are saved one at a time, and each is
  signed in as soon as its save succeeds. The last successful save wins, both
  in memory and after relaunch; a failed save leaves the current account
  signed in. Signing out does not cancel a sign-in that is still saving.
- If a Git operation needs credentials for an account that has been signed out,
  including because renewal was rejected, it follows the same path as when no
  account exists: foreground operations ask the user to sign in, and background
  operations fail with the usual authentication error.
- OAuth exchanges have a 30-second deadline, including response parsing. They
  reject redirects and are never automatically replayed. Errors and lifecycle
  logs do not include token values or server-provided error descriptions.
- Stale 401 responses do not invalidate a replacement credential. API requests
  already in flight when a pair rotates can still fail: rotation invalidates
  the old access token as well as its refresh token. Desktop does not blindly
  replay mutations; retry the user operation after a failure. Git operations
  are only affected if they run past their token's expiry.
- If the server consumes a refresh token but its response is lost, a later
  attempt can be rejected. Sign-in is the recovery path; Desktop cannot make
  remote rotation and local persistence transactional.

### Compatibility and validation

Older Desktop versions cannot read the new secure-record format. Sign out before
downgrading and sign in again in the older version. Keep renewal support in
rollback builds even if new acquisition is disabled.

Run the OAuth protocol, account lifecycle, authentication integration, image IPC,
consumer, recovery-dialog, and account-settings tests with `yarn test`, followed
by the full suite.
The tests use mock OAuth responses and in-memory secure stores. Before broad
rollout, also verify real browser authorization and rotation on macOS and Windows,
Git/LFS, Copilot SDK cached-token rollover and long-running invocations,
sleep/resume, keychain failures, and supported Enterprise deployments.
Security review and rollout approval remain release requirements.

Device-bound credentials, token sharing with `gh`, forced migration, a token
export interface, SSH changes, and third-party credential-helper replacement are
outside this feature.
