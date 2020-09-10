import { setupEmptyRepository } from '../helpers/repositories'
import { writeFile } from 'fs-extra'
import { join } from 'path'
import { git } from '../../src/lib/git'
import { cloneLocalRepository } from '../helpers/repository-scaffolding'
import { GitError as DugiteError } from 'dugite'
import { parseFilesToBeOverwritten } from '../../src/ui/lib/parse-files-to-be-overwritten'

describe('parseFilesToBeOverwritten', () => {
  it('parses files from pull error', async () => {
    const parent = await setupEmptyRepository()
    await writeFile(join(parent.path, 'a'), '1')
    await writeFile(join(parent.path, 'b'), '2')
    await git(['add', 'a', 'b'], parent.path, 'add')
    await git(['commit', '-m', 'initial'], parent.path, 'add')

    await writeFile(join(parent.path, 'a'), '3')
    await writeFile(join(parent.path, 'b'), '4')
    await git(['add', 'a', 'b'], parent.path, 'add')
    await git(['commit', '-m', 'second'], parent.path, 'add')

    const fork = await cloneLocalRepository(parent)
    await git(['reset', 'HEAD^'], fork.path, 'reset')
    const result = await git(['pull'], fork.path, 'pull', {
      expectedErrors: new Set([DugiteError.MergeWithLocalChanges]),
    })

    expect(result.gitError).toBe(DugiteError.MergeWithLocalChanges)
    expect(parseFilesToBeOverwritten(result.stderr)).toEqual(['a', 'b'])
  })
})
