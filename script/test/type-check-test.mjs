import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { it } from 'node:test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { checkProject, checkScope, projectRoot, runNode } from '../type-check.mjs'

it('checks cross-file types without emitting JavaScript', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'desktop-type-check-'))
  t.after(() => rm(directory, { recursive: true, force: true }))
  const config = join(directory, 'tsconfig.json')
  await writeFile(
    config,
    JSON.stringify({
      compilerOptions: { strict: true, types: [], module: 'nodenext' },
      include: ['*.ts'],
    })
  )
  await writeFile(join(directory, 'value.ts'), 'export const value = 42')
  await writeFile(
    join(directory, 'use.ts'),
    "import { value } from './value'; export const result: string = value"
  )
  await assert.rejects(checkProject(config), /failed/)
  await writeFile(
    join(directory, 'use.ts'),
    "import { value } from './value'; export const result: number = value"
  )
  await checkProject(config)
  await assert.rejects(readFile(join(directory, 'use.js')), { code: 'ENOENT' })
})

it('rejects unknown scopes rather than skipping checks', async () => {
  await assert.rejects(checkScope('unknown'), /Unknown type-check scope/)
})

it('propagates subprocess failures', async () => {
  await assert.rejects(
    runNode(['--eval', 'process.exit(17)']),
    /exit code 17/
  )
})

it('does not execute a command when its check fails', async () => {
  const execFileAsync = promisify(execFile)
  await assert.rejects(
    execFileAsync(process.execPath, [
      join(projectRoot, 'script/checked-run.mjs'),
      'invalid-scope',
      '--eval',
      'console.log("COMMAND_EXECUTED")',
    ]),
    error => {
      assert.ok(error instanceof Error)
      assert.match(error.message, /Unknown type-check scope/)
      if (!('stdout' in error)) {
        return false
      }
      assert.equal(error.stdout, '')
      return true
    }
  )
})
