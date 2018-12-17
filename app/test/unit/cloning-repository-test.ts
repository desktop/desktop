import { expect } from 'chai'

import { CloningRepository } from '../../src/models/cloning-repository'

describe('CloningRepository', () => {
  describe('name', () => {
    it('provides the name of the repository being cloned', () => {
      const repository = new CloningRepository(
        'C:/some/path/to/desktop',
        'https://github.com/desktop/desktop'
      )

      expect(repository.name).to.equal('desktop')
    })

    it('extracts the repo name from the url not the path', () => {
      const repository = new CloningRepository(
        'C:/some/path/to/repo',
        'https://github.com/desktop/desktop'
      )

      expect(repository.name).to.equal('desktop')
    })

    it('extracts the repo name without git suffix', () => {
      const repository = new CloningRepository(
        'C:/some/path/to/repo',
        'https://github.com/desktop/desktop.git'
      )

      expect(repository.name).to.equal('desktop')
    })
  })
})
