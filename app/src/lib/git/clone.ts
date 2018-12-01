import { git, IGitExecutionOptions, gitNetworkArguments } from './core'
import { ICloneProgress } from '../../models/progress'
import { CloneOptions } from '../../models/clone-options'
import { CloneProgressParser, executionOptionsWithProgress } from '../progress'
import { envForAuthentication } from './authentication'

/**
 * Clones a repository from a given url into to the specified path.
 *
 * @param url     - The remote repository URL to clone from
 *
 * @param path    - The destination path for the cloned repository. If the
 *                  path does not exist it will be created. Cloning into an
 *                  existing directory is only allowed if the directory is
 *                  empty.
 *
 * @param options  - Options specific to the clone operation, see the
 *                   documentation for CloneOptions for more details.
 *
 * @param progressCallback - An optional function which will be invoked
 *                           with information about the current progress
 *                           of the clone operation. When provided this enables
 *                           the '--progress' command line flag for
 *                           'git clone'.
 *
 */
export async function clone(
  url: string,
  path: string,
  options: CloneOptions,
  progressCallback?: (progress: ICloneProgress) => void
): Promise<void> {
  const networkArguments = await gitNetworkArguments(null, options.account)

  const env = envForAuthentication(options.account)

  const args = [...networkArguments, 'clone', '--recursive']

  let opts: IGitExecutionOptions = { env }

  if (progressCallback) {
    args.push('--progress')

    const title = `Cloning into ${path}`
    const kind = 'clone'

    opts = await executionOptionsWithProgress(
      { ...opts, trackLFSProgress: true },
      new CloneProgressParser(),
      progress => {
        const description =
          progress.kind === 'progress' ? progress.details.text : progress.text
        const value = progress.percent

        progressCallback({ kind, title, description, value })
      }
    )

    // Initial progress
    progressCallback({ kind, title, value: 0 })
  }

  if (options.branch) {
    args.push('-b', options.branch)
  }

  args.push('--', url, path)

  await git(args, __dirname, 'clone', opts)
}
