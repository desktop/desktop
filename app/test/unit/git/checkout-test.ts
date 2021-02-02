import { shell } from '../../helpers/test-app-shell'
import {
  setupEmptyRepository,
  setupFixtureRepository,
} from '../../helpers/repositories'

import { Repository } from '../../../src/models/repository'
import { checkoutBranch, getBranches, createBranch } from '../../../src/lib/git'
import { TipState, IValidBranch } from '../../../src/models/tip'
import { GitStore } from '../../../src/lib/stores'
import { Branch, BranchType } from '../../../src/models/branch'
import { getStatusOrThrow } from '../../helpers/status'
import { GitProcess } from 'dugite'
import { StatsStore, StatsDatabase } from '../../../src/lib/stats'
import { UiActivityMonitor } from '../../../src/ui/lib/ui-activity-monitor'

describe('git/checkout', () => {
  let statsStore: StatsStore

  beforeEach(() => {
    statsStore = new StatsStore(
      new StatsDatabase('test-StatsDatabase'),
      new UiActivityMonitor()
    )
  })

  it('throws when invalid characters are used for branch name', async () => {
    const repository = await setupEmptyRepository()

    const branch: Branch = {
      name: '..',
      nameWithoutRemote: '..',
      upstream: null,
      upstreamWithoutRemote: null,
      type: BranchType.Local,
      tip: {
        sha: '',
        author: {
          name: '',
          email: '',
          date: new Date(),
          tzOffset: 0,
        },
      },
      remoteName: null,
      upstreamRemoteName: null,
      isDesktopForkRemoteBranch: false,
      ref: '',
    }

    let errorRaised = false
    try {
      await checkoutBranch(repository, null, branch)
    } catch (error) {
      errorRaised = true
      expect(error.message).toBe('fatal: invalid reference: ..\n')
    }

    expect(errorRaised).toBe(true)
  })

  it('can checkout a valid branch name in an existing repository', async () => {
    const path = await setupFixtureRepository('repo-with-many-refs')
    const repository = new Repository(path, -1, null, false)

    const branches = await getBranches(
      repository,
      'refs/heads/commit-with-long-description'
    )

    if (branches.length === 0) {
      throw new Error(`Could not find branch: commit-with-long-description`)
    }

    await checkoutBranch(repository, null, branches[0])

    const store = new GitStore(repository, shell, statsStore)
    await store.loadStatus()
    const tip = store.tip

    expect(tip.kind).toBe(TipState.Valid)

    const validBranch = tip as IValidBranch
    expect(validBranch.branch.name).toBe('commit-with-long-description')
  })

  it('can checkout a branch when it exists on multiple remotes', async () => {
    const path = await setupFixtureRepository('checkout-test-cases')
    const repository = new Repository(path, -1, null, false)

    const expectedBranch = 'first'
    const firstRemote = 'first-remote'
    const secondRemote = 'second-remote'

    const branches = await getBranches(repository)
    const firstBranch = `${firstRemote}/${expectedBranch}`
    const firstRemoteBranch = branches.find(b => b.name === firstBranch)

    if (firstRemoteBranch == null) {
      throw new Error(`Could not find branch: '${firstBranch}'`)
    }

    const secondBranch = `${secondRemote}/${expectedBranch}`
    const secondRemoteBranch = branches.find(b => b.name === secondBranch)

    if (secondRemoteBranch == null) {
      throw new Error(`Could not find branch: '${secondBranch}'`)
    }

    await checkoutBranch(repository, null, firstRemoteBranch)

    const store = new GitStore(repository, shell, statsStore)
    await store.loadStatus()
    const tip = store.tip

    expect(tip.kind).toBe(TipState.Valid)

    const validBranch = tip as IValidBranch
    expect(validBranch.branch.name).toBe(expectedBranch)
    expect(validBranch.branch.type).toBe(BranchType.Local)
    expect(validBranch.branch.upstreamRemoteName).toBe('first-remote')
  })

  it('will fail when an existing branch matches the remote branch', async () => {
    const path = await setupFixtureRepository('checkout-test-cases')
    const repository = new Repository(path, -1, null, false)

    const expectedBranch = 'first'
    const firstRemote = 'first-remote'

    const branches = await getBranches(repository)
    const firstBranch = `${firstRemote}/${expectedBranch}`
    const remoteBranch = branches.find(b => b.name === firstBranch)

    if (remoteBranch == null) {
      throw new Error(`Could not find branch: '${firstBranch}'`)
    }

    await createBranch(repository, expectedBranch, null)

    let errorRaised = false

    try {
      await checkoutBranch(repository, null, remoteBranch)
    } catch (error) {
      errorRaised = true
      expect(error.message).toBe('A branch with that name already exists.')
    }

    expect(errorRaised).toBe(true)
  })

  describe('with submodules', () => {
    it('cleans up an submodule that no longer exists', async () => {
      const path = await setupFixtureRepository('test-submodule-checkouts')
      const repository = new Repository(path, -1, null, false)

      // put the repository into a known good state
      await GitProcess.exec(
        ['checkout', 'add-private-repo', '-f', '--recurse-submodules'],
        path
      )

      const branches = await getBranches(repository)
      const masterBranch = branches.find(b => b.name === 'master')

      if (masterBranch == null) {
        throw new Error(`Could not find branch: 'master'`)
      }

      await checkoutBranch(repository, null, masterBranch)

      const status = await getStatusOrThrow(repository)

      expect(status.workingDirectory.files).toHaveLength(0)
    })

    it('updates a changed submodule reference', async () => {
      const path = await setupFixtureRepository('test-submodule-checkouts')
      const repository = new Repository(path, -1, null, false)

      // put the repository into a known good state
      await GitProcess.exec(
        ['checkout', 'master', '-f', '--recurse-submodules'],
        path
      )

      const branches = await getBranches(repository)
      const devBranch = branches.find(b => b.name === 'dev')

      if (devBranch == null) {
        throw new Error(`Could not find branch: 'dev'`)
      }

      await checkoutBranch(repository, null, devBranch)

      const status = await getStatusOrThrow(repository)
      expect(status.workingDirectory.files).toHaveLength(0)
    })
  })
})
