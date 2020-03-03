import { Repository } from '../../../models/repository'
import { IAPIRepository } from '../../api'
import { GitStore } from '../git-store'
import * as URL from 'url'

export async function updateRemoteUrl(
  gitStore: GitStore,
  repository: Repository,
  apiRepo: IAPIRepository
): Promise<void> {
  // I'm not sure when these early exit conditions would be met. But when they are
  // we don't have enough information to continue so exit early!
  if (!gitStore.currentRemote) {
    return
  }
  if (!repository.gitHubRepository) {
    return
  }

  const remoteUrl = gitStore.currentRemote.url
  const updatedRemoteUrl = apiRepo.clone_url
  const protocolEquals =
    URL.parse(remoteUrl).protocol === URL.parse(updatedRemoteUrl).protocol

  const usingDefaultRemote =
    gitStore.defaultRemote &&
    gitStore.defaultRemote.url === repository.gitHubRepository.cloneURL

  if (protocolEquals && usingDefaultRemote && remoteUrl !== updatedRemoteUrl) {
    await gitStore.setRemoteURL(gitStore.currentRemote.name, updatedRemoteUrl)
  }
}
