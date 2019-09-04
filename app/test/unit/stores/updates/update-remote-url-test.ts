import { GitStore, RepositoriesStore } from '../../../../src/lib/stores'
import { TestRepositoriesDatabase } from '../../../helpers/databases'
import { IAPIRepository } from '../../../../src/lib/api'
import updateRemoteUrl from '../../../../src/lib/stores/updates/update-remote-url'
import { Repository } from '../../../../src/models/repository'
import { shell } from '../../../helpers/test-app-shell'
import { setupFixtureRepository } from '../../../helpers/repositories'
import { addRemote } from '../../../../src/lib/git'

describe('Update remote url', () => {
  const apiRepository: IAPIRepository = {
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

  let gitStore: GitStore
  let repositoriesStore: RepositoriesStore
  let repository: Repository

  beforeEach(async () => {
    const db = new TestRepositoriesDatabase()
    await db.reset()
    repositoriesStore = new RepositoriesStore(db)

    const repoPath = await setupFixtureRepository('test-repo')
    const blankRepo = await repositoriesStore.addRepository(repoPath)
    repository = await repositoriesStore.updateGitHubRepository(
      blankRepo,
      '',
      apiRepository
    )
    await addRemote(repository, 'origin', 'https://whatever.git')

    gitStore = new GitStore(repository, shell)
    await gitStore.loadRemotes()
  })

  it("updates the repository's remote url when the cloned url changes", async () => {
    const originalUrl = gitStore.defaultRemote!.url
    const updatedUrl = 'https://github.com/my-user/my-updated-repo'
    const updatedGitHubRepo = { ...apiRepository, clone_url: updatedUrl }
    await updateRemoteUrl(gitStore, repository, updatedGitHubRepo)
    expect(originalUrl).not.toBe(updatedUrl)
    expect(gitStore.defaultRemote!.url).toBe(updatedUrl)
  })

  it("doesn't update the repository's remote url when the cloned url is the same", async () => {
    const originalUrl = gitStore.defaultRemote!.url
    expect(originalUrl).not.toBeEmpty()
    await updateRemoteUrl(gitStore, repository, apiRepository)
    expect(gitStore.defaultRemote!.url).toBe(originalUrl)
  })
})
