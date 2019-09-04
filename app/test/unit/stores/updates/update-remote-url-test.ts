import { RepositoriesStore, GitStore } from '../../../../src/lib/stores'
import { TestRepositoriesDatabase } from '../../../helpers/databases'
import { IAPIRepository } from '../../../../src/lib/api'
import updateRemoteUrl from '../../../../src/lib/stores/updates/update-remote-url'
import { Repository } from '../../../../src/models/repository'
import { shell } from '../../../helpers/test-app-shell'

describe('Update remote url', () => {
  const gitHubRepo: IAPIRepository = {
    clone_url: 'https://github.com/my-user/my-repo',
    ssh_url: 'git@github.com:my-user/my-repo.git',
    html_url: 'https://github.com/my-user/my-repo',
    name: 'my-repo',
    owner: {
      id: 42,
      url: 'https://github.com/my-user',
      login: 'my-user',
      avatar_url: 'https://github.com/my-user.png',
      type: 'User',
    },
    private: true,
    fork: false,
    default_branch: 'master',
    parent: null,
    pushed_at: '1995-12-17T03:24:00',
  }

  let repositoriesStore: RepositoriesStore
  let gitStore: GitStore
  let repository: Repository

  beforeEach(async () => {
    const db = new TestRepositoriesDatabase()
    await db.reset()
    repositoriesStore = new RepositoriesStore(db)
    gitStore = new GitStore(repository, shell)
    repository = await repositoriesStore!.addRepository('/some/cool/path')
    await repositoriesStore!.updateGitHubRepository(
      repository,
      'https://api.github.com',
      gitHubRepo
    )
  })

  it("updates the repository's remote url when the cloned url changes", async () => {
    const clone_url = 'https://github.com/my-user/my-updated-repo'
    const updatedGitHubRepo = { ...gitHubRepo, clone_url }
    const newUrl = updateRemoteUrl(gitStore, repository, updatedGitHubRepo)

    expect(gitHubRepo.clone_url).not.toBe(updatedGitHubRepo.clone_url)
    expect(newUrl).toBe(updatedGitHubRepo.clone_url)
  })

  it("doesn't update the repository's remote url when the cloned url is the same", async () => {
    expect(updateRemoteUrl(gitStore, repository, gitHubRepo)).toBeNull()
  })
})
