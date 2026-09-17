import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'node:test'
import { findTestFilesIn } from '../find-test-files.mjs'

it('discovers both test naming conventions recursively', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-test-discovery-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  await mkdir(join(directory, 'nested'))
  const names = [
    'application-test.ts',
    'component-test.tsx',
    'runner-test.mjs',
    'nested/custom-rule.test.js',
  ]
  for (const name of [...names, 'helper.ts', 'not-a-test.txt']) {
    await writeFile(join(directory, name), '')
  }

  assert.deepEqual(
    (await findTestFilesIn([directory])).sort(),
    names.map(name => join(directory, name)).sort()
  )
  assert.deepEqual(
    await findTestFilesIn([join(directory, names[0])]),
    [join(directory, names[0])]
  )
})
