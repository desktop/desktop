import {
  fetch,
  pull,
  getAheadBehind,
  revSymmetricDifference,
} from '../../../../src/lib/git'
import { Commit } from '../../../../src/models/commit'
import { Repository } from '../../../../src/models/repository'
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
    let repository: Repository

    beforeEach(async () => {
      const remoteRepository = await createRepository(featureBranch)
      repository = await cloneRepository(remoteRepository)

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
    })

    describe('by default', () => {
      let previousTip: Commit
      let newTip: Commit

      beforeEach(async () => {
        previousTip = await getTipOrError(repository)

        await pull(repository, remote)

        newTip = await getTipOrError(repository)
      })

      it('does not create new commit', async () => {
        expect(newTip.sha).toBe(previousTip.sha)
      })

      it('is different from tracking branch', async () => {
        const remoteCommit = await getRefOrError(repository, remoteBranch)
        expect(remoteCommit.sha).not.toBe(newTip.sha)
      })

      it('remains ahead of tracking branch', async () => {
        const range = revSymmetricDifference(featureBranch, remoteBranch)

        const aheadBehind = await getAheadBehind(repository, range)

        expect(aheadBehind).toEqual({
          ahead: 1,
          behind: 0,
        })
      })
    })

    describe('with pull.ff=false set in config', () => {
      let previousTip: Commit
      let newTip: Commit

      beforeEach(async () => {
        await setupLocalConfig(repository, [['pull.ff', 'false']])

        previousTip = await getTipOrError(repository)

        await pull(repository, remote)

        newTip = await getTipOrError(repository)
      })

      it('does not create new commit', async () => {
        expect(newTip.sha).toBe(previousTip.sha)
      })

      it('is different to tracking branch', async () => {
        const remoteCommit = await getRefOrError(repository, remoteBranch)
        expect(remoteCommit.sha).not.toBe(newTip.sha)
      })

      it('is ahead of tracking branch', async () => {
        const range = revSymmetricDifference(featureBranch, remoteBranch)

        const aheadBehind = await getAheadBehind(repository, range)
        expect(aheadBehind).toEqual({
          ahead: 1,
          behind: 0,
        })
      })
    })

    describe('with pull.ff=only set in config', () => {
      let previousTip: Commit
      let newTip: Commit

      beforeEach(async () => {
        await setupLocalConfig(repository, [['pull.ff', 'only']])

        previousTip = await getTipOrError(repository)

        await pull(repository, remote)

        newTip = await getTipOrError(repository)
      })

      it('does not create new commit', async () => {
        expect(newTip.sha).toBe(previousTip.sha)
      })

      it('is different from tracking branch', async () => {
        const remoteCommit = await getRefOrError(repository, remoteBranch)
        expect(remoteCommit.sha).not.toBe(newTip.sha)
      })

      it('is ahead of tracking branch', async () => {
        const range = revSymmetricDifference(featureBranch, remoteBranch)

        const aheadBehind = await getAheadBehind(repository, range)

        expect(aheadBehind).toEqual({
          ahead: 1,
          behind: 0,
        })
      })
    })
  })
})
