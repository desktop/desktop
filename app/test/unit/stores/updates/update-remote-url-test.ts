import { GitStore, RepositoriesStore } from '../../../../src/lib/stores'
import { TestRepositoriesDatabase } from '../../../helpers/databases'
import {
  IAPIFullRepository,
  getDotComAPIEndpoint,
} from '../../../../src/lib/api'
import { updateRemoteUrl } from '../../../../src/lib/stores/updates/update-remote-url'
import { shell } from '../../../helpers/test-app-shell'
import { setupFixtureRepository } from '../../../helpers/repositories'
import { addRemote } from '../../../../src/lib/git'
import { StatsStore, StatsDatabase } from '../../../../src/lib/stats'
import { UiActivityMonitor } from '../../../../src/ui/lib/ui-activity-monitor'
import { fakePost } from '../../../fake-stats-post'

describe('Update remote url', () => {
  const apiRepository: IAPIFullRepository = {
    clone_url: 'https://github.com/my-user/my-repo',
    ssh_url: 'git@github.com:my-user/my-repo.git',
    html_url: 'https://github.com/my-user/my-repo',
    name: 'my-repo',
    owner: {
      id: 42,
      html_url: 'https://github.com/my-user',
      login: 'my-user',
      avatar_url: 'https://github.com/my-user.png',
      type: 'User',
    },
    private: true,
    fork: false,
    default_branch: 'master',
    pushed_at: '1995-12-17T03:24:00',
    has_issues: true,
    archived: false,
    parent: undefined,
  }
  const endpoint = getDotComAPIEndpoint()

  let gitStore: GitStore

  const createRepository = async (
    apiRepo: IAPIFullRepository,
    remoteUrl: string | null = null
  ) => {
    const db = new TestRepositoriesDatabase()
    await db.reset()
    const repositoriesStore = new RepositoriesStore(db)

    const repoPath = await setupFixtureRepository('test-repo')
    const repository = await repositoriesStore.setGitHubRepository(
      await repositoriesStore.addRepository(repoPath),
      await repositoriesStore.upsertGitHubRepository(endpoint, apiRepo)
    )
    await addRemote(repository, 'origin', remoteUrl || apiRepo.clone_url)
    gitStore = new GitStore(
      repository,
      shell,
      new StatsStore(
        new StatsDatabase('test-StatsDatabase'),
        new UiActivityMonitor(),
        fakePost
      )
    )
    await gitStore.loadRemotes()
    const gitHubRepository = repository.gitHubRepository!

    return { gitHubRepository, gitStore }
  }

  it("updates the repository's remote url when the github url changes", async () => {
    const { gitHubRepository, gitStore } = await createRepository(apiRepository)
    const originalUrl = gitStore.currentRemote!.url
    const updatedUrl = 'https://github.com/my-user/my-updated-repo'
    const updatedApiRepository = { ...apiRepository, clone_url: updatedUrl }
    await updateRemoteUrl(gitStore, gitHubRepository, updatedApiRepository)
    expect(originalUrl).not.toBe(updatedUrl)
    expect(gitStore.currentRemote!.url).toBe(updatedUrl)
  })

  it("doesn't update the repository's remote url when the github url is the same", async () => {
    const { gitHubRepository, gitStore } = await createRepository(apiRepository)
    const originalUrl = gitStore.currentRemote!.url
    expect(originalUrl).not.toBeEmpty()
    await updateRemoteUrl(gitStore, gitHubRepository, apiRepository)
    expect(gitStore.currentRemote!.url).toBe(originalUrl)
  })

  it("doesn't update repository's remote url if protocols don't match", async () => {
    const originalUrl = 'git@github.com:desktop/desktop.git'
    const sshApiRepository = {
      ...apiRepository,
      clone_url: originalUrl,
    }
    const { gitHubRepository, gitStore } = await createRepository(
      sshApiRepository
    )
    const updatedUrl = 'https://github.com/my-user/my-updated-repo'
    const updatedApiRepository = { ...apiRepository, clone_url: updatedUrl }

    await updateRemoteUrl(gitStore, gitHubRepository, updatedApiRepository)
    expect(gitStore.currentRemote!.url).toBe(originalUrl)
  })

  it("doesn't update the repository's remote url if it differs from the default from the github API", async () => {
    const originalUrl = 'https://github.com/my-user/something-different'
    const { gitHubRepository, gitStore } = await createRepository(
      apiRepository,
      originalUrl
    )

    const updatedUrl = 'https://github.com/my-user/my-updated-repo'
    const updatedApiRepository = { ...apiRepository, clone_url: updatedUrl }

    await updateRemoteUrl(gitStore, gitHubRepository, updatedApiRepository)
    expect(gitStore.currentRemote!.url).toBe(originalUrl)
  })
})
