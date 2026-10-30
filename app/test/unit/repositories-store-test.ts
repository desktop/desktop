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

    it('keeps the owner alias when the owner is rewritten', async () => {
      const repo = await repositoriesStore.setGitHubRepository(
        await repositoriesStore.addRepository('/a', '/a/.git'),
        await repositoriesStore.upsertGitHubRepository(endpoint, apiRepo)
      )
      await repositoriesStore.updateOwnerAlias(
        repo.gitHubRepository.owner,
        '  Me  '
      )

      const renamedOwner = { ...apiRepo.owner, login: 'My-User' }
      const upserted = await repositoriesStore.upsertGitHubRepository(
        endpoint,
        { ...apiRepo, owner: { ...renamedOwner, type: 'Organization' } }
      )
      assert.equal(upserted.owner.login, 'My-User')
      assert.equal(upserted.owner.alias, 'Me')

      const [stored] = await repositoriesStore.getAll()
      assertIsRepositoryWithGitHubRepository(stored)
      assert.equal(stored.gitHubRepository.owner.alias, 'Me')

      await repositoriesStore.updateOwnerAlias(upserted.owner, '   ')
      const [reset] = await repositoriesStore.getAll()
      assertIsRepositoryWithGitHubRepository(reset)
      assert.strictEqual(reset.gitHubRepository.owner.alias, null)

      await repositoriesStore.updateOwnerAlias(upserted.owner, 'Me')
      await repositoriesStore.updateOwnerAlias(upserted.owner, 'my-user')
      const [unchanged] = await repositoriesStore.getAll()
      assertIsRepositoryWithGitHubRepository(unchanged)
      assert.strictEqual(unchanged.gitHubRepository.owner.alias, null)
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

  describe('repository groups', () => {
    const add = (path: string) =>
      repositoriesStore.addRepository(path, join(path, '.git'))
    const groupsByPath = async () =>
      Object.fromEntries(
        (await repositoriesStore.getAll()).map(r => [r.path, r.group])
      )

    it('reads a missing group as null', async () => {
      await repoDb.repositories.add({
        path: '/old',
        gitHubRepositoryID: null,
        alias: null,
        missing: false,
      })

      const [repository] = await repositoriesStore.getAll()
      assert.strictEqual(repository.group, null)
    })

    it('persists, normalizes and clears the group', async () => {
      const a = await add('/a')
      const b = await add('/b')

      await repositoriesStore.updateRepositoryGroup(a, '  Work  ')
      await repositoriesStore.updateRepositoryGroup(b, 'work')
      assert.deepEqual(await groupsByPath(), { '/a': 'Work', '/b': 'Work' })

      await repositoriesStore.updateRepositoryGroup(b, '   ')
      assert.deepEqual(await groupsByPath(), { '/a': 'Work', '/b': 'Work' })

      await repositoriesStore.updateRepositoryGroup(a, null)
      assert.deepEqual(await groupsByPath(), { '/a': null, '/b': 'Work' })
    })

    it('renames a group across repositories', async () => {
      const a = await add('/a')
      const b = await add('/b')
      const c = await add('/c')
      await repositoriesStore.updateRepositoryGroup(a, 'Work')
      await repositoriesStore.updateRepositoryGroup(b, 'Work')
      await repositoriesStore.updateRepositoryGroup(c, 'Other')

      await repositoriesStore.renameRepositoryGroup('work', ' Job ')
      assert.deepEqual(await groupsByPath(), {
        '/a': 'Job',
        '/b': 'Job',
        '/c': 'Other',
      })

      await repositoriesStore.renameRepositoryGroup('Job', 'job')
      assert.deepEqual(await groupsByPath(), {
        '/a': 'job',
        '/b': 'job',
        '/c': 'Other',
      })

      await repositoriesStore.renameRepositoryGroup('job', 'OTHER')
      assert.deepEqual(await groupsByPath(), {
        '/a': 'Other',
        '/b': 'Other',
        '/c': 'Other',
      })
    })

    it('ungroups every repository in a group', async () => {
      const a = await add('/a')
      const b = await add('/b')
      const c = await add('/c')
      await repositoriesStore.updateRepositoryGroup(a, 'Work')
      await repositoriesStore.updateRepositoryGroup(b, 'Work')
      await repositoriesStore.updateRepositoryGroup(c, 'Other')

      await repositoriesStore.renameRepositoryGroup('work', null)
      assert.deepEqual(await groupsByPath(), {
        '/a': null,
        '/b': null,
        '/c': 'Other',
      })
    })
  })
})
