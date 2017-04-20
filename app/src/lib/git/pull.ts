import { git, envForAuthentication, expectedAuthenticationErrors, GitError, IGitExecutionOptions } from './core'
import { Repository } from '../../models/repository'
import { Account } from '../../models/account'
import { ChildProcess } from 'child_process'
import { PullProgressParser } from '../progress'
import { IGenericProgress } from '../app-state'

const byline = require('byline')

/** Pull from the remote to the branch. */
export async function pull(repository: Repository, account: Account | null, remote: string, progressCallback?: (progress: IGenericProgress) => void): Promise<void> {

  let options: IGitExecutionOptions = {
    env: envForAuthentication(account),
    expectedErrors: expectedAuthenticationErrors(),
  }

  if (progressCallback) {
    const title = `Pulling ${remote}`

    options = {
      ...options,
      processCallback: (process: ChildProcess) => {
        const parser = new PullProgressParser()
        byline(process.stderr).on('data', (line: string) => {
          const progress = parser.parse(line)

          progressCallback({
            title,
            description: progress.kind === 'progress'
              ? progress.details.text
              : progress.text,
            value: progress.percent,
          })
        })
      },
    }

    progressCallback({ title, value: 0 })
  }

  const args = progressCallback
    ? [ 'pull', '--progress', remote ]
    : [ 'pull', remote ]

  const result = await git(args, repository.path, 'pull', options)

  if (result.gitErrorDescription) {
    throw new GitError(result, args)
  }
}
