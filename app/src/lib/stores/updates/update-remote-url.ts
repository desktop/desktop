import { Repository } from '../../../models/repository'
import { IAPIRepository } from '../../api'
import { GitStore } from '../git-store'

const updateRemoteUrl = (
  gitStore: GitStore,
  repository: Repository,
  apiRepo: IAPIRepository
) => {
  if (gitStore.currentRemote) {
    const updatedRemoteUrl = await this.repositoriesStore.updateRemoteUrl(
      repository,
      apiRepo
    )
    if (updatedRemoteUrl) {
      this._setRemoteURL(
        repository,
        gitStore.currentRemote.name,
        updatedRemoteUrl
      )
    }
  }

  if (
    repository.gitHubRepository &&
    repository.gitHubRepository.cloneURL !== apiRepo.clone_url
  ) {
    return apiRepo.clone_url
  } else {
    return null
  }
}

export default updateRemoteUrl
