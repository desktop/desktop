import { expect } from 'chai'
import * as FSE from 'fs-extra'
import * as Path from 'path'

import { setupEmptyRepository } from '../../helpers/repositories'
import { writeGitAttributes } from '../../../src/ui/add-repository/git-attributes'

describe('git/git-attributes', () => {
  describe('writeGitAttributes', () => {
    it('initializes a .gitattributes file', async () => {
      const repo = await setupEmptyRepository()
      await writeGitAttributes(repo.path)
      const expectedPath = Path.join(repo.path, '.gitattributes')
      const contents = await FSE.readFile(expectedPath, 'utf8')
      expect(contents).to.contain('* text=auto')
    })
  })
})
