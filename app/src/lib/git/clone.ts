import { git, envForAuthentication } from './core'
import { Account } from '../../models/account'
import { ChildProcess } from 'child_process'

const byline = require('byline')

/** Clone the repository to the path. */
export async function clone(url: string, path: string, user: Account | null, progress: (progress: string) => void): Promise<void> {
  const env = envForAuthentication(user)
  const processCallback = (process: ChildProcess) => {
    byline(process.stderr).on('data', (chunk: string) => {
      progress(chunk)
    })
  }

  await git([ 'clone', '--recursive', '--progress', '--', url, path ], __dirname, 'clone', { env, processCallback })
}
