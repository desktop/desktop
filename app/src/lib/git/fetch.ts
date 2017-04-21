import { git, envForAuthentication, gitNetworkArguments } from './core'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'

/** Fetch from the given remote. */
export async function fetch(repository: Repository, account: Account | null, remote: string): Promise<void> {
  const options = {
    successExitCodes: new Set([ 0 ]),
    env: envForAuthentication(account),
  }

  const args = [
    ...gitNetworkArguments,
    'fetch', '--prune', remote,
  ]

  await git(args, repository.path, 'fetch', options)
}

/** Fetch a given refspec from the given remote. */
export async function fetchRefspec(repository: Repository, account: Account | null, remote: string, refspec: string): Promise<void> {
  const options = {
    successExitCodes: new Set([ 0, 128 ]),
    env: envForAuthentication(account),
  }

  const args = [
    ...gitNetworkArguments,
    'fetch', remote, refspec,
  ]

  await git(args, repository.path, 'fetchRefspec', options)
}

