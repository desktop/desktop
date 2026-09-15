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
  describe('only ahead of tracking branch', () => {
    const setup = async (t: TestContext, pullFFConfig?: string) => {
      const remoteRepository = await createRepository(t, featureBranch)
      const repository = await cloneRepository(t, remoteRepository)

      // add a commit to the local branch so that it is now "ahead"

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

      if (pullFFConfig) {
        await setupLocalConfig(repository, [['pull.ff', pullFFConfig]])
      }

      const previousTip = await getTipOrError(repository)

      await pull(repository, remote)

      const newTip = await getTipOrError(repository)

      return { repository, previousTip, newTip }
    }

    describe('by default', () => {
      it('does not create new commit', async t => {
        const { previousTip, newTip } = await setup(t)
        assert.equal(newTip.sha, previousTip.sha)
      })

      it('is different from tracking branch', async t => {
        const { newTip, repository } = await setup(t)

        const remoteCommit = await getRefOrError(repository, remoteBranch)
        assert.notEqual(remoteCommit.sha, newTip.sha)
      })

      it('remains ahead of tracking branch', async t => {
        const { repository } = await setup(t)

        const range = revSymmetricDifference(featureBranch, remoteBranch)

        const aheadBehind = await getAheadBehind(repository, range)

        assert.deepStrictEqual(aheadBehind, { ahead: 1, behind: 0 })
      })
    })

    describe('with pull.ff=false set in config', () => {
      it('does not create new commit', async t => {
        const { previousTip, newTip } = await setup(t, 'false')
        assert.equal(newTip.sha, previousTip.sha)
      })

      it('is different to tracking branch', async t => {
        const { newTip, repository } = await setup(t, 'false')

        const remoteCommit = await getRefOrError(repository, remoteBranch)
        assert.notEqual(remoteCommit.sha, newTip.sha)
      })

      it('is ahead of tracking branch', async t => {
        const { repository } = await setup(t, 'false')

        const range = revSymmetricDifference(featureBranch, remoteBranch)

        const aheadBehind = await getAheadBehind(repository, range)
        assert.deepStrictEqual(aheadBehind, { ahead: 1, behind: 0 })
      })
    })

    describe('with pull.ff=only set in config', () => {
      it('does not create new commit', async t => {
        const { previousTip, newTip } = await setup(t, 'only')
        assert.equal(newTip.sha, previousTip.sha)
      })

      it('is different from tracking branch', async t => {
        const { repository, newTip } = await setup(t, 'only')

        const remoteCommit = await getRefOrError(repository, remoteBranch)
        assert.notEqual(remoteCommit.sha, newTip.sha)
      })

      it('is ahead of tracking branch', async t => {
        const { repository } = await setup(t, 'only')

        const range = revSymmetricDifference(featureBranch, remoteBranch)

        const aheadBehind = await getAheadBehind(repository, range)

        assert.deepStrictEqual(aheadBehind, { ahead: 1, behind: 0 })
      })
    })
  })
})
