import { Repository } from '../../../models/repository'
import { IAPIRepository } from '../../api'
import { GitStore } from '../git-store'
import { urlMatchesRemote } from '../../repository-matching'

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

  const updatedRemoteUrl = apiRepo.clone_url
  const urlsMatch = urlMatchesRemote(updatedRemoteUrl, gitStore.defaultRemote)

  const remoteUrlUnchanged =
    gitStore.defaultRemote &&
    urlMatchesRemote(
      repository.gitHubRepository.cloneURL,
      gitStore.defaultRemote
    )

  if (remoteUrlUnchanged && !urlsMatch) {
    // Frankenstein the existing remote url to have the updated user/repo path
    const updatedUrl = new URL(gitStore.defaultRemote.url)
    updatedUrl.pathname = new URL(updatedRemoteUrl).pathname
    await gitStore.setRemoteURL(
      gitStore.defaultRemote.name,
      updatedUrl.toString()
    )
  }
}
