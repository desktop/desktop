import { git } from './core'
import { WorkingDirectoryFileChange } from '../../models/status'
import { DiffType } from '../../models/diff'
import { Repository } from '../../models/repository'
import { getWorkingDirectoryDiff } from './diff'
import { formatPatch } from '../patch-formatter'

export async function applyPatchToIndex(repository: Repository, file: WorkingDirectoryFileChange): Promise<void> {
  const applyArgs: string[] = [ 'apply', '--cached', '--unidiff-zero', '--whitespace=nowarn', '-' ]

  const diff = await getWorkingDirectoryDiff(repository, file)

  if (diff.kind !== DiffType.Text) {
    throw new Error(`Unexpected diff result returned: '${diff.kind}'`)
  }

  const patch = await formatPatch(file, diff)
  await git(applyArgs, repository.path, 'applyPatchToIndex', { stdin: patch })

  return Promise.resolve()
}
