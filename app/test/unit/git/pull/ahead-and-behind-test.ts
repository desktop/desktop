import { describe, it, TestContext } from 'node:test'
import assert from 'node:assert'
import {
  fetch,
  pull,
  getAheadBehind,
  revSymmetricDifference,
} from '../../../../src/lib/git'
import { createRepository } from '../../../helpers/repository-builder-pull-test'
import {
  cloneRepository,
  makeCommit,
} from '../../../helpers/repository-scaffolding'
import { getTipOrError, getRefOrError } from '../../../helpers/git'
import { setupLocalConfig } from '../../../helpers/local-config'
import { IRemote } from '../../../../src/models/remote'

const featureBranch = 'this-is-a-feature'
const remote: IRemote = { name: 'origin', url: 'file://' }
const remoteBranch = `${remote.name}/${featureBranch}`

describe('git/pull', () => {
  describe('ahead and behind of tracking branch', () => {
    const setup = async (t: TestContext) => {
      const remoteRepository = await createRepository(t, featureBranch)
      const repository = await cloneRepository(t, remoteRepository)

      // make a commits to both remote and local so histories diverge

      const changesForRemoteRepository = {
        commitMessage: 'Changed a file in the remote repository',
        entries: [
          {
            path: 'README.md',
            contents: '# HELLO WORLD! \n WORDS GO HERE! \nLOL',
          },
        ],
      }

      await makeCommit(remoteRepository, changesForRemoteRepository)

      const changesForLocalRepository = {
        commitMessage: 'Added a new file to the local repository',
        entries: [
          {
            path: 'CONTRIBUTING.md',
            contents: '# HELLO WORLD! \nTHINGS GO HERE\nYES, THINGS',
          },
        ],
      }

      await makeCommit(repository, changesForLocalRepository)
      await fetch(repository, remote)

      return repository
    }

    describe('with pull.rebase=false and pull.ff=false set in config', () => {
      const setupConfig = async (t: TestContext) => {
        const repository = await setup(t)
        await setupLocalConfig(repository, [
          ['pull.rebase', 'false'],
          ['pull.ff', 'false'],
        ])

        const previousTip = await getTipOrError(repository)

        await pull(repository, remote)

        const newTip = await getTipOrError(repository)
        return { repository, previousTip, newTip }
      }

      it('creates a merge commit', async t => {
        const { previousTip, newTip } = await setupConfig(t)

        assert.notEqual(newTip.sha, previousTip.sha)
        assert.equal(newTip.parentSHAs.length, 2)
      })

      it('is different from remote branch', async t => {
        const { repository, newTip } = await setupConfig(t)

        const remoteCommit = await getRefOrError(repository, remoteBranch)
        assert.notEqual(remoteCommit.sha, newTip.sha)
      })

      it('is ahead of tracking branch', async t => {
        const { repository } = await setupConfig(t)

        const range = revSymmetricDifference(featureBranch, remoteBranch)

        const aheadBehind = await getAheadBehind(repository, range)
        assert.deepStrictEqual(aheadBehind, { ahead: 2, behind: 0 })
      })
    })

    describe('with pull.rebase=false set in config', () => {
      const setupConfig = async (t: TestContext) => {
        const repository = await setup(t)
        await setupLocalConfig(repository, [['pull.rebase', 'false']])

        const previousTip = await getTipOrError(repository)

        await pull(repository, remote)

        const newTip = await getTipOrError(repository)

        return { repository, previousTip, newTip }
      }

      it('creates a merge commit', async t => {
        const { previousTip, newTip } = await setupConfig(t)
        assert.notEqual(newTip.sha, previousTip.sha)
        assert.equal(newTip.parentSHAs.length, 2)
      })

      it('is ahead of tracking branch', async t => {
        const { repository } = await setupConfig(t)

        const range = revSymmetricDifference(featureBranch, remoteBranch)

        const aheadBehind = await getAheadBehind(repository, range)
        assert.deepStrictEqual(aheadBehind, { ahead: 2, behind: 0 })
      })
    })

    describe('with pull.rebase=true set in config', () => {
      const setupConfig = async (t: TestContext) => {
        const repository = await setup(t)
        await setupLocalConfig(repository, [['pull.rebase', 'true']])

        const previousTip = await getTipOrError(repository)

        await pull(repository, remote)

        const newTip = await getTipOrError(repository)

        return { repository, previousTip, newTip }
      }

      it('does not create a merge commit', async t => {
        const { previousTip, newTip } = await setupConfig(t)

        assert.notEqual(newTip.sha, previousTip.sha)
        assert.equal(newTip.parentSHAs.length, 1)
      })

      it('is ahead of tracking branch', async t => {
        const { repository } = await setupConfig(t)
        const range = revSymmetricDifference(featureBranch, remoteBranch)

        const aheadBehind = await getAheadBehind(repository, range)
        assert.deepStrictEqual(aheadBehind, { ahead: 1, behind: 0 })
      })
    })

    describe('with pull.rebase=false and pull.ff=only set in config', () => {
      it(`throws an error as the user blocks merge commits on pull`, async t => {
        const repository = await setup(t)
        await setupLocalConfig(repository, [
          ['pull.rebase', 'false'],
          ['pull.ff', 'only'],
        ])
        await assert.rejects(() => pull(repository, remote))
      })
    })
  })
})
