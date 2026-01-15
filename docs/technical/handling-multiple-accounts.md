# Handling Multiple Accounts

GitHub Desktop supports signing in to multiple accounts on the same endpoint (e.g. multiple GitHub.com accounts) as well as accounts across different GitHub Enterprise instances.

## Architecture

### Account Storage (`AccountsStore`)

Accounts are stored in `AccountsStore`, which coordinates with:
1.  **DataStore** (localStorage): Stores account metadata (login, email, name, etc.).
2.  **SecureStore** (keytar): Stores OAuth tokens securely.

#### Token Isolation

To support multiple accounts on the same endpoint, tokens are stored using a composite key: `endpoint` + `id` (or `login` as part of the lookup).
Method: `getKeyForAccount(account)` -> `Account/${endpoint}/${id}` (conceptually).

This ensures that even if two accounts share an endpoint (e.g., `https://api.github.com`), their tokens are isolated and retrieved correctly.

### Repository Binding (`RepositoryAccountStore`)

While the app can have multiple active accounts, each repository is associated with a single "preferred" account for operations (commits, API calls).

-   `RepositoryAccountStore` persists this preference.
-   Key: `repository.id`.
-   Value: `account.login`.

#### Resolution Logic (`getAccountForRepository`)

1.  Check `RepositoryAccountStore` for a preferred login for the repository.
2.  If found, look up that account in the active `AccountsStore`.
3.  If not found (or no preference), fall back to the first available account for the repository's endpoint.

### UI Interaction

-   **Account Switching**: The user can switch the preferred account for a repository via the `CommitMessageAvatar` (Git Config) popover in the changes view.
-   **Sign In**: Modifications to `SignInStore` allow the authentication flow to proceed even if an account for the endpoint already exists, adding the new account alongside the existing one.

## Testing

-   **Unit Tests**:
    -   `app/test/unit/accounts-store-test.ts`: Verifies multi-account adds, storage, and persistence.
    -   `app/test/unit/multi-account-security-test.ts`: Verifies secure token isolation and cleanup.
    -   `app/test/unit/repository-account-store-test.ts`: Verifies repository-specific account preferences.
    -   `app/test/unit/sign-in-store-test.ts`: Verifies allowing multiple account sign-ins.
