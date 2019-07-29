import { setupTwoCommitRepo } from '../../helpers/repositories'
import { Repository } from '../../../src/models/repository'
import { formatPatch } from '../../../src/lib/git'
import {
  cloneLocalRepository,
  makeCommit,
} from '../../helpers/repository-scaffolding'
import { GitProcess } from 'dugite'

describe('formatPatch', () => {
  describe('in a repo with commits', () => {
    let repository: Repository
    beforeEach(async () => {
      repository = await setupTwoCommitRepo()
      await makeCommit(repository, {
        entries: [{ path: 'another-one', contents: 'dusty' }],
      })
    })
    it('returns a string for a single commit range', async () => {
      expect(await formatPatch(repository, 'HEAD~', 'HEAD')).toBeTruthy()
    })
    it('returns a string for a multi commit range', async () => {
      expect(await formatPatch(repository, 'HEAD~~', 'HEAD')).toBeTruthy()
    })
    it('returns empty string for no range', async () => {
      expect(await formatPatch(repository, 'HEAD', 'HEAD')).toBeFalsy()
    })
    describe('applied in a related repo', () => {
      let clonedRepository: Repository
      beforeEach(async () => {
        clonedRepository = await cloneLocalRepository(repository)
        await makeCommit(clonedRepository, {
          entries: [{ path: 'okay-file', contents: 'okay' }],
        })
      })
      it('is valid', async () => {
        const patch = await formatPatch(repository, 'HEAD~', 'HEAD')
        const result = await GitProcess.exec(['apply'], clonedRepository.path, {
          stdin: patch,
        })
        expect(result).toBeTruthy()
      })
    })
  })
})
