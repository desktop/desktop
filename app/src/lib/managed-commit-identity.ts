import { Account, getAccountKey, IAccountIdentity } from '../models/account'
import { lookupPreferredEmail } from './email'
import { gitAuthorNameIsValid } from '../ui/lib/identifier-rules'

/** Whether Git configuration or Desktop's account identities supply authorship. */
export type CommitIdentityMode = 'git' | 'desktop'

/** Credential-free authorship retained independently of an account's sign-in. */
export interface IManagedCommitIdentity extends IAccountIdentity {
  readonly name: string
  readonly email: string
  readonly nameOverridden: boolean
  readonly emailOverridden: boolean
}

/** Persisted Desktop-only authorship preferences. */
export interface ICommitIdentitySettings {
  readonly mode: CommitIdentityMode
  readonly identities: ReadonlyArray<IManagedCommitIdentity>
}

/** Only explicitly edited fields become overrides. */
export interface ICommitIdentityEdit extends IAccountIdentity {
  readonly name?: string
  readonly email?: string
}

/** Refresh API-derived fields without replacing user overrides or signed-out identities. */
export function refreshManagedCommitIdentities(
  identities: ReadonlyArray<IManagedCommitIdentity>,
  accounts: ReadonlyArray<Account>
): ReadonlyArray<IManagedCommitIdentity> {
  const result = new Map(identities.map(i => [getAccountKey(i), i]))
  for (const account of accounts) {
    const previous = result.get(getAccountKey(account))
    result.set(getAccountKey(account), {
      endpoint: account.endpoint,
      login: account.login,
      name: previous?.nameOverridden ? previous.name : account.friendlyName,
      email: previous?.emailOverridden
        ? previous.email
        : lookupPreferredEmail(account),
      nameOverridden: previous?.nameOverridden ?? false,
      emailOverridden: previous?.emailOverridden ?? false,
    })
  }
  return [...result.values()]
}

/** Describe why a managed commit name is invalid, if it is. */
export function getManagedCommitNameError(name: string): string | undefined {
  if (name.trim().length === 0) {
    return 'Enter a name.'
  }
  if (!gitAuthorNameIsValid(name)) {
    return 'Name can’t consist only of punctuation.'
  }
  if (/[\0\r\n]/.test(name)) {
    return 'Name can’t contain line breaks.'
  }
  return undefined
}

/** Describe why a managed commit email is invalid, if it is. */
export function getManagedCommitEmailError(email: string): string | undefined {
  if (email.trim().length === 0) {
    return 'Enter an email.'
  }
  if (/[\0\r\n<>]/.test(email)) {
    return 'Email can’t contain angle brackets or line breaks.'
  }
  return undefined
}

/** Validate both identity fields before persisting or passing them to Git. */
export function isValidManagedCommitIdentity(
  identity: Pick<IManagedCommitIdentity, 'name' | 'email'>
): boolean {
  return (
    getManagedCommitNameError(identity.name) === undefined &&
    getManagedCommitEmailError(identity.email) === undefined
  )
}

/** Validate stored preferences rather than silently accepting a corrupt identity. */
export function isCommitIdentitySettings(
  value: unknown
): value is ICommitIdentitySettings {
  return (
    typeof value === 'object' &&
    value !== null &&
    'mode' in value &&
    (value.mode === 'git' || value.mode === 'desktop') &&
    'identities' in value &&
    Array.isArray(value.identities) &&
    value.identities.every(
      (i: unknown) =>
        typeof i === 'object' &&
        i !== null &&
        'endpoint' in i &&
        typeof i.endpoint === 'string' &&
        'login' in i &&
        typeof i.login === 'string' &&
        'name' in i &&
        typeof i.name === 'string' &&
        'email' in i &&
        typeof i.email === 'string' &&
        'nameOverridden' in i &&
        typeof i.nameOverridden === 'boolean' &&
        'emailOverridden' in i &&
        typeof i.emailOverridden === 'boolean'
    )
  )
}

type CommitIdentityProvider = (
  path: string
) => Pick<IManagedCommitIdentity, 'name' | 'email'> | undefined

let identityProvider: CommitIdentityProvider = () => undefined

/** Install the renderer's repository-scoped, credential-free identity lookup. */
export function setCommitIdentityProvider(provider: CommitIdentityProvider) {
  identityProvider = provider
}

/**
 * Identity variables for Desktop's child processes; never modify process.env or Git config.
 * A complete caller-supplied identity, including explicit undefined keys, takes precedence.
 */
export function getManagedCommitEnvironment(
  path: string,
  environment?: Readonly<Record<string, string | undefined>>
): Record<string, string | undefined> {
  if (
    environment !== undefined &&
    [
      'GIT_AUTHOR_NAME',
      'GIT_AUTHOR_EMAIL',
      'GIT_COMMITTER_NAME',
      'GIT_COMMITTER_EMAIL',
    ].every(key => Object.prototype.hasOwnProperty.call(environment, key))
  ) {
    return {}
  }
  const identity = identityProvider(path)
  if (identity === undefined) {
    return {}
  }
  if (!isValidManagedCommitIdentity(identity)) {
    throw new Error(
      'The managed commit name or email is invalid. Update Git preferences.'
    )
  }
  return {
    GIT_AUTHOR_NAME: identity.name,
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
  }
}
