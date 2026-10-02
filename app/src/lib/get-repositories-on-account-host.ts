import { Account } from '../models/account'
import { Repository } from '../models/repository'
import { getHTMLURL } from './api'
import { parseRemote } from './remote-parsing'

export const getRepositoriesOnAccountHost = (
  account: Account,
  repositories: ReadonlyArray<Repository>,
  remoteURLs: ReadonlyMap<number, string> = new Map()
): ReadonlyArray<Repository> => {
  const hostname = new URL(getHTMLURL(account.endpoint)).hostname.toLowerCase()
  return repositories.filter(repository => {
    if (repository.gitHubRepository !== null) {
      return repository.gitHubRepository.endpoint === account.endpoint
    }

    const remote = remoteURLs.get(repository.id)
    if (remote !== undefined) {
      return parseRemote(remote)?.hostname.toLowerCase() === hostname
    }

    return repository.accountIdentity?.endpoint === account.endpoint
  })
}
