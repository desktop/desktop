import { GitError as DugiteError } from 'dugite'
import { git } from './core'
import {
  WorkingDirectoryFileChange,
  AppFileStatusKind,
} from '../../models/status'
import { DiffType } from '../../models/diff'
import { Repository, WorkingTree } from '../../models/repository'
import { getWorkingDirectoryDiff } from './diff'
import { formatPatch } from '../patch-formatter'

export async function applyPatchToIndex(
  repository: Repository,
  file: WorkingDirectoryFileChange
): Promise<void> {
  // If the file was a rename we have to recreate that rename since we've
  // just blown away the index. Think of this block of weird looking commands
  // as running `git mv`.
  if (file.status.kind === AppFileStatusKind.Renamed) {
    // Make sure the index knows of the removed file. We could use
    // update-index --force-remove here but we're not since it's
    // possible that someone staged a rename and then recreated the
    // original file and we don't have any guarantees for in which order
    // partial stages vs full-file stages happen. By using git add the
    // worst that could happen is that we re-stage a file already staged
    // by updateIndex.
    await git(
      ['add', '--u', '--', file.status.oldPath],
      repository.path,
      'applyPatchToIndex'
    )

    // Figure out the blob oid of the removed file
    // <mode> SP <type> SP <object> TAB <file>
    const oldFile = await git(
      ['ls-tree', 'HEAD', '--', file.status.oldPath],
      repository.path,
      'applyPatchToIndex'
    )

    const [info] = oldFile.stdout.split('\t', 1)
    const [mode, , oid] = info.split(' ', 3)

    // Add the old file blob to the index under the new name
    await git(
      ['update-index', '--add', '--cacheinfo', mode, oid, file.path],
      repository.path,
      'applyPatchToIndex'
    )
  }

  const applyArgs: string[] = [
    'apply',
    '--cached',
    '--unidiff-zero',
    '--whitespace=nowarn',
    '-',
  ]

  const diff = await getWorkingDirectoryDiff(repository, file)

  if (diff.kind !== DiffType.Text) {
    throw new Error(`Unexpected diff result returned: '${diff.kind}'`)
  }

  const patch = await formatPatch(file, diff)
  await git(applyArgs, repository.path, 'applyPatchToIndex', { stdin: patch })

  return Promise.resolve()
}

/**
 * Test a patch to see if it will apply cleanly.
 *
 * @param workTree work tree (which should be checked out to a specific commit)
 * @param patch a Git patch (or patch series) to try applying
 * @returns whether the patch applies cleanly
 *
 * See `formatPatch` to generate a patch series from existing Git commits
 */
export async function checkPatch(
  workTree: WorkingTree,
  patch: string
): Promise<boolean> {
  const result = await git(
    ['apply', '--check', '-'],
    workTree.path,
    'checkPatch',
    {
      stdin: patch,
      stdinEncoding: 'utf8',
      expectedErrors: new Set<DugiteError>([DugiteError.PatchDoesNotApply]),
    }
  )

  if (result.gitError === DugiteError.PatchDoesNotApply) {
    // other errors will be thrown if encountered, so this is fine for now
    return false
  }

  return true
}
