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
request `offline_access` in addition to Desktop's existing OAuth scopes. The
authorization response determines whether the account uses rotating credentials:
older hosts and existing non-expiring tokens remain supported. This does not
automatically migrate existing accounts. Reauthenticate to opt an account in.
The platform announced OAuth refresh support for GitHub Enterprise Server 3.23;
Desktop does not assume that every Enterprise host supports it.

The flag controls acquisition only. Disabling the preview must not stop renewal
of already-issued credentials. Do not force expiring tokens in the OAuth app's
registration while older Desktop versions remain in use.

### Storage and renewal

`AccountsStore` is the credential authority in Desktop's single main renderer.
Electron's single-instance lock prevents a second Desktop instance from owning
the same application profile. Main-process private image requests delegate token
resolution to that renderer; Git subprocesses use the existing trampoline.

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

API clients resolve credentials for every request, including clients created
before rotation. Git and Git LFS resolve credentials before delivery. Git clients
advertising `authtype` receive ephemeral Basic credentials. Older clients retain
username/password output; Desktop's trampoline disables other credential helpers
for its Git operations, so it does not populate external credential caches.
Private images use bounded, sender-checked IPC. Copilot sessions use the SDK's
token-provider callback with its longer, one-hour preflight margin; only access
tokens and remaining lifetimes cross that boundary. No lifetime is invented when
the server omits it.

### Failure and recovery

- Temporary network/service failures retain credentials, fail the operation, and
  impose a 30-second retry cooldown. They do not sign the user out.
- Explicit refresh rejection or a malformed replacement pair requires sign-in.
  The account identity remains available and a single recovery dialog explains
  that local repositories and changes are unaffected. After choosing **Not now**,
  use **Sign in again** in Settings/Preferences > Accounts to recover without
  signing out first. This action remains available after restart and preselects
  the account's host for Enterprise sign-in.
- Failed persistence after rotation never returns the new access token or falls
  back to plaintext. Desktop records that sign-in is required before attempting
  to revoke the unused replacement. Revocation runs independently of waiting
  credential consumers, has a 30-second cancellation deadline, and logs failures
  without preventing sign-in recovery.
- During sign-in, credentials returned by the code exchange remain owned by the
  sign-in flow until `AccountsStore` accepts them. Cancellation, profile lookup
  failure, or failed persistence attempts the same bounded, nonblocking cleanup
  of unpublished credentials. Once installed, credentials are owned by
  `AccountsStore` and are not revoked merely because the sign-in UI is dismissed.
- OAuth exchanges have a 30-second deadline, including response parsing. They
  reject redirects and are never automatically replayed. Errors and lifecycle
  logs do not include token values or server-provided error descriptions.
- Stale 401 responses do not invalidate a replacement credential. Requests already
  in flight when a pair rotates can still fail: rotation invalidates the old
  access token as well as its refresh token. Desktop does not blindly replay
  mutations; retry the user operation after a failure.
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
Git/LFS, sleep/resume, keychain failures, and supported Enterprise deployments.
Security review and rollout approval remain release requirements.

Device-bound credentials, token sharing with `gh`, forced migration, a token
export interface, SSH changes, and third-party credential-helper replacement are
outside this feature.
