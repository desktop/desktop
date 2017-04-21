import { git, envForAuthentication } from './core'
import { Account } from '../../models/account'
import { ChildProcess } from 'child_process'

const byline = require('byline')

/** Additional arguments to provide when cloning a repository */
export type CloneOptions = {
  /** The optional identity to provide when cloning. */
  readonly account: Account | null
  /** The branch to checkout after the clone has completed. */
  readonly branch?: string
}

/** Clone the repository to the path. */
export async function clone(url: string, path: string, options: CloneOptions, progress: (progress: string) => void): Promise<void> {
  const env = envForAuthentication(options.account)
  const processCallback = (process: ChildProcess) => {
    byline(process.stderr).on('data', (chunk: string) => {
      progress(chunk)
    })
  }

  const args = [
    // Explicitly unset any defined credential helper, we rely on our
    // own askpass for authentication.
      '-c' , 'credential.helper=',
    'clone', '--recursive', '--progress',
  ]

  if (options.branch) {
    args.push('-b', options.branch)
  }

  args.push('--', url, path)

  await git(args, __dirname, 'clone', { env, processCallback })
}
