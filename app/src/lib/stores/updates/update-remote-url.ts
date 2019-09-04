import { Repository } from '../../../models/repository'
import { IAPIRepository } from '../../api'
import { GitStore } from '../git-store'

const updateRemoteUrl = async (
  gitStore: GitStore,
  repository: Repository,
  apiRepo: IAPIRepository
): Promise<void> => {
  // I'm not sure when these early exit conditions would be met, but if there are
  // we don't have enough information to continue.
  if (!gitStore.currentRemote) return
  if (!repository.gitHubRepository) return

  const currentRemoteUrl = repository.gitHubRepository.cloneURL
  const updatedRemoteUrl = apiRepo.clone_url
  if (currentRemoteUrl !== updatedRemoteUrl) {
    await gitStore.setRemoteURL(gitStore.currentRemote.name, updatedRemoteUrl)
  }
}

export default updateRemoteUrl
