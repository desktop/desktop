import { remote } from 'electron'
import { writeFile } from 'fs'
import * as moment from 'moment'

import { Repository } from '../../models/repository'

import { parseRemote } from '../remote-parsing'
import { getRemotes } from '../git'

import {
  listEnvironmentVariables,
  isSSHAgentRunning,
  listIdentities,
  testSSHConnection,
} from './ssh-interop'

export async function generateSSHTroubleshootingLog(
  repository: Repository
): Promise<string> {
  const remotes = await getRemotes(repository)

  const sshRemoteHosts: Array<string> = []
  for (const remote of remotes) {
    const gitRemote = parseRemote(remote.url)
    if (gitRemote != null && gitRemote.protocol === 'ssh') {
      sshRemoteHosts.push(gitRemote.hostname)
    }
  }

  const sshUrl = `git@${sshRemoteHosts[0]}`

  const sshAgentRunning = await isSSHAgentRunning()

  const firstSection = sshAgentRunning
    ? 'ssh-agent process is running'
    : 'ssh-agent process is NOT running'
  const secondSection = listEnvironmentVariables()
  const identitiesResult = await listIdentities()
  const connectResult = await testSSHConnection(sshUrl)

  const output = `# SSH Troubleshooting

## ssh-agent
${firstSection}

## environment variables
${secondSection}

## identities
stdout:
${identitiesResult.stdout}
stderr:
${identitiesResult.stderr}

## ssh test
stdout:
${connectResult.stdout}
stderr:
${connectResult.stderr}
`
  return output
}

export function saveLogFile(contents: string) {
  const timestamp = moment().format('YYYYMMDD-HHmmss')
  const defaultPath = `ssh-output-${timestamp}.txt`

  return new Promise<void>((resolve, reject) => {
    // TODO: null should be a valid argument here
    const window: any = null
    remote.dialog.showSaveDialog(window, { defaultPath }, filename => {
      if (filename == null) {
        log.warn(
          'TODO: filename returned null, this needs to be in the signature'
        )
        resolve()
      } else {
        writeFile(filename, contents, err => {
          if (err) {
            reject(err)
          } else {
            resolve()
          }
        })
      }
    })
  })
}
