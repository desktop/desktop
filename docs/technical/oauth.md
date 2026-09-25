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

## Repository account assignments

Desktop can retain multiple signed-in accounts for the same endpoint. A local
repository stores a nullable `login`, paired with its GitHub repository's API
endpoint. This is an authentication choice, not a Git author name or email.
Repository Settings exposes the assignment on the Remote tab.

On the first startup after upgrading, repositories without a persisted login
field are assigned the existing account for their endpoint, if one exists.
The migration writes `null` when none exists and never revisits that choice.
New records default to `null`.

User-initiated operations on an unassigned repository ask the user to choose an
account. If an assigned login is signed out, Desktop offers to sign back into
that account or choose another. Targeted reauthentication adds `login` and
`allow_signup=false` to the OAuth authorization URL and verifies the returned
identity before accepting it. Background operations never open these prompts
and do not fall back to another account.

Explicit sign-out offers to keep or clear matching repository assignments.
Automatic account removal, including token invalidation, preserves assignments.
Changing a repository's endpoint clears its account assignment.

HTTPS Git credentials are resolved in the credential trampoline using its
operation path and a locally cached copy of the repositories store. Both account
and repository updates invalidate that cached view. A requested host must match
the assigned endpoint; an account is never borrowed from another endpoint.
Operations on repositories that haven't been added to Desktop yet, such as
cloning or pushing a new tutorial repository, can pass a `fallbackAccount` in
their Git execution options. It's only used when no repository can be resolved
from the operation's path, the endpoint matches, and the account is still
signed in. It shouldn't be passed merely because an account is available.

### Included and deferred work

- **Cloning and adding local repositories (included):** probe repository access for each
  account on the endpoint. Select the sole accessible account; ask the user when
  more than one account has access. If none has access, cloning proceeds
  anonymously and the repository remains unassigned. A private clone that
  requires authentication fails normally; sign in with an account that has
  access before retrying.
- **Account-dependent caches (included):** isolate repository permissions, pull request
  metadata, and check subscriptions between assigned identities.
- **SSH identity selection (deferred):** SSH continues to use the user's SSH
  configuration and agent, not Desktop's HTTPS account token.
- **Copilot identity controls (deferred):** preserve the existing fallback to
  another Copilot-eligible account when the repository account lacks access.
- **Repository-list presentation (follow-up):** consider displaying account
  assignments and grouping or filtering repositories by account.
- **Authenticated images and avatars (deferred):** avatar API lookups and private
  image loading still resolve credentials by endpoint rather than repository.
- **Orphaned account-scoped metadata (follow-up):** reassigning a repository
  switches it to the GitHub repository record scoped to the new account, but
  the previous account's record is retained. Records no longer referenced by
  any local repository (or as another record's parent) should be pruned along
  with their dependent protected branches and cached pull requests.
