import { Repository } from '../../../models/repository'
import { IAPIRepository } from '../../api'
import { GitStore } from '../git-store'
import { urlMatchesRemote } from '../../repository-matching'
import { remoteRegexes } from '../../remote-parsing'
import * as URL from 'url'

export async function updateRemoteUrl(
  gitStore: GitStore,
  repository: Repository,
  apiRepo: IAPIRepository
): Promise<void> {
  // I'm not sure when these early exit conditions would be met. But when they are
  // we don't have enough information to continue so exit early!
  if (!gitStore.defaultRemote) {
    return
  }
  if (!repository.gitHubRepository) {
    return
  }

  const remoteUrl = gitStore.defaultRemote.url
  const updatedRemoteUrl = apiRepo.clone_url
  const urlsMatch = urlMatchesRemote(updatedRemoteUrl, gitStore.defaultRemote)

  // Verify that protocol hasn't changed. If it has we don't want
  // to alter the protocol in case they are relying on a specific one.
  // If protocol is null that implies the url is a ssh url
  // of the format git@github.com:octocat/Hello-World.git, which
  // can't be parsed by URL.parse. In this case we assume the user
  // manually configured their remote to use this format and we don't
  // want to change what they've done just to be safe
  const parsedRemoteUrl = URL.parse(remoteUrl)
  const parsedUpdaedRemoteUrl = URL.parse(updatedRemoteUrl)
  const protocolsMatch =
    parsedRemoteUrl.protocol !== null &&
    parsedUpdaedRemoteUrl.protocol !== null &&
    parsedRemoteUrl.protocol === parsedUpdaedRemoteUrl.protocol

  const remoteUrlUnchanged =
    gitStore.defaultRemote &&
    urlMatchesRemote(
      repository.gitHubRepository.cloneURL,
      gitStore.defaultRemote
    )

  if (protocolsMatch && remoteUrlUnchanged && !urlsMatch) {
    await gitStore.setRemoteURL(gitStore.defaultRemote.name, updatedRemoteUrl)
  }
}
