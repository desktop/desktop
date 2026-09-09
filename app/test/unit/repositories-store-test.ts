import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { join } from 'path'
import { RepositoriesStore } from '../../src/lib/stores/repositories-store'
import { TestRepositoriesDatabase } from '../helpers/databases'
import { IAPIFullRepository, getDotComAPIEndpoint } from '../../src/lib/api'
import { assertIsRepositoryWithGitHubRepository } from '../../src/models/repository'

describe('RepositoriesStore', () => {
  let repoDb = new TestRepositoriesDatabase()
  let repositoriesStore = new RepositoriesStore(repoDb)

  beforeEach(async () => {
    repoDb = new TestRepositoriesDatabase()
    await repoDb.reset()
    repositoriesStore = new RepositoriesStore(repoDb)
  })

  afterEach(() => {
    repoDb.close()
  })

  describe('adding a new repository', () => {
    it('contains the added repository', async () => {
      const repoPath = '/some/cool/path'
      await repositoriesStore.addRepository(repoPath, join(repoPath, '.git'))

      const repositories = await repositoriesStore.getAll()
      assert.equal(repositories[0].path, repoPath)
    })
  })

  describe('getting all repositories', () => {
    it('returns multiple repositories', async () => {
      await repositoriesStore.addRepository(
        '/some/cool/path',
        '/some/cool/path/.git'
      )
      await repositoriesStore.addRepository(
        '/some/other/path',
        '/some/other/path/.git'
      )

      const repositories = await repositoriesStore.getAll()
      assert.equal(repositories.length, 2)
    })
  })

  describe('updating a GitHub repository', () => {
    const apiRepo: IAPIFullRepository = {
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
      permissions: {
        pull: true,
        push: true,
        admin: false,
      },
      parent: undefined,
    }
    const endpoint = getDotComAPIEndpoint()

    it('adds a new GitHub repository', async () => {
      await repositoriesStore.setGitHubRepository(
        await repositoriesStore.addRepository(
          '/some/cool/path',
          '/some/cool/path/.git'
        ),
        await repositoriesStore.upsertGitHubRepository(endpoint, apiRepo)
      )

      const repositories = await repositoriesStore.getAll()
      const repo = repositories[0]
      assertIsRepositoryWithGitHubRepository(repo)
      assert(repo.gitHubRepository.isPrivate)
      assert(!repo.gitHubRepository.fork)
      assert.equal(
        repo.gitHubRepository.htmlURL,
        'https://github.com/my-user/my-repo'
      )
    })

    it('reuses an existing GitHub repository', async () => {
      const firstRepo = await repositoriesStore.setGitHubRepository(
        await repositoriesStore.addRepository(
          '/some/cool/path',
          '/some/cool/path/.git'
        ),
        await repositoriesStore.upsertGitHubRepository(endpoint, apiRepo)
      )

      const secondRepo = await repositoriesStore.setGitHubRepository(
        await repositoriesStore.addRepository(
          '/some/other/path',
          '/some/other/path/.git'
        ),
        await repositoriesStore.upsertGitHubRepository(endpoint, apiRepo)
      )

      assert.equal(
        firstRepo.gitHubRepository.dbID,
        secondRepo.gitHubRepository.dbID
      )
    })
  })

  describe('switching worktrees', () => {
    const mainPath = '/some/cool/path'
    const worktreePath = '/some/cool/path-wt-a'
    const worktreeGitDir = join(mainPath, '.git/worktrees/path-wt-a')

    it('persists the main worktree path', async () => {
      const repository = await repositoriesStore.addRepository(
        mainPath,
        join(mainPath, '.git')
      )

      await repositoriesStore.switchWorktree(
        repository,
        worktreePath,
        false,
        worktreeGitDir,
        mainPath
      )

      const [reloaded] = await repositoriesStore.getAll()
      assert.equal(reloaded.path, worktreePath)
      assert.equal(reloaded.mainWorktreePath, mainPath)
    })

    it('keeps the main worktree path when switching between worktrees', async () => {
      const repository = await repositoriesStore.addRepository(
        mainPath,
        join(mainPath, '.git')
      )

      const { repository: onWorktree } = await repositoriesStore.switchWorktree(
        repository,
        worktreePath,
        false,
        worktreeGitDir,
        mainPath
      )

      // Switching on to a second worktree doesn't re-resolve the main worktree,
      // so it has to survive without being passed again.
      await repositoriesStore.switchWorktree(
        onWorktree,
        '/some/cool/path-wt-b',
        false,
        join(mainPath, '.git/worktrees/path-wt-b')
      )

      const [reloaded] = await repositoriesStore.getAll()
      assert.equal(reloaded.mainWorktreePath, mainPath)
    })
  })

  describe('relocating a repository', () => {
    const mainPath = '/some/cool/path'
    const worktreePath = '/some/cool/path-wt-a'
    const worktreeGitDir = join(mainPath, '.git/worktrees/path-wt-a')

    async function onWorktree() {
      const repository = await repositoriesStore.addRepository(
        mainPath,
        join(mainPath, '.git')
      )

      const { repository: switched } = await repositoriesStore.switchWorktree(
        repository,
        worktreePath,
        false,
        worktreeGitDir,
        mainPath
      )

      return switched
    }

    it('updates the main worktree path', async () => {
      // Relocating moves the whole repository, so the previously recorded main
      // worktree no longer exists where it used to.
      const movedMain = '/moved/path'
      const movedWorktree = '/moved/path-wt-a'

      await repositoriesStore.updateRepositoryPath(
        await onWorktree(),
        movedWorktree,
        join(movedMain, '.git/worktrees/path-wt-a'),
        movedMain
      )

      const [reloaded] = await repositoriesStore.getAll()
      assert.equal(reloaded.path, movedWorktree)
      assert.equal(reloaded.mainWorktreePath, movedMain)
    })

    it('clears the main worktree path when it cannot be resolved', async () => {
      // Better to fall back to the git dir lookup than to keep pointing at a
      // location the repository has moved away from.
      await repositoriesStore.updateRepositoryPath(
        await onWorktree(),
        '/moved/path-wt-a',
        undefined,
        undefined,
        true
      )

      const [reloaded] = await repositoriesStore.getAll()
      assert.equal(reloaded.mainWorktreePath, undefined)
    })
  })
})
