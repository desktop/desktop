import { GitProcess } from 'dugite'
import { setupTwoCommitRepo } from '../../helpers/repositories'
import { Repository } from '../../../src/models/repository'
import { checkPatch } from '../../../src/lib/git'
import {
  cloneLocalRepository,
  makeCommit,
} from '../../helpers/repository-scaffolding'

describe('git/apply', () => {
  describe('checkPatch', () => {
    describe('on related repository without conflicts', () => {
      let repository: Repository
      let patch: string
      beforeEach(async () => {
        const originalRepo = await setupTwoCommitRepo()
        repository = await cloneLocalRepository(originalRepo)
        await makeCommit(originalRepo, {
          entries: [{ path: 'just-okay-file', contents: 'okay' }],
        })
        ;({ stdout: patch } = await GitProcess.exec(
          ['format-patch', '--stdout', 'HEAD~'],
          originalRepo.path
        ))
      })
      it('returns true', async () => {
        expect(await checkPatch(repository, patch)).toBe(true)
      })
    })
    describe('on a related repo with conflicts', () => {
      let repository: Repository
      let patch: string
      beforeEach(async () => {
        const originalRepo = await setupTwoCommitRepo()
        ;({ stdout: patch } = await GitProcess.exec(
          ['format-patch', '--stdout', 'HEAD~'],
          originalRepo.path
        ))
        repository = await cloneLocalRepository(originalRepo)
        await makeCommit(repository, {
          entries: [{ path: 'good-file', contents: 'okay' }],
        })
      })
      it('returns false', async () => {
        expect(await checkPatch(repository, patch)).toBe(false)
      })
    })
  })
})
