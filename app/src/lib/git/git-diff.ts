import { git } from './core'

import { Repository } from '../../models/repository'
import { WorkingDirectoryFileChange, FileChange, FileStatus } from '../../models/status'
import { Diff } from '../../models/diff'

import { DiffParser } from '../diff-parser'

export class GitDiff {

  /**
   * Render the difference between a file in the given commit and its parent
   *
   * @param commitish A commit SHA or some other identifier that ultimately dereferences
   *                  to a commit.
   */
  public static getCommitDiff(repository: Repository, file: FileChange, commitish: string): Promise<Diff> {

    const args = [ 'log', commitish, '-m', '-1', '--first-parent', '--patch-with-raw', '-z', '--', file.path ]

    return git(args, repository.path)
      .then(value => this.diffFromRawDiffOutput(value.stdout))
  }

  /**
   * Render the diff for a file within the repository working directory. The file will be
   * compared against HEAD if it's tracked, if not it'll be compared to an empty file meaning
   * that all content in the file will be treated as additions.
   */
  public static getWorkingDirectoryDiff(repository: Repository, file: WorkingDirectoryFileChange): Promise<Diff> {
    // `git diff` seems to emulate the exit codes from `diff` irrespective of
    // whether you set --exit-code
    //
    // this is the behaviour:
    // - 0 if no changes found
    // - 1 if changes found
    // -   and error otherwise
    //
    // citation in source:
    // https://github.com/git/git/blob/1f66975deb8402131fbf7c14330d0c7cdebaeaa2/diff-no-index.c#L300
    const successExitCodes = new Set([ 0, 1 ])

    const args = file.status === FileStatus.New
      ? [ 'diff', '--no-index', '--patch-with-raw', '-z', '--', '/dev/null', file.path ]
      : [ 'diff', 'HEAD', '--patch-with-raw', '-z', '--', file.path ]

    return git(args, repository.path, { successExitCodes })
      .then(value => this.diffFromRawDiffOutput(value.stdout))
  }

  /**
   * Utility function used by get(Commit|WorkingDirectory)Diff.
   *
   * Parses the output from a diff-like command that uses `--path-with-raw`
   */
  private static diffFromRawDiffOutput(result: string): Diff {
    const pieces = result.split('\0')
    const parser = new DiffParser()
    return parser.parse(pieces[pieces.length - 1])
  }
}
