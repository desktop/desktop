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
import { getTipOrError, getRefOrError } from '../../../helpers/tip'
import { setupLocalConfig } from '../../../helpers/local-config'

const featureBranch = 'this-is-a-feature'
const origin = 'origin'
const remoteBranch = `${origin}/${featureBranch}`

describe('git/pull', () => {
  describe('ahead and behind of tracking branch', () => {
    let repository: Repository

    beforeEach(async () => {
      const remoteRepository = await createRepository(featureBranch)
      repository = await cloneRepository(remoteRepository)

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
      await fetch(repository, null, origin)
    })

    describe('with pull.rebase=false and pull.ff=false set in config', () => {
      let previousTip: Commit
      let newTip: Commit

      beforeEach(async () => {
        await setupLocalConfig(repository, [
          ['pull.rebase', 'false'],
          ['pull.ff', 'false'],
        ])

        previousTip = await getTipOrError(repository)

        await pull(repository, null, origin)

        newTip = await getTipOrError(repository)
      })

      it('creates a merge commit', async () => {
        expect(newTip.sha).not.toBe(previousTip.sha)
        expect(newTip.parentSHAs).toHaveLength(2)
      })

      it('is different from remote branch', async () => {
        const remoteCommit = await getRefOrError(repository, remoteBranch)
        expect(remoteCommit.sha).not.toBe(newTip.sha)
      })

      it('is ahead of tracking branch', async () => {
        const range = revSymmetricDifference(
          featureBranch,
          `${origin}/${featureBranch}`
        )

        const aheadBehind = await getAheadBehind(repository, range)
        expect(aheadBehind).toEqual({
          ahead: 2,
          behind: 0,
        })
      })
    })

    describe('with pull.rebase=false set in config', () => {
      let previousTip: Commit
      let newTip: Commit

      beforeEach(async () => {
        await setupLocalConfig(repository, [['pull.rebase', 'false']])

        previousTip = await getTipOrError(repository)

        await pull(repository, null, origin)

        newTip = await getTipOrError(repository)
      })

      it('creates a merge commit', async () => {
        expect(newTip.sha).not.toBe(previousTip.sha)
        expect(newTip.parentSHAs).toHaveLength(2)
      })

      it('is ahead of tracking branch', async () => {
        const range = revSymmetricDifference(
          featureBranch,
          `${origin}/${featureBranch}`
        )

        const aheadBehind = await getAheadBehind(repository, range)
        expect(aheadBehind).toEqual({
          ahead: 2,
          behind: 0,
        })
      })
    })

    describe('with pull.rebase=true set in config', () => {
      let previousTip: Commit
      let newTip: Commit

      beforeEach(async () => {
        await setupLocalConfig(repository, [['pull.rebase', 'true']])

        previousTip = await getTipOrError(repository)

        await pull(repository, null, origin)

        newTip = await getTipOrError(repository)
      })

      it('does not create a merge commit', async () => {
        expect(newTip.sha).not.toBe(previousTip.sha)
        expect(newTip.parentSHAs).toHaveLength(1)
      })

      it('is ahead of tracking branch', async () => {
        const range = revSymmetricDifference(
          featureBranch,
          `${origin}/${featureBranch}`
        )

        const aheadBehind = await getAheadBehind(repository, range)
        expect(aheadBehind).toEqual({
          ahead: 1,
          behind: 0,
        })
      })
    })

    describe('with pull.rebase=false and pull.ff=only set in config', () => {
      beforeEach(async () => {
        await setupLocalConfig(repository, [
          ['pull.rebase', 'false'],
          ['pull.ff', 'only'],
        ])
      })

      it(`throws an error as the user blocks merge commits on pull`, () => {
        expect(pull(repository, null, origin)).rejects.toThrow()
      })
    })
  })
})
