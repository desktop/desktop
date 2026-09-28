import * as React from 'react'
import { Account } from '../../models/account'
import {
  getAccountsForRemote,
  IRepositoryAccountBinding,
} from '../../lib/repository-account'
import { parseRemote } from '../../lib/remote-parsing'
import { Select } from '../lib/select'

interface IRepositoryAccountProps {
  readonly accounts: ReadonlyArray<Account>
  readonly remoteURL: string
  readonly binding: IRepositoryAccountBinding | null
  readonly onChange: (account: Account | null) => void
}

/** Selects a GitHub identity independently of the Git commit author. */
export function RepositoryAccount(props: IRepositoryAccountProps) {
  const accounts = getAccountsForRemote(props.accounts, props.remoteURL)
  const binding = props.binding
  const value =
    binding === null ? '' : JSON.stringify([binding.endpoint, binding.id])
  const unavailable =
    binding !== null &&
    !accounts.some(
      account =>
        account.endpoint === binding.endpoint &&
        account.id === binding.id &&
        account.token.length > 0
    )
  const onChange = React.useCallback(
    (event: React.FormEvent<HTMLSelectElement>) => {
      const selected = event.currentTarget.value
      if (selected === '') {
        props.onChange(null)
        return
      }
      const account = accounts.find(
        account => JSON.stringify([account.endpoint, account.id]) === selected
      )
      if (account !== undefined) {
        props.onChange(account)
      }
    },
    [accounts, props.onChange]
  )
  return (
    <div>
      <Select
        label="GitHub account for this repository"
        value={value}
        onChange={onChange}
      >
        <option value="">Default account for this host</option>
        {unavailable && (
          <option value={value} disabled={true}>
            @{binding.login} (sign-in required)
          </option>
        )}
        {accounts
          .filter(account => account.token.length > 0)
          .map(account => (
            <option
              key={`${account.endpoint}:${account.id}`}
              value={JSON.stringify([account.endpoint, account.id])}
            >
              @{account.login}
            </option>
          ))}
      </Select>
      {unavailable && (
        <p role="alert">
          The selected account is signed out. Sign in again or choose another
          account. Another account will not be used automatically.
        </p>
      )}
      {accounts.length === 0 && (
        <p>
          Add an account for this GitHub host in Options / Accounts first. Other
          hosting services, including Azure DevOps, continue to use their own
          saved credentials.
        </p>
      )}
      <p>
        This controls GitHub API and HTTPS Git authentication, not the commit
        name or email. All local checkouts of this remote repository share the
        selection.
      </p>
      {parseRemote(props.remoteURL)?.protocol === 'ssh' && (
        <p role="status">
          This remote uses SSH. Git authentication still uses your SSH key, not
          the account selected here. Use an HTTPS remote to apply this selection
          to fetch and push.
        </p>
      )}
    </div>
  )
}
