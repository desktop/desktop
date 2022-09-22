import * as FSE from 'fs-extra'
import * as path from 'path'
import { mkdirSync } from '../helpers/temp'

import { writeDefaultReadme } from '../../src/ui/add-repository/write-default-readme'

describe('repository setup', () => {
  describe('writeDefaultReadme', () => {
    let directory: string
    let file: string

    beforeEach(() => {
      directory = mkdirSync('new-readme')
      file = path.join(directory, 'README.md')
    })

    it('writes a default README without a description', async () => {
      await writeDefaultReadme(directory, 'some-repository')

      const text = await FSE.readFile(file, 'utf8')
      expect(text).toBe('# some-repository\n')
    })

    it('writes a README with description when provided', async () => {
      await writeDefaultReadme(
        directory,
        'some-repository',
        'description goes here'
      )

      const text = await FSE.readFile(file, 'utf8')
      expect(text).toBe('# some-repository\n description goes here\n')
    })
  })
})
