import { describe, it } from 'node:test'
import assert from 'node:assert'
import { readFile } from 'fs/promises'
import * as path from 'path'

import { writeDefaultReadme } from '../../src/ui/add-repository/write-default-readme'
import { createTempDirectory } from '../helpers/temp'

describe('repository setup', () => {
  describe('writeDefaultReadme', () => {
    it('writes a default README without a description', async t => {
      const directory = await createTempDirectory(t)
      const file = path.join(directory, 'README.md')

      await writeDefaultReadme(directory, 'some-repository')

      const text = await readFile(file, 'utf8')
      assert.equal(text, '# some-repository\n')
    })

    it('writes a README with description when provided', async t => {
      const directory = await createTempDirectory(t)
      const file = path.join(directory, 'README.md')

      await writeDefaultReadme(
        directory,
        'some-repository',
        'description goes here'
      )

      const text = await readFile(file, 'utf8')
      assert.equal(text, '# some-repository\ndescription goes here\n')
    })
  })
})
