import { expect } from 'chai'
import * as FSE from 'fs-extra'
import * as Path from 'path'

import { getGitDescription } from '../../../src/lib/git'
import { setupEmptyRepository } from '../../helpers/repositories'

describe('git/description', () => {
  describe('getGitDescription', () => {
    it('returns empty for an initialized repository', async () => {
      const repo = await setupEmptyRepository()
      const actual = await getGitDescription(repo.path)
      expect(actual).equals('')
    })

    it('returns empty when path is missing', async () => {
      const repo = await setupEmptyRepository()
      const path = Path.join(repo.path, '.git', 'description')
      await FSE.unlink(path)

      const actual = await getGitDescription(repo.path)
      expect(actual).equals('')
    })

    it('reads the custom text', async () => {
      const expected = 'this is a repository description'
      const repo = await setupEmptyRepository()
      const path = Path.join(repo.path, '.git', 'description')
      await FSE.writeFile(path, expected)

      const actual = await getGitDescription(repo.path)
      expect(actual).equals(expected)
    })
  })
})
