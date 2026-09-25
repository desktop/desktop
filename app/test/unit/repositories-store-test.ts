import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert'
import { join } from 'path'
import { RepositoriesStore } from '../../src/lib/stores/repositories-store'
import { TestRepositoriesDatabase } from '../helpers/databases'
import { IAPIFullRepository, getDotComAPIEndpoint } from '../../src/lib/api'
import { assertIsRepositoryWithGitHubRepository } from '../../src/models/repository'
import { Account } from '../../src/models/account'
import { PullRequestDatabase } from '../../src/lib/databases/pull-request-database'

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

      assertIsRepositoryWithGitHubRepository(firstRepo)
      assertIsRepositoryWithGitHubRepository(secondRepo)
      assert.equal(
        firstRepo.gitHubRepository.dbID,
        secondRepo.gitHubRepository.dbID
      )
    })

    it('isolates permissions for two local copies assigned to different accounts', async () => {
      const first = await repositoriesStore.updateRepositoryAccount(
        await repositoriesStore.addRepository('/first', undefined),
        'alice'
      )
      const second = await repositoriesStore.updateRepositoryAccount(
        await repositoriesStore.addRepository('/second', undefined),
        'bob'
      )
      const alice = await repositoriesStore.upsertGitHubRepository(
        endpoint,
        apiRepo,
        'alice'
      )
      const bob = await repositoriesStore.upsertGitHubRepository(
        endpoint,
        {
          ...apiRepo,
          permissions: { pull: true, push: false, admin: false },
        },
        'bob'
      )
      await repositoriesStore.setGitHubRepository(first, alice)
      await repositoriesStore.setGitHubRepository(second, bob)
      assert.notStrictEqual(alice.dbID, bob.dbID)

      await repositoriesStore.upsertGitHubRepository(
        endpoint,
        {
          ...apiRepo,
          permissions: { pull: true, push: true, admin: true },
        },
        'ALICE'
      )
      const reloaded = await repositoriesStore.getAll()
      assert.deepStrictEqual(
        reloaded.map(repo => repo.gitHubRepository?.permissions),
        ['admin', 'read']
      )
      assert.deepStrictEqual(
        reloaded.map(repo => repo.gitHubRepository?.dbID),
        [alice.dbID, bob.dbID]
      )
    })

    it('changes cache identity and clears unknown permissions when switching accounts', async () => {
      const initial = await repositoriesStore.updateRepositoryAccount(
        await repositoriesStore.addRepository('/first', undefined),
        'alice'
      )
      const alice = await repositoriesStore.upsertGitHubRepository(
        endpoint,
        apiRepo,
        'alice'
      )
      const assigned = await repositoriesStore.setGitHubRepository(
        initial,
        alice
      )
      const switched = await repositoriesStore.updateRepositoryAccount(
        assigned,
        'bob'
      )
      assertIsRepositoryWithGitHubRepository(switched)
      assert.notStrictEqual(switched.gitHubRepository.dbID, alice.dbID)
      assert.strictEqual(switched.gitHubRepository.permissions, null)

      const restored = await repositoriesStore.updateRepositoryAccount(
        switched,
        'ALICE'
      )
      assert.strictEqual(restored.gitHubRepository?.dbID, alice.dbID)
      assert.strictEqual(restored.gitHubRepository?.permissions, 'write')
      assert.strictEqual(
        (await repositoriesStore.getAll())[0].gitHubRepository?.dbID,
        alice.dbID
      )
    })

    it('does not retain previous permissions when the API explicitly revokes them', async () => {
      await repositoriesStore.upsertGitHubRepository(endpoint, apiRepo, 'alice')
      const updated = await repositoriesStore.upsertGitHubRepository(
        endpoint,
        {
          ...apiRepo,
          permissions: { pull: false, push: false, admin: false },
        },
        'alice'
      )
      assert.strictEqual(updated.permissions, null)
    })

    it('does not attach an old account refresh after the local account changes', async () => {
      const initial = await repositoriesStore.updateRepositoryAccount(
        await repositoriesStore.addRepository('/first', undefined),
        'alice'
      )
      const alice = await repositoriesStore.upsertGitHubRepository(
        endpoint,
        apiRepo,
        'alice'
      )
      const assigned = await repositoriesStore.setGitHubRepository(
        initial,
        alice
      )
      const switched = await repositoriesStore.updateRepositoryAccount(
        assigned,
        'bob'
      )
      const staleRefresh = await repositoriesStore.upsertGitHubRepository(
        endpoint,
        {
          ...apiRepo,
          name: 'renamed',
        },
        'alice'
      )
      const result = await repositoriesStore.setGitHubRepository(
        assigned,
        staleRefresh
      )
      assertIsRepositoryWithGitHubRepository(result)
      assert.strictEqual(result.login, 'bob')
      assert.strictEqual(
        result.gitHubRepository.dbID,
        switched.gitHubRepository?.dbID
      )
      assert.strictEqual(result.gitHubRepository.name, apiRepo.name)
    })

    it('isolates parent metadata and branch protection caches by login', async () => {
      const fork = { ...apiRepo, parent: { ...apiRepo, name: 'parent' } }
      const alice = await repositoriesStore.upsertGitHubRepository(
        endpoint,
        fork,
        'alice'
      )
      const bob = await repositoriesStore.upsertGitHubRepository(
        endpoint,
        fork,
        'bob'
      )
      assert.notStrictEqual(alice.parent?.dbID, bob.parent?.dbID)
      await repositoriesStore.updateBranchProtections(alice, [
        {
          name: 'main',
          protected: true,
        },
      ])
      await repositoriesStore.updateBranchProtections(bob, [])
      assert.strictEqual(
        await repositoriesStore.hasBranchProtectionsConfigured(alice),
        true
      )
      assert.strictEqual(
        await repositoriesStore.hasBranchProtectionsConfigured(bob),
        false
      )
      const reloaded = new RepositoriesStore(repoDb)
      assert.strictEqual(
        await reloaded.hasBranchProtectionsConfigured(alice),
        true
      )
      assert.strictEqual(
        await reloaded.hasBranchProtectionsConfigured(bob),
        false
      )
    })

    it('clears account and GitHub metadata persistently without changing local properties', async () => {
      const initial = await repositoriesStore.updateRepositoryAccount(
        await repositoriesStore.addRepository('/first', '/first/.git'),
        'alice'
      )
      const ghRepo = await repositoriesStore.upsertGitHubRepository(
        endpoint,
        apiRepo,
        'alice'
      )
      const assigned = await repositoriesStore.setGitHubRepository(
        initial,
        ghRepo
      )
      const cleared = await repositoriesStore.clearGitHubRepository(assigned)
      assert.strictEqual(cleared.login, null)
      assert.strictEqual(cleared.gitHubRepository, null)
      assert.strictEqual(cleared.id, assigned.id)
      assert.strictEqual(cleared.path, assigned.path)
      assert.strictEqual(cleared.gitDir, assigned.gitDir)
      assert.strictEqual(
        (await repositoriesStore.getAll())[0].gitHubRepository,
        null
      )
      assert.strictEqual((await repositoriesStore.getAll())[0].login, null)

      const stale = await repositoriesStore.setGitHubRepository(
        assigned,
        ghRepo
      )
      assert.strictEqual(stale.gitHubRepository, null)
      assert.strictEqual(stale.login, null)
    })

    it('does not let a stale clear remove a later account assignment', async () => {
      const initial = await repositoriesStore.updateRepositoryAccount(
        await repositoriesStore.addRepository('/first', undefined),
        'alice'
      )
      const assigned = await repositoriesStore.setGitHubRepository(
        initial,
        await repositoriesStore.upsertGitHubRepository(
          endpoint,
          apiRepo,
          'alice'
        )
      )
      const switched = await repositoriesStore.updateRepositoryAccount(
        assigned,
        'bob'
      )
      const result = await repositoriesStore.clearGitHubRepository(assigned)
      assert.strictEqual(result.login, 'bob')
      assert.strictEqual(
        result.gitHubRepository?.dbID,
        switched.gitHubRepository?.dbID
      )
    })

    it('rejects a stale same-account refresh after the remote repository changes', async () => {
      const initial = await repositoriesStore.updateRepositoryAccount(
        await repositoriesStore.addRepository('/first', undefined),
        'alice'
      )
      const ghRepo = await repositoriesStore.upsertGitHubRepository(
        endpoint,
        apiRepo,
        'alice'
      )
      const assigned = await repositoriesStore.setGitHubRepository(
        initial,
        ghRepo
      )
      const replacement = await repositoriesStore.upsertGitHubRepository(
        endpoint,
        {
          ...apiRepo,
          name: 'replacement',
        },
        'alice'
      )
      await repositoriesStore.setGitHubRepository(assigned, replacement)
      const stale = await repositoriesStore.setGitHubRepository(
        assigned,
        ghRepo
      )
      assert.strictEqual(stale.gitHubRepository?.dbID, replacement.dbID)
      assert.strictEqual(
        (await repositoriesStore.getAll())[0].gitHubRepository?.dbID,
        replacement.dbID
      )
    })

    it('keeps PR base and head records and stored PR data account-specific', async t => {
      const alice = await repositoriesStore.upsertGitHubRepository(
        endpoint,
        apiRepo,
        'alice'
      )
      const bob = await repositoriesStore.upsertGitHubRepository(
        endpoint,
        apiRepo,
        'bob'
      )
      const aliceBase =
        await repositoriesStore.upsertGitHubRepositoryLightForRepository(
          alice,
          apiRepo
        )
      const bobBase =
        await repositoriesStore.upsertGitHubRepositoryLightForRepository(
          bob,
          apiRepo
        )
      const aliceHead =
        await repositoriesStore.upsertGitHubRepositoryLightForRepository(
          alice,
          { ...apiRepo, name: 'fork' }
        )
      const bobHead =
        await repositoriesStore.upsertGitHubRepositoryLightForRepository(bob, {
          ...apiRepo,
          name: 'fork',
        })
      assert.strictEqual(aliceBase.dbID, alice.dbID)
      assert.strictEqual(bobBase.dbID, bob.dbID)
      assert.notStrictEqual(aliceHead.dbID, bobHead.dbID)

      const db = new PullRequestDatabase('AccountIsolationPullRequests')
      await db.delete()
      await db.open()
      t.after(() => db.delete())
      await db.putPullRequests([
        {
          number: 1,
          title: 'Visible to Alice',
          body: '',
          author: 'alice',
          createdAt: '2026-01-01T00:00:00Z',
          updatedAt: '2026-01-01T00:00:00Z',
          head: { ref: 'feature', sha: 'abc', repoId: aliceHead.dbID },
          base: { ref: 'main', sha: 'def', repoId: aliceBase.dbID },
          draft: false,
        },
      ])
      assert.strictEqual(
        (await db.getAllPullRequestsInRepository(alice)).length,
        1
      )
      assert.strictEqual(
        (await db.getAllPullRequestsInRepository(bob)).length,
        0
      )
      await db.deleteAllPullRequestsInRepository(bob)
      assert.strictEqual(
        (await db.getAllPullRequestsInRepository(alice)).length,
        1
      )
    })

    it('creates account-specific skeletons from remote matches', async () => {
      const match = { owner: apiRepo.owner.login, name: apiRepo.name }
      const first = await repositoriesStore.upsertGitHubRepositoryFromMatch({
        ...match,
        account: new Account('alice', endpoint, 'token', [], '', 1, ''),
      })
      const same = await repositoriesStore.upsertGitHubRepositoryFromMatch({
        ...match,
        account: new Account('ALICE', endpoint, 'token', [], '', 1, ''),
      })
      const other = await repositoriesStore.upsertGitHubRepositoryFromMatch({
        ...match,
        account: new Account('bob', endpoint, 'token', [], '', 2, ''),
      })
      assert.strictEqual(first.dbID, same.dbID)
      assert.notStrictEqual(first.dbID, other.dbID)
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
