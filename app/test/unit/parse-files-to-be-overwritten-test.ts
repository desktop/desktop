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

  it("isn't able to parse files from pull rebase error", async () => {
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
    const result = await git(['pull', '--rebase'], fork.path, 'pull', {
      expectedErrors: new Set([DugiteError.RebaseWithLocalChanges]),
    })

    expect(result.gitError).toBe(DugiteError.RebaseWithLocalChanges)
    expect(parseFilesToBeOverwritten(result.stderr)).toEqual([])
  })

  it('parses files from merge error', async () => {
    const repo = await setupEmptyRepository()
    await writeFile(join(repo.path, 'a'), '1')
    await writeFile(join(repo.path, 'b'), '2')
    await git(['add', 'a', 'b'], repo.path, 'add')
    await git(['commit', '-m', 'initial'], repo.path, 'add')

    await writeFile(join(repo.path, 'a'), '3')
    await writeFile(join(repo.path, 'b'), '4')
    await git(['add', 'a', 'b'], repo.path, 'add')
    await git(['commit', '-m', 'second'], repo.path, 'add')

    await git(['reset', 'HEAD^'], repo.path, 'reset')
    const result = await git(['merge', 'HEAD@{1}'], repo.path, 'merge', {
      expectedErrors: new Set([DugiteError.MergeWithLocalChanges]),
    })

    expect(result.gitError).toBe(DugiteError.MergeWithLocalChanges)
    expect(parseFilesToBeOverwritten(result.stderr)).toEqual(['a', 'b'])
  })

  it('parses files from checkout error', async () => {
    const repo = await setupEmptyRepository()
    await writeFile(join(repo.path, 'a'), '1')
    await writeFile(join(repo.path, 'b'), '2')
    await git(['add', 'a', 'b'], repo.path, 'add')
    await git(['commit', '-m', 'initial'], repo.path, 'add')

    await git(['branch', 'feature-branch'], repo.path, 'branch')

    await writeFile(join(repo.path, 'a'), '3')
    await writeFile(join(repo.path, 'b'), '4')

    await git(['commit', '-am', 'second'], repo.path, 'add')

    await git(['checkout', 'feature-branch'], repo.path, 'checkout')

    await writeFile(join(repo.path, 'a'), '5')
    await writeFile(join(repo.path, 'b'), '6')

    const result = await git(['checkout', 'master'], repo.path, 'checkout', {
      expectedErrors: new Set([DugiteError.LocalChangesOverwritten]),
    })

    expect(result.gitError).toBe(DugiteError.LocalChangesOverwritten)
    expect(parseFilesToBeOverwritten(result.stderr)).toEqual(['a', 'b'])
  })
})
