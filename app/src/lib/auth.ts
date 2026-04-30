import { Account } from '../models/account'

/** Get the auth key for the user. */
export function getKeyForAccount(account: Account): string {
  return getKeyForEndpoint(account.endpoint)
}

// We intentionally do NOT vary the prefix by __DEV__. From-source release builds
// run with channel=development (so __DEV__=true) but share Windows Credential
// Manager + userData with the official Desktop install. Using the same "GitHub"
// prefix lets users sign in once and have credentials work across both builds,
// avoiding empty-token fetches that get a 404 from GitHub.
export function getKeyForEndpoint(endpoint: string): string {
  return `GitHub - ${endpoint}`
}
