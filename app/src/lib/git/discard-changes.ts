import { git } from './core'
import { Repository } from '../../models/repository'
import { DiffSelection, ITextDiff } from '../../models/diff'
import { formatPatchToDiscardChanges } from '../patch-formatter'

/**
 * Discards the local changes for the specified file based on the passed diff
 * and a selection of lines from it.
 *
 * When passed an empty selection, this method won't do anything. When passed a
 * full selection, all changes from the file will be discarded.
 *
 * @param repository The repository in which to update the working directory
 *                   with information from the index
 *
 * @param filePath   The relative path in the working directory of the file to use
 *
 * @param diff       The diff containing the file local changes
 *
 * @param selection  The selection of changes from the diff to discard
 */
export async function discardChangesFromSelection(
  repository: Repository,
  filePath: string,
  diff: ITextDiff,
  selection: DiffSelection
) {
  const patch = formatPatchToDiscardChanges(filePath, diff, selection)

  const args = ['apply', '--unidiff-zero', '--whitespace=nowarn', '-']

  await git(args, repository.path, 'discardChangesFromSelection', {
    stdin: patch,
  })
}
