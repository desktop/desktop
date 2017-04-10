import { git, envForAuthentication } from './core'
import { User } from '../../models/user'
import { ChildProcess } from 'child_process'

const byline = require('byline')

/** Additional arguments to provide when cloning a repository */
export type CloneOptions = {
  /** The optional identity to provide when cloning. */
  readonly user: User | null
  /** The branch to checkout after the clone has completed. */
  readonly branch?: string
}

/** Clone the repository to the path. */
export async function clone(url: string, path: string, options: CloneOptions, progress: (progress: string) => void): Promise<void> {
  const env = envForAuthentication(options.user)
  const processCallback = (process: ChildProcess) => {
    byline(process.stderr).on('data', (chunk: string) => {
      progress(chunk)
    })
  }

  const args = [ 'clone', '--recursive', '--progress' ]

  if (options.branch) {
    args.push('-b', options.branch)
  }

  args.push('--', url, path)

  await git(args, __dirname, 'clone', { env, processCallback })
}
