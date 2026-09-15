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
  describe('only behind tracking branch', () => {
    const setup = async (t: TestContext, config?: Array<[string, string]>) => {
      const remoteRepository = await createRepository(t, featureBranch)
      const repository = await cloneRepository(t, remoteRepository)

      // make commits to remote is ahead of local repository

      const firstCommit = {
        commitMessage: 'Changed a file in the remote repository',
        entries: [
          {
            path: 'README.md',
            contents: '# HELLO WORLD! \n WORDS GO HERE! \nLOL',
          },
        ],
      }

      const secondCommit = {
        commitMessage: 'Added a new file to the remote repository',
        entries: [
          {
            path: 'CONTRIBUTING.md',
            contents: '# HELLO WORLD! \nTHINGS GO HERE\nYES, THINGS',
          },
        ],
      }

      await makeCommit(remoteRepository, firstCommit)
      await makeCommit(remoteRepository, secondCommit)

      await fetch(repository, remote)

      if (config) {
        await setupLocalConfig(repository, config)
      }

      const previousTip = await getTipOrError(repository)

      await pull(repository, remote)

      const newTip = await getTipOrError(repository)

      return { repository, previousTip, newTip }
    }

    describe('with pull.rebase=false and pull.ff=false set in config', () => {
      const config = [
        ['pull.rebase', 'false'],
        ['pull.ff', 'false'],
      ] as [string, string][]

      it('creates a merge commit', async t => {
        const { newTip, previousTip } = await setup(t, config)

        assert.notEqual(newTip.sha, previousTip.sha)
        assert.equal(newTip.parentSHAs.length, 2)
      })

      it('is different from remote branch', async t => {
        const { newTip, repository } = await setup(t, config)

        const remoteCommit = await getRefOrError(repository, remoteBranch)
        assert.notEqual(remoteCommit.sha, newTip.sha)
      })

      it('is now ahead of tracking branch', async t => {
        const { repository } = await setup(t, config)

        const range = revSymmetricDifference(featureBranch, remoteBranch)

        const aheadBehind = await getAheadBehind(repository, range)
        assert.deepStrictEqual(aheadBehind, { ahead: 1, behind: 0 })
      })
    })

    describe('with pull.ff=only set in config', () => {
      const config = [['pull.ff', 'only']] as [string, string][]

      it('does not create a merge commit', async t => {
        const { newTip, previousTip } = await setup(t, config)

        assert.notEqual(newTip.sha, previousTip.sha)
        assert.equal(newTip.parentSHAs.length, 1)
      })

      it('is same as remote branch', async t => {
        const { newTip, repository } = await setup(t, config)

        const remoteCommit = await getRefOrError(repository, remoteBranch)
        assert.equal(remoteCommit.sha, newTip.sha)
      })

      it('is not behind tracking branch', async t => {
        const { repository } = await setup(t, config)

        const range = revSymmetricDifference(featureBranch, remoteBranch)

        const aheadBehind = await getAheadBehind(repository, range)
        assert.deepStrictEqual(aheadBehind, { ahead: 0, behind: 0 })
      })
    })
  })
})
