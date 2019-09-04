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

  const createRepository = async (remoteUrl = 'https://whatever.git') => {
    const db = new TestRepositoriesDatabase()
    await db.reset()
    const repositoriesStore = new RepositoriesStore(db)

    const repoPath = await setupFixtureRepository('test-repo')
    const blankRepo = await repositoriesStore.addRepository(repoPath)
    const repository = await repositoriesStore.updateGitHubRepository(
      blankRepo,
      '',
      apiRepository
    )
    await addRemote(repository, 'origin', remoteUrl)
    gitStore = new GitStore(repository, shell)
    await gitStore.loadRemotes()

    return { repository, gitStore }
  }

  it("updates the repository's remote url when the cloned url changes", async () => {
    const { repository, gitStore } = await createRepository()
    const originalUrl = gitStore.defaultRemote!.url
    const updatedUrl = 'https://github.com/my-user/my-updated-repo'
    const updatedApiRepository = { ...apiRepository, clone_url: updatedUrl }
    await updateRemoteUrl(gitStore, repository, updatedApiRepository)
    expect(originalUrl).not.toBe(updatedUrl)
    expect(gitStore.defaultRemote!.url).toBe(updatedUrl)
  })

  it("doesn't update the repository's remote url when the cloned url is the same", async () => {
    const { repository, gitStore } = await createRepository()
    const originalUrl = gitStore.defaultRemote!.url
    expect(originalUrl).not.toBeEmpty()
    await updateRemoteUrl(gitStore, repository, apiRepository)
    expect(gitStore.defaultRemote!.url).toBe(originalUrl)
  })

  it("doesn't update the repository's remote url when the protocol is something other than https", async () => {
    const originalUrl = 'git@github.com:desktop/desktop.git'
    const { repository, gitStore } = await createRepository(originalUrl)
    const updatedUrl = 'https://github.com/my-user/my-updated-repo'
    const updatedApiRepository = { ...apiRepository, clone_url: updatedUrl }

    await updateRemoteUrl(gitStore, repository, updatedApiRepository)
    expect(gitStore.defaultRemote!.url).toBe(originalUrl)
  })
})
